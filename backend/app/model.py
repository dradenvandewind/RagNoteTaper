import asyncio

import ctranslate2
from faster_whisper import WhisperModel

from .config import WHISPER_MODEL, logger


def get_device_and_compute_type() -> tuple[str, str]:
    """Auto-detect GPU availability; fall back to CPU transparently."""
    try:
        cuda_device_count = ctranslate2.get_cuda_device_count()
    except Exception:
        logger.warning("Could not query CUDA device count, falling back to CPU", exc_info=True)
        return "cpu", "int8"

    if cuda_device_count > 0:
        return "cuda", "float16"
    return "cpu", "int8"


DEVICE, COMPUTE_TYPE = get_device_and_compute_type()
logger.info("Whisper model=%s device=%s compute_type=%s", WHISPER_MODEL, DEVICE, COMPUTE_TYPE)

model = WhisperModel(WHISPER_MODEL, device=DEVICE, compute_type=COMPUTE_TYPE)

# faster-whisper's WhisperModel isn't guaranteed thread-safe for concurrent
# inference calls. Both the one-shot pipeline (audio.py) and the streaming
# sessions (streaming.py) run transcription in worker threads via
# asyncio.to_thread; this lock serializes access to `model.transcribe`
# across all of them so overlapping requests never run concurrently.
model_lock = asyncio.Lock()
