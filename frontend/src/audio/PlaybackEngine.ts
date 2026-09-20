import type { DeckId } from '../types';
import type { SessionItem } from '../types';
import { getEffectivePlaybackSettings } from '../types';
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
    // Take over AudioEngine callbacks
    this.engine.setCallbacks(
      (_deckId: DeckId, _time: number) => {
        // We handle time monitoring ourselves
      },
      (deckId: DeckId) => {
        // Song ended naturally on a deck
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
    if (this.crossfadeAnimId) {
      cancelAnimationFrame(this.crossfadeAnimId);
      this.crossfadeAnimId = null;
    }
  }

  private startMonitor() {
    const monitor = () => {
      if (!this.active) return;

      if (this.currentItem && !this.isTransitioning) {
        const time = this.engine.getCurrentTime(this.activeDeck);
        this.onTimeUpdate?.(time);

        // Check if we need to start transition
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

  async playSong(item: SessionItem, preloadNext?: SessionItem | null) {
    this.currentItem = item;
    this.currentConfig = getPlaybackConfig(item);

    // Stop any ongoing transition
    this.isTransitioning = false;
    if (this.crossfadeAnimId) {
      cancelAnimationFrame(this.crossfadeAnimId);
      this.crossfadeAnimId = null;
    }

    // Load song on active deck
    const hasStems = item.song.stems_status === 'ready' && item.song.stems.length > 0;
    const duration = await this.engine.loadSong(this.activeDeck, item.song.id, hasStems);
    this.currentDuration = duration;

    // Set crossfader fully to active deck
    const cfValue = this.activeDeck === 'A' ? -1 : 1;
    this.engine.setCrossfader(cfValue);

    // Apply playback speed
    this.engine.setTempo(this.activeDeck, this.currentConfig.playbackSpeed);

    // Seek to start time
    if (this.currentConfig.startTime > 0) {
      this.engine.seek(this.activeDeck, this.currentConfig.startTime);
    }

    // Play
    this.engine.play(this.activeDeck);
    this.onSongStart?.(item);

    // Preload next song on idle deck
    if (preloadNext) {
      this.preloadSong(preloadNext);
    }
  }

  private async preloadSong(item: SessionItem) {
    if (this.preloadedItemId === item.id) return; // Already preloaded
    try {
      const hasStems = item.song.stems_status === 'ready' && item.song.stems.length > 0;
      await this.engine.loadSong(this.preloadDeck, item.song.id, hasStems);
      this.preloadedItemId = item.id;
      this.preloadedItem = item;
    } catch {
      this.preloadedItemId = null;
      this.preloadedItem = null;
    }
  }

  private beginTransition() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    const nextTitle = this.preloadedItem?.song?.title ?? null;
    this.onTransitionChange?.(true, nextTitle);

    const config = this.currentConfig!;
    const duration = config.transitionDuration;

    if (config.transitionType === 'cut') {
      // Instant cut — no crossfade
      this.engine.stop(this.activeDeck);
      this.swapDecks();
      this.isTransitioning = false;
      this.onTransitionChange?.(false, null);
      this.onSongEnd?.();
      return;
    }

    // Start next song on preload deck (if preloaded)
    if (this.preloadedItemId !== null) {
      const nextConfig = this.getPreloadConfig();
      if (nextConfig) {
        this.engine.setTempo(this.preloadDeck, nextConfig.playbackSpeed);
        if (nextConfig.startTime > 0) {
          this.engine.seek(this.preloadDeck, nextConfig.startTime);
        }
        this.engine.play(this.preloadDeck);
      }
    }

    // Animate crossfader
    const startCf = this.activeDeck === 'A' ? -1 : 1;
    const endCf = this.activeDeck === 'A' ? 1 : -1;
    const startTimestamp = performance.now();
    const durationMs = duration * 1000;

    const animate = (now: number) => {
      if (!this.active) return;

      const elapsed = now - startTimestamp;
      const progress = Math.min(elapsed / durationMs, 1);

      // Apply easing based on transition type
      let easedProgress: number;
      switch (config.transitionType) {
        case 'sharp':
          // S-curve for sharp crossfade
          easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          break;
        case 'linear':
          easedProgress = progress;
          break;
        case 'smooth':
        default:
          // Equal-power-like smooth
          easedProgress = Math.sin(progress * Math.PI / 2);
          break;
      }

      const cfValue = startCf + (endCf - startCf) * easedProgress;
      this.engine.setCrossfader(cfValue);

      if (progress < 1) {
        this.crossfadeAnimId = requestAnimationFrame(animate);
      } else {
        // Transition complete
        this.engine.stop(this.activeDeck);
        this.swapDecks();
        this.isTransitioning = false;
        this.crossfadeAnimId = null;
        this.onTransitionChange?.(false, null);
        this.onSongEnd?.();
      }
    };

    this.crossfadeAnimId = requestAnimationFrame(animate);
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
    this.engine.stop(this.activeDeck);
    this.engine.stop(this.preloadDeck);
    this.currentItem = null;
    this.currentConfig = null;
    this.preloadedItemId = null;
    this.preloadedItem = null;
    this.isTransitioning = false;
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
}
