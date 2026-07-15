import asyncio
import os
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import SOURCE_LANG
from .model import model


@contextmanager
def _temp_file(suffix: str) -> Iterator[Path]:
    """Create a temp file path and guarantee cleanup even if something raises."""
    fd, path_str = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    path = Path(path_str)
    try:
        yield path
    finally:
        path.unlink(missing_ok=True)


def _convert_to_wav_sync(input_bytes: bytes, input_suffix: str = ".webm") -> Path:
    """Convert arbitrary audio bytes to 16kHz mono wav using ffmpeg.

    Returns the path to a wav file. Caller is responsible for deleting it.
    """
    with _temp_file(input_suffix) as in_path:
        in_path.write_bytes(input_bytes)

        out_fd, out_path_str = tempfile.mkstemp(suffix=".wav")
        os.close(out_fd)
        out_path = Path(out_path_str)

        cmd = [
            "ffmpeg", "-y", "-i", str(in_path),
            "-ar", "16000", "-ac", "1", "-f", "wav", str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True)

        if result.returncode != 0:
            out_path.unlink(missing_ok=True)
            raise RuntimeError(f"ffmpeg conversion failed: {result.stderr.decode(errors='ignore')}")

        return out_path


def _transcribe_wav_sync(wav_path: Path, language: str = SOURCE_LANG) -> str:
    segments, _ = model.transcribe(str(wav_path), language=language, vad_filter=True)
    return " ".join(seg.text.strip() for seg in segments).strip()


async def convert_to_wav(input_bytes: bytes, input_suffix: str = ".webm") -> Path:
    """Async wrapper: runs the blocking ffmpeg conversion in a worker thread."""
    return await asyncio.to_thread(_convert_to_wav_sync, input_bytes, input_suffix)


async def transcribe_wav(wav_path: Path, language: str = SOURCE_LANG) -> str:
    """Async wrapper: runs the blocking Whisper inference in a worker thread."""
    return await asyncio.to_thread(_transcribe_wav_sync, wav_path, language)
