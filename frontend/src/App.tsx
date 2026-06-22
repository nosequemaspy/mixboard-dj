import { useEffect } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PublicSessionPage } from './components/public/PublicSessionPage';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useMidi } from './hooks/useMidi';
import { useWebSocket } from './hooks/useWebSocket';
import { useDeckStore } from './store/deckStore';
import { getAudioEngine } from './hooks/useAudioEngine';

function toggleDeck(deckId: 'A' | 'B') {
  const engine = getAudioEngine();
  const state = useDeckStore.getState();
  const deck = state.getDeck(deckId);
  if (!deck.song) return;
  if (deck.isPlaying) {
    engine.pause(deckId);
    state.setPlaying(deckId, false);
  } else {
    engine.play(deckId);
    state.setPlaying(deckId, true);
  }
}

function KeyboardHandler() {
  useEffect(() => {
    const engine = getAudioEngine();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          toggleDeck('A');
          break;
        case 'KeyQ':
          toggleDeck('A');
          break;
        case 'KeyW':
          toggleDeck('B');
          break;
        case 'ArrowLeft': {
          e.preventDefault();
          const cf = Math.max(-1, useDeckStore.getState().crossfader - 0.05);
          engine.setCrossfader(cf);
          useDeckStore.getState().setCrossfader(cf);
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const cf = Math.min(1, useDeckStore.getState().crossfader + 0.05);
          engine.setCrossfader(cf);
          useDeckStore.getState().setCrossfader(cf);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}

function DJApp() {
  useAudioEngine();
  useMidi();
  useWebSocket();

  return (
    <>
      <KeyboardHandler />
      <AppLayout />
    </>
  );
}

function PublicSessionRoute() {
  const { shareCode } = useParams<{ shareCode: string }>();
  if (!shareCode) return null;
  return <PublicSessionPage shareCode={shareCode} />;
}

function App() {
  return (
    <Routes>
      <Route path="/s/:shareCode" element={<PublicSessionRoute />} />
      <Route path="/*" element={<DJApp />} />
    </Routes>
  );
}

export default App;
