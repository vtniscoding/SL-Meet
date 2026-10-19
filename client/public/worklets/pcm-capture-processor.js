/**
 * AudioWorkletProcessor for extracting raw mono 16kHz Float32 PCM chunks
 * and forwarding them directly to the main thread via MessagePort.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData && channelData.length > 0) {
        // Copy audio buffer to prevent detached ArrayBuffer issues when posting
        const copy = new Float32Array(channelData.length);
        copy.set(channelData);
        this.port.postMessage(copy, [copy.buffer]);
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
