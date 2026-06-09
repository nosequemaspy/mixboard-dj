import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { api } from '../../api/http';
import type { DeckId, Song } from '../../types';

interface WaveformProps {
  deckId: DeckId;
  song: Song | null;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

export function Waveform({ deckId, song, currentTime, duration, onSeek }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: deckId === 'A' ? '#3b82f680' : '#f9731680',
      progressColor: deckId === 'A' ? '#3b82f6' : '#f97316',
      cursorColor: '#e2e8f0',
      cursorWidth: 1,
      height: 60,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
      hideScrollbar: true,
    });

    // 'interaction' fires only on user clicks, not on programmatic seekTo
    ws.on('interaction', (newTime: number) => {
      onSeekRef.current(newTime);
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [deckId]);

  useEffect(() => {
    if (!wsRef.current || !song || song.id === loadedSongId.current) return;
    loadedSongId.current = song.id;
    wsRef.current.load(api.streamUrl(song.id));
  }, [song]);

  useEffect(() => {
    if (!wsRef.current || !duration || duration === 0) return;
    const progress = currentTime / duration;
    wsRef.current.seekTo(Math.min(1, Math.max(0, progress)));
  }, [currentTime, duration]);

  return (
    <div className="w-full bg-bg-primary rounded-md overflow-hidden border border-border/50">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
