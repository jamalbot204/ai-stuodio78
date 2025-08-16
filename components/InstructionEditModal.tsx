



import React, { useState, useEffect, memo, useCallback } from 'react';
import { CloseIcon } from './Icons.tsx';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea.ts'; // Import the new hook

interface InstructionEditModalProps {
  isOpen: boolean;
  title: string;
  currentInstruction: string;
  onApply: (newInstruction: string) => void;
  onClose: () => void;
}

const InstructionEditModal: React.FC<InstructionEditModalProps> = memo(({
  isOpen,
  title,
  currentInstruction,
  onApply,
  onClose,
}) => {
  const [editText, setEditText] = useState('');
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(editText, 400); // Max height 400px

  useEffect(() => {
    if (isOpen) {
      setEditText(currentInstruction);
    }
  }, [isOpen, currentInstruction]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
      // Auto-resize is handled by the hook
    }
  }, [isOpen, textareaRef]); // Depend on textareaRef to ensure it's available

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    // Auto-resize is handled by the useAutoResizeTextarea hook
  }, []);

  const handleApplyClick = useCallback(() => {
    onApply(editText);
  }, [onApply, editText]);
  
  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instruction-edit-modal-title"
    >
      <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 id="instruction-edit-modal-title" className="text-xl font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label={`Close ${title} editor`}
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={editText}
          onChange={handleTextChange}
          className="w-full flex-grow p-3 aurora-textarea resize-none hide-scrollbar text-sm sm:text-base leading-relaxed"
          placeholder="Enter instruction..."
          style={{ minHeight: '300px' }} 
          aria-label="Instruction content editor"
        />

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]"
          >
            Cancel
          </button>
          <button
            onClick={handleApplyClick}
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
});

export default InstructionEditModal;