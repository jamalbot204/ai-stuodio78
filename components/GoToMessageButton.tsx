

import React, { memo } from 'react';
import { LocateIcon } from './Icons.tsx';

interface GoToMessageButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const GoToMessageButton: React.FC<GoToMessageButtonProps> = memo(({ onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 text-gray-400 hover:text-blue-300 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-1 flex-shrink-0`}
      title="Go to playing message"
      aria-label="Go to playing message"
    >
      <LocateIcon />
    </button>
  );
});

export default GoToMessageButton;