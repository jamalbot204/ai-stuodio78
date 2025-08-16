

import React, { memo } from 'react';
import { PlayIcon, StopIcon } from './Icons.tsx';

interface AutoSendControlsProps {
  isAutoSendingActive: boolean;
  autoSendText: string;
  setAutoSendText: (text: string) => void;
  autoSendRepetitionsInput: string;
  setAutoSendRepetitionsInput: (reps: string) => void;
  autoSendRemaining: number;
  onStartAutoSend: () => void; 
  onStopAutoSend: () => void;
  canStart: boolean; 
  isChatViewLoading: boolean;
  currentChatSessionExists: boolean;
  isCharacterMode: boolean;
  isPreparingAutoSend: boolean;
  isWaitingForErrorRetry: boolean; // New prop
  errorRetryCountdown: number;    // New prop
}

const AutoSendControls: React.FC<AutoSendControlsProps> = memo(({
  isAutoSendingActive,
  autoSendText,
  setAutoSendText,
  autoSendRepetitionsInput,
  setAutoSendRepetitionsInput,
  autoSendRemaining,
  onStartAutoSend,
  onStopAutoSend,
  canStart,
  isChatViewLoading,
  currentChatSessionExists,
  isCharacterMode,
  isPreparingAutoSend,
  isWaitingForErrorRetry, // Destructure new prop
  errorRetryCountdown,    // Destructure new prop
}) => {
  const commonInputClass = "p-2 aurora-input text-sm disabled:opacity-50";
  const commonButtonClass = "p-2 text-sm font-medium rounded-md transition-shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed";

  const showGenericStartButton = !isCharacterMode && !isAutoSendingActive && !isWaitingForErrorRetry;

  return (
    <div className="p-2 sm:p-3 border-t border-[var(--aurora-border)] bg-transparent space-y-2">
      <div className="flex items-center space-x-2">
        <input
          type="text"
          placeholder="Text to auto-send"
          value={autoSendText}
          onChange={(e) => setAutoSendText(e.target.value)}
          className={`flex-grow ${commonInputClass}`}
          disabled={isAutoSendingActive || !currentChatSessionExists || isWaitingForErrorRetry}
          aria-label="Text for automated sending"
        />
        <input
          type="number"
          placeholder="Times"
          value={autoSendRepetitionsInput}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || (parseInt(val, 10) >= 1 && parseInt(val, 10) <= 100)) {
                 setAutoSendRepetitionsInput(val);
            } else if (parseInt(val, 10) > 100) {
                 setAutoSendRepetitionsInput('100');
            } else if (parseInt(val, 10) < 1 && val !== '') {
                 setAutoSendRepetitionsInput('1');
            }
          }}
          min="1"
          max="100"
          className={`w-20 ${commonInputClass}`}
          disabled={isAutoSendingActive || !currentChatSessionExists || isWaitingForErrorRetry}
          aria-label="Number of times to send"
        />
        {isAutoSendingActive && !isWaitingForErrorRetry ? (
          <button
            onClick={onStopAutoSend}
            className={`${commonButtonClass} bg-red-600/80 text-white focus:ring-red-500 flex items-center hover:shadow-[0_0_12px_2px_rgba(239,68,68,0.6)]`}
            title="Stop automated sending"
          >
            <StopIcon className="w-4 h-4 mr-1" />
            Stop ({autoSendRemaining} left)
          </button>
        ) : showGenericStartButton ? (
          <button
            onClick={onStartAutoSend}
            disabled={!canStart || isChatViewLoading || !currentChatSessionExists || isWaitingForErrorRetry}
            className={`${commonButtonClass} bg-green-600/80 text-white focus:ring-green-500 flex items-center hover:shadow-[0_0_12px_2px_rgba(34,197,94,0.6)]`}
            title="Start automated sending"
          >
            <PlayIcon className="w-4 h-4 mr-1" />
            Start
          </button>
        ) : null}
      </div>
      {isCharacterMode && isPreparingAutoSend && !isAutoSendingActive && !isWaitingForErrorRetry && (
        <p className="text-xs text-yellow-400">
          Auto-send configured. Click a character button below to start sending to them.
        </p>
      )}
      {isWaitingForErrorRetry && (
        <p className="text-xs text-yellow-400 animate-pulse text-center">
          Error detected. Attempting to regenerate in {errorRetryCountdown}s...
        </p>
      )}
    </div>
  );
});

export default AutoSendControls;