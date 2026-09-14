import { useEffect, useRef, useCallback } from 'react';
import { wsClient } from '../api/websocket';
import { usePlayerStore } from '../store/playerStore';
import { getPlaybackEngine } from './usePlaybackEngine';

/**
 * Remote control hook for Spotify Connect-like functionality.
 *
 * Host mode: broadcasts playback state to all connected remotes.
 * Remote mode: receives state from host and sends commands.
 */
export function useRemoteControl(sessionId: number | null, role: 'host' | 'remote') {
  const broadcastRef = useRef<number | null>(null);
  const roleRef = useRef(role);
  roleRef.current = role;

  // Join/leave session room
  useEffect(() => {
    if (!sessionId) return;

    wsClient.send('join_session', { session_id: sessionId, role });

    return () => {
      wsClient.send('leave_session', {});
    };
  }, [sessionId, role]);

  // HOST: broadcast state every 1.5 seconds
  useEffect(() => {
    if (role !== 'host' || !sessionId) return;

    const broadcastState = () => {
      const state = usePlayerStore.getState();
      wsClient.send('playback_state', {
        sessionId: state.sessionId,
        currentItemId: state.currentItemId,
        currentSongId: state.currentSongId,
        isPlaying: state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
        activeTagId: state.activeTagId,
        shuffleEnabled: state.shuffleEnabled,
        playedSongIds: Array.from(state.playedSongIds),
        queue: state.queue.map(q => q.id),
      });
    };

    broadcastRef.current = window.setInterval(broadcastState, 1500);

    return () => {
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
    };
  }, [role, sessionId]);

  // HOST: handle incoming commands from remotes
  useEffect(() => {
    if (role !== 'host') return;

    const unsub = wsClient.on('playback_command', (data: any) => {
      const store = usePlayerStore.getState();
      const engine = getPlaybackEngine();

      switch (data.command) {
        case 'play':
          if (!store.currentItemId) {
            const filtered = store.getFilteredItems();
            const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
            if (first) store.playItem(first);
          } else {
            store.setIsPlaying(true);
          }
          break;
        case 'pause':
          store.setIsPlaying(false);
          break;
        case 'toggle':
          if (!store.currentItemId) {
            const filtered = store.getFilteredItems();
            const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
            if (first) store.playItem(first);
          } else {
            store.setIsPlaying(!store.isPlaying);
          }
          break;
        case 'next':
          store.playNext();
          break;
        case 'previous':
          store.playPrevious();
          break;
        case 'seek':
          if (typeof data.time === 'number') {
            store.setCurrentTime(data.time);
            engine.seek(data.time);
          }
          break;
        case 'shuffle':
          store.toggleShuffle();
          break;
        case 'play_item':
          if (data.itemId) {
            const item = store.sessionItems.find(i => i.id === data.itemId);
            if (item) store.playItem(item);
          }
          break;
        case 'add_to_queue':
          if (data.itemId) {
            const item = store.sessionItems.find(i => i.id === data.itemId);
            if (item) store.addToQueue(item);
          }
          break;
        case 'set_tag':
          store.setActiveTag(data.tagId ?? null);
          break;
        case 'reset_played':
          store.resetAllPlayed();
          break;
      }
    });

    return () => { unsub(); };
  }, [role]);

  // REMOTE: receive playback state from host
  useEffect(() => {
    if (role !== 'remote') return;

    const unsub = wsClient.on('playback_state', (data: any) => {
      const store = usePlayerStore.getState();

      // Update state from host — but don't trigger audio playback on remote
      store.setCurrentTime(data.currentTime ?? 0);
      store.setDuration(data.duration ?? 0);
      store.setIsPlaying(data.isPlaying ?? false);

      // Sync current item if changed
      if (data.currentItemId !== store.currentItemId) {
        const item = store.sessionItems.find(i => i.id === data.currentItemId);
        if (item) {
          // Update store state without triggering audio
          usePlayerStore.setState({
            currentItemId: data.currentItemId,
            currentSongId: data.currentSongId,
          });
        }
      }

      // Sync active tag
      if (data.activeTagId !== store.activeTagId) {
        usePlayerStore.setState({ activeTagId: data.activeTagId });
      }

      // Sync shuffle
      if (data.shuffleEnabled !== store.shuffleEnabled) {
        usePlayerStore.setState({ shuffleEnabled: data.shuffleEnabled });
      }

      // Sync played songs
      if (data.playedSongIds) {
        usePlayerStore.setState({ playedSongIds: new Set(data.playedSongIds) });
      }
    });

    return () => { unsub(); };
  }, [role]);

  // Send command to host (used by remote)
  const sendCommand = useCallback((command: string, extra?: Record<string, any>) => {
    wsClient.send('playback_command', { command, ...extra });
  }, []);

  return { sendCommand };
}
