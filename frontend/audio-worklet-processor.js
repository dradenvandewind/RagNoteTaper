// Runs on the audio rendering thread. Buffers incoming Float32 samples and
// posts them to the main thread as raw Int16 PCM once enough samples have
// accumulated (~46ms per message at 44.1kHz), instead of once per 128-sample
// audio quantum, to keep the number of postMessage/WebSocket sends reasonable.
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameSize = 2048;
    this.buffer = new Float32Array(this.frameSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const GAIN = 2.0;

    const channelData = input[0]; // mono
    for (let i = 0; i < channelData.length; i++) {
          this.buffer[this.offset++] = Math.max(-1, Math.min(1, channelData[i] * GAIN));
      if (this.offset === this.frameSize) {
        const pcm16 = new Int16Array(this.frameSize);
        for (let j = 0; j < this.frameSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
