/**
 * Audio Mixer Service for Multi-Track WebRTC STT.
 * Safely clones input tracks and merges them into a single mono/stereo MediaStream
 * for consumption by Voice Activity Detection (VAD) and ASR engines.
 * 
 * IMPORTANT:
 * 1. Clones all incoming tracks to prevent stopping live peer tracks.
 * 2. Connects sources ONLY to MediaStreamDestination (NEVER to AudioContext.destination)
 *    to prevent audio feedback/echo to physical speakers.
 * 3. Provides dispose() to cleanly release audio graphs, nodes, and cloned tracks.
 */

export function createMixedStream(tracks) {
  if (!tracks || tracks.length === 0) {
    return {
      stream: new MediaStream(),
      dispose: () => {},
    };
  }

  // Optimized single-track shortcut (avoids AudioContext overhead when only 1 track is active)
  if (tracks.length === 1) {
    const cloned = tracks[0].clone();
    const stream = new MediaStream([cloned]);
    return {
      stream,
      dispose: () => {
        try {
          cloned.stop();
        } catch {}
      },
    };
  }

  // Multi-track audio graph mixing
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  const dest = ctx.createMediaStreamDestination();

  const clones = tracks.map((t) => t.clone());
  const sources = clones.map((cloneTrack) => {
    const src = ctx.createMediaStreamSource(new MediaStream([cloneTrack]));
    src.connect(dest);
    return src;
  });

  return {
    stream: dest.stream,
    dispose: () => {
      sources.forEach((src) => {
        try {
          src.disconnect();
        } catch {}
      });
      clones.forEach((cloneTrack) => {
        try {
          cloneTrack.stop();
        } catch {}
      });
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    },
  };
}
