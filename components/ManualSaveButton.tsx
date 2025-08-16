


import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { SaveDiskIcon, CheckIcon } from './Icons.tsx';
import { useToastStore } from '../store/useToastStore.ts';
interface ManualSaveButtonProps {
  onManualSave: () => Promise<void>;
  disabled?: boolean;
}

const ManualSaveButton: React.FC<ManualSaveButtonProps> = memo(({ onManualSave, disabled }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimeoutRef = useRef<number | null>(null);
  const showToast = useToastStore(state => state.showToast);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (isSaving || disabled) return;
    setIsSaving(true);
    setShowSuccess(false);
    try {
      await onManualSave();
      setShowSuccess(true);
      successTimeoutRef.current = window.setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
    } catch (error) {
      console.error("Manual save trigger failed:", error);
      showToast("Failed to save app state.", "error");
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, disabled, onManualSave, showToast]);

  const IconToDisplay = showSuccess ? CheckIcon : SaveDiskIcon;
  const iconColor = showSuccess ? 'text-green-400' : (isSaving ? 'text-blue-400 animate-pulse' : 'text-gray-300');
  const buttonTitle = showSuccess ? "Saved!" : (isSaving ? "Saving..." : "Save App State");

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isSaving}
      className={`p-1.5 rounded-md transition-all focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)]
                  ${disabled || isSaving ? 'opacity-60 cursor-not-allowed' : 'hover:text-white hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]'}`}
      title={buttonTitle}
      aria-label={buttonTitle}
    >
      <IconToDisplay className={`w-5 h-5 ${iconColor}`} />
    </button>
  );
});

export default ManualSaveButton;