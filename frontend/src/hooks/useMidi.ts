import { useEffect, useRef } from 'react';
import { MidiEngine } from '../midi/MidiEngine';
import { useDeckStore } from '../store/deckStore';
import { getAudioEngine } from './useAudioEngine';

let midiInstance: MidiEngine | null = null;

export function getMidiEngine(): MidiEngine {
  if (!midiInstance) {
    midiInstance = new MidiEngine();
  }
  return midiInstance;
}

export function useMidi() {
  const midiRef = useRef<MidiEngine>(getMidiEngine());

  useEffect(() => {
    const midi = midiRef.current;
    const engine = getAudioEngine();

    midi.init();
    midi.setActionHandler((action, value, deckId) => {
      const store = useDeckStore.getState();

      switch (action) {
        case 'play':
          if (value > 0 && deckId) {
            const deck = store.getDeck(deckId);
            if (deck.isPlaying) {
              engine.pause(deckId);
              store.setPlaying(deckId, false);
            } else {
              engine.play(deckId);
              store.setPlaying(deckId, true);
            }
          }
          break;
        case 'cue':
          if (value > 0 && deckId) {
            const deck = store.getDeck(deckId);
            engine.seek(deckId, deck.cuePoint);
            store.setCurrentTime(deckId, deck.cuePoint);
          }
          break;
        case 'volume':
          if (deckId) {
            engine.setVolume(deckId, value);
            store.setVolume(deckId, value);
          }
          break;
        case 'eq_low':
          if (deckId) {
            const eqVal = (value - 0.5) * 2;
            engine.setEQ(deckId, 'low', eqVal);
            store.setEQ(deckId, 'eqLow', eqVal);
          }
          break;
        case 'eq_mid':
          if (deckId) {
            const eqVal = (value - 0.5) * 2;
            engine.setEQ(deckId, 'mid', eqVal);
            store.setEQ(deckId, 'eqMid', eqVal);
          }
          break;
        case 'eq_high':
          if (deckId) {
            const eqVal = (value - 0.5) * 2;
            engine.setEQ(deckId, 'high', eqVal);
            store.setEQ(deckId, 'eqHigh', eqVal);
          }
          break;
        case 'tempo':
          if (deckId) {
            const tempo = 0.5 + value;
            engine.setTempo(deckId, tempo);
            store.setTempo(deckId, tempo);
          }
          break;
        case 'crossfader': {
          const cf = (value - 0.5) * 2;
          engine.setCrossfader(cf);
          store.setCrossfader(cf);
          break;
        }
      }
    });

    return () => midi.destroy();
  }, []);

  return midiRef.current;
}
