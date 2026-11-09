/**
 * Zero-dependency Web Audio API sound synthesizer for SL-Meet.
 * Plays crisp, harmonic acoustic chimes for room events.
 */

/**
 * Plays a warm, subtle ascending 2-tone melodic chime when joining a meeting room.
 * Notes: D5 (587.33 Hz) -> A5 (880.00 Hz)
 *
 * @param {string} [sinkId=''] - Optional audio output deviceId (setSinkId)
 */
export async function playJoinRoomSound(sinkId = '') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const audioCtx = new AudioCtx();

    if (sinkId && typeof audioCtx.setSinkId === 'function') {
      try {
        await audioCtx.setSinkId(sinkId);
      } catch (err) {
        console.warn('[meetingSound] Failed to setSinkId on AudioContext:', err);
      }
    }

    const now = audioCtx.currentTime;
    const notes = [
      { freq: 587.33, time: 0.0, dur: 0.18, peakGain: 0.09 }, // D5
      { freq: 880.00, time: 0.12, dur: 0.38, peakGain: 0.12 }, // A5
    ];

    notes.forEach(({ freq, time, dur, peakGain }) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0.0001, now + time);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur + 0.05);
    });

    setTimeout(() => {
      audioCtx.close().catch(() => {});
    }, 600);
  } catch (err) {
    console.warn('[meetingSound] Could not play join chime:', err);
  }
}

