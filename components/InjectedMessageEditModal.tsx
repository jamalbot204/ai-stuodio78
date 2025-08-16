import React, { useState, useEffect, useCallback } from 'react';
import { useModalStore } from '../store/useModalStore';
import { useActiveChatStore } from '../store/useActiveChatStore';
import { useGeminiApiStore } from '../store/useGeminiApiStore';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea';
import { XCircleIcon, ArrowPathIcon } from './Icons';

const InjectedMessageEditModal: React.FC = () => {
  const { 
    isInjectedMessageEditModalOpen, 
    closeInjectedMessageEditModal, 
    injectedMessageEditTarget 
  } = useModalStore();
  
  const { updateCurrentChatSession, currentChatSession } = useActiveChatStore();
  const { handleRegenerateResponseForUserMessage } = useGeminiApiStore.getState();
  const isLoading = useGeminiApiStore(s => s.isLoading);

  const [inputValue, setInputValue] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(inputValue);

  const originalMessage = currentChatSession?.messages.find(m => m.id === injectedMessageEditTarget?.messageId);

  useEffect(() => {
    if (originalMessage) {
      setInputValue(originalMessage.content);
    }
  }, [originalMessage]);

  const handleSaveAndRegenerate = useCallback(async () => {
    if (!injectedMessageEditTarget || !originalMessage) return;

    // 1. Update the user message content
    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === injectedMessageEditTarget.messageId);
      if (messageIndex === -1) return session;

      const updatedMessages = [...session.messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: inputValue,
      };
      return { ...session, messages: updatedMessages };
    });

    // 2. Trigger regeneration for this user message
    handleRegenerateResponseForUserMessage(injectedMessageEditTarget.messageId);

    // 3. Close the modal
    closeInjectedMessageEditModal();
  }, [injectedMessageEditTarget, inputValue, originalMessage, updateCurrentChatSession, handleRegenerateResponseForUserMessage, closeInjectedMessageEditModal]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveAndRegenerate();
    }
  };
  
  const handleClose = () => {
    // If user closes without saving, and the message is still empty,
    // we can leave it as is. The user can edit it later via the normal "Edit" button.
    closeInjectedMessageEditModal();
  };

  if (!isInjectedMessageEditModalOpen || !injectedMessageEditTarget) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="injected-edit-modal-title"
    >
      <div 
        className="bg-[var(--aurora-surface)] border border-[var(--aurora-border)] rounded-lg shadow-2xl w-full max-w-2xl flex flex-col relative"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-[var(--aurora-border)]">
          <h2 id="injected-edit-modal-title" className="text-lg font-semibold text-gray-100">Edit User Message</h2>
          <button 
            onClick={handleClose} 
            className="p-1.5 text-gray-400 hover:text-white rounded-full transition-colors hover:bg-white/10"
            aria-label="Close modal"
          >
            <XCircleIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="p-4 flex-grow">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            className="w-full h-48 p-3 bg-black/30 border border-white/20 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-[var(--aurora-accent-primary)] resize-none"
            placeholder="Type the user's message here..."
            aria-label="User message text"
          />
        </main>

        <footer className="flex justify-end items-center p-4 border-t border-[var(--aurora-border)] space-x-3">
          <button 
            onClick={handleClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-300 bg-white/5 rounded-md hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndRegenerate}
            disabled={isLoading || inputValue.trim() === ''}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-all hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <ArrowPathIcon className="w-5 h-5 mr-2" />
            {isLoading ? 'Regenerating...' : 'Regenerate AI Response'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default InjectedMessageEditModal;
