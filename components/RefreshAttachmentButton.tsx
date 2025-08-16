

import React, { memo, useCallback } from 'react';
import { ArrowPathIcon, XCircleIcon } from './Icons.tsx';
import { Attachment } from '../types.ts';

interface RefreshAttachmentButtonProps {
  attachment: Attachment;
  onReUpload: () => Promise<void>;
  disabled?: boolean;
}

const RefreshAttachmentButton: React.FC<RefreshAttachmentButtonProps> = memo(({
  attachment,
  onReUpload,
  disabled,
}) => {
  const isLoading = attachment.isReUploading;
  const hasError = !!attachment.reUploadError;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from bubbling to parent (e.g., opening attachment)
    if (!isLoading && !disabled) {
      onReUpload();
    }
  }, [isLoading, disabled, onReUpload]);

  let IconComponent = ArrowPathIcon;
  let iconColor = 'text-blue-300 hover:text-blue-200';
  let title = "Refresh cloud link";

  if (isLoading) {
    IconComponent = () => ( // Spinner
      <svg className="animate-spin h-3 w-3 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    );
    title = "Refreshing link...";
    iconColor = 'text-blue-300'; // Spinner color
  } else if (hasError) {
    IconComponent = XCircleIcon;
    iconColor = 'text-red-400';
    title = `Error refreshing: ${attachment.reUploadError}`;
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      title={title}
      aria-label={title}
      className={`p-1 bg-black bg-opacity-40 rounded-full transition-all
                  ${disabled || isLoading ? 'cursor-not-allowed opacity-70' : 'hover:shadow-[0_0_8px_1px_rgba(59,130,246,0.6)]'}
                  ${iconColor}
                `}
    >
      <IconComponent className="w-3 h-3" />
    </button>
  );
});

export default RefreshAttachmentButton;
