


import React, { memo, useCallback } from 'react';
import { AttachmentWithContext, ChatMessageRole } from '../types.ts';
import { CloseIcon, DocumentIcon, PlayCircleIcon, ArrowUturnLeftIcon, UserIcon, SparklesIcon } from './Icons.tsx';
import RefreshAttachmentButton from './RefreshAttachmentButton.tsx';
import { useGeminiApiStore } from '../store/useGeminiApiStore.ts'; // Import new store
import { useInteractionStore } from '../store/useInteractionStore.ts';

interface ChatAttachmentsModalProps {
  isOpen: boolean;
  attachments: AttachmentWithContext[];
  chatTitle: string;
  onClose: () => void;
  onGoToMessage: (messageId: string) => void;
}

const ChatAttachmentsModal: React.FC<ChatAttachmentsModalProps> = memo(({
  isOpen,
  attachments,
  chatTitle,
  onClose,
  onGoToMessage,
}) => {
  const { reUploadAttachment } = useInteractionStore();
  const isLoading = useGeminiApiStore(s => s.isLoading); // Get state from store

  const getFileIcon = useCallback((item: AttachmentWithContext) => {
    const { attachment } = item;
    if (attachment.dataUrl && attachment.mimeType.startsWith('image/')) {
      return <img src={attachment.dataUrl} alt={attachment.name} className="w-10 h-10 object-cover rounded-md" />;
    }
    if (attachment.dataUrl && attachment.mimeType.startsWith('video/')) {
      return <PlayCircleIcon className="w-10 h-10 text-gray-400" />;
    }
    return <DocumentIcon className="w-10 h-10 text-gray-400" />;
  }, []);
  
  const getRoleIcon = useCallback((role: ChatMessageRole) => {
    if (role === ChatMessageRole.USER) return <UserIcon className="w-3 h-3 text-blue-400" />;
    if (role === ChatMessageRole.MODEL) return <SparklesIcon className="w-3 h-3 text-purple-400" />;
    return null;
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-attachments-modal-title"
      onClick={onClose}
    >
      <div 
        className="aurora-panel p-5 sm:p-6 rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="chat-attachments-modal-title" className="text-xl font-semibold text-gray-100 truncate">Attachments in "{chatTitle}"</h2>
          <button
            onClick={onClose}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close attachments view"
          >
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-3">
          {attachments.length === 0 ? (
            <p className="text-gray-400 italic text-center py-8">No attachments in this chat.</p>
          ) : (
            attachments.map(item => (
              <div key={item.attachment.id} className="p-3 bg-white/5 rounded-md flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0">{getFileIcon(item)}</div>
                  <div className="flex-grow min-w-0">
                    <p className="font-medium text-gray-200 truncate" title={item.attachment.name}>{item.attachment.name}</p>
                    <p className="text-xs text-gray-400 truncate" title={item.messageContentSnippet}>
                      From: <span className="italic">"{item.messageContentSnippet}"</span>
                    </p>
                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                      <span>{getRoleIcon(item.messageRole)}</span>
                      <span>{new Date(item.messageTimestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {item.attachment.fileUri && (
                    <RefreshAttachmentButton 
                      attachment={item.attachment}
                      onReUpload={() => reUploadAttachment(item.messageId, item.attachment.id)}
                      disabled={item.attachment.isReUploading || isLoading}
                    />
                  )}
                  <button 
                    onClick={() => onGoToMessage(item.messageId)}
                    className="p-1.5 text-gray-400 hover:text-blue-300 rounded-full hover:bg-white/10 transition-colors"
                    title="Go to message"
                  >
                    <ArrowUturnLeftIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-6 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]">Close</button>
        </div>
      </div>
    </div>
  );
});

export default ChatAttachmentsModal;
