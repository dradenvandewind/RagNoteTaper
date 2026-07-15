const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const transcriptEl = document.getElementById('transcript');
const translationEl = document.getElementById('translation');
const meterCanvas = document.getElementById('meter');
const meterCtx = meterCanvas.getContext('2d');

// Duration of each recorded chunk. Each chunk must be a complete, self-contained
// WebM file (see startNewChunkRecorder), so this also drives ffmpeg/Whisper call
// frequency. 3s is a reasonable trade-off between latency and per-chunk overhead.
const CHUNK_DURATION_MS = 3000;

let mediaRecorder;
let ws;
let stream;
let audioCtx;
let analyser;
let meterRAF;
let chunkInterval;
let mimeType;
let recording = false;

function wsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/transcribe`;
}

function setStatus(text, live) {
  statusText.textContent = text;
  statusBadge.classList.toggle('status--live', !!live);
}

function appendLine(el, text) {
  if (!text) return;
  const p = document.createElement('p');
  p.textContent = text;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
}

function drawMeter() {
  const bufferLength = analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);

  function render() {
    meterRAF = requestAnimationFrame(render);
    analyser.getByteFrequencyData(data);

    const w = meterCanvas.width;
    const h = meterCanvas.height;
    meterCtx.clearRect(0, 0, w, h);

    const barCount = 48;
    const step = Math.floor(bufferLength / barCount);
    const barWidth = w / barCount;

    for (let i = 0; i < barCount; i++) {
      const value = data[i * step] / 255;
      const barHeight = Math.max(2, value * h);
      meterCtx.fillStyle = i < barCount * 0.7 ? '#f2b84b' : '#e8604c';
      meterCtx.fillRect(i * barWidth + 1, h - barHeight, barWidth - 2, barHeight);
    }
  }
  render();
}

function stopMeter() {
  if (meterRAF) cancelAnimationFrame(meterRAF);
  meterCtx.clearRect(0, 0, meterCanvas.width, meterCanvas.height);
}

// Records exactly one complete, independently decodable WebM file.
// MediaRecorder only writes valid EBML/WebM headers at the start of a
// recording, so timeslice-based chunking on a single continuous recorder
// produces fragments ffmpeg can't parse on their own. Instead we start a
// fresh MediaRecorder for every chunk and let it finish naturally via stop().
function startNewChunkRecorder() {
  mediaRecorder = new MediaRecorder(stream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
      e.data.arrayBuffer().then((buf) => ws.send(buf));
    }
  };

  mediaRecorder.start();
}

function restartChunkRecorder() {
  if (!recording) return;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  startNewChunkRecorder();
}

startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus("Microphone denied or unavailable", false);
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  drawMeter();

  ws = new WebSocket(wsUrl());
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    setStatus('Connected — listening', true);

    mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    recording = true;
    startNewChunkRecorder();
    chunkInterval = setInterval(restartChunkRecorder, CHUNK_DURATION_MS);

    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.error) {
      setStatus(`Error: ${data.error}`, false);
      return;
    }
    appendLine(transcriptEl, data.transcription);
    appendLine(translationEl, data.translation);
  };

  ws.onerror = () => setStatus('WebSocket error', false);

  ws.onclose = () => {
    setStatus('Disconnected', false);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
});

stopBtn.addEventListener('click', () => {
  recording = false;
  if (chunkInterval) {
    clearInterval(chunkInterval);
    chunkInterval = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
  }
  if (audioCtx) {
    audioCtx.close();
  }
  stopMeter();
  if (ws) {
    ws.close();
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('Stopped', false);
});