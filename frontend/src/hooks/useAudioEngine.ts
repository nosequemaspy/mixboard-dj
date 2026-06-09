import { useEffect, useRef } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { useDeckStore } from '../store/deckStore';
import { useSettingsStore } from '../store/settingsStore';
import type { DeckId } from '../types';

let engineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine();

    // Apply persisted settings on creation
    const settings = useSettingsStore.getState().getSettings();
    engineInstance.setMasterVolume(settings.masterVolume);
    engineInstance.setHeadphoneVolume(settings.headphoneVolume);
    engineInstance.setHeadphoneCueMix(settings.headphoneCueMix);
    engineInstance.setCueEnabled('A', settings.cueA);
    engineInstance.setCueEnabled('B', settings.cueB);
    engineInstance.setCrossfaderCurve(settings.crossfaderCurve);

    if (settings.masterDeviceId) {
      engineInstance.setMasterDevice(settings.masterDeviceId);
    }
    if (settings.headphoneDeviceId) {
      engineInstance.setHeadphoneDevice(settings.headphoneDeviceId);
    }
  }
  return engineInstance;
}

export function useAudioEngine() {
  const engineRef = useRef<AudioEngine>(getAudioEngine());
  const store = useDeckStore();

  useEffect(() => {
    const engine = engineRef.current;
    engine.setCallbacks(
      (deckId: DeckId, time: number) => {
        store.setCurrentTime(deckId, time);
      },
      (deckId: DeckId) => {
        store.setPlaying(deckId, false);
        store.setCurrentTime(deckId, 0);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return engineRef.current;
}
