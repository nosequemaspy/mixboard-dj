import { useEffect, useRef } from 'react';
import { PlaybackEngine } from '../audio/PlaybackEngine';
import { usePlayerStore } from '../store/playerStore';
import { getAudioEngine } from './useAudioEngine';

let playbackEngineInstance: PlaybackEngine | null = null;

export function getPlaybackEngine(): PlaybackEngine {
  if (!playbackEngineInstance) {
    playbackEngineInstance = new PlaybackEngine(getAudioEngine());
  }
  return playbackEngineInstance;
}

export function usePlaybackEngine() {
  const engineRef = useRef<PlaybackEngine>(getPlaybackEngine());

  useEffect(() => {
    const engine = engineRef.current;
    const store = usePlayerStore.getState();

    engine.setCallbacks({
      onTimeUpdate: (time: number) => {
        usePlayerStore.getState().setCurrentTime(time);
      },
      onSongEnd: () => {
        const state = usePlayerStore.getState();
        // Mark current song as played
        if (state.currentSongId) {
          state.markPlayed(state.currentSongId);
        }

        // Get next item and play it
        const nextItem = state.getNextItem();
        if (nextItem) {
          state.playItem(nextItem);

          // Get the item after next for preloading
          // We need to temporarily set the current to next to compute the one after
          const afterNext = usePlayerStore.getState().getNextItem();
          engine.playSong(nextItem, afterNext);
        } else {
          usePlayerStore.getState().setIsPlaying(false);
          engine.stop();
        }
      },
      onSongStart: (item) => {
        // Mark the song as played when it starts
        usePlayerStore.getState().markPlayed(item.song_id);
      },
    });

    engine.activate();

    // Subscribe to playback state changes
    const unsub = usePlayerStore.subscribe((state, prevState) => {
      // Handle play/pause toggle
      if (state.isPlaying !== prevState.isPlaying && state.currentItemId === prevState.currentItemId) {
        if (state.isPlaying) {
          engine.resume();
        } else {
          engine.pause();
        }
      }

      // Handle new song selection
      if (state.currentItemId !== prevState.currentItemId && state.currentItemId !== null) {
        const item = state.sessionItems.find(i => i.id === state.currentItemId);
        if (item) {
          const nextItem = state.getNextItem();
          engine.playSong(item, nextItem);
        }
      }
    });

    return () => {
      unsub();
      engine.deactivate();
    };
  }, []);

  return engineRef.current;
}
