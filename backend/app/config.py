import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whisper-qwen")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen2.5:3b")
SOURCE_LANG = os.getenv("SOURCE_LANG", "fr")
HTTP_TIMEOUT_SECONDS = 60.0
