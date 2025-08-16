

import React, { memo } from 'react';
import { CloseIcon } from './Icons.tsx';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode; // Allow JSX for message
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = memo(({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}) => {
  if (!isOpen) return null;

  const confirmButtonBaseClass = "px-4 py-2.5 text-sm font-medium rounded-md transition-shadow flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black";
  const confirmButtonClass = isDestructive
    ? `${confirmButtonBaseClass} text-white bg-red-600/80 focus:ring-red-500 hover:shadow-[0_0_12px_2px_rgba(239,68,68,0.6)]`
    : `${confirmButtonBaseClass} text-white bg-[var(--aurora-accent-primary)] focus:ring-blue-500 hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]`;
  const cancelButtonClass = `${confirmButtonBaseClass} text-gray-300 bg-white/5 focus:ring-gray-500 hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]`;


  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      onClick={onCancel}
    >
      <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id="confirmation-modal-title" className="text-xl font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close confirmation"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="text-sm text-gray-300 mb-6 whitespace-pre-line">
          {message}
        </div>

        <div className="mt-auto flex justify-end space-x-3">
          <button
            onClick={onCancel}
            type="button"
            className={cancelButtonClass}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            type="button"
            className={confirmButtonClass}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ConfirmationModal;