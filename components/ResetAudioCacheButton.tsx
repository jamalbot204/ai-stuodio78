

import React, { memo } from 'react';
import { AudioResetIcon } from './Icons.tsx';

interface ResetAudioCacheButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}

const ResetAudioCacheButton: React.FC<ResetAudioCacheButtonProps> = memo(({
  onClick,
  disabled = false,
  title = "Reset Audio Cache",
  className = "",
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`p-1.5 text-yellow-400 rounded-md bg-black bg-opacity-20 transition-all focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed hover:text-yellow-300 hover:shadow-[0_0_8px_1px_rgba(252,211,77,0.7)] ${className}`}
    >
      <AudioResetIcon className="w-4 h-4" />
    </button>
  );
});

export default ResetAudioCacheButton;
