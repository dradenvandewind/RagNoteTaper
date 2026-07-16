const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const transcriptEl = document.getElementById('transcript');
const translationEl = document.getElementById('translation');
const meterCanvas = document.getElementById('meter');
const meterCtx = meterCanvas.getContext('2d');

let ws;
let stream;
let audioCtx;
let analyser;
let workletNode;
let meterRAF;
let partialP = null; // <p> currently showing the live, not-yet-final transcript

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

// Shows/updates the live, not-yet-committed transcript as a single line that
// gets replaced on every "partial" message from the server.
function updatePartialLine(el, text) {
  if (!text) return;
  if (!partialP) {
    partialP = document.createElement('p');
    partialP.classList.add('partial');
    el.appendChild(partialP);
  }
  partialP.textContent = text;
  el.scrollTop = el.scrollHeight;
}

// Called when the server sends a "final" result: drop the partial line and
// append the committed one in its place.
function commitPartialLine(el, text) {
  if (partialP) {
    partialP.remove();
    partialP = null;
  }
  appendLine(el, text);
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

startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    setStatus('Microphone denied or unavailable', false);
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  drawMeter();

  try {
    await audioCtx.audioWorklet.addModule('audio-worklet-processor.js');
  } catch (err) {
    setStatus('Failed to load audio processor', false);
    return;
  }
  workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture-processor');
  source.connect(workletNode);
  // Not connected to audioCtx.destination: we only need the raw samples,
  // not playback.

  ws = new WebSocket(wsUrl());
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    setStatus('Connected — listening', true);

    // Handshake: tell the server the native sample rate of this stream so it
    // can resample correctly before feeding audio to Whisper.
    ws.send(JSON.stringify({ sampleRate: audioCtx.sampleRate }));

    workletNode.port.onmessage = (event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(event.data); // raw Int16 PCM ArrayBuffer
      }
    };

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

    if (data.type === 'partial') {
      updatePartialLine(transcriptEl, data.transcription);
    } else if (data.type === 'final') {
      commitPartialLine(transcriptEl, data.transcription);
      appendLine(translationEl, data.translation);
    }
  };

  ws.onerror = () => setStatus('WebSocket error', false);

  ws.onclose = () => {
    setStatus('Disconnected', false);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
});

stopBtn.addEventListener('click', () => {
  if (workletNode) {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
    workletNode = null;
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
