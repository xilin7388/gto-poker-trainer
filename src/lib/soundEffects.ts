/**
 * Web Audio API Poker Sound Synthesizer
 * Provides high-fidelity, zero-dependency, real-time synthesized sound effects
 * for a premium, tactile poker user experience.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

// Resume AudioContext on user action to satisfy browser auto-play policies
async function ensureAudioContextActive(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
      return true;
    } catch (e) {
      console.warn("AudioContext resolution failed:", e);
      return false;
    }
  }
  return true;
}

/**
 * Play a double table-knock sound to signify a "Check".
 * Simulates a finger tapping on a clean oak poker table.
 */
export async function playCheckSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const active = await ensureAudioContextActive(ctx);
  if (!active) return;

  const playSingleKnock = (delay: number) => {
    const osc = ctx.createOscillator();
    const clickOsc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "triangle";
    // Slide from 600Hz down to 180Hz for a beautiful, punchy wood block sound audible on all speakers
    osc.frequency.setValueAtTime(600, ctx.currentTime + delay);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + delay + 0.08);

    clickOsc.type = "sine";
    // Crisp tactile contact tick at 1800Hz
    clickOsc.frequency.setValueAtTime(1800, ctx.currentTime + delay);
    clickOsc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + delay + 0.015);

    gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + delay + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.09);

    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, ctx.currentTime + delay);
    filter.frequency.linearRampToValueAtTime(500, ctx.currentTime + delay + 0.09);
    filter.Q.setValueAtTime(3.0, ctx.currentTime + delay);

    osc.connect(filter);
    clickOsc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // Warm organic texture noise transient
    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.02);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(1500, ctx.currentTime + delay);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.04, ctx.currentTime + delay);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.015);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSource.start(ctx.currentTime + delay);
      noiseSource.stop(ctx.currentTime + delay + 0.02);
    } catch (e) {
      // Safe fallback
    }

    osc.start(ctx.currentTime + delay);
    clickOsc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.1);
    clickOsc.stop(ctx.currentTime + delay + 0.1);
  };

  try {
    // Two quick knocks for double-tap GTO "Check"
    playSingleKnock(0);
    playSingleKnock(0.12);
  } catch (err) {
    console.error("Failed to synthesize check sound:", err);
  }
}

/**
 * Play a rich, satisfying ceramic/clay poker chip stack splash to signify a "Raise" or "Bet".
 * Synthesizes multiple natural-sounding body collisions with custom resonant decay.
 */
export async function playRaiseSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const active = await ensureAudioContextActive(ctx);
  if (!active) return;

  const playClayChipImpact = (delay: number, frequency: number, volume: number, duration: number) => {
    const oscBody = ctx.createOscillator();
    const oscRing = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filterNode = ctx.createBiquadFilter();

    // Body tone (triangle wave gives more organic plastic/clay body fullness)
    oscBody.type = "triangle";
    oscBody.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    oscBody.frequency.exponentialRampToValueAtTime(frequency * 0.8, ctx.currentTime + delay + duration);

    // High metallic resonant ring tone
    oscRing.type = "sine";
    oscRing.frequency.setValueAtTime(frequency * 1.5, ctx.currentTime + delay);
    oscRing.frequency.exponentialRampToValueAtTime(frequency * 1.35, ctx.currentTime + delay + duration);

    // Envelope
    gainNode.gain.setValueAtTime(0.001, ctx.currentTime + delay);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

    // Bandpass filter to isolate the sweet, hollow clay/dense plastic resonance (usually around 1kHz - 2kHz)
    filterNode.type = "bandpass";
    filterNode.frequency.setValueAtTime(1100, ctx.currentTime + delay);
    filterNode.Q.setValueAtTime(4.0, ctx.currentTime + delay);

    oscBody.connect(filterNode);
    oscRing.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Warm organic texture noise transient for plastic friction
    try {
      const bufferSize = Math.floor(ctx.sampleRate * 0.03); // 30ms friction
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(1700, ctx.currentTime + delay);
      noiseFilter.Q.setValueAtTime(3.0, ctx.currentTime + delay);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.05 * volume, ctx.currentTime + delay);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.025);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      
      noiseSource.start(ctx.currentTime + delay);
      noiseSource.stop(ctx.currentTime + delay + 0.03);
    } catch (e) {
      // safe fallback
    }

    oscBody.start(ctx.currentTime + delay);
    oscRing.start(ctx.currentTime + delay);
    
    oscBody.stop(ctx.currentTime + delay + duration + 0.02);
    oscRing.stop(ctx.currentTime + delay + duration + 0.02);
  };

  try {
    // Generate a beautiful, staggered 4-chip cascade stack push (clack-cluck-clank-click)
    playClayChipImpact(0.0, 950, 0.22, 0.12);
    playClayChipImpact(0.04, 750, 0.18, 0.15);
    playClayChipImpact(0.09, 1150, 0.14, 0.10);
    playClayChipImpact(0.14, 850, 0.10, 0.14);
  } catch (err) {
    console.error("Failed to synthesize raise sound:", err);
  }
}

/**
 * Play a friction sweep card roll sound to signify a "New Card Turned".
 * Uses bandpass-filtered noise swept in frequency.
 */
export async function playCardFlipSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const active = await ensureAudioContextActive(ctx);
  if (!active) return;

  try {
    const bufferSize = ctx.sampleRate * 0.18; // Short 180ms card glide
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Populating noise buffer
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    
    // Sweep frequency downwards to sound like physical card release friction on felt
    filter.frequency.setValueAtTime(3000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.16);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.17);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noiseSource.start();
    noiseSource.stop(ctx.currentTime + 0.18);
  } catch (err) {
    console.error("Failed to synthesize card deal sound:", err);
  }
}
