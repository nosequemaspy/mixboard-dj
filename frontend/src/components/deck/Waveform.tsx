import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import type { DeckId, MuteSection, Song } from '../../types';

interface WaveformProps {
  deckId: DeckId;
  song: Song | null;
  currentTime: number;
  duration: number;
  muteSections: MuteSection[];
  onSeek: (time: number) => void;
  onDragStart?: () => void;
  onDragSeek?: (time: number) => void;
  onDragEnd?: () => void;
}

export function Waveform({ deckId, song, currentTime, duration, muteSections, onSeek, onDragStart, onDragSeek, onDragEnd }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const loadedSongId = useRef<number | null>(null);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragSeekRef = useRef(onDragSeek);
  onDragSeekRef.current = onDragSeek;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const isSeeking = useRef(false);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: deckId === 'A' ? '#3b82f680' : '#f9731680',
      progressColor: deckId === 'A' ? '#3b82f6' : '#f97316',
      cursorColor: '#e2e8f0',
      cursorWidth: 2,
      height: 60,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      interact: true,
      dragToSeek: true,
      hideScrollbar: true,
      plugins: [regions],
    });

    ws.on('interaction', (newTime: number) => {
      if (isDragging.current) {
        // During drag: silent position update only (no audio source recreation)
        onDragSeekRef.current?.(newTime);
      } else {
        // Single click: full seek with audio
        onSeekRef.current(newTime);
      }
    });

    // Block currentTime sync while user is dragging the seek cursor
    ws.on('dragstart', () => {
      isSeeking.current = true;
      isDragging.current = true;
      onDragStartRef.current?.();
    });
    ws.on('dragend', () => {
      isDragging.current = false;
      onDragEndRef.current?.();
      // Release seeking lock after drag ends, giving time for audio engine to sync
      setTimeout(() => { isSeeking.current = false; }, 150);
    });
    // Also handle single clicks (not drag) — briefly block to prevent flicker
    ws.on('click', () => {
      isSeeking.current = true;
      setTimeout(() => { isSeeking.current = false; }, 150);
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
      regionsRef.current = null;
    };
  }, [deckId]);

  // Render waveform from engine's decoded buffer (no extra download)
  useEffect(() => {
    if (!wsRef.current || !song || !duration || duration === 0) return;
    if (song.id === loadedSongId.current) return;

    // Try pre-computed peaks from DB first
    if (song.waveform_peaks) {
      try {
        const peaks: number[] = JSON.parse(song.waveform_peaks);
        loadedSongId.current = song.id;
        wsRef.current.empty();
        wsRef.current.load('', [peaks], duration);
        return;
      } catch { /* fall through */ }
    }

    // Extract peaks from AudioEngine's already-decoded buffer
    const engine = getAudioEngine();
    const peaks = engine.getPeaks(deckId);
    if (peaks) {
      loadedSongId.current = song.id;
      wsRef.current.empty();
      wsRef.current.load('', [peaks], duration);
    }
    // If peaks not available yet, don't set loadedSongId — effect will
    // re-run when duration updates after engine finishes decoding
  }, [song?.id, duration, deckId]);

  // Reset loadedSongId when song changes (before duration is set)
  useEffect(() => {
    if (!song) {
      loadedSongId.current = null;
      wsRef.current?.empty();
    }
  }, [song]);

  useEffect(() => {
    if (!wsRef.current || !duration || duration === 0) return;
    // Don't update cursor position while user is dragging
    if (isSeeking.current) return;
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
    <div className="w-full bg-bg-primary rounded-md overflow-hidden border border-border/50 cursor-pointer" style={{ touchAction: 'none' }}>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
