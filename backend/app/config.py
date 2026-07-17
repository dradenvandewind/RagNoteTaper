import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whisper-qwen")

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen2.5:3b")
SOURCE_LANG = os.getenv("SOURCE_LANG", "fr")
HTTP_TIMEOUT_SECONDS = 60.0

TRANSLATE_CONNECT_TIMEOUT_SECONDS = float(os.getenv("TRANSLATE_CONNECT_TIMEOUT_SECONDS", "5.0"))
TRANSLATE_READ_TIMEOUT_SECONDS = float(os.getenv("TRANSLATE_READ_TIMEOUT_SECONDS", "300.0"))


QWEN_KEEP_ALIVE = os.getenv("QWEN_KEEP_ALIVE", "30m")

WARM_UP_TRANSLATION_MODEL = os.getenv("WARM_UP_TRANSLATION_MODEL", "true").lower() == "true"