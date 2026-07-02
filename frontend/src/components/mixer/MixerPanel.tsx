import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Knob } from '../shared/Knob';
import { VUMeter } from './VUMeter';
import { Crossfader } from './Crossfader';
import { VerticalFader } from './VerticalFader';

export function MixerPanel() {
  const store = useDeckStore();
  const engine = getAudioEngine();

  const handleVolumeA = (v: number) => {
    engine.setVolume('A', v);
    store.setVolume('A', v);
  };

  const handleVolumeB = (v: number) => {
    engine.setVolume('B', v);
    store.setVolume('B', v);
  };

  const handleCrossfader = (v: number) => {
    engine.setCrossfader(v);
    store.setCrossfader(v);
  };

  const handleEQ = (deckId: 'A' | 'B', band: 'low' | 'mid' | 'high', value: number) => {
    engine.setEQ(deckId, band, value);
    const eqKey = band === 'low' ? 'eqLow' : band === 'mid' ? 'eqMid' : 'eqHigh';
    store.setEQ(deckId, eqKey, value);
  };

  return (
    <div className="w-[200px] bg-bg-secondary border-x border-border hidden lg:flex flex-col items-center py-3 px-2 gap-3 flex-shrink-0">
      <span className="text-[10px] text-text-muted tracking-widest uppercase">Mixer</span>

      {/* EQ Section */}
      <div className="flex gap-4 w-full justify-center">
        {/* Deck A EQ */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-deck-a font-bold">A</span>
          <Knob value={store.deckA.eqHigh} onChange={v => handleEQ('A', 'high', v)} size={32} color="#3b82f6" label="HI" />
          <Knob value={store.deckA.eqMid} onChange={v => handleEQ('A', 'mid', v)} size={32} color="#3b82f6" label="MID" />
          <Knob value={store.deckA.eqLow} onChange={v => handleEQ('A', 'low', v)} size={32} color="#3b82f6" label="LO" />
        </div>

        {/* Deck B EQ */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-deck-b font-bold">B</span>
          <Knob value={store.deckB.eqHigh} onChange={v => handleEQ('B', 'high', v)} size={32} color="#f97316" label="HI" />
          <Knob value={store.deckB.eqMid} onChange={v => handleEQ('B', 'mid', v)} size={32} color="#f97316" label="MID" />
          <Knob value={store.deckB.eqLow} onChange={v => handleEQ('B', 'low', v)} size={32} color="#f97316" label="LO" />
        </div>
      </div>

      {/* Volume faders + VU meters */}
      <div className="flex gap-4 items-stretch flex-1 w-full justify-center min-h-0 max-h-[200px]">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-text-muted">VOL</span>
          <div className="flex gap-1 flex-1 min-h-0">
            <VUMeter deckId="A" />
            <VerticalFader
              value={store.deckA.volume}
              onChange={handleVolumeA}
              color="#3b82f6"
              label="A"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] text-text-muted">VOL</span>
          <div className="flex gap-1 flex-1 min-h-0">
            <VerticalFader
              value={store.deckB.volume}
              onChange={handleVolumeB}
              color="#f97316"
              label="B"
            />
            <VUMeter deckId="B" />
          </div>
        </div>
      </div>

      {/* Crossfader */}
      <div className="w-full px-2">
        <div className="flex justify-between text-[9px] text-text-muted mb-1">
          <span className="text-deck-a">A</span>
          <span>CROSSFADER</span>
          <span className="text-deck-b">B</span>
        </div>
        <Crossfader value={store.crossfader} onChange={handleCrossfader} />
      </div>
    </div>
  );
}
