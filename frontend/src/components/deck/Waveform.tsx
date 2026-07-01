import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { api } from '../../api/http';
import type { DeckId, MuteSection, Song } from '../../types';

interface WaveformProps {
  deckId: DeckId;
  song: Song | null;
  currentTime: number;
  duration: number;
  muteSections: MuteSection[];
  onSeek: (time: number) => void;
}

export function Waveform({ deckId, song, currentTime, duration, muteSections, onSeek }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

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
      plugins: [regions],
    });

    // 'interaction' fires only on user clicks, not on programmatic seekTo
    ws.on('interaction', (newTime: number) => {
      onSeekRef.current(newTime);
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
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

  // Draw mute section regions
  useEffect(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    regions.clearRegions();
    for (const section of muteSections) {
      regions.addRegion({
        start: section.start,
        end: section.end,
        color: 'rgba(245, 158, 11, 0.25)',
        drag: false,
        resize: false,
      });
    }
  }, [muteSections]);

  return (
    <div className="w-full bg-bg-primary rounded-md overflow-hidden border border-border/50">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
