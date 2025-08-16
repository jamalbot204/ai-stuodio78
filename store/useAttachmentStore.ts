import { create } from 'zustand';
import { Attachment, LogApiRequestCallback } from '../types.ts';
import { uploadFileViaApi, deleteFileViaApi, formatGeminiError } from '../services/geminiService.ts';
import { SUPPORTED_IMAGE_MIME_TYPES, SUPPORTED_VIDEO_MIME_TYPES } from '../constants.ts';
import { getDisplayFileType as getDisplayFileTypeUtil } from '../services/utils.ts';

// Dependency getters to avoid direct store imports
type GetApiKey = () => string;
type GetLogApiRequest = () => LogApiRequestCallback;
type GetShowToast = () => (message: string, type?: 'success' | 'error', duration?: number) => void;

interface AttachmentState {
  selectedFiles: Attachment[];
  dependencies: {
    getApiKey: GetApiKey | null;
    getLogApiRequest: GetLogApiRequest | null;
    getShowToast: GetShowToast | null;
  };
}

interface AttachmentActions {
  setDependencies: (deps: AttachmentState['dependencies']) => void;
  updateAttachmentState: (id: string, updates: Partial<Attachment>) => void;
  handleFileSelection: (files: FileList | null, isInfoInputModeActive: boolean) => void;
  handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>, isInfoInputModeActive: boolean) => void;
  removeSelectedFile: (id: string) => void;
  resetSelectedFiles: () => void;
  getValidAttachmentsToSend: () => Attachment[];
  isAnyFileStillProcessing: () => boolean;
  getFileProgressDisplay: (file: Attachment) => string;
  getDisplayFileType: (file: Attachment) => string;
}

const activeUploadControllers = new Map<string, AbortController>();

export const useAttachmentStore = create<AttachmentState & AttachmentActions>((set, get) => ({
  selectedFiles: [],
  dependencies: { getApiKey: null, getLogApiRequest: null, getShowToast: null },

  setDependencies: (deps) => set({ dependencies: deps }),

  updateAttachmentState: (id, updates) => {
    set(state => ({
      selectedFiles: state.selectedFiles.map(f => (f.id === id ? { ...f, ...updates } : f)),
    }));
  },

  handleFileSelection: (files, isInfoInputModeActive) => {
    if (!files || isInfoInputModeActive) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let fileTypeForApp: 'image' | 'video' = 'image';
      if (SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
        fileTypeForApp = 'image';
      } else if (SUPPORTED_VIDEO_MIME_TYPES.includes(file.type)) {
        fileTypeForApp = 'video';
      }

      const attachmentId = `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const newAttachmentInitial: Attachment = {
        id: attachmentId, name: file.name, mimeType: file.type, size: file.size,
        type: fileTypeForApp, uploadState: 'reading_client', statusMessage: 'Reading file...', isLoading: true,
      };

      set(state => ({ selectedFiles: [...state.selectedFiles, newAttachmentInitial] }));

      const reader = new FileReader();
      reader.onload = (e_reader) => {
        const fileContentResult = e_reader.target?.result as string;
        if (!fileContentResult || !fileContentResult.startsWith('data:')) {
          get().updateAttachmentState(attachmentId, {
            error: "Failed to read file content correctly.", uploadState: 'error_client_read',
            statusMessage: 'Error reading file content.', isLoading: false,
          });
          return;
        }
        
        const base64Data = fileContentResult.split(',')[1];
        
        get().updateAttachmentState(attachmentId, {
          dataUrl: (fileTypeForApp === 'image' || fileTypeForApp === 'video') ? fileContentResult : undefined,
          base64Data: base64Data,
          uploadState: 'completed', statusMessage: 'Preview ready. Initiating cloud sync...', isLoading: true,
        });
        
        const processCloudUpload = async () => {
          const { getApiKey, getLogApiRequest, getShowToast } = get().dependencies;
          if (!getApiKey || !getLogApiRequest || !getShowToast) return;

          get().updateAttachmentState(attachmentId, {
              uploadState: 'uploading_to_cloud', statusMessage: 'Initiating cloud upload...',
              isLoading: true, progress: undefined, error: undefined,
          });

          const controller = new AbortController();
          activeUploadControllers.set(attachmentId, controller);
          
          try {
            const uploadResult = await uploadFileViaApi(
              getApiKey()!, file, getLogApiRequest()!,
              (state, fileApiNameFromCb, messageFromCb, progressFromCb) => {
                if (controller.signal.aborted) return;
                get().updateAttachmentState(attachmentId, {
                  uploadState: state, statusMessage: messageFromCb || state.replace(/_/g, ' '),
                  fileApiName: fileApiNameFromCb, progress: progressFromCb,
                  isLoading: state === 'uploading_to_cloud' || state === 'processing_on_server',
                });
              },
              controller.signal
            );
            
            if (controller.signal.aborted) return;

            if (uploadResult.error) {
              getShowToast()!(uploadResult.error, 'error');
              get().updateAttachmentState(attachmentId, { error: uploadResult.error, uploadState: 'error_cloud_upload', statusMessage: `Cloud Error: ${uploadResult.error}`, isLoading: false });
            } else if (uploadResult.fileUri) {
              get().updateAttachmentState(attachmentId, {
                fileUri: uploadResult.fileUri, fileApiName: uploadResult.fileApiName, uploadState: 'completed_cloud_upload',
                statusMessage: 'Cloud upload complete. Ready.', isLoading: false, error: undefined,
              });
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              get().updateAttachmentState(attachmentId, { error: "Upload cancelled.", uploadState: 'error_cloud_upload', statusMessage: "Upload cancelled by user.", isLoading: false });
            } else if (!controller.signal.aborted) {
              const formattedError = formatGeminiError(err);
              getShowToast()!(formattedError, 'error');
              get().updateAttachmentState(attachmentId, { error: formattedError, uploadState: 'error_cloud_upload', statusMessage: `Cloud Error: ${formattedError}`, isLoading: false });
            }
          } finally {
            if (activeUploadControllers.get(attachmentId) === controller) {
                activeUploadControllers.delete(attachmentId);
            }
          }
        };
        processCloudUpload();
      };
      reader.onerror = () => {
        get().updateAttachmentState(attachmentId, { error: "Failed to read file.", uploadState: 'error_client_read', statusMessage: 'Error reading file.', isLoading: false });
      };
      reader.readAsDataURL(file);
    }
  },

  handlePaste: (event, isInfoInputModeActive) => {
    if (isInfoInputModeActive) return;
    if (event.clipboardData.files && event.clipboardData.files.length > 0) {
      event.preventDefault();
      get().handleFileSelection(event.clipboardData.files, isInfoInputModeActive);
    }
  },

  removeSelectedFile: (id) => {
    const { getApiKey, getLogApiRequest, getShowToast } = get().dependencies;
    const attachmentToRemove = get().selectedFiles.find(f => f.id === id);

    if (attachmentToRemove) {
      const controller = activeUploadControllers.get(id);
      if (controller) {
        controller.abort();
        activeUploadControllers.delete(id);
      }
      if (attachmentToRemove.fileApiName && getApiKey && getLogApiRequest && getShowToast) {
        deleteFileViaApi(getApiKey()!, attachmentToRemove.fileApiName, getLogApiRequest()!)
          .catch(err => {
            console.warn(`Failed to delete file ${attachmentToRemove.fileApiName} from cloud:`, err);
            getShowToast()!(`Could not delete file from cloud: ${err.message}`, 'error');
          });
      }
    }
    set(state => ({ selectedFiles: state.selectedFiles.filter(file => file.id !== id) }));
  },

  resetSelectedFiles: () => {
    get().selectedFiles.forEach(file => {
      const controller = activeUploadControllers.get(file.id);
      if (controller) {
        controller.abort();
        activeUploadControllers.delete(file.id);
      }
    });
    set({ selectedFiles: [] });
  },

  getValidAttachmentsToSend: () => {
    return get().selectedFiles.filter(f => f.uploadState === 'completed_cloud_upload' && f.fileUri && !f.error);
  },

  isAnyFileStillProcessing: () => {
    return get().selectedFiles.some(f => 
      (f.uploadState === 'uploading_to_cloud' || f.uploadState === 'processing_on_server' || f.uploadState === 'reading_client') && !f.error
    );
  },

  getFileProgressDisplay: (file) => {
    const totalSizeMB = (file.size / 1024 / 1024).toFixed(1);
    switch(file.uploadState) {
      case 'reading_client': return `Reading for preview...`;
      case 'uploading_to_cloud':
        const uploadProgress = file.progress || 0;
        const uploadedMB = (file.size * uploadProgress / 100 / 1024 / 1024).toFixed(1);
        return `${uploadedMB}MB / ${totalSizeMB}MB`;
      case 'processing_on_server': return `Processing on server...`;
      case 'completed_cloud_upload': return `Cloud ready (${totalSizeMB}MB)`;
      case 'completed': return file.fileUri ? `Cloud ready (${totalSizeMB}MB)` : `Preview ready`;
      case 'error_client_read': return `Preview Error: ${file.error || 'Failed'}`;
      case 'error_cloud_upload': return `Upload Error: ${file.error || 'Failed'}`;
      default: return file.statusMessage || `Waiting... (${totalSizeMB}MB)`;
    }
  },

  getDisplayFileType: (file) => getDisplayFileTypeUtil(file),
}));
