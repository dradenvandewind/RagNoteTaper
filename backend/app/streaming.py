import asyncio
import time

import numpy as np

from .config import SOURCE_LANG, logger
from .model import model, model_lock
from .translate import translate_text

TARGET_SR = 16000

PARTIAL_INTERVAL_S = 1.0        # minimum time between two "partial" transcriptions
MIN_AUDIO_FOR_PARTIAL_S = 1.0   # don't bother transcribing a near-empty buffer
SILENCE_RMS_THRESHOLD = 0.005    # tune based on mic gain / noise floor
SILENCE_DURATION_S = 0.7        # silence needed to consider an utterance finished
MAX_BUFFER_S = 30.0             # safety cap so a stuck session can't grow forever
MAX_BUFFER_BEFORE_FORCE_FINALIZE_S = 8.0


def _resample(audio: np.ndarray, orig_sr: int, target_sr: int) -> np.ndarray:
    """Lightweight linear-interpolation resampler.

    Good enough for feeding speech into Whisper; if higher fidelity is needed,
    swap this for scipy.signal.resample_poly.
    """
    if orig_sr == target_sr or audio.size == 0:
        return audio
    duration = audio.shape[0] / orig_sr
    target_len = max(1, int(round(duration * target_sr)))
    orig_idx = np.linspace(0, audio.shape[0] - 1, num=audio.shape[0])
    target_idx = np.linspace(0, audio.shape[0] - 1, num=target_len)
    return np.interp(target_idx, orig_idx, audio).astype(np.float32)


class StreamSession:
    """Per-connection streaming state.

    Accumulates raw PCM as it arrives, periodically transcribes the current
    buffer for live "partial" captions, and detects silence to decide when an
    utterance is finished (then emits a "final" transcription + translation
    and resets the buffer).
    """

    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate
        self._buffer = np.empty(0, dtype=np.float32)
        self._silence_s = 0.0
        self._has_speech = False
        self._last_partial_at = 0.0

    def add_frame(self, pcm_int16: np.ndarray) -> None:
        audio = pcm_int16.astype(np.float32) / 32768.0
        self._buffer = np.concatenate([self._buffer, audio])

        frame_duration = audio.shape[0] / self.sample_rate
        rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
        
        logger.info("frame rms=%.5f max=%.5f", rms, float(np.max(np.abs(audio))) if audio.size else 0.0)

        if rms < SILENCE_RMS_THRESHOLD:
            self._silence_s += frame_duration
        else:
            if rms > SILENCE_RMS_THRESHOLD * 1.5:
                self._silence_s = 0.0
            self._has_speech = True
        logger.info("silence_s=%.3f rms=%.5f threshold=%.5f", self._silence_s, rms, SILENCE_RMS_THRESHOLD)

        max_samples = int(MAX_BUFFER_S * self.sample_rate)
        if self._buffer.shape[0] > max_samples:
            self._buffer = self._buffer[-max_samples:]

    @property
    def buffer_duration_s(self) -> float:
        return self._buffer.shape[0] / self.sample_rate

    def should_emit_partial(self) -> bool:
        now = time.monotonic()
        return (
            self._has_speech
            and self.buffer_duration_s >= MIN_AUDIO_FOR_PARTIAL_S
            and (now - self._last_partial_at) >= PARTIAL_INTERVAL_S
        )

    def should_finalize(self) -> bool:
        natural = self._has_speech and self._silence_s >= SILENCE_DURATION_S
        forced = self._has_speech and self.buffer_duration_s >= MAX_BUFFER_BEFORE_FORCE_FINALIZE_S
        if natural or forced:
            logger.info(
                "finalize triggered (natural=%s forced=%s) silence_s=%.3f buffer_s=%.3f",
                natural, forced, self._silence_s, self.buffer_duration_s,
            )
        return natural or forced

    def reset(self) -> None:
        self._buffer = np.empty(0, dtype=np.float32)
        self._silence_s = 0.0
        self._has_speech = False

    async def _transcribe_current(self) -> str:
        audio_16k = _resample(self._buffer, self.sample_rate, TARGET_SR)

        def _run() -> str:
            segments, _ = model.transcribe(audio_16k, language=SOURCE_LANG, vad_filter=True,
    vad_parameters=dict(threshold=0.2, min_silence_duration_ms=500))
            return " ".join(seg.text.strip() for seg in segments).strip()

        # Serialize model access: faster-whisper's WhisperModel is not
        # guaranteed safe for concurrent inference calls from multiple threads.
        async with model_lock:
            return await asyncio.to_thread(_run)

    async def emit_partial(self) -> str:
        self._last_partial_at = time.monotonic()
        try:
            return await self._transcribe_current()
        except Exception:
            logger.exception("Partial transcription failed")
            return ""

    async def emit_final(self) -> dict[str, str]:
        try:
            text_fr = await self._transcribe_current()
        except Exception:
            logger.exception("Final transcription failed")
            text_fr = ""

        text_en = ""
        if text_fr:
            try:
                text_en = await translate_text(text_fr)
            except Exception:
                logger.exception("Translation failed; sending transcription without translation")

        # Always clear the buffer, even if transcription/translation failed,
        # otherwise should_finalize() keeps firing on every subsequent frame
        # and the session gets stuck retrying the same (growing) buffer.
        self.reset()
        return {"transcription": text_fr, "translation": text_en}