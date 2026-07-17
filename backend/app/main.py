from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import WARM_UP_TRANSLATION_MODEL, logger
from .routes import router
from .translate import translate_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    if WARM_UP_TRANSLATION_MODEL:
        logger.info("Warming up Qwen translation model...")
        try:
            await translate_text("Bonjour", target_lang="English")
            logger.info("Qwen translation model warmed up successfully")
        except Exception:
            logger.exception("Qwen warmup failed; continuing startup anyway")
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Whisper + Qwen transcription/translation service", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router)
    return app


app = create_app()