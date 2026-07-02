import type { DeckId, CrossfaderCurve, MuteSection } from '../types';
import { api } from '../api/http';

interface DeckNodes {
  sourceOriginal: AudioBufferSourceNode | null;
  sourceInstrumental: AudioBufferSourceNode | null;
  gainOriginal: GainNode;
  gainInstrumental: GainNode;
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  volume: GainNode;
  crossfaderGain: GainNode;
  headphoneCueGain: GainNode;
  analyser: AnalyserNode;
  bufferOriginal: AudioBuffer | null;
  bufferInstrumental: AudioBuffer | null;
  startTime: number;
  pauseOffset: number;
  isPlaying: boolean;
  playbackRate: number;
  cueEnabled: boolean;
  muteSections: MuteSection[];
  muteSectionsActive: boolean;
  autoMuteState: boolean;
  loadGeneration: number;
}

export class AudioEngine {
  private ctx: AudioContext;
  private decks: Map<DeckId, DeckNodes> = new Map();
  private onTimeUpdate: ((deckId: DeckId, time: number) => void) | null = null;
  private onEnded: ((deckId: DeckId) => void) | null = null;
  private animFrameId: number | null = null;
  // Reusable typed arrays for analyser data (avoids GC pressure)
  private analyserBuffers: Map<DeckId, Uint8Array<ArrayBuffer>> = new Map();

  // Master chain
  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;

  // Headphone chain
  private headphoneMixer: GainNode;
  private headphoneMasterSend: GainNode;
  private headphoneCueSend: GainNode;
  private headphoneGain: GainNode;
  private headphoneDestination: MediaStreamAudioDestinationNode;
  private headphoneAudioEl: HTMLAudioElement;

  // Crossfader state
  private crossfaderCurve: CrossfaderCurve = 'smooth';
  private currentCrossfaderValue = 0;

  constructor() {
    this.ctx = new AudioContext();

    // Master output chain
    this.masterGain = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Headphone output chain
    this.headphoneDestination = this.ctx.createMediaStreamDestination();
    this.headphoneGain = this.ctx.createGain();
    this.headphoneGain.gain.value = 0.8;
    this.headphoneMixer = this.ctx.createGain();
    this.headphoneMasterSend = this.ctx.createGain();
    this.headphoneMasterSend.gain.value = 0; // cueMix=0 means full cue
    this.headphoneCueSend = this.ctx.createGain();
    this.headphoneCueSend.gain.value = 1;

    // Master goes to headphone mixer via master send
    this.masterGain.connect(this.headphoneMasterSend);
    this.headphoneMasterSend.connect(this.headphoneMixer);
    // Cue send also goes to headphone mixer
    this.headphoneCueSend.connect(this.headphoneMixer);
    this.headphoneMixer.connect(this.headphoneGain);
    this.headphoneGain.connect(this.headphoneDestination);

    // Hidden audio element for headphone output routing
    this.headphoneAudioEl = document.createElement('audio');
    this.headphoneAudioEl.srcObject = this.headphoneDestination.stream;
    this.headphoneAudioEl.autoplay = true;

    this.decks.set('A', this.createDeckNodes());
    this.decks.set('B', this.createDeckNodes());
    this.startTimeUpdates();
  }

  private createDeckNodes(): DeckNodes {
    const gainOriginal = this.ctx.createGain();
    const gainInstrumental = this.ctx.createGain();
    gainInstrumental.gain.value = 0;

    const merger = this.ctx.createGain();
    gainOriginal.connect(merger);
    gainInstrumental.connect(merger);

    const eqLow = this.ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 320;
    eqLow.gain.value = 0;

    const eqMid = this.ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.7;
    eqMid.gain.value = 0;

    const eqHigh = this.ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 3200;
    eqHigh.gain.value = 0;

    const volume = this.ctx.createGain();
    const crossfaderGain = this.ctx.createGain();
    const headphoneCueGain = this.ctx.createGain();
    headphoneCueGain.gain.value = 0; // cue off by default
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;

    merger.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(volume);

    // Volume splits to crossfader (master) and headphone cue
    volume.connect(crossfaderGain);
    crossfaderGain.connect(this.masterGain);
    crossfaderGain.connect(analyser);

    // Headphone cue path: volume → headphoneCueGain → headphoneCueSend
    volume.connect(headphoneCueGain);
    headphoneCueGain.connect(this.headphoneCueSend);

    return {
      sourceOriginal: null,
      sourceInstrumental: null,
      gainOriginal,
      gainInstrumental,
      eqLow,
      eqMid,
      eqHigh,
      volume,
      crossfaderGain,
      headphoneCueGain,
      analyser,
      bufferOriginal: null,
      bufferInstrumental: null,
      startTime: 0,
      pauseOffset: 0,
      isPlaying: false,
      playbackRate: 1,
      cueEnabled: false,
      muteSections: [],
      muteSectionsActive: true,
      autoMuteState: false,
      loadGeneration: 0,
    };
  }

  private cleanupSources(deck: DeckNodes) {
    if (deck.sourceOriginal) {
      try { deck.sourceOriginal.stop(); } catch { /* already stopped */ }
      deck.sourceOriginal.disconnect();
      deck.sourceOriginal = null;
    }
    if (deck.sourceInstrumental) {
      try { deck.sourceInstrumental.stop(); } catch { /* already stopped */ }
      deck.sourceInstrumental.disconnect();
      deck.sourceInstrumental = null;
    }
  }

  setCallbacks(
    onTimeUpdate: (deckId: DeckId, time: number) => void,
    onEnded: (deckId: DeckId) => void,
  ) {
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
  }

  private startTimeUpdates() {
    const update = () => {
      for (const [deckId, deck] of this.decks) {
        if (deck.isPlaying && deck.bufferOriginal) {
          const elapsed = (this.ctx.currentTime - deck.startTime) * deck.playbackRate;
          const currentTime = deck.pauseOffset + elapsed;
          if (currentTime >= deck.bufferOriginal.duration) {
            this.stop(deckId);
            this.onEnded?.(deckId);
          } else {
            this.onTimeUpdate?.(deckId, currentTime);

            // Section-based auto-muting
            if (deck.muteSectionsActive && deck.muteSections.length > 0 && deck.bufferInstrumental) {
              const inSection = deck.muteSections.some(s => currentTime >= s.start && currentTime < s.end);
              if (inSection && !deck.autoMuteState) {
                // Entering a mute section — crossfade to instrumental
                deck.autoMuteState = true;
                const t = this.ctx.currentTime;
                deck.gainOriginal.gain.linearRampToValueAtTime(0, t + 0.02);
                deck.gainInstrumental.gain.linearRampToValueAtTime(1, t + 0.02);
              } else if (!inSection && deck.autoMuteState) {
                // Leaving a mute section — crossfade back to original
                deck.autoMuteState = false;
                const t = this.ctx.currentTime;
                deck.gainOriginal.gain.linearRampToValueAtTime(1, t + 0.02);
                deck.gainInstrumental.gain.linearRampToValueAtTime(0, t + 0.02);
              }
            }
          }
        }
      }
      this.animFrameId = requestAnimationFrame(update);
    };
    this.animFrameId = requestAnimationFrame(update);
  }

  async loadSong(deckId: DeckId, songId: number, hasStems: boolean) {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const deck = this.decks.get(deckId)!;

    // Stop and clear old buffers immediately so play() can't use stale audio
    if (deck.isPlaying) this.stop(deckId);
    this.cleanupSources(deck);
    deck.bufferOriginal = null;
    deck.bufferInstrumental = null;
    deck.pauseOffset = 0;
    deck.autoMuteState = false;

    // Increment generation to cancel any in-flight load for this deck
    const gen = ++deck.loadGeneration;

    // Load original audio only — return fast so deck is usable immediately
    const origResponse = await fetch(api.streamUrl(songId));
    if (deck.loadGeneration !== gen) return 0;
    if (!origResponse.ok) throw new Error(`Original fetch failed: HTTP ${origResponse.status}`);
    const origData = await origResponse.arrayBuffer();
    if (deck.loadGeneration !== gen) return 0;
    deck.bufferOriginal = await this.ctx.decodeAudioData(origData);
    if (deck.loadGeneration !== gen) { deck.bufferOriginal = null; return 0; }

    deck.gainOriginal.gain.value = 1;
    deck.gainInstrumental.gain.value = 0;

    // Load instrumental in background — don't block the deck
    if (hasStems) {
      this.loadInstrumentalHot(deckId, songId).catch(() => {});
    }

    return deck.bufferOriginal.duration;
  }

  // Hot-load instrumental stem while song may be playing (for instant vocal mute)
  async loadInstrumentalHot(deckId: DeckId, songId: number): Promise<boolean> {
    const deck = this.decks.get(deckId)!;
    try {
      const response = await fetch(api.stemByTypeUrl(songId, 'instrumental'));
      if (!response.ok) {
        console.error(`[AudioEngine] Instrumental fetch failed: HTTP ${response.status}`);
        return false;
      }
      const data = await response.arrayBuffer();
      console.log(`[AudioEngine] Instrumental fetched: ${data.byteLength} bytes`);
      deck.bufferInstrumental = await this.ctx.decodeAudioData(data);
      console.log(`[AudioEngine] Instrumental decoded: ${deck.bufferInstrumental.duration.toFixed(1)}s, channels: ${deck.bufferInstrumental.numberOfChannels}`);

      // If currently playing, start instrumental source at correct offset
      if (deck.isPlaying) {
        const elapsed = (this.ctx.currentTime - deck.startTime) * deck.playbackRate;
        const currentOffset = deck.pauseOffset + elapsed;

        if (deck.sourceInstrumental) {
          try { deck.sourceInstrumental.stop(); } catch {}
          deck.sourceInstrumental.disconnect();
        }

        const srcInst = this.ctx.createBufferSource();
        srcInst.buffer = deck.bufferInstrumental;
        srcInst.playbackRate.value = deck.playbackRate;
        srcInst.connect(deck.gainInstrumental);
        deck.sourceInstrumental = srcInst;
        srcInst.start(0, currentOffset);
      }
      return true;
    } catch (err) {
      console.error('[AudioEngine] loadInstrumentalHot FAILED:', err);
      return false;
    }
  }

  play(deckId: DeckId) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const deck = this.decks.get(deckId)!;
    if (!deck.bufferOriginal || deck.isPlaying) return;

    // Create and connect source for original
    const srcOrig = this.ctx.createBufferSource();
    srcOrig.buffer = deck.bufferOriginal;
    srcOrig.playbackRate.value = deck.playbackRate;
    srcOrig.connect(deck.gainOriginal);
    deck.sourceOriginal = srcOrig;

    // Create and connect source for instrumental
    if (deck.bufferInstrumental) {
      const srcInst = this.ctx.createBufferSource();
      srcInst.buffer = deck.bufferInstrumental;
      srcInst.playbackRate.value = deck.playbackRate;
      srcInst.connect(deck.gainInstrumental);
      deck.sourceInstrumental = srcInst;
      srcInst.start(0, deck.pauseOffset);
      console.log(`[AudioEngine] play: instrumental source STARTED at offset ${deck.pauseOffset.toFixed(1)}`);
    } else {
      console.log('[AudioEngine] play: NO instrumental buffer, skipping');
    }

    srcOrig.start(0, deck.pauseOffset);
    deck.startTime = this.ctx.currentTime;
    deck.isPlaying = true;
    console.log(`[AudioEngine] play: ctxState=${this.ctx.state}, gainOrig=${deck.gainOriginal.gain.value}, gainInst=${deck.gainInstrumental.gain.value}`);
  }

  pause(deckId: DeckId) {
    const deck = this.decks.get(deckId)!;
    if (!deck.isPlaying) return;

    const elapsed = (this.ctx.currentTime - deck.startTime) * deck.playbackRate;
    deck.pauseOffset += elapsed;

    this.cleanupSources(deck);
    deck.isPlaying = false;
  }

  stop(deckId: DeckId) {
    const deck = this.decks.get(deckId)!;
    this.cleanupSources(deck);
    deck.isPlaying = false;
    deck.pauseOffset = 0;
  }

  seek(deckId: DeckId, time: number) {
    const deck = this.decks.get(deckId)!;
    const wasPlaying = deck.isPlaying;
    if (wasPlaying) {
      this.cleanupSources(deck);
      deck.isPlaying = false;
    }
    deck.pauseOffset = time;
    if (wasPlaying) this.play(deckId);
  }

  /** During drag: pause audio silently, just update position. No source recreation. */
  seekDragStart(deckId: DeckId) {
    const deck = this.decks.get(deckId)!;
    if (deck.isPlaying) {
      this.cleanupSources(deck);
      deck.isPlaying = false;
      (deck as any)._wasDraggingWhilePlaying = true;
    }
  }

  /** During drag: update position without recreating audio sources. */
  seekDragUpdate(deckId: DeckId, time: number) {
    const deck = this.decks.get(deckId)!;
    deck.pauseOffset = time;
  }

  /** End drag: resume playback from new position if was playing. */
  seekDragEnd(deckId: DeckId) {
    const deck = this.decks.get(deckId)!;
    if ((deck as any)._wasDraggingWhilePlaying) {
      delete (deck as any)._wasDraggingWhilePlaying;
      this.play(deckId);
    }
  }

  setVolume(deckId: DeckId, value: number) {
    const deck = this.decks.get(deckId)!;
    deck.volume.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setTempo(deckId: DeckId, rate: number) {
    const deck = this.decks.get(deckId)!;
    if (deck.isPlaying) {
      const elapsed = (this.ctx.currentTime - deck.startTime) * deck.playbackRate;
      deck.pauseOffset += elapsed;
      deck.startTime = this.ctx.currentTime;
    }
    deck.playbackRate = rate;
    if (deck.sourceOriginal) deck.sourceOriginal.playbackRate.value = rate;
    if (deck.sourceInstrumental) deck.sourceInstrumental.playbackRate.value = rate;
  }

  setEQ(deckId: DeckId, band: 'low' | 'mid' | 'high', value: number) {
    const deck = this.decks.get(deckId)!;
    const dbValue = value * 12; // -12 to +12 dB
    const node = band === 'low' ? deck.eqLow : band === 'mid' ? deck.eqMid : deck.eqHigh;
    node.gain.setTargetAtTime(dbValue, this.ctx.currentTime, 0.01);
  }

  setVocalMute(deckId: DeckId, muted: boolean) {
    const deck = this.decks.get(deckId)!;
    if (!deck.bufferInstrumental) {
      console.warn(`[AudioEngine] setVocalMute(${muted}): NO instrumental buffer loaded!`);
      return;
    }

    // If playing but instrumental source doesn't exist yet, create it now
    if (muted && deck.isPlaying && !deck.sourceInstrumental) {
      const elapsed = (this.ctx.currentTime - deck.startTime) * deck.playbackRate;
      const currentOffset = deck.pauseOffset + elapsed;

      const srcInst = this.ctx.createBufferSource();
      srcInst.buffer = deck.bufferInstrumental;
      srcInst.playbackRate.value = deck.playbackRate;
      srcInst.connect(deck.gainInstrumental);
      deck.sourceInstrumental = srcInst;
      srcInst.start(0, currentOffset);
      console.log(`[AudioEngine] setVocalMute: created missing source at offset ${currentOffset.toFixed(1)}`);
    }

    console.log(`[AudioEngine] setVocalMute(${muted}): sourceInst=${!!deck.sourceInstrumental}, playing=${deck.isPlaying}`);
    const t = this.ctx.currentTime;
    if (muted) {
      deck.gainOriginal.gain.linearRampToValueAtTime(0, t + 0.02);
      deck.gainInstrumental.gain.linearRampToValueAtTime(1, t + 0.02);
    } else {
      deck.gainOriginal.gain.linearRampToValueAtTime(1, t + 0.02);
      deck.gainInstrumental.gain.linearRampToValueAtTime(0, t + 0.02);
    }
  }

  setMuteSections(deckId: DeckId, sections: MuteSection[]) {
    const deck = this.decks.get(deckId)!;
    deck.muteSections = sections;
    deck.autoMuteState = false;
  }

  setMuteSectionsActive(deckId: DeckId, active: boolean) {
    const deck = this.decks.get(deckId)!;
    deck.muteSectionsActive = active;
    if (!active && deck.autoMuteState) {
      // Turning off — restore original audio
      deck.autoMuteState = false;
      const t = this.ctx.currentTime;
      deck.gainOriginal.gain.linearRampToValueAtTime(1, t + 0.02);
      deck.gainInstrumental.gain.linearRampToValueAtTime(0, t + 0.02);
    }
  }

  setCrossfader(value: number) {
    this.currentCrossfaderValue = value;
    this.applyCrossfader();
  }

  private applyCrossfader() {
    const value = this.currentCrossfaderValue;
    const position = (value + 1) / 2; // 0 to 1

    let gainA: number;
    let gainB: number;

    switch (this.crossfaderCurve) {
      case 'linear':
        gainA = 1 - position;
        gainB = position;
        break;
      case 'sharp': {
        // Sharp curve: quick transition near center
        const sharpness = 4;
        gainA = position < 0.5
          ? 1
          : Math.max(0, 1 - Math.pow((position - 0.5) * 2, 1 / sharpness));
        gainB = position > 0.5
          ? 1
          : Math.max(0, 1 - Math.pow((0.5 - position) * 2, 1 / sharpness));
        break;
      }
      case 'smooth':
      default:
        // Equal-power crossfade (cosine)
        gainA = Math.cos(position * Math.PI / 2);
        gainB = Math.sin(position * Math.PI / 2);
        break;
    }

    const deckA = this.decks.get('A')!;
    const deckB = this.decks.get('B')!;
    deckA.crossfaderGain.gain.setTargetAtTime(gainA, this.ctx.currentTime, 0.01);
    deckB.crossfaderGain.gain.setTargetAtTime(gainB, this.ctx.currentTime, 0.01);
  }

  setCrossfaderCurve(curve: CrossfaderCurve) {
    this.crossfaderCurve = curve;
    this.applyCrossfader();
  }

  // --- Master/Headphone controls ---

  setMasterVolume(value: number) {
    this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setHeadphoneVolume(value: number) {
    this.headphoneGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setHeadphoneCueMix(value: number) {
    // value: 0 = full cue, 1 = full master
    this.headphoneCueSend.gain.setTargetAtTime(1 - value, this.ctx.currentTime, 0.01);
    this.headphoneMasterSend.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setCueEnabled(deckId: DeckId, enabled: boolean) {
    const deck = this.decks.get(deckId)!;
    deck.cueEnabled = enabled;
    deck.headphoneCueGain.gain.setTargetAtTime(enabled ? 1 : 0, this.ctx.currentTime, 0.01);
  }

  async setMasterDevice(deviceId: string) {
    try {
      // AudioContext.setSinkId is available in modern Chrome
      if ('setSinkId' in this.ctx && typeof (this.ctx as any).setSinkId === 'function') {
        await (this.ctx as any).setSinkId(deviceId || '');
      }
    } catch (e) {
      console.warn('Failed to set master device:', e);
    }
  }

  async setHeadphoneDevice(deviceId: string) {
    try {
      if ('setSinkId' in this.headphoneAudioEl && typeof this.headphoneAudioEl.setSinkId === 'function') {
        await this.headphoneAudioEl.setSinkId(deviceId || '');
      }
    } catch (e) {
      console.warn('Failed to set headphone device:', e);
    }
  }

  // --- Info methods ---

  getAudioInfo() {
    return {
      sampleRate: this.ctx.sampleRate,
      baseLatency: this.ctx.baseLatency ?? 0,
      outputLatency: (this.ctx as any).outputLatency ?? 0,
      state: this.ctx.state,
    };
  }

  getAnalyserData(deckId: DeckId): Uint8Array {
    const deck = this.decks.get(deckId)!;
    let buf = this.analyserBuffers.get(deckId);
    if (!buf || buf.length !== deck.analyser.frequencyBinCount) {
      buf = new Uint8Array(deck.analyser.frequencyBinCount);
      this.analyserBuffers.set(deckId, buf);
    }
    deck.analyser.getByteFrequencyData(buf);
    return buf;
  }

  getCurrentTime(deckId: DeckId): number {
    const deck = this.decks.get(deckId)!;
    if (!deck.isPlaying) return deck.pauseOffset;
    const elapsed = (this.ctx.currentTime - deck.startTime) * deck.playbackRate;
    return deck.pauseOffset + elapsed;
  }

  isInstrumentalLoaded(deckId: DeckId): boolean {
    return this.decks.get(deckId)!.bufferInstrumental !== null;
  }

  /** Extract peaks from the loaded AudioBuffer for waveform rendering. */
  getPeaks(deckId: DeckId, numPoints: number = 800): number[] | null {
    const deck = this.decks.get(deckId)!;
    if (!deck.bufferOriginal) return null;
    const channel = deck.bufferOriginal.getChannelData(0);
    const step = Math.floor(channel.length / numPoints);
    if (step === 0) return null;
    const peaks: number[] = [];
    for (let i = 0; i < numPoints; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, channel.length);
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channel[j]);
        if (abs > max) max = abs;
      }
      peaks.push(max);
    }
    return peaks;
  }

  isPlaying(deckId: DeckId): boolean {
    return this.decks.get(deckId)!.isPlaying;
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.decks.forEach((_, id) => this.stop(id));
    this.headphoneAudioEl.pause();
    this.headphoneAudioEl.srcObject = null;
    this.ctx.close();
  }
}
