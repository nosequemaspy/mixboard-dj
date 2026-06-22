import { useState } from 'react';
import { Modal } from '../shared/Modal';
import { Button } from '../shared/Button';

interface DuplicateSessionModalProps {
  open: boolean;
  onClose: () => void;
  originalName: string;
  onDuplicate: (data: { name: string; password?: string; is_public: boolean }) => void;
}

export function DuplicateSessionModal({ open, onClose, originalName, onDuplicate }: DuplicateSessionModalProps) {
  const [name, setName] = useState(`${originalName} (copy)`);
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const handleDuplicate = () => {
    if (!name.trim()) return;
    onDuplicate({
      name: name.trim(),
      password: password || undefined,
      is_public: isPublic,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Duplicate Session">
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New session name"
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
          Public session (shareable link)
        </label>
        <Button variant="primary" onClick={handleDuplicate}>Duplicate</Button>
      </div>
    </Modal>
  );
}
