import React, { useState, useEffect, memo, useCallback } from 'react';
import { useCharacterStore } from '../store/useCharacterStore.ts';
import { useModalStore } from '../store/useModalStore.ts';
import { CloseIcon } from './Icons.tsx';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea.ts';

// No props are needed anymore!
const CharacterContextualInfoModal: React.FC = memo(() => {
  const { saveContextualInfo } = useCharacterStore();
  const { isContextualInfoModalOpen, editingCharacterForContextualInfo, closeCharacterContextualInfoModal } = useModalStore();
  
  const [infoText, setInfoText] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(infoText, 250);

  useEffect(() => {
    if (isContextualInfoModalOpen && editingCharacterForContextualInfo) {
      setInfoText(editingCharacterForContextualInfo.contextualInfo || '');
    }
  }, [isContextualInfoModalOpen, editingCharacterForContextualInfo]);

  useEffect(() => {
    if (isContextualInfoModalOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isContextualInfoModalOpen, textareaRef]);

  const handleSave = useCallback(() => {
    if (!editingCharacterForContextualInfo) return;
    saveContextualInfo(editingCharacterForContextualInfo.id, infoText);
    closeCharacterContextualInfoModal();
  }, [editingCharacterForContextualInfo, saveContextualInfo, infoText, closeCharacterContextualInfoModal]);
  
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInfoText(e.target.value);
  }, []);

  if (!isContextualInfoModalOpen || !editingCharacterForContextualInfo) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contextual-info-modal-title"
        onClick={closeCharacterContextualInfoModal}
    >
      <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="contextual-info-modal-title" className="text-xl font-semibold">Contextual Info for <span className="text-purple-400">{editingCharacterForContextualInfo.name}</span></h2>
          <button onClick={closeCharacterContextualInfoModal} className="p-1 text-gray-400 rounded-full transition-all hover:text-gray-100 hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]" aria-label="Close contextual info editor"><CloseIcon /></button>
        </div>
        
        <p className="text-sm text-gray-400 mb-3">
          This text will be used as a prompt if the main chat input is empty when this character speaks.
          It will <strong className="text-gray-300">not</strong> be saved in the chat history or resent with subsequent messages.
        </p>

        <textarea
          ref={textareaRef}
          placeholder={`Enter contextual prompt for ${editingCharacterForContextualInfo.name}... (e.g., "Describe your current surroundings and mood.")`}
          value={infoText}
          onChange={handleTextChange}
          rows={8}
          className="w-full p-2.5 aurora-textarea mb-4 hide-scrollbar resize-y flex-grow"
          style={{ minHeight: '150px' }}
          aria-label={`Contextual information for ${editingCharacterForContextualInfo.name}`}
        />
        <div className="flex justify-end space-x-3 flex-shrink-0">
          <button onClick={closeCharacterContextualInfoModal} className="px-4 py-2 text-sm text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-[var(--aurora-accent-primary)] text-white rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]">
            Save Info
          </button>
        </div>
      </div>
    </div>
  );
});

export default CharacterContextualInfoModal;