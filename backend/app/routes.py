import os

from fastapi import APIRouter, File, UploadFile, WebSocket, WebSocketDisconnect

from .config import QWEN_MODEL, WHISPER_MODEL, logger
from .model import DEVICE
from .pipeline import process_audio_bytes

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok", "device": DEVICE, "whisper_model": WHISPER_MODEL, "qwen_model": QWEN_MODEL}


@router.post("/api/transcribe")
async def transcribe_upload(file: UploadFile = File(...)):
    content = await file.read()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    return await process_audio_bytes(content, suffix)


@router.websocket("/ws/transcribe")
async def ws_transcribe(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")
    try:
        while True:
            chunk = await websocket.receive_bytes()
            try:
                result = await process_audio_bytes(chunk, ".webm")
                await websocket.send_json(result)
            except Exception as e:
                logger.exception("Error while processing audio chunk")
                await websocket.send_json({"error": str(e)})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")

@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_bytes()
        # décoder webm -> pcm, puis transcrire