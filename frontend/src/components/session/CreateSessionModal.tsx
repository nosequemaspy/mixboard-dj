import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

interface CreateSessionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; password?: string; is_public: boolean; allow_suggestions: boolean }) => void;
}

export function CreateSessionModal({ open, onClose, onCreate }: CreateSessionModalProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [allowSuggestions, setAllowSuggestions] = useState(true);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      password: password || undefined,
      is_public: isPublic,
      allow_suggestions: allowSuggestions,
    });
    setName('');
    setPassword('');
    setIsPublic(false);
    setAllowSuggestions(true);
  };

  return (
    <Modal open={open} onClose={onClose} title="New Session">
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Session name"
          autoFocus
          className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password (optional)"
          className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={e => setIsPublic(e.target.checked)}
            className="accent-accent"
          />
          Public session
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={allowSuggestions}
            onChange={e => setAllowSuggestions(e.target.checked)}
            className="accent-accent"
          />
          Allow song suggestions
        </label>
        <Button variant="primary" onClick={handleCreate}>Create</Button>
      </div>
    </Modal>
  );
}
