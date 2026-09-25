import { useEffect, useRef } from 'react';
import { PlaybackEngine } from '../audio/PlaybackEngine';
import { usePlayerStore } from '../store/playerStore';
import { useDeckStore } from '../store/deckStore';
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

        // Use playNext() which properly consumes from queue.
        // The store subscription below will detect currentItemId change
        // and call engine.playSong(). If the song is already playing
        // (from a transition), playSong will detect it and skip the reload.
        state.playNext();

        // If no more songs to play, stop the engine
        if (!usePlayerStore.getState().isPlaying) {
          usePlayerStore.getState().setIsLoadingSong(false);
          engine.stop();
        }
      },
      onSongStart: (item) => {
        // Audio is loaded and playing — clear loading state
        usePlayerStore.getState().setIsLoadingSong(false);
        // Mark the song as played when it starts
        usePlayerStore.getState().markPlayed(item.song_id);
      },
      onTransitionChange: (isTransitioning, nextSongTitle) => {
        usePlayerStore.getState().setTransitionState(isTransitioning, nextSongTitle);
      },
    });

    engine.activate();

    // Subscribe to playback state changes
    const unsub = usePlayerStore.subscribe((state, prevState) => {
      // Handle play/pause toggle
      if (state.isPlaying !== prevState.isPlaying && state.currentItemId === prevState.currentItemId) {
        if (state.isPlaying) {
          if (engine.hasCurrentItem()) {
            engine.resume();
          } else if (state.currentItemId) {
            // Engine was invalidated (e.g., after audio edit) — reload fresh
            const item = state.sessionItems.find(i => i.id === state.currentItemId);
            if (item) {
              state.setTransitionState(true, item.song.title);
              const nextItem = state.getNextItem();
              engine.playSong(item, nextItem);
            }
          }
        } else {
          engine.pause();
        }
      }

      // Handle new song selection
      if (state.currentItemId !== prevState.currentItemId && state.currentItemId !== null) {
        const item = state.sessionItems.find(i => i.id === state.currentItemId);
        if (item) {
          // Show transition indicator immediately so skip feels responsive
          state.setTransitionState(true, item.song.title);
          const nextItem = state.getNextItem();
          engine.playSong(item, nextItem);
        }
      }

      // When queue changes, re-preload so transitions use the correct next song
      if (state.queue !== prevState.queue) {
        const nextItem = state.getNextItem();
        engine.rePreload(nextItem);
      }
    });

    return () => {
      unsub();
      engine.deactivate();

      // Restore AudioEngine callbacks for DJ mixer deck mode
      const audioEngine = getAudioEngine();
      audioEngine.setCallbacks(
        (deckId, time) => {
          useDeckStore.getState().setCurrentTime(deckId, time);
        },
        (deckId) => {
          useDeckStore.getState().setPlaying(deckId, false);
          useDeckStore.getState().setCurrentTime(deckId, 0);
        },
      );
    };
  }, []);

  return engineRef.current;
}
