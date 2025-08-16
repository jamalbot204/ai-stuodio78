import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { CheckIcon, CloseIcon as CancelIcon, GitHubIcon } from './Icons.tsx';

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string) => void;
}

const GitHubImportModal: React.FC<GitHubImportModalProps> = memo(({ isOpen, onClose, onImport }) => {
  const [url, setUrl] = useState('');
  const [isValid, setIsValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const GITHUB_REPO_REGEX = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-._]+(\/)?$/;

  useEffect(() => {
    if (isOpen) {
      setUrl('');
      setIsValid(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    setIsValid(GITHUB_REPO_REGEX.test(newUrl));
  }, [GITHUB_REPO_REGEX]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onImport(url);
    }
  }, [isValid, onImport, url]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-import-modal-title"
      onClick={onClose}
    >
      <div
        className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="github-import-modal-title" className="text-lg font-semibold text-gray-100 flex items-center">
            <GitHubIcon className="w-5 h-5 mr-2" />
            Import GitHub Repository
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close GitHub import"
          >
            <CancelIcon className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-4">
          Enter the full URL of a public GitHub repository to provide it as context for your chat session.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={handleUrlChange}
            className="w-full p-2.5 aurora-input mb-6"
            aria-label="GitHub Repository URL"
            placeholder="e.g., https://github.com/owner/repo-name"
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
              disabled={!isValid}
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] flex items-center disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4 mr-1.5" /> Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default GitHubImportModal;
