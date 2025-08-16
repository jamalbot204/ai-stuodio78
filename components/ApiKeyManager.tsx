

import React, { memo, useCallback } from 'react';
import { useApiKeyStore } from '../store/useApiKeyStore.ts';
import { useModalStore } from '../store/useModalStore.ts';
import { ApiKey } from '../types.ts';
import { PlusIcon, TrashIcon, CheckIcon, ChevronUpIcon, ChevronDownIcon, ChevronDoubleUpIcon, ChevronDoubleDownIcon, EyeIcon, EyeOffIcon, ArrowPathIcon } from './Icons.tsx';

const ReorderButton: React.FC<{ onClick: () => void, disabled: boolean, title: string, children: React.ReactNode }> = memo(({ onClick, disabled, title, children }) => (
    <button onClick={onClick} disabled={disabled} title={title} className="p-0.5 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
        {children}
    </button>
));


// Sub-component for a single API key item
const ApiKeyItem: React.FC<{
  apiKey: ApiKey;
  isFirst: boolean;
  isLast: boolean;
  isKeyVisible: boolean;
  onUpdate: (id: string, name: string, value: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onMoveToEdge: (id: string, edge: 'top' | 'bottom') => void;
}> = memo(({ apiKey, isFirst, isLast, isKeyVisible, onUpdate, onDelete, onMove, onMoveToEdge }) => {

  const handleDeleteClick = useCallback(() => {
    onDelete(apiKey.id);
  }, [onDelete, apiKey.id]);

  const handleMoveUp = useCallback(() => onMove(apiKey.id, 'up'), [apiKey.id, onMove]);
  const handleMoveDown = useCallback(() => onMove(apiKey.id, 'down'), [apiKey.id, onMove]);
  const handleMoveToTop = useCallback(() => onMoveToEdge(apiKey.id, 'top'), [apiKey.id, onMoveToEdge]);
  const handleMoveToBottom = useCallback(() => onMoveToEdge(apiKey.id, 'bottom'), [apiKey.id, onMoveToEdge]);

  return (
    <div
      data-id={apiKey.id}
      className="flex items-center space-x-2 p-2 bg-black/20 rounded-md"
    >
      <div className="flex-shrink-0 w-5">
        {isFirst && <CheckIcon className="w-5 h-5 text-green-400" title="Active Key" />}
      </div>
      <input
        type="text"
        value={apiKey.name}
        onChange={(e) => onUpdate(apiKey.id, e.target.value, apiKey.value)}
        placeholder="Key Name (e.g., Main)"
        className="aurora-input text-sm p-1.5 w-32"
        aria-label="API Key Name"
      />
      <input
        type={isKeyVisible ? 'text' : 'password'}
        value={apiKey.value}
        onChange={(e) => onUpdate(apiKey.id, apiKey.name, e.target.value)}
        placeholder="Paste API Key Value"
        className="aurora-input text-sm p-1.5 flex-grow font-mono"
        aria-label="API Key Value"
      />
      <div className="flex items-center space-x-0.5">
        <ReorderButton onClick={handleMoveToTop} disabled={isFirst} title="Move to Top">
            <ChevronDoubleUpIcon className="w-4 h-4" />
        </ReorderButton>
        <ReorderButton onClick={handleMoveUp} disabled={isFirst} title="Move Up">
            <ChevronUpIcon className="w-4 h-4" />
        </ReorderButton>
        <ReorderButton onClick={handleMoveDown} disabled={isLast} title="Move Down">
            <ChevronDownIcon className="w-4 h-4" />
        </ReorderButton>
        <ReorderButton onClick={handleMoveToBottom} disabled={isLast} title="Move to Bottom">
            <ChevronDoubleDownIcon className="w-4 h-4" />
        </ReorderButton>
      </div>
      <button onClick={handleDeleteClick} title="Delete Key" className="p-1.5 text-red-500 hover:text-red-400">
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  );
});


const ApiKeyManager: React.FC = memo(() => {
  const { apiKeys, isKeyVisible, addApiKey, updateApiKey, toggleKeyVisibility, moveKey, moveKeyToEdge, isRotationEnabled, toggleRotation } = useApiKeyStore();
  const requestDeleteConfirmation = useModalStore(state => state.requestDeleteConfirmation);

  const handleDelete = useCallback((id: string) => {
    requestDeleteConfirmation({ sessionId: id, messageId: 'api-key' });
  }, [requestDeleteConfirmation]);
  
  return (
    <div>
      <div className="space-y-2">
        {apiKeys.map((key, index) => (
          <ApiKeyItem
            key={key.id}
            apiKey={key}
            isFirst={index === 0}
            isLast={index === apiKeys.length - 1}
            isKeyVisible={isKeyVisible}
            onUpdate={updateApiKey}
            onDelete={handleDelete}
            onMove={moveKey}
            onMoveToEdge={moveKeyToEdge}
          />
        ))}
        {apiKeys.length === 0 && <p className="text-sm text-gray-400 italic">No API keys added.</p>}
      </div>
      <div className="mt-3 flex space-x-2">
        <button onClick={addApiKey} className="flex items-center px-3 py-2 text-xs font-medium text-white bg-blue-600/80 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(59,130,246,0.6)]">
          <PlusIcon className="w-4 h-4 mr-1.5" /> Add API Key
        </button>
        <button onClick={toggleKeyVisibility} title={isKeyVisible ? "Hide Keys" : "Show Keys"} className="p-2 text-gray-300 bg-white/5 rounded-md hover:text-white">
          {isKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
        <button 
          onClick={toggleRotation} 
          title={isRotationEnabled ? "Turn Off Key Rotation" : "Turn On Key Rotation"} 
          className={`flex items-center px-3 py-2 text-xs font-medium rounded-md transition-all disabled:opacity-50 ${
            isRotationEnabled 
              ? 'bg-green-600/80 text-white hover:shadow-[0_0_12px_2px_rgba(34,197,94,0.6)]' 
              : 'bg-gray-600/80 text-gray-200 hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]'
          }`}
          disabled={apiKeys.length < 2}
        >
          <ArrowPathIcon className={`w-4 h-4 mr-1.5 ${isRotationEnabled ? 'animate-spin-slow' : ''}`} />
          Rotation: {isRotationEnabled ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  );
});

export default ApiKeyManager;