import { useEffect, useRef, useCallback, useState } from 'react';
import { wsClient } from '../api/websocket';
import { usePlayerStore } from '../store/playerStore';
import { getPlaybackEngine } from './usePlaybackEngine';

/**
 * Remote control hook for Spotify Connect-like functionality.
 *
 * Host mode: broadcasts playback state to all connected remotes.
 * Remote mode: receives state from host and sends commands.
 * Auto mode: server decides role based on whether a host already exists.
 */
export function useRemoteControl(
  sessionId: number | null,
  preferredRole: 'host' | 'remote' | 'auto'
): { sendCommand: (cmd: string, extra?: Record<string, any>) => void; effectiveRole: 'host' | 'remote' | null } {
  const broadcastRef = useRef<number | null>(null);
  // For 'auto', start as 'host' optimistically so playback engine mounts immediately.
  // Server will demote to 'remote' via joined_session/role_changed if a host already exists.
  const [effectiveRole, setEffectiveRole] = useState<'host' | 'remote' | null>(
    preferredRole === 'auto' ? 'host' : preferredRole
  );
  const effectiveRoleRef = useRef(effectiveRole);
  effectiveRoleRef.current = effectiveRole;

  // Join/leave session room (including on reconnect)
  useEffect(() => {
    if (!sessionId) return;

    wsClient.send('join_session', { session_id: sessionId, role: preferredRole });

    // Rejoin room if WebSocket reconnects (network blip)
    const unsubReconnect = wsClient.on('_reconnect', () => {
      wsClient.send('join_session', { session_id: sessionId, role: preferredRole });
    });

    return () => {
      unsubReconnect();
      wsClient.send('leave_session', {});
    };
  }, [sessionId, preferredRole]);

  // Listen for role assignment from server (for 'auto' mode + demotions)
  useEffect(() => {
    const unsubJoined = wsClient.on('joined_session', (data: any) => {
      if (data.role === 'host' || data.role === 'remote') {
        setEffectiveRole(data.role);
      }
    });

    const unsubRoleChanged = wsClient.on('role_changed', (data: any) => {
      if (data.role === 'host' || data.role === 'remote') {
        setEffectiveRole(data.role);
      }
    });

    return () => {
      unsubJoined();
      unsubRoleChanged();
    };
  }, []);

  // HOST: broadcast state every 1.5 seconds
  useEffect(() => {
    if (effectiveRole !== 'host' || !sessionId) return;

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
        queue: state.queue.map(q => q.item.id),
        isTransitioning: state.isTransitioning,
        nextTransitionSongTitle: state.nextTransitionSongTitle,
      });
    };

    broadcastRef.current = window.setInterval(broadcastState, 1500);

    return () => {
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
    };
  }, [effectiveRole, sessionId]);

  // HOST: handle incoming commands from remotes
  useEffect(() => {
    if (effectiveRole !== 'host') return;

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
  }, [effectiveRole]);

  // REMOTE: receive playback state from host
  useEffect(() => {
    if (effectiveRole !== 'remote') return;

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

      // Sync transition state
      if (data.isTransitioning !== undefined) {
        usePlayerStore.setState({
          isTransitioning: data.isTransitioning,
          nextTransitionSongTitle: data.nextTransitionSongTitle ?? null,
        });
      }
    });

    return () => { unsub(); };
  }, [effectiveRole]);

  // Send command to host (used by remote)
  const sendCommand = useCallback((command: string, extra?: Record<string, any>) => {
    wsClient.send('playback_command', { command, ...extra });
  }, []);

  return { sendCommand, effectiveRole };
}
