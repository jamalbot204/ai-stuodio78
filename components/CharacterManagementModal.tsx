import React, { useState, useEffect, memo, useCallback } from 'react';
import { useCharacterStore } from '../store/useCharacterStore.ts';
import { useModalStore } from '../store/useModalStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { AICharacter } from '../types.ts';
import { CloseIcon, PencilIcon, TrashIcon, InfoIcon } from './Icons.tsx';

// No props are needed anymore!
const CharacterManagementModal: React.FC = memo(() => {
  const { currentChatSession } = useActiveChatStore();
  const { addCharacter, editCharacter, deleteCharacter } = useCharacterStore();
  const { isCharacterManagementModalOpen, closeCharacterManagementModal, openCharacterContextualInfoModal } = useModalStore();

  const [editingCharacter, setEditingCharacter] = useState<AICharacter | null>(null);
  const [newCharName, setNewCharName] = useState('');
  const [newCharInstruction, setNewCharInstruction] = useState('');

  const characters = currentChatSession?.aiCharacters || [];

  useEffect(() => {
    if (isCharacterManagementModalOpen) {
      setEditingCharacter(null);
      setNewCharName('');
      setNewCharInstruction('');
    }
  }, [isCharacterManagementModalOpen]);

  const handleSave = useCallback(() => {
    if (editingCharacter) {
      editCharacter(editingCharacter.id, newCharName, newCharInstruction);
    } else {
      addCharacter(newCharName, newCharInstruction);
    }
    setNewCharName('');
    setNewCharInstruction('');
    setEditingCharacter(null);
  }, [editingCharacter, newCharName, newCharInstruction, editCharacter, addCharacter]);
  
  const startEdit = useCallback((char: AICharacter) => {
    setEditingCharacter(char);
    setNewCharName(char.name);
    setNewCharInstruction(char.systemInstruction);
  }, []);

  if (!isCharacterManagementModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md" onClick={closeCharacterManagementModal}>
      <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold">Manage Characters</h2>
          <button onClick={closeCharacterManagementModal} className="p-1 text-gray-400 rounded-full transition-all hover:text-gray-100 hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.5)]"><CloseIcon /></button>
        </div>

        <div className="mb-6 space-y-3 overflow-y-auto pr-2 flex-grow min-h-0">
            {characters.length === 0 && <p className="text-gray-400 italic">No characters defined yet.</p>}
            {characters.map(char => (
                <div key={char.id} className="p-3 bg-white/5 rounded-md flex justify-between items-center">
                    <div>
                        <p className="font-medium text-purple-300">{char.name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-xs" title={char.systemInstruction}>{char.systemInstruction}</p>
                    </div>
                    <div className="flex space-x-1.5">
                        <button onClick={() => openCharacterContextualInfoModal(char)} className="p-1.5 text-sky-400 transition-all hover:text-sky-300 hover:drop-shadow-[0_0_4px_rgba(56,189,248,0.9)]" title="Edit Contextual Info"><InfoIcon className="w-4 h-4"/></button>
                        <button onClick={() => startEdit(char)} className="p-1.5 text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_4px_rgba(90,98,245,0.9)]" title="Edit Character"><PencilIcon className="w-4 h-4"/></button>
                        <button onClick={() => deleteCharacter(char.id)} className="p-1.5 text-red-400 transition-all hover:text-red-300 hover:drop-shadow-[0_0_4px_rgba(239,68,68,0.9)]" title="Delete Character"><TrashIcon className="w-4 h-4"/></button>
                    </div>
                </div>
            ))}
        </div>
        
        <div className="border-t border-[var(--aurora-border)] pt-4 flex-shrink-0">
          <h3 className="text-lg font-medium mb-2">{editingCharacter ? 'Edit Character' : 'Add New Character'}</h3>
          <input 
            type="text" 
            placeholder="Character Name (e.g., Wizard)" 
            value={newCharName}
            onChange={(e) => setNewCharName(e.target.value)}
            className="w-full p-2.5 aurora-input mb-3"
            aria-label="Character Name"
          />
          <textarea 
            placeholder="Personality & Role (System Instruction)"
            value={newCharInstruction}
            onChange={(e) => setNewCharInstruction(e.target.value)}
            rows={4}
            className="w-full p-2.5 aurora-textarea mb-3 hide-scrollbar resize-none"
            aria-label="Character Personality and Role"
          />
          <div className="flex justify-end space-x-2">
            {editingCharacter && <button onClick={() => { setEditingCharacter(null); setNewCharName(''); setNewCharInstruction('');}} className="px-4 py-2 text-sm text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]">Cancel Edit</button>}
            <button 
                onClick={handleSave} 
                disabled={!newCharName.trim() || !newCharInstruction.trim()}
                className="px-4 py-2 text-sm bg-[var(--aurora-accent-primary)] text-white rounded-md disabled:opacity-50 transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]"
            >
                {editingCharacter ? 'Save Changes' : 'Add Character'}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end flex-shrink-0">
          <button onClick={closeCharacterManagementModal} className="px-4 py-2 text-sm bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]">Close</button>
        </div>
      </div>
    </div>
  );
});

export default CharacterManagementModal;