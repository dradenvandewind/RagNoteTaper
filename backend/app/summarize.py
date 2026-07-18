import httpx
from .config import (
    OLLAMA_URL,
    QWEN_KEEP_ALIVE,
    QWEN_MODEL,
    TRANSLATE_CONNECT_TIMEOUT_SECONDS,
    TRANSLATE_READ_TIMEOUT_SECONDS,
    logger,
)

# On réutilise la même logique de timeout que pour la traduction
_SUMMARIZE_TIMEOUT = httpx.Timeout(
    connect=TRANSLATE_CONNECT_TIMEOUT_SECONDS,
    read=TRANSLATE_READ_TIMEOUT_SECONDS,
    write=10.0,
    pool=5.0,
)

async def summarize_text(text: str) -> str:
    """Envoie le texte cumulé à Ollama pour générer un résumé structuré."""
    if not text or not text.strip():
        return ""

    prompt = (
        "Fais un résumé clair, concis et structuré sous forme de puces (bullet points) "
        "des points clés de la discussion suivante en français :\n\n"
        f"Texte : {text}"
    )

    async with httpx.AsyncClient(timeout=_SUMMARIZE_TIMEOUT) as client:
        logger.info("Envoi d'une demande de résumé à Ollama (modèle: %s)...", QWEN_MODEL)
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": QWEN_MODEL,
                "prompt": prompt,
                "stream": False,
                "keep_alive": QWEN_KEEP_ALIVE
            },
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()