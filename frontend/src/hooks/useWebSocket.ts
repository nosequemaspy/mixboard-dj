import { useEffect } from 'react';
import { wsClient } from '../api/websocket';
import { useMixerStore } from '../store/mixerStore';
import { useLibraryStore } from '../store/libraryStore';

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
    });

    const unsub3 = wsClient.on('song_added', () => {
      fetchSongs();
    });

    const unsub4 = wsClient.on('stems_ready', () => {
      fetchSongs();
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
