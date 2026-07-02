import { useEffect, useRef } from 'react';
import { wsClient } from '../api/websocket';
import { api } from '../api/http';
import { useMixerStore } from '../store/mixerStore';
import { useLibraryStore } from '../store/libraryStore';
import { useDeckStore } from '../store/deckStore';
import { getAudioEngine } from './useAudioEngine';

function pollActiveTasks() {
  const { tasks, updateTask, removeTask } = useMixerStore.getState();
  const fetchSongs = useLibraryStore.getState().fetchSongs;
  const activeTasks = Array.from(tasks.values()).filter(
    t => t.status === 'running' || t.status === 'pending'
  );
  if (activeTasks.length === 0) return;

  api.getActiveTasks().then(serverTasks => {
    const serverMap = new Map(serverTasks.map((t: any) => [t.task_id, t]));

    // Only update tasks we're already tracking locally (don't add new ones)
    for (const local of activeTasks) {
      const server = serverMap.get(local.task_id);
      if (server) {
        updateTask(server);
      } else {
        // Server no longer has this task → it completed or failed
        removeTask(local.task_id);
        fetchSongs();
      }
    }
  }).catch(() => {});
}

export function useWebSocket() {
  const updateTask = useMixerStore(s => s.updateTask);
  const fetchSongs = useLibraryStore(s => s.fetchSongs);
  const pollRef = useRef<number | null>(null);

  // Poll every 3s when there are active tasks
  useEffect(() => {
    pollRef.current = window.setInterval(() => {
      const tasks = useMixerStore.getState().tasks;
      const hasActive = Array.from(tasks.values()).some(
        t => t.status === 'running' || t.status === 'pending'
      );
      if (hasActive) pollActiveTasks();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    wsClient.connect();

    const unsub1 = wsClient.on('task_progress', (data) => {
      updateTask(data);
    });

    const unsub2 = wsClient.on('task_complete', (data) => {
      if (data.status === 'completed') {
        fetchSongs();
      }
      // Remove finished tasks immediately
      const removeTask = useMixerStore.getState().removeTask;
      removeTask(data.task_id);
    });

    // On WS reconnect, poll immediately to catch up
    const unsubReconnect = wsClient.on('_reconnect', () => {
      pollActiveTasks();
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
      unsubReconnect();
      wsClient.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
