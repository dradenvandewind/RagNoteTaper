from .audio import convert_to_wav, transcribe_wav
from .translate import translate_text


async def process_audio_bytes(content: bytes, suffix: str) -> dict[str, str]:
    """Shared pipeline: bytes -> wav -> transcription -> translation.

    Guarantees the intermediate wav file is always removed.
    """
    wav_path = await convert_to_wav(content, suffix)
    try:
        text_fr = await transcribe_wav(wav_path)
    finally:
        wav_path.unlink(missing_ok=True)

    text_en = await translate_text(text_fr) if text_fr else ""
    return {"transcription": text_fr, "translation": text_en}
