/**
 * Procedural Web Audio soundscape & tactile chimes (100% offline, zero external files).
 */

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private rootMidi = 57;
  private scale: number[] = [0, 2, 4, 7, 9];

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setBiomeTuning(rootMidi: number, scale: number[]): void {
    this.rootMidi = rootMidi;
    this.scale = scale;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    slideToFreq?: number,
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideToFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playHop(row: number, col: number): void {
    const deg = (row + col) % this.scale.length;
    const oct = Math.floor((row + col) / this.scale.length) % 2;
    const midi = this.rootMidi + 12 + this.scale[deg] + oct * 12;
    this.playTone(midiToHz(midi), 0.22, 'sine', 0.11);
    this.playTone(midiToHz(midi + 12), 0.12, 'triangle', 0.035);
  }

  playWhisper(): void {
    this.playTone(midiToHz(this.rootMidi + 12), 0.45, 'sine', 0.06);
    this.playTone(midiToHz(this.rootMidi + 19), 0.55, 'sine', 0.05, 0.09);
  }

  playPin(): void {
    this.playTone(midiToHz(this.rootMidi + 24), 0.09, 'triangle', 0.06);
  }

  playWilt(): void {
    this.playTone(170, 0.28, 'sawtooth', 0.08, 0, 88);
    this.playTone(124, 0.32, 'triangle', 0.09, 0.03, 72);
  }

  playGoldLit(): void {
    const base = midiToHz(this.rootMidi + 16);
    this.playTone(base, 0.4, 'sine', 0.1);
    this.playTone(base * 1.5, 0.5, 'triangle', 0.07, 0.05);
  }

  playDoorOpen(): void {
    const chord = [0, 4, 7, 12];
    chord.forEach((semi, idx) => {
      this.playTone(midiToHz(this.rootMidi + 12 + semi), 0.6, 'sine', 0.075, idx * 0.055);
    });
  }

  playDoorClose(): void {
    this.playTone(135, 0.45, 'triangle', 0.11, 0, 58);
    this.playTone(98, 0.5, 'sine', 0.12, 0.04, 46);
  }

  playWin(): void {
    const notes = [0, 4, 7, 11, 12, 16];
    notes.forEach((semi, i) => {
      this.playTone(midiToHz(this.rootMidi + 12 + semi), 0.65, 'sine', 0.085, i * 0.07);
    });
  }

  playVoid(): void {
    this.playTone(220, 0.85, 'sine', 0.1, 0, 58);
    this.playTone(155, 1.1, 'triangle', 0.09, 0.06, 46);
    this.playTone(92, 1.4, 'sawtooth', 0.05, 0.14, 38);
  }
}

export const soundEngine = new SoundEngine();
