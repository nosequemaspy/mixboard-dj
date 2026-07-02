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

    // Update tasks that are still active on the server
    for (const st of serverTasks) {
      updateTask(st);
    }

    // Tasks that we think are active but the server no longer has → completed
    for (const local of activeTasks) {
      if (!serverMap.has(local.task_id)) {
        updateTask({ ...local, status: 'completed', progress: 1 });
        fetchSongs();
        setTimeout(() => removeTask(local.task_id), 10000);
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
      updateTask(data);
      if (data.status === 'completed') {
        fetchSongs();
      }
      // Auto-cleanup completed/failed tasks after 10 seconds to prevent memory leak
      const removeTask = useMixerStore.getState().removeTask;
      setTimeout(() => removeTask(data.task_id), 10000);
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
