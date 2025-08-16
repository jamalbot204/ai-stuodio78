

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { CheckIcon, CloseIcon as CancelIcon, ArrowDownTrayIcon } from './Icons.tsx'; // Re-using existing icons

interface FilenameInputModalProps {
  isOpen: boolean;
  defaultFilename: string;
  promptMessage: string;
  onSubmit: (filename: string) => void;
  onClose: () => void;
}

const FilenameInputModal: React.FC<FilenameInputModalProps> = memo(({
  isOpen,
  defaultFilename,
  promptMessage,
  onSubmit,
  onClose,
}) => {
  const [currentFilename, setCurrentFilename] = useState(defaultFilename);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentFilename(defaultFilename);
      // Focus the input when the modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultFilename]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(currentFilename.trim() || defaultFilename);
  }, [onSubmit, currentFilename, defaultFilename]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFilename(e.target.value);
  }, []);

  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filename-input-modal-title"
        onClick={onClose} // Close on backdrop click
    >
      <div 
        className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="filename-input-modal-title" className="text-lg font-semibold text-gray-100 flex items-center">
            <ArrowDownTrayIcon className="w-5 h-5 mr-2 text-blue-400" />
            Name Audio File
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close filename input"
          >
            <CancelIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-3">{promptMessage}</p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={currentFilename}
            onChange={handleInputChange}
            className="w-full p-2.5 aurora-input mb-6"
            aria-label="Filename for audio"
            placeholder="Enter filename"
          />
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] flex items-center"
            >
              <CancelIcon className="w-4 h-4 mr-1.5" /> Cancel
            </button>
            <button
              type="submit"
              disabled={!currentFilename.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] flex items-center disabled:opacity-50"
            >
                <CheckIcon className="w-4 h-4 mr-1.5" /> Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default FilenameInputModal;