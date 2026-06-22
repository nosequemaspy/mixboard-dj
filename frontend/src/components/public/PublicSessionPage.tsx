import { useEffect, useState, useRef } from 'react';
import { api } from '../../api/http';
import type { SessionData } from '../../types';
import { PasswordGate } from './PasswordGate';
import { PublicSessionView } from './PublicSessionView';

interface PublicSessionPageProps {
  shareCode: string;
}

export function PublicSessionPage({ shareCode }: PublicSessionPageProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const passwordRef = useRef('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSession = async (pw?: string) => {
    const usePw = pw ?? passwordRef.current;
    setLoading(true);
    try {
      const data = await api.getSessionByCode(shareCode, usePw || undefined);
      if (data.has_password && data.items.length === 0 && !usePw) {
        setNeedsPassword(true);
        setSession(null);
      } else {
        setSession(data);
        setNeedsPassword(false);
      }
    } catch {
      setError('Session not found');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareCode]);

  const handlePasswordSubmit = async (pw: string) => {
    try {
      const data = await api.getSessionByCode(shareCode, pw);
      if (data.items.length === 0 && data.has_password) {
        // Password was wrong - backend still hides data
        setPasswordError('Invalid password');
        return;
      }
      passwordRef.current = pw;
      setSession(data);
      setNeedsPassword(false);
      setPasswordError('');
    } catch {
      setPasswordError('Invalid password');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <span className="text-text-muted text-sm">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary mb-2">Not Found</h2>
          <p className="text-sm text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return <PasswordGate onSubmit={handlePasswordSubmit} error={passwordError} />;
  }

  if (!session) return null;

  return <PublicSessionView session={session} onRefresh={() => fetchSession()} />;
}
