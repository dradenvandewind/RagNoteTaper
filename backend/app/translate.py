import httpx

from .config import HTTP_TIMEOUT_SECONDS, OLLAMA_URL, QWEN_MODEL


async def translate_text(text: str, target_lang: str = "English") -> str:
    if not text:
        return ""
    prompt = (
        f"Translate the following French text to {target_lang}. "
        f"Only output the translation, nothing else.\n\nText: {text}"
    )
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={"model": QWEN_MODEL, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()
