import type { DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface TempoSliderProps {
  deckId: DeckId;
}

export function TempoSlider({ deckId }: TempoSliderProps) {
  const tempo = useDeckStore(s => deckId === 'A' ? s.deckA.tempo : s.deckB.tempo);
  const setTempo = useDeckStore(s => s.setTempo);
  const engine = getAudioEngine();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    engine.setTempo(deckId, val);
    setTempo(deckId, val);
  };

  const handleReset = () => {
    engine.setTempo(deckId, 1);
    setTempo(deckId, 1);
  };

  const pct = Math.round((tempo - 1) * 100);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-text-muted w-6">BPM</span>
      <input
        type="range"
        min="0.5"
        max="1.5"
        step="0.01"
        value={tempo}
        onChange={handleChange}
        onDoubleClick={handleReset}
        className="flex-1 h-1"
      />
      <span className={`text-xs font-mono w-10 text-right ${pct === 0 ? 'text-text-muted' : 'text-accent'}`}>
        {pct >= 0 ? '+' : ''}{pct}%
      </span>
    </div>
  );
}
