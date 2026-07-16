import os

import numpy as np
from fastapi import APIRouter, File, UploadFile, WebSocket, WebSocketDisconnect

from .config import QWEN_MODEL, WHISPER_MODEL, logger
from .model import DEVICE
from .pipeline import process_audio_bytes
from .streaming import StreamSession

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok", "device": DEVICE, "whisper_model": WHISPER_MODEL, "qwen_model": QWEN_MODEL}


@router.post("/api/transcribe")
async def transcribe_upload(file: UploadFile = File(...)):
    """One-shot upload: whole file in, transcription + translation out."""
    content = await file.read()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    return await process_audio_bytes(content, suffix)


@router.websocket("/ws/transcribe")
async def ws_transcribe(websocket: WebSocket):
    """Continuous streaming transcription.

    Protocol:
    1. Client sends one JSON handshake message first: {"sampleRate": <int>}
       (the native sample rate of the mic stream, e.g. 48000).
    2. Client then sends a continuous stream of binary messages, each one
       being raw 16-bit PCM mono audio (Int16Array bytes) at that sample rate.
    3. Server replies with JSON messages as they become available:
       - {"type": "partial", "transcription": "..."}   (live, may change)
       - {"type": "final", "transcription": "...", "translation": "..."}
         (emitted once silence is detected; buffer is reset afterwards)
       - {"error": "..."} on failure (session continues)
    """
    await websocket.accept()
    logger.info("WebSocket client connected")

    try:
        handshake = await websocket.receive_json()
    except Exception:
        await websocket.close(code=1002, reason="Expected JSON handshake with sampleRate")
        return

    sample_rate = int(handshake.get("sampleRate", 48000))
    session = StreamSession(sample_rate=sample_rate)
    logger.info("Streaming session started at %d Hz", sample_rate)

    try:
        while True:
            frame_bytes = await websocket.receive_bytes()
            pcm_int16 = np.frombuffer(frame_bytes, dtype=np.int16)
            session.add_frame(pcm_int16)

            try:
                if session.should_finalize():
                    result = await session.emit_final()
                    if result["transcription"]:
                        await websocket.send_json({"type": "final", **result})
                elif session.should_emit_partial():
                    text = await session.emit_partial()
                    if text:
                        await websocket.send_json({"type": "partial", "transcription": text})
            except Exception as e:
                logger.exception("Error while processing streamed audio")
                await websocket.send_json({"error": str(e)})
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
