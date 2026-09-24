import type { DeckId } from '../types';
import type { SessionItem } from '../types';
import { getEffectivePlaybackSettings, getEffectiveMuteSections } from '../types';
import { AudioEngine } from './AudioEngine';
type TransitionType = 'smooth' | 'sharp' | 'linear' | 'cut';


interface SongPlaybackConfig {
  startTime: number;
  endTime: number | null;
  transitionDuration: number;
  transitionType: TransitionType;
  playbackSpeed: number;
}

function getPlaybackConfig(item: SessionItem): SongPlaybackConfig {
  const eff = getEffectivePlaybackSettings(item);
  return {
    startTime: eff.start_time,
    endTime: eff.end_time,
    transitionDuration: eff.transition_duration,
    transitionType: eff.transition_type as TransitionType,
    playbackSpeed: eff.playback_speed,
  };
}

export class PlaybackEngine {
  private engine: AudioEngine;
  private activeDeck: DeckId = 'A';
  private preloadDeck: DeckId = 'B';
  private preloadedItemId: number | null = null;
  private crossfadeAnimId: number | null = null;
  private monitorAnimId: number | null = null;
  private isTransitioning = false;
  private active = false;

  private preloadedItem: SessionItem | null = null;
  private preloadedDuration = 0;
  private playGeneration = 0;

  // Callbacks
  private onTimeUpdate: ((time: number) => void) | null = null;
  private onSongEnd: (() => void) | null = null;
  private onSongStart: ((item: SessionItem) => void) | null = null;
  private onTransitionChange: ((isTransitioning: boolean, nextSongTitle: string | null) => void) | null = null;

  // Current state
  private currentItem: SessionItem | null = null;
  private currentConfig: SongPlaybackConfig | null = null;
  private currentDuration = 0;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  setCallbacks(callbacks: {
    onTimeUpdate: (time: number) => void;
    onSongEnd: () => void;
    onSongStart: (item: SessionItem) => void;
    onTransitionChange?: (isTransitioning: boolean, nextSongTitle: string | null) => void;
  }) {
    this.onTimeUpdate = callbacks.onTimeUpdate;
    this.onSongEnd = callbacks.onSongEnd;
    this.onSongStart = callbacks.onSongStart;
    this.onTransitionChange = callbacks.onTransitionChange ?? null;
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this.engine.setCallbacks(
      (_deckId: DeckId, _time: number) => {
        // We handle time monitoring ourselves
      },
      (deckId: DeckId) => {
        if (deckId === this.activeDeck && !this.isTransitioning) {
          this.onSongEnd?.();
        }
      }
    );
    this.startMonitor();
  }

  deactivate() {
    this.active = false;
    this.stopMonitor();
    this.cancelTransition();
    this.engine.setTransitionGain('A', 1);
    this.engine.setTransitionGain('B', 1);
  }

  // ─── Monitor ───────────────────────────────────────────────

  private startMonitor() {
    const monitor = () => {
      if (!this.active) return;

      if (this.currentItem && !this.isTransitioning) {
        const time = this.engine.getCurrentTime(this.activeDeck);
        this.onTimeUpdate?.(time);

        const config = this.currentConfig!;
        const effectiveEnd = config.endTime ?? this.currentDuration;
        const transitionPoint = effectiveEnd - config.transitionDuration;

        if (time >= transitionPoint && time < effectiveEnd) {
          this.beginTransition();
        }
      }

      this.monitorAnimId = requestAnimationFrame(monitor);
    };
    this.monitorAnimId = requestAnimationFrame(monitor);
  }

  private stopMonitor() {
    if (this.monitorAnimId) {
      cancelAnimationFrame(this.monitorAnimId);
      this.monitorAnimId = null;
    }
  }

  // ─── Main API ──────────────────────────────────────────────

  async playSong(item: SessionItem, preloadNext?: SessionItem | null) {
    // Case 1: Already playing on active deck (from completed transition) — skip reload
    if (this.currentItem && this.currentItem.id === item.id && this.engine.isPlaying(this.activeDeck)) {
      this.onTransitionChange?.(false, null);
      this.clearPreload();
      if (preloadNext) this.preloadSong(preloadNext);
      return;
    }

    // Case 2: Song is preloaded on preload deck — smooth crossfade or snap
    if (this.preloadedItemId === item.id && this.preloadedItem) {
      if (this.isTransitioning) {
        // Mid-transition to this song — snap to completion instantly
        this.snapTransitionComplete(preloadNext);
      } else if (this.engine.isPlaying(this.activeDeck)) {
        // Active deck playing — smooth skip crossfade
        this.doSkipCrossfade(item, preloadNext);
      } else {
        // Nothing playing — start preloaded song directly
        this.startPreloadedDirect(item, preloadNext);
      }
      return;
    }

    // Case 3: Not preloaded — load fresh
    const gen = ++this.playGeneration;
    const wasPlaying = !this.isTransitioning && this.engine.isPlaying(this.activeDeck);

    // Cancel any ongoing transition
    this.cancelTransition();

    if (wasPlaying) {
      // Keep old song playing on active deck while loading new song on preload deck
      this.engine.stop(this.preloadDeck);
      this.clearPreload();

      const hasStems = item.song.stems_status === 'ready' && item.song.stems.length > 0;
      let duration: number;
      try {
        duration = await this.engine.loadSong(this.preloadDeck, item.song.id, hasStems);
        if (gen !== this.playGeneration) return;
      } catch (e) {
        if (gen !== this.playGeneration) return;
        console.error('Failed to load song:', e);
        this.onTransitionChange?.(false, null);
        this.onSongEnd?.();
        return;
      }

      // Configure preload deck
      this.preloadedItemId = item.id;
      this.preloadedItem = item;
      this.preloadedDuration = duration;
      this.applyDeckConfig(this.preloadDeck, item);

      // Crossfade from active to preload
      this.doSkipCrossfade(item, preloadNext);
    } else {
      // Nothing playing — stop everything, load on active deck, play directly
      this.engine.stop(this.activeDeck);
      this.engine.stop(this.preloadDeck);
      this.clearPreload();

      this.currentItem = item;
      this.currentConfig = getPlaybackConfig(item);

      this.engine.setTransitionGain(this.activeDeck, 1);
      this.engine.setTransitionGain(this.preloadDeck, 0);

      const hasStems = item.song.stems_status === 'ready' && item.song.stems.length > 0;
      try {
        const duration = await this.engine.loadSong(this.activeDeck, item.song.id, hasStems);
        if (gen !== this.playGeneration) return;
        this.currentDuration = duration;
      } catch (e) {
        if (gen !== this.playGeneration) return;
        console.error('Failed to load song:', e);
        this.onTransitionChange?.(false, null);
        this.onSongEnd?.();
        return;
      }

      this.applyDeckConfig(this.activeDeck, item);
      this.engine.play(this.activeDeck);
      this.onSongStart?.(item);
      this.onTransitionChange?.(false, null);
      if (preloadNext) this.preloadSong(preloadNext);
    }
  }

  /** Re-preload the next song (called when queue changes to keep preload in sync) */
  async rePreload(item: SessionItem | null) {
    if (this.isTransitioning) return;
    if (!item) {
      this.clearPreload();
      return;
    }
    if (this.preloadedItemId === item.id) return;
    await this.preloadSong(item);
  }

  pause() {
    if (this.currentItem) {
      this.engine.pause(this.activeDeck);
    }
  }

  resume() {
    if (this.currentItem) {
      this.engine.play(this.activeDeck);
    }
  }

  seek(time: number) {
    this.engine.seek(this.activeDeck, time);
  }

  stop() {
    this.cancelTransition();
    this.engine.stop(this.activeDeck);
    this.engine.stop(this.preloadDeck);
    this.currentItem = null;
    this.currentConfig = null;
    this.currentDuration = 0;
    this.clearPreload();
    this.onTransitionChange?.(false, null);
  }

  setSpeed(speed: number) {
    this.engine.setTempo(this.activeDeck, speed);
  }

  getCurrentTime(): number {
    return this.engine.getCurrentTime(this.activeDeck);
  }

  isCurrentlyPlaying(): boolean {
    return this.engine.isPlaying(this.activeDeck);
  }

  getActiveDeck(): DeckId {
    return this.activeDeck;
  }

  // ─── Auto transition (end of song) ────────────────────────

  private beginTransition() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    if (this.preloadedItemId === null || !this.preloadedItem) {
      this.engine.stop(this.activeDeck);
      this.isTransitioning = false;
      this.onSongEnd?.();
      return;
    }

    const nextTitle = this.preloadedItem.song?.title ?? null;
    this.onTransitionChange?.(true, nextTitle);

    const config = this.currentConfig!;
    const duration = config.transitionDuration;

    if (config.transitionType === 'cut') {
      this.engine.stop(this.activeDeck);
      this.engine.setTransitionGain(this.activeDeck, 0);
      this.engine.setTransitionGain(this.preloadDeck, 1);

      const nextConfig = this.getPreloadConfig();
      if (nextConfig) {
        this.engine.setTempo(this.preloadDeck, nextConfig.playbackSpeed);
        if (nextConfig.startTime > 0) {
          this.engine.seek(this.preloadDeck, nextConfig.startTime);
        }
        this.engine.play(this.preloadDeck);
      }

      this.currentItem = this.preloadedItem;
      this.currentConfig = getPlaybackConfig(this.preloadedItem);
      this.currentDuration = this.preloadedDuration;
      this.swapDecks();
      this.isTransitioning = false;
      this.onTransitionChange?.(false, null);
      this.onSongEnd?.();
      return;
    }

    // Start next song on preload deck
    const nextConfig = this.getPreloadConfig();
    if (nextConfig) {
      this.engine.setTempo(this.preloadDeck, nextConfig.playbackSpeed);
      if (nextConfig.startTime > 0) {
        this.engine.seek(this.preloadDeck, nextConfig.startTime);
      }
      this.engine.play(this.preloadDeck);
    }

    // Animate transition gains
    const startTimestamp = performance.now();
    const durationMs = duration * 1000;

    const animate = (now: number) => {
      if (!this.active) return;

      const elapsed = now - startTimestamp;
      const progress = Math.min(elapsed / durationMs, 1);

      let easedProgress: number;
      switch (config.transitionType) {
        case 'sharp':
          easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          break;
        case 'linear':
          easedProgress = progress;
          break;
        case 'smooth':
        default: {
          // S-curve with middle plateau: derivative=0 at midpoint so both
          // songs stay at similar volume for a noticeable period before completing
          const x = 2 * progress - 1;
          easedProgress = 0.5 + 0.5 * x * Math.abs(x);
          break;
        }
      }

      this.engine.setTransitionGain(this.activeDeck, 1 - easedProgress);
      this.engine.setTransitionGain(this.preloadDeck, easedProgress);

      if (progress < 1) {
        this.crossfadeAnimId = requestAnimationFrame(animate);
      } else {
        this.engine.stop(this.activeDeck);
        const transitionedItem = this.preloadedItem;
        if (transitionedItem) {
          this.currentItem = transitionedItem;
          this.currentConfig = getPlaybackConfig(transitionedItem);
          this.currentDuration = this.preloadedDuration;
        }
        this.swapDecks();
        this.isTransitioning = false;
        this.crossfadeAnimId = null;
        this.onTransitionChange?.(false, null);
        this.onSongEnd?.();
      }
    };

    this.crossfadeAnimId = requestAnimationFrame(animate);
  }

  // ─── Skip crossfade (manual next/prev) ────────────────────

  /** Crossfade for manual skip — uses song's configured transition duration and easing */
  private doSkipCrossfade(item: SessionItem, preloadNext?: SessionItem | null) {
    this.cancelTransition();

    this.engine.setTransitionGain(this.activeDeck, 1);
    this.engine.setTransitionGain(this.preloadDeck, 0);

    // Start preloaded song
    const config = getPlaybackConfig(item);
    this.engine.setTempo(this.preloadDeck, config.playbackSpeed);
    if (config.startTime > 0) {
      this.engine.seek(this.preloadDeck, config.startTime);
    }
    this.engine.play(this.preloadDeck);

    // 'cut' type — skip animation entirely, instant swap
    if (config.transitionType === 'cut') {
      this.engine.stop(this.activeDeck);
      this.engine.setTransitionGain(this.activeDeck, 0);
      this.engine.setTransitionGain(this.preloadDeck, 1);
      this.currentItem = item;
      this.currentConfig = config;
      this.currentDuration = this.preloadedDuration;
      this.swapDecks();
      this.onTransitionChange?.(false, null);
      this.onSongStart?.(item);
      if (preloadNext) this.preloadSong(preloadNext);
      return;
    }

    this.isTransitioning = true;
    // Transition indicator was already set by the subscription before playSong was called

    const durationMs = config.transitionDuration * 1000;
    const startTimestamp = performance.now();

    const animate = (now: number) => {
      if (!this.active) return;
      const elapsed = now - startTimestamp;
      const progress = Math.min(elapsed / durationMs, 1);

      let eased: number;
      switch (config.transitionType) {
        case 'sharp':
          eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          break;
        case 'linear':
          eased = progress;
          break;
        case 'smooth':
        default: {
          const x = 2 * progress - 1;
          eased = 0.5 + 0.5 * x * Math.abs(x);
          break;
        }
      }

      this.engine.setTransitionGain(this.activeDeck, 1 - eased);
      this.engine.setTransitionGain(this.preloadDeck, eased);

      if (progress < 1) {
        this.crossfadeAnimId = requestAnimationFrame(animate);
      } else {
        this.engine.stop(this.activeDeck);
        this.currentItem = item;
        this.currentConfig = config;
        this.currentDuration = this.preloadedDuration;
        this.swapDecks();
        this.isTransitioning = false;
        this.crossfadeAnimId = null;
        this.onTransitionChange?.(false, null);
        this.onSongStart?.(item);
        if (preloadNext) this.preloadSong(preloadNext);
      }
    };

    this.crossfadeAnimId = requestAnimationFrame(animate);
  }

  /** Snap a mid-transition to completion instantly (user skipped to what's already transitioning) */
  private snapTransitionComplete(preloadNext?: SessionItem | null) {
    this.cancelTransition();
    this.engine.setTransitionGain(this.activeDeck, 0);
    this.engine.setTransitionGain(this.preloadDeck, 1);
    this.engine.stop(this.activeDeck);

    const item = this.preloadedItem!;
    this.currentItem = item;
    this.currentConfig = getPlaybackConfig(item);
    this.currentDuration = this.preloadedDuration;
    this.swapDecks();
    this.onTransitionChange?.(false, null);
    this.onSongStart?.(item);
    if (preloadNext) this.preloadSong(preloadNext);
  }

  /** Start a preloaded song directly without crossfade (nothing was playing) */
  private startPreloadedDirect(item: SessionItem, preloadNext?: SessionItem | null) {
    this.engine.stop(this.activeDeck);
    this.engine.setTransitionGain(this.activeDeck, 0);
    this.engine.setTransitionGain(this.preloadDeck, 1);

    const config = getPlaybackConfig(item);
    this.engine.setTempo(this.preloadDeck, config.playbackSpeed);
    if (config.startTime > 0) {
      this.engine.seek(this.preloadDeck, config.startTime);
    }
    this.engine.play(this.preloadDeck);

    this.currentItem = item;
    this.currentConfig = config;
    this.currentDuration = this.preloadedDuration;
    this.swapDecks();
    this.onTransitionChange?.(false, null);
    this.onSongStart?.(item);
    if (preloadNext) this.preloadSong(preloadNext);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async preloadSong(item: SessionItem) {
    if (this.preloadedItemId === item.id) return;
    try {
      const hasStems = item.song.stems_status === 'ready' && item.song.stems.length > 0;
      const duration = await this.engine.loadSong(this.preloadDeck, item.song.id, hasStems);
      this.preloadedItemId = item.id;
      this.preloadedItem = item;
      this.preloadedDuration = duration;

      const muteSections = getEffectiveMuteSections(item);
      this.engine.setMuteSections(this.preloadDeck, muteSections);
      if (muteSections.length > 0 && hasStems && !this.engine.isInstrumentalLoaded(this.preloadDeck)) {
        this.engine.loadInstrumentalHot(this.preloadDeck, item.song.id);
      }
    } catch {
      this.preloadedItemId = null;
      this.preloadedItem = null;
      this.preloadedDuration = 0;
    }
  }

  private getPreloadConfig(): SongPlaybackConfig | null {
    if (this.preloadedItem) {
      return getPlaybackConfig(this.preloadedItem);
    }
    return { startTime: 0, endTime: null, transitionDuration: 4, transitionType: 'smooth', playbackSpeed: 1 };
  }

  private swapDecks() {
    const temp = this.activeDeck;
    this.activeDeck = this.preloadDeck;
    this.preloadDeck = temp;
    this.preloadedItemId = null;
    this.preloadedItem = null;
    this.preloadedDuration = 0;
  }

  private cancelTransition() {
    this.isTransitioning = false;
    if (this.crossfadeAnimId) {
      cancelAnimationFrame(this.crossfadeAnimId);
      this.crossfadeAnimId = null;
    }
  }

  private clearPreload() {
    this.preloadedItemId = null;
    this.preloadedItem = null;
    this.preloadedDuration = 0;
  }

  private applyDeckConfig(deckId: DeckId, item: SessionItem) {
    const config = getPlaybackConfig(item);
    this.engine.setTempo(deckId, config.playbackSpeed);
    const muteSections = getEffectiveMuteSections(item);
    this.engine.setMuteSections(deckId, muteSections);
    const hasStems = item.song.stems_status === 'ready' && item.song.stems.length > 0;
    if (muteSections.length > 0 && hasStems && !this.engine.isInstrumentalLoaded(deckId)) {
      this.engine.loadInstrumentalHot(deckId, item.song.id);
    }
    if (config.startTime > 0) {
      this.engine.seek(deckId, config.startTime);
    }
  }
}
