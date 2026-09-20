interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-bg-secondary border border-border rounded-xl p-5 mx-4 min-w-[280px] max-w-[400px] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 text-sm font-medium bg-bg-tertiary text-text-secondary rounded-lg hover:bg-bg-hover transition-colors min-h-[48px]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors min-h-[48px]"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
