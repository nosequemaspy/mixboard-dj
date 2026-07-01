import { useEffect } from 'react';
import { wsClient } from '../api/websocket';
import { useMixerStore } from '../store/mixerStore';
import { useLibraryStore } from '../store/libraryStore';
import { useDeckStore } from '../store/deckStore';
import { getAudioEngine } from './useAudioEngine';

export function useWebSocket() {
  const updateTask = useMixerStore(s => s.updateTask);
  const fetchSongs = useLibraryStore(s => s.fetchSongs);

  useEffect(() => {
    wsClient.connect();

    const unsub1 = wsClient.on('task_progress', (data) => {
      updateTask(data);
    });

    const unsub2 = wsClient.on('task_complete', (data) => {
      updateTask(data);
      if (data.status === 'completed') {
        fetchSongs();
      }
      // Auto-cleanup completed/failed tasks after 10 seconds to prevent memory leak
      const removeTask = useMixerStore.getState().removeTask;
      setTimeout(() => removeTask(data.task_id), 10000);
    });

    const unsub3 = wsClient.on('song_added', () => {
      fetchSongs();
    });

    const unsub4 = wsClient.on('stems_ready', async (data) => {
      fetchSongs();
      const songId = data?.song_id;
      if (!songId) return;

      const { deckA, deckB, updateSongInDeck } = useDeckStore.getState();
      const engine = getAudioEngine();

      // For each deck: update status, hot-load instrumental, apply mute if pending
      for (const [deckId, deck] of [['A', deckA], ['B', deckB]] as const) {
        if (deck.song?.id !== songId) continue;
        updateSongInDeck(deckId, { stems_status: 'ready' });

        // If user already toggled vocal mute, hot-load and apply
        if (deck.vocalMuted) {
          const loaded = await engine.loadInstrumentalHot(deckId, songId);
          if (loaded) {
            engine.setVocalMute(deckId, true);
          }
        }
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      wsClient.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
