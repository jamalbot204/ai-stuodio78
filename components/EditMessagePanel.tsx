

import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { useModalStore } from '../store/useModalStore.ts';
import { ChatMessageRole, Attachment } from '../types.ts';
import { CloseIcon, SparklesIcon, UserIcon, SaveDiskIcon, XCircleIcon, SubmitPlayIcon, ContinueArrowIcon, PaperClipIcon, DocumentIcon, PlayCircleIcon, CloudArrowUpIcon, ServerIcon } from './Icons.tsx';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea.ts';
import { useGeminiApiStore } from '../store/useGeminiApiStore.ts'; // Import new store
import { useApiKeyStore } from '../store/useApiKeyStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { uploadFileViaApi, deleteFileViaApi } from '../services/geminiService.ts';
import { SUPPORTED_IMAGE_MIME_TYPES, SUPPORTED_VIDEO_MIME_TYPES } from '../constants.ts';
import { getDisplayFileType } from '../services/utils.ts';


export enum EditMessagePanelAction {
  CANCEL = 'cancel',
  SAVE_LOCALLY = 'save_locally',
  SAVE_AND_SUBMIT = 'save_and_submit',
  CONTINUE_PREFIX = 'continue_prefix',
}

export interface EditMessagePanelDetails {
  sessionId: string;
  messageId: string;
  originalContent: string;
  role: ChatMessageRole;
  attachments?: Attachment[];
}

const EditMessagePanel: React.FC = memo(() => {
  const { handleEditPanelSubmit, handleCancelGeneration } = useGeminiApiStore.getState();
  const isLoading = useGeminiApiStore(s => s.isLoading);
  const { isEditPanelOpen, editingMessageDetail, closeEditPanel } = useModalStore();
  const { activeApiKey } = useApiKeyStore();
  const logApiRequest = useGeminiApiStore(s => s.logApiRequest);
  const showToast = useToastStore(s => s.showToast);

  const [editedContent, setEditedContent] = useState('');
  const [newAttachments, setNewAttachments] = useState<Attachment[]>([]);
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(editedContent, 300);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());

  const isProcessingFiles = newAttachments.some(f => f.isLoading);
  const isUserMessage = editingMessageDetail?.role === ChatMessageRole.USER;

  // Reset state when modal opens
  useEffect(() => {
    if (isEditPanelOpen && editingMessageDetail) {
      setEditedContent(editingMessageDetail.originalContent);
      setNewAttachments([]); // Clear new attachments when modal opens
    }
  }, [isEditPanelOpen, editingMessageDetail]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isEditPanelOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditPanelOpen, textareaRef]);

  // Cleanup pending uploads on unmount
  useEffect(() => {
    return () => {
      uploadControllersRef.current.forEach(controller => controller.abort());
      uploadControllersRef.current.clear();
    };
  }, []);

  const handleAction = useCallback((action: EditMessagePanelAction) => {
    if (!editingMessageDetail) return;
    closeEditPanel();
    handleEditPanelSubmit(action, editedContent, editingMessageDetail as any, newAttachments);
  }, [editingMessageDetail, handleEditPanelSubmit, editedContent, newAttachments, closeEditPanel]);
  
  const handleCancelClick = useCallback(() => {
    if (editingMessageDetail && isLoading && editingMessageDetail.role === ChatMessageRole.MODEL) {
      handleCancelGeneration();
    }
    closeEditPanel();
  }, [isLoading, editingMessageDetail, handleCancelGeneration, closeEditPanel]);

  const updateNewAttachmentState = useCallback((id: string, updates: Partial<Attachment>) => {
    setNewAttachments(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const handleFileSelection = useCallback((files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileTypeForApp = SUPPORTED_IMAGE_MIME_TYPES.includes(file.type) ? 'image' : (SUPPORTED_VIDEO_MIME_TYPES.includes(file.type) ? 'video' : 'image'); // Default to image-like handling for other types
        const attachmentId = `edit-file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const newAttachment: Attachment = { id: attachmentId, name: file.name, mimeType: file.type, size: file.size, type: fileTypeForApp, uploadState: 'reading_client', statusMessage: 'Reading file...', isLoading: true };

        setNewAttachments(prev => [...prev, newAttachment]);

        const reader = new FileReader();
        reader.onload = () => {
          updateNewAttachmentState(attachmentId, { base64Data: (reader.result as string).split(',')[1], dataUrl: reader.result as string });
          
          const processCloudUpload = async () => {
            if (!activeApiKey?.value) {
                updateNewAttachmentState(attachmentId, { error: "API Key not found.", uploadState: 'error_cloud_upload', statusMessage: 'API Key Missing', isLoading: false });
                return;
            }
            const controller = new AbortController();
            uploadControllersRef.current.set(attachmentId, controller);
            try {
                const uploadResult = await uploadFileViaApi(
                    activeApiKey.value, file, logApiRequest,
                    (state, fileApiName, message, progress) => {
                        if (controller.signal.aborted) return;
                        updateNewAttachmentState(attachmentId, { uploadState: state, fileApiName, statusMessage: message || state, progress, isLoading: state === 'uploading_to_cloud' || state === 'processing_on_server' });
                    },
                    controller.signal
                );
                if (uploadResult.error) throw new Error(uploadResult.error);
                updateNewAttachmentState(attachmentId, { fileUri: uploadResult.fileUri, fileApiName: uploadResult.fileApiName, uploadState: 'completed_cloud_upload', statusMessage: 'Cloud ready', isLoading: false });
            } catch (err: any) {
                if (err.name !== 'AbortError') {
                    updateNewAttachmentState(attachmentId, { error: err.message, uploadState: 'error_cloud_upload', statusMessage: `Error: ${err.message}`, isLoading: false });
                }
            } finally {
                uploadControllersRef.current.delete(attachmentId);
            }
          };
          processCloudUpload();
        };
        reader.onerror = () => updateNewAttachmentState(attachmentId, { error: "Failed to read file.", uploadState: 'error_client_read', statusMessage: 'Read error', isLoading: false });
        reader.readAsDataURL(file);
    }
  }, [activeApiKey, logApiRequest, updateNewAttachmentState]);

  const removeNewAttachment = useCallback(async (id: string) => {
    const attachmentToRemove = newAttachments.find(f => f.id === id);
    if (!attachmentToRemove) return;

    uploadControllersRef.current.get(id)?.abort();
    uploadControllersRef.current.delete(id);
    
    setNewAttachments(prev => prev.filter(f => f.id !== id));
    
    if (attachmentToRemove.fileApiName && activeApiKey?.value) {
      try {
        await deleteFileViaApi(activeApiKey.value, attachmentToRemove.fileApiName, logApiRequest);
      } catch (err) {
        console.warn(`Failed to delete cloud file for attachment ${id}:`, err);
        showToast("Failed to delete cloud file.", "error");
      }
    }
  }, [newAttachments, activeApiKey, logApiRequest, showToast]);

  if (!isEditPanelOpen || !editingMessageDetail) return null;
  
  const panelTitle = editingMessageDetail.role === ChatMessageRole.USER ? "Edit User Message" : "Edit AI Response";
  const IconComponent = editingMessageDetail.role === ChatMessageRole.USER ? UserIcon : SparklesIcon;

  const baseButtonClass = "px-4 py-2.5 text-sm font-medium rounded-md transition-shadow flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black";
  const cancelButtonClass = `${baseButtonClass} text-gray-300 bg-white/5 hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] focus:ring-gray-500`;
  const saveLocallyButtonClass = `${baseButtonClass} text-white bg-blue-600/80 hover:shadow-[0_0_12px_2px_rgba(59,130,246,0.6)] focus:ring-blue-500`;
  const continuePrefixButtonClass = `${baseButtonClass} text-white bg-teal-600/80 hover:shadow-[0_0_12px_2px_rgba(13,148,136,0.6)] focus:ring-teal-500`;
  const saveSubmitButtonClass = `${baseButtonClass} text-white bg-green-600/80 hover:shadow-[0_0_12px_2px_rgba(34,197,94,0.6)] focus:ring-green-500`;

  const getFileProgressDisplay = (file: Attachment): string => {
    const totalSizeMB = (file.size / 1024 / 1024).toFixed(1);
    switch(file.uploadState) {
      case 'uploading_to_cloud': return `Uploading... (${(file.progress || 0).toFixed(0)}%)`;
      case 'processing_on_server': return `Processing on server...`;
      case 'completed_cloud_upload': return `Cloud ready (${totalSizeMB}MB)`;
      case 'error_cloud_upload': return `Upload Error`;
      default: return `Waiting... (${totalSizeMB}MB)`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-40 flex justify-center items-center p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="edit-message-panel-title" onClick={handleCancelClick}>
      <div className="aurora-panel p-5 sm:p-6 rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <IconComponent className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-gray-400" />
            <h2 id="edit-message-panel-title" className="text-lg sm:text-xl font-semibold text-gray-100">{panelTitle}</h2>
          </div>
          <button onClick={handleCancelClick} className="text-gray-400 p-1 rounded-full disabled:opacity-50 transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]" aria-label="Close edit panel">
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
        <textarea ref={textareaRef} value={editedContent} onChange={(e) => setEditedContent(e.target.value)} className="w-full flex-grow p-3 aurora-textarea resize-none hide-scrollbar text-sm sm:text-base leading-relaxed" placeholder="Enter message content..." style={{ minHeight: '200px' }} disabled={isLoading && editingMessageDetail.role === ChatMessageRole.MODEL} aria-label="Message content editor" />
        
        {/* Existing Attachments Display */}
        {editingMessageDetail.attachments && editingMessageDetail.attachments.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--aurora-border)]">
                <p className="text-xs text-gray-400 mb-1.5">Existing Attachments (read-only):</p>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto hide-scrollbar">
                {editingMessageDetail.attachments.map(att => (
                    <span key={att.id} className="text-xs bg-white/5 px-2 py-1 rounded-full" title={att.name}>{att.name}</span>
                ))}
                </div>
            </div>
        )}

        {/* New Attachments Section */}
        {isUserMessage && (
          <div className="mt-3 pt-3 border-t border-[var(--aurora-border)]">
              <div className="flex justify-between items-center mb-2">
                 <p className="text-xs text-gray-400">Add New Attachments:</p>
                 <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFileSelection(e.target.files)} className="hidden" accept="image/*,video/*,.pdf,text/*,application/json" />
                 <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingFiles} className="flex items-center px-2 py-1 text-xs font-medium text-white bg-blue-600/50 rounded-md transition-shadow hover:shadow-[0_0_10px_1px_rgba(59,130,246,0.6)] disabled:opacity-50">
                    <PaperClipIcon className="w-3.5 h-3.5 mr-1" /> Add Files
                 </button>
              </div>
              {newAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-3 max-h-32 overflow-y-auto hide-scrollbar p-1">
                      {newAttachments.map(file => (
                          <div key={file.id} className="relative group p-2.5 bg-black/20 rounded-lg shadow flex items-center w-full sm:w-auto sm:max-w-xs md:max-w-sm" style={{ minWidth: '200px' }}>
                              <div className="flex-shrink-0 w-10 h-10 bg-black/20 rounded-full flex items-center justify-center overflow-hidden mr-3">
                                  {file.isLoading && (file.uploadState === 'uploading_to_cloud' || file.uploadState === 'processing_on_server') ? (
                                    file.uploadState === 'uploading_to_cloud' ? <CloudArrowUpIcon className="w-5 h-5 text-blue-400 animate-pulse" /> : <ServerIcon className="w-5 h-5 text-blue-400 animate-pulse" />
                                  ) : file.dataUrl && file.mimeType.startsWith('image/') ? (
                                      <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                                  ) : file.dataUrl && file.mimeType.startsWith('video/') ? (
                                      <PlayCircleIcon className="w-6 h-6 text-gray-300" />
                                  ) : (
                                      <DocumentIcon className="w-6 h-6 text-gray-300" />
                                  )}
                              </div>
                              <div className="flex-grow flex flex-col min-w-0 mr-2">
                                  <p className="text-sm font-medium text-gray-200 truncate" title={file.name}>{getDisplayFileType(file)}</p>
                                  <p className="text-xs text-gray-400 truncate" title={file.statusMessage}>{getFileProgressDisplay(file)}</p>
                                  {(file.uploadState === 'uploading_to_cloud' && file.progress !== undefined && file.progress > 0) && (
                                      <div className="w-full bg-black/20 rounded-full h-1 mt-1"><div className="bg-blue-500 h-1 rounded-full" style={{ width: `${file.progress}%` }}></div></div>
                                  )}
                              </div>
                              <button onClick={() => removeNewAttachment(file.id)} className="flex-shrink-0 p-1 bg-black/20 text-gray-300 hover:text-white rounded-full transition-shadow hover:shadow-[0_0_10px_1px_rgba(239,68,68,0.7)]" title="Remove file">
                                  <XCircleIcon className="w-5 h-5" />
                              </button>
                          </div>
                      ))}
                  </div>
              )}
          </div>
        )}

        <div className="mt-5 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={handleCancelClick} className={cancelButtonClass} aria-label="Cancel edits"><XCircleIcon className="w-4 h-4 mr-1.5" /> Cancel</button>
          <button onClick={() => handleAction(EditMessagePanelAction.SAVE_LOCALLY)} className={saveLocallyButtonClass} disabled={isLoading || isProcessingFiles || (editedContent.trim() === editingMessageDetail.originalContent.trim() && newAttachments.length === 0)} aria-label="Save changes locally"><SaveDiskIcon className="w-4 h-4 mr-1.5"/>Save Locally</button>
          <button onClick={() => handleAction(EditMessagePanelAction.CONTINUE_PREFIX)} className={continuePrefixButtonClass} disabled={isLoading || isProcessingFiles || editedContent.trim() === ''} aria-label="Continue prefix with AI">
            {isLoading && editingMessageDetail.role === ChatMessageRole.MODEL ? (<svg className="animate-spin h-4 w-4 mr-1.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : <ContinueArrowIcon className="w-4 h-4 mr-1.5"/>}
            {isLoading && editingMessageDetail.role === ChatMessageRole.MODEL ? 'Continuing...' : 'Continue Prefix'}
          </button>
          <button onClick={() => handleAction(EditMessagePanelAction.SAVE_AND_SUBMIT)} className={saveSubmitButtonClass} disabled={isLoading || isProcessingFiles || editedContent.trim() === ''} aria-label="Save changes and submit for AI response"><SubmitPlayIcon className="w-4 h-4 mr-1.5"/>Save & Submit</button>
        </div>
      </div>
    </div>
  );
});

export default EditMessagePanel;