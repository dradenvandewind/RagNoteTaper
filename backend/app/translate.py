import httpx

from .config import (
    OLLAMA_URL,
    QWEN_KEEP_ALIVE,
    QWEN_MODEL,
    TRANSLATE_CONNECT_TIMEOUT_SECONDS,
    TRANSLATE_READ_TIMEOUT_SECONDS,
)

_TRANSLATE_TIMEOUT = httpx.Timeout(
    connect=TRANSLATE_CONNECT_TIMEOUT_SECONDS,
    read=TRANSLATE_READ_TIMEOUT_SECONDS,
    write=10.0,
    pool=5.0,
)


async def translate_text(text: str, target_lang: str = "English") -> str:
    if not text:
        return ""
    prompt = (
        f"Translate the following French text to {target_lang}. "
        f"Only output the translation, nothing else.\n\nText: {text}"
    )
    async with httpx.AsyncClient(timeout=_TRANSLATE_TIMEOUT) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": QWEN_MODEL,
                "prompt": prompt,
                "stream": False,
                "keep_alive": QWEN_KEEP_ALIVE},
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()