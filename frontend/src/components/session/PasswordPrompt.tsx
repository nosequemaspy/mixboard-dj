import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

interface PasswordPromptProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  error?: string;
}

export function PasswordPrompt({ open, onClose, onSubmit, error }: PasswordPromptProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (!password) return;
    onSubmit(password);
    setPassword('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Enter Password">
      <div className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Session password"
          autoFocus
          className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button variant="primary" onClick={handleSubmit}>Verify</Button>
      </div>
    </Modal>
  );
}
