import { useState } from 'react';

interface PasswordGateProps {
  onSubmit: (password: string) => void;
  error?: string;
}

export function PasswordGate({ onSubmit, error }: PasswordGateProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    onSubmit(password);
  };

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="bg-bg-secondary border border-border rounded-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-text-primary mb-1">Private Session</h2>
        <p className="text-sm text-text-muted mb-4">Enter the password to view this session.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            className="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
