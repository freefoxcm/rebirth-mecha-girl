export type SfxName =
  | 'gun'
  | 'missile'
  | 'lock'
  | 'explosion'
  | 'hit'
  | 'ui'
  | 'confirm'
  | 'back'
  | 'alarm'
  | 'pickup'
  | 'stamp'
  | 'special'
  | 'revive'
  | 'radio'
  | 'fail'
  | 'success';

export type MusicKind = 'none' | 'menu' | 'combat' | 'boss' | 'ending';

interface TrackState {
  kind: MusicKind;
  step: number;
  nextTime: number;
  tempo: number;
}

const COMBAT_BASS = [45, 45, 48, 45, 43, 45, 50, 45]; // A1 C2 G1 D2
const COMBAT_ARP = [69, 72, 76, 72, 69, 76, 81, 76];
const MENU_CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
const BOSS_BASS = [40, 40, 46, 40, 41, 41, 47, 40];

/** 纯 WebAudio 合成音效与音乐，不依赖任何外部音频文件。 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastGun = 0;
  private music: TrackState = { kind: 'none', step: 0, nextTime: 0, tempo: 112 };
  private timer: number | null = null;
  private volumes = { master: 0.85, sfx: 0.75, music: 0.45 };
  private disposed = false;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state !== 'closed';
  }

  get kind(): MusicKind {
    return this.music.kind;
  }

  init(): void {
    if (this.ctx || this.disposed) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.applyVolumes();
    this.buildNoise();
  }

  async unlock(): Promise<void> {
    this.init();
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* user gesture required */
      }
    }
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.volumes = { master, sfx, music };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master?.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfxBus?.gain.setTargetAtTime(this.volumes.sfx * 0.9, t, 0.05);
    this.musicBus?.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.08);
  }

  private buildNoise(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    this.noiseBuffer = buffer;
  }

  private get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    t0: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    destination?: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.012, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(destination ?? this.sfxBus ?? ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(
    t0: number,
    dur: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    peak: number,
    q = 0.8,
    destination?: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(30, freqStart), t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + Math.min(0.01, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination ?? this.sfxBus ?? ctx.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** 和弦：用于菜单氛围与重生演出。 */
  private chord(t0: number, notes: number[], dur: number, peak: number, destination?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = this.midi(note);
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.4, dur * 0.3));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination ?? this.musicBus ?? ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
  }

  private midi(note: number): number {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  play(name: SfxName): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.now;
    switch (name) {
      case 'gun': {
        if (t - this.lastGun < 0.045) return;
        this.lastGun = t;
        this.noise(t, 0.075, 'bandpass', 2400, 700, 0.13, 0.9);
        this.tone(t, 'square', 150, 70, 0.07, 0.05);
        break;
      }
      case 'missile':
        this.noise(t, 0.55, 'bandpass', 500, 2600, 0.12, 0.7);
        this.tone(t, 'sawtooth', 220, 90, 0.5, 0.05);
        break;
      case 'lock':
        this.tone(t, 'square', 980, 980, 0.05, 0.04);
        this.tone(t + 0.075, 'square', 1320, 1320, 0.06, 0.045);
        break;
      case 'explosion':
        this.noise(t, 0.65, 'lowpass', 1600, 90, 0.42, 1.1);
        this.tone(t, 'sine', 70, 30, 0.55, 0.38);
        break;
      case 'hit':
        this.tone(t, 'square', 2100, 1400, 0.035, 0.045);
        break;
      case 'ui':
        this.tone(t, 'sine', 520, 560, 0.045, 0.035);
        break;
      case 'confirm':
        this.tone(t, 'triangle', 680, 1020, 0.09, 0.05);
        break;
      case 'back':
        this.tone(t, 'triangle', 420, 300, 0.09, 0.04);
        break;
      case 'alarm':
        this.tone(t, 'square', 720, 720, 0.11, 0.035);
        this.tone(t + 0.14, 'square', 480, 480, 0.14, 0.035);
        break;
      case 'pickup':
        this.tone(t, 'sine', 1046, 1046, 0.05, 0.03);
        this.tone(t + 0.045, 'sine', 1568, 1568, 0.07, 0.03);
        break;
      case 'stamp':
        this.tone(t, 'sine', 100, 42, 0.28, 0.3);
        this.noise(t, 0.16, 'lowpass', 600, 200, 0.18, 0.7);
        break;
      case 'special':
        this.tone(t, 'sawtooth', 160, 1500, 0.42, 0.09);
        this.noise(t, 0.5, 'bandpass', 600, 4000, 0.1, 0.9);
        break;
      case 'revive':
        this.chord(t, [57, 64, 69], 1.1, 0.05);
        break;
      case 'radio':
        this.noise(t, 0.07, 'bandpass', 1800, 1200, 0.05, 2);
        break;
      case 'fail':
        this.tone(t, 'sawtooth', 240, 110, 0.7, 0.07);
        break;
      case 'success':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 'triangle', f, f, 0.24, 0.05));
        break;
    }
  }

  startMusic(kind: MusicKind): void {
    this.init();
    if (!this.ctx) return;
    if (this.music.kind === kind && this.timer !== null) return;
    this.music.kind = kind;
    this.music.step = 0;
    this.music.nextTime = this.now + 0.08;
    this.music.tempo = kind === 'combat' ? 112 : kind === 'boss' ? 132 : kind === 'ending' ? 68 : 76;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (kind === 'none') return;
    this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stopMusic(): void {
    this.startMusic('none');
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.music.kind === 'none') return;
    const stepDur = 60 / this.music.tempo / 4;
    while (this.music.nextTime < ctx.currentTime + 0.15) {
      this.scheduleStep(this.music.step, this.music.nextTime);
      this.music.step = (this.music.step + 1) % 64;
      this.music.nextTime += stepDur;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const bus = this.musicBus ?? undefined;
    const kind = this.music.kind;

    if (kind === 'menu') {
      if (s === 0) {
        const notes = MENU_CHORDS[bar];
        this.chord(t, notes, 3.4, 0.035, bus);
        this.tone(t, 'sine', this.midi(notes[0] - 12), this.midi(notes[0] - 12), 3.2, 0.035, bus);
      }
      if (s % 2 === 0) {
        const arp = [0, 7, 12, 7, 3, 10, 15, 10][(step / 2) % 8 | 0];
        this.tone(t, 'triangle', this.midi(69 + arp), this.midi(69 + arp), 0.35, 0.012, bus);
      }
      return;
    }

    if (kind === 'ending') {
      if (s === 0) {
        this.chord(t, [57, 60, 64, 69], 4.2, 0.045, bus);
        this.tone(t, 'sine', this.midi(45), this.midi(45), 4, 0.05, bus);
      }
      if (s % 4 === 0) {
        this.tone(t, 'triangle', this.midi([69, 72, 76, 79][(step / 4) % 4 | 0]), this.midi(69), 0.9, 0.014, bus);
      }
      return;
    }

    const heavy = kind === 'boss';
    const kickSteps = heavy ? [0, 4, 8, 12] : [0, 4, 8, 12];
    const snareSteps = heavy ? [2, 6, 10, 14] : [4, 12];
    if (kickSteps.includes(s)) {
      this.tone(t, 'sine', 150, 42, 0.2, 0.22, bus);
    }
    if (snareSteps.includes(s)) {
      this.noise(t, 0.12, 'bandpass', 1800, 1200, 0.075, 1.2, bus);
      this.tone(t, 'triangle', 190, 150, 0.07, 0.05, bus);
    }
    if (s % 2 === 0) {
      this.noise(t, 0.035, 'highpass', 7200, 6000, 0.026, 0.8, bus);
    }
    const bass = heavy ? BOSS_BASS : COMBAT_BASS;
    if (s % 2 === 0) {
      const n = bass[(s / 2) % bass.length | 0];
      this.bassNote(t, n, 0.26, bus);
    }
    if (heavy && s % 4 === 3) {
      this.tone(t, 'sawtooth', this.midi(76), this.midi(75), 0.15, 0.02, bus);
    }
    const arp = COMBAT_ARP[(step + bar * 2) % COMBAT_ARP.length];
    if (!heavy || s % 2 === 1) {
      this.tone(t, 'square', this.midi(arp + 12), this.midi(arp + 12), 0.09, heavy ? 0.014 : 0.012, bus);
    }
  }

  private bassNote(t: number, note: number, dur: number, destination?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = this.midi(note);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination ?? this.musicBus ?? ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
