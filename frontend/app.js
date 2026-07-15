Claude finished the response

propose moi un refactoring et traduit les commentaires en anglais
Examined code structure and harmonized multilingual documentation

Voici mon analyse et une proposition de refactoring. Points principaux que je vois dans ton code :

Problèmes identifiés :

    Blocage de l'event loop : transcribe_wav et convert_to_wav (via subprocess.run) sont synchrones/bloquants mais appelés dans du code async — ça bloque tout le serveur pendant la transcription.
    Fuite de fichiers temporaires : si ffmpeg échoue ou si une exception survient entre la création et le os.unlink, le fichier .wav traîne sur le disque.
    except Exception: pass dans get_device_and_compute_type masque silencieusement toute erreur (pas juste l'absence de GPU).
    Logs en français mélangés à un code anglais — à uniformiser.
    Pas de nettoyage garanti par try/finally dans convert_to_wav lui-même (le nettoyage est fait à l'extérieur, dispersé).

Je te fais une version corrigée :
Examined file for refactoring opportunities and translation needs

Résumé des changements :

    Non-bloquant : convert_to_wav et transcribe_wav sont maintenant async et délèguent le vrai travail (ffmpeg, inférence Whisper) à asyncio.to_thread, donc le serveur reste réactif pendant qu'une transcription tourne.
    Nettoyage garanti : _temp_file est un context manager qui unlink même en cas d'exception ; le .wav de sortie est aussi nettoyé via finally dans process_audio_bytes.
    Pipeline factorisé : process_audio_bytes est utilisé à la fois par la route HTTP et le WebSocket — plus de duplication entre les deux endpoints.
    Erreurs moins masquées : le except Exception: pass initial logue maintenant l'erreur avant de retomber sur le CPU.
    Logs traduits : "Client WebSocket connecté/déconnecté" → "WebSocket client connected/disconnected", "Erreur de traitement du chunk audio" → "Error while processing audio chunk".
    Petits détails : Path au lieu de strings brutes pour les fichiers temporaires, typage plus précis (tuple[str, str], dict[str, str]).

Le comportement fonctionnel est identique, uniquement la robustesse et la structure changent.
Presented file

Une chose à vérifier de ton côté : si WhisperModel n'est pas thread-safe pour des appels concurrents, il faudrait sérialiser les accès (ex. un asyncio.Lock autour de transcribe_wav) plutôt que de laisser to_thread lancer plusieurs inférences en parallèle sur le même modèle.
Main refactored
PY 

il faut sortir les routes etc
Architected modular codebase avec séparation des responsabilités

Bonne idée, ça sera plus propre. Je découpe en plusieurs modules avec les routes dans leur propre fichier (APIRouter).
Created 8 files, ran 3 commands

Structure finale :

whisper_qwen_service/
└── app/
    ├── __init__.py
    ├── config.py     # env vars, logger
    ├── model.py      # détection GPU/CPU + chargement WhisperModel (singleton)
    ├── audio.py       # convert_to_wav / transcribe_wav (async, via to_thread)
    ├── translate.py    # appel Ollama/Qwen
    ├── pipeline.py     # process_audio_bytes : orchestration bytes -> wav -> texte -> traduction
    ├── routes.py       # APIRouter : /api/health, /api/transcribe, /ws/transcribe
    └── main.py         # create_app() : instancie FastAPI, ajoute CORS, inclut le router

Pour lancer : uvicorn app.main:app --host 0.0.0.0 --port 8000 (en te plaçant dans whisper_qwen_service/).

Chaque module a une seule responsabilité : routes.py ne fait plus que du routing HTTP/WebSocket, toute la logique métier vit dans audio.py/translate.py/pipeline.py, et main.py ne sert qu'à assembler l'app (utile aussi si tu veux plus tard écrire des tests avec TestClient sans réimporter tout le module monolithique).
Presented 7 files

Un point à vérifier si tu déploies avec Docker : assure-toi que le Dockerfile/CMD pointe bien vers app.main:app (et non plus l'ancien fichier unique).
Config
PY 
Model
PY 
Audio
PY 
Translate
PY 
Pipeline
PY 
Routes
PY 
Main
PY 

taduit les commetaires en anglais const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const transcriptEl = document.getElementById('transcript');
const translationEl = document.getElementById('translation');
const meterCanvas = document.getElementById('meter');
const meterCtx = meterCanvas.getContext('2d');

let mediaRecorder;
let ws;
let stream;
let audioCtx;
let analyser;
let meterRAF;

function wsUrl() {
const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
return ${proto}//${window.location.host}/ws/transcribe;
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
meterCtx.fillStyle = i < barCount * 0.7 ? '#f2b84b' : '
#e8604c';
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
setStatus("Micro refusé ou indisponible", false);
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
setStatus('Connecté — écoute en cours', true);

const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
? 'audio/webm;codecs=opus'
: 'audio/webm';

mediaRecorder = new MediaRecorder(stream, { mimeType });
mediaRecorder.ondataavailable = (e) => {
if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
e.data.arrayBuffer().then((buf) => ws.send(buf));
      }
    };
mediaRecorder.start(5000); // chunk toutes les 5 secondes

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
setStatus(Erreur: ${data.error}, false);
return;
    }
appendLine(transcriptEl, data.transcription);
appendLine(translationEl, data.translation);
  };

ws.onerror = () => setStatus('Erreur WebSocket', false);

ws.onclose = () => {
setStatus('Déconnecté', false);
startBtn.disabled = false;
stopBtn.disabled = true;
  };
});

stopBtn.addEventListener('click', () => {
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
setStatus('Arrêté', false);
});
Identified single code comment requiring translation

Il n'y a en réalité qu'un seul commentaire dans ce fichier (// chunk toutes les 5 secondes), le reste étant des textes affichés à l'utilisateur (statuts UI), pas des commentaires de code. Je traduis ce commentaire :
js

mediaRecorder.start(5000); // chunk every 5 seconds

Si tu veux, je peux aussi traduire les textes de statut affichés à l'écran ("Micro refusé ou indisponible", "Connecté — écoute en cours", "Erreur: ...", "Erreur WebSocket", "Déconnecté", "Arrêté") — mais ce sont des chaînes visibles par l'utilisateur final, pas des commentaires, donc je n'y ai pas touché sans confirmation.
Created a file, read a file

Dis-moi si tu veux que je traduise aussi les textes de statut affichés à l'utilisateur.
Recorder
JS 

oui les texts de status
Edited 7 files, read a file

Tous les textes sont maintenant en anglais (comment inclus).
Recorder
JS 


Claude is AI and can make mistakes. Please double-check responses.
Recorder · JS
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const transcriptEl = document.getElementById('transcript');
const translationEl = document.getElementById('translation');
const meterCanvas = document.getElementById('meter');
const meterCtx = meterCanvas.getContext('2d');
 
let mediaRecorder;
let ws;
let stream;
let audioCtx;
let analyser;
let meterRAF;
 
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
 
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
 
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then((buf) => ws.send(buf));
      }
    };
    mediaRecorder.start(5000); // chunk every 5 seconds
 
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
 

