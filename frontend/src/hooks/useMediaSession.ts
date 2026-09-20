import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { getPlaybackEngine } from './usePlaybackEngine';

export function useMediaSession() {
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const isTransitioning = usePlayerStore(s => s.isTransitioning);
  const nextTransitionSongTitle = usePlayerStore(s => s.nextTransitionSongTitle);

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

    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: 1,
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
      usePlayerStore.getState().setIsPlaying(true);
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
