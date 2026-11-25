type AudioContextConstructor = typeof AudioContext;

let sharedAudioContext: AudioContext | null = null;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const win = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };

  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function ensureAudioContext(): AudioContext | null {
  const AudioCtx = getAudioContextConstructor();
  if (!AudioCtx) {
    return null;
  }

  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }

  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume().catch(() => {
      // Ignore browser autoplay rejection if gesture context was lost.
    });
  }

  return sharedAudioContext;
}

/**
 * Returns the shared Web Audio API AudioContext instance if created.
 */
export function getAudioContext(): AudioContext | null {
  return sharedAudioContext;
}

/**
 * Initializes and unlocks the Web Audio API AudioContext during a user click/tap
 * gesture so mobile browsers (iOS Safari / Android Chrome) allow notification
 * audio playback when the visitor's turn arrives.
 */
export function unlockAudioContext(): boolean {
  try {
    const ctx = ensureAudioContext();
    if (!ctx) {
      return false;
    }

    // Play a 1-sample silent buffer to satisfy mobile Safari Web Audio unlock requirements.
    const silentBuffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(ctx.destination);
    source.start(0);

    return true;
  } catch {
    return false;
  }
}

/**
 * Synthesizes a soft, clear 3-note ascending chime (C5 -> E5 -> G5)
 * using the Web Audio API without any external audio assets.
 */
export function playCallChime(): boolean {
  try {
    const ctx = ensureAudioContext();
    if (!ctx) {
      return false;
    }

    const now = ctx.currentTime + 0.02;
    const notes = [
      { frequency: 523.25, offset: 0.0, duration: 0.36 }, // C5
      { frequency: 659.25, offset: 0.16, duration: 0.38 }, // E5
      { frequency: 783.99, offset: 0.32, duration: 0.62 }, // G5
    ];

    for (const note of notes) {
      const startTime = now + note.offset;
      const stopTime = startTime + note.duration;

      const oscPrimary = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const harmonicGain = ctx.createGain();

      oscPrimary.type = 'sine';
      oscPrimary.frequency.setValueAtTime(note.frequency, startTime);

      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(note.frequency * 2, startTime);

      harmonicGain.gain.setValueAtTime(0.08, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(0.22, startTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      oscPrimary.connect(noteGain);
      oscHarmonic.connect(harmonicGain);
      harmonicGain.connect(noteGain);
      noteGain.connect(ctx.destination);

      oscPrimary.start(startTime);
      oscHarmonic.start(startTime);
      oscPrimary.stop(stopTime + 0.02);
      oscHarmonic.stop(stopTime + 0.02);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers a gentle double-pulse vibration pattern on devices that support it.
 */
export function triggerCallVibration(): boolean {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      return navigator.vibrate([300, 150, 300]);
    }
    return false;
  } catch {
    return false;
  }
}
