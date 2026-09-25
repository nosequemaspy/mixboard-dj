import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { getPlaybackEngine } from './usePlaybackEngine';
import { getEffectivePlaybackSettings } from '../types';

// Tiny silent MP3 (1 frame, ~140 bytes) encoded as base64 data URL.
// Looping this on an <audio> element keeps the browser audio session alive
// on mobile, preventing the AudioContext from being suspended in background.
const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYlPfGiAAAAAAD/+1DEAAAGAAGn9AAAIgAANP8AAABM//tQxBUAAADSAAAAAAAAANIAAAAA';

export function useMediaSession() {
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const isTransitioning = usePlayerStore(s => s.isTransitioning);
  const nextTransitionSongTitle = usePlayerStore(s => s.nextTransitionSongTitle);

  // Silent audio loop to keep browser audio session alive on mobile
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (isPlaying) {
      if (!silentAudioRef.current) {
        const audio = new Audio(SILENT_MP3);
        audio.loop = true;
        audio.volume = 0.01; // near-silent
        silentAudioRef.current = audio;
      }
      silentAudioRef.current.play().catch(() => {});
    } else {
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
      }
    }
    return () => {
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
        silentAudioRef.current = null;
      }
    };
  }, [isPlaying]);

  // Update metadata when song changes or transition state changes
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentSongId) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const item = sessionItems.find(i => i.song_id === currentSongId);
    if (!item) return;

    const title = isTransitioning && nextTransitionSongTitle
      ? `${item.song.title} -> ${nextTransitionSongTitle}`
      : item.song.title;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: item.song.artist || 'Unknown Artist',
      album: 'MixBoard DJ',
    });
  }, [currentSongId, sessionItems, isTransitioning, nextTransitionSongTitle]);

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Update position state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!duration || duration <= 0) return;

    // Get actual playback speed from current session item
    let rate = 1;
    const store = usePlayerStore.getState();
    if (store.currentItemId) {
      const item = store.sessionItems.find(i => i.id === store.currentItemId);
      if (item) rate = getEffectivePlaybackSettings(item).playback_speed;
    }

    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: rate,
        position: Math.min(currentTime, duration),
      });
    } catch {
      // setPositionState can throw if values are invalid
    }
  }, [currentTime, duration]);

  // Register action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlePlay = () => {
      const store = usePlayerStore.getState();
      if (!store.currentItemId) {
        // Nothing playing — start from first unplayed song (like PlayerControls)
        const filtered = store.getFilteredItems();
        const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
        if (first) {
          store.playItem(first);
          return;
        }
      }
      store.setIsPlaying(true);
    };

    const handlePause = () => {
      usePlayerStore.getState().setIsPlaying(false);
    };

    const handlePreviousTrack = () => {
      const store = usePlayerStore.getState();
      if (store.currentTime > 3) {
        store.setCurrentTime(0);
        getPlaybackEngine().seek(0);
        return;
      }
      store.playPrevious();
    };

    const handleNextTrack = () => {
      usePlayerStore.getState().playNext();
    };

    navigator.mediaSession.setActionHandler('play', handlePlay);
    navigator.mediaSession.setActionHandler('pause', handlePause);
    navigator.mediaSession.setActionHandler('previoustrack', handlePreviousTrack);
    navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, []);
}
