// Fix: Removed incorrect import of 'ChatSession as GeminiChatSessionSDK'. Chat config is GenerationConfig.
import { GoogleGenAI, Chat, GenerateContentResponse, Part, SafetySetting as GeminiSafetySettingFromSDK, Content, GenerationConfig as GeminiGenerationConfigSDK, FileData } from "@google/genai"; // Use SDK's SafetySetting type
import { ChatMessage, ChatMessageRole, GeminiSettings, GeminiHistoryEntry, GroundingChunk, Attachment, ApiRequestLog, ApiRequestPayload, AICharacter, LoggedGeminiGenerationConfig, FileUploadResult, GeminiFileResource, AttachmentUploadState } from '../types.ts';
import { MODELS_SENDING_THINKING_CONFIG_API } from "../constants.ts"; // Updated import

const aiInstancesCache = new Map<string, GoogleGenAI>();

function createAiInstance(apiKey: string): GoogleGenAI {
    if (aiInstancesCache.has(apiKey)) {
        return aiInstancesCache.get(apiKey)!;
    }
    const newInstance = new GoogleGenAI({ apiKey });
    aiInstancesCache.set(apiKey, newInstance);
    return newInstance;
}

// NOTE ON ATTACHMENT HANDLING FOR API:
// When constructing 'parts' for the Gemini API (e.g., in mapMessagesToGeminiHistoryInternal):
// 1. If an attachment has a 'fileUri' (from successful File API upload), a 'fileData' part is created. This sends a reference to the raw file already on Google's servers.
// 2. If 'fileUri' is not available but 'base64Data' is (e.g., as a fallback or older data), an 'inlineData' part is created. This sends the file content base64 encoded.
// 3. The 'dataUrl' field on an Attachment object is primarily for client-side UI previews (e.g., in MessageItem or ChatView's selected files tray) and is NOT directly used for API communication with Gemini models.

export function mapMessagesToGeminiHistoryInternal(
  messages: ChatMessage[],
  settings?: GeminiSettings
): GeminiHistoryEntry[] {
  let eligibleMessages = messages.filter(
    msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL
  );

  const maxMessages = settings?.contextWindowMessages;

  if (typeof maxMessages === 'number' && maxMessages > 0 && eligibleMessages.length > maxMessages) {
    eligibleMessages = eligibleMessages.slice(-maxMessages);
  }

  return eligibleMessages.map(msg => {
    const parts: Part[] = []; // Use SDK Part type
    let baseContent = msg.content;

    if (settings?.aiSeesTimestamps && msg.role === ChatMessageRole.USER) {
        baseContent = `[USER at ${new Date(msg.timestamp).toLocaleString()}] ${baseContent}`;
    } else if (settings?.aiSeesTimestamps && msg.role === ChatMessageRole.MODEL) {
        baseContent = `[AI at ${new Date(msg.timestamp).toLocaleString()}] ${baseContent}`;
    }
    
    if (baseContent.trim() || msg.isGithubContextMessage) { // Also add part if it's the github context message, even if content is "" for UI
      parts.push({ text: baseContent });
    }
    
    if (msg.attachments) {
      msg.attachments.forEach(att => {
        if (att.fileUri && att.uploadState === 'completed_cloud_upload') {
          parts.push({
            fileData: { // This structure creates a FileDataPart
              mimeType: att.mimeType,
              fileUri: att.fileUri,
            }
          });
        } else if (att.base64Data && !att.error) { // Fallback to inlineData
          parts.push({ // This structure creates an InlineDataPart
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64Data,
            }
          });
        }
      });
    }
    
    if (parts.length === 0 && (msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL)) { 
      parts.push({ text: "" }); 
    }
    
    return {
      role: msg.role as 'user' | 'model',
      parts: parts,
    };
  });
}

export function mapMessagesToFlippedRoleGeminiHistory(
  messages: ChatMessage[],
  settings?: GeminiSettings
): GeminiHistoryEntry[] {
  let eligibleMessages = messages.filter(
    msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL || msg.role === ChatMessageRole.ERROR
  );

  const maxMessages = settings?.contextWindowMessages;

  if (typeof maxMessages === 'number' && maxMessages > 0 && eligibleMessages.length > maxMessages) {
    eligibleMessages = eligibleMessages.slice(-maxMessages);
  }

  return eligibleMessages.map(msg => {
    const parts: Part[] = []; // Use SDK Part type
    let baseContent = msg.content;
    // Timestamps are generally not flipped in role, but added if the original message had it conceptually.
    // For simplicity here, not adding timestamps to flipped roles unless specifically required.

    if (baseContent.trim()) {
      parts.push({ text: baseContent });
    }
    
    if (msg.attachments) {
      msg.attachments.forEach(att => {
        if (att.fileUri && att.uploadState === 'completed_cloud_upload') {
          parts.push({
            fileData: {
              mimeType: att.mimeType,
              fileUri: att.fileUri,
            }
          });
        } else if (att.base64Data && !att.error) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64Data,
            }
          });
        }
      });
    }
    
    let finalRole: 'user' | 'model';
    if (msg.role === ChatMessageRole.USER) {
      finalRole = 'model';
    } else { // MODEL or ERROR
      finalRole = 'user';
    }
    
    if (parts.length === 0) { 
      parts.push({ text: "" }); 
    }
    
    return {
      role: finalRole,
      parts: parts,
    };
  });
}


export function mapMessagesToCharacterPerspectiveHistory(
  allMessages: ChatMessage[],
  currentCharacterId: string,
  aiCharacters: AICharacter[],
  settings?: GeminiSettings
): GeminiHistoryEntry[] {
  const perspectiveHistory: GeminiHistoryEntry[] = [];
  const currentCharacter = aiCharacters.find(c => c.id === currentCharacterId);
  if (!currentCharacter) return [];

  let eligibleMessages = allMessages.filter(
    msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL
  );
  const maxMessages = settings?.contextWindowMessages;
  if (typeof maxMessages === 'number' && maxMessages > 0 && eligibleMessages.length > maxMessages) {
    eligibleMessages = eligibleMessages.slice(-maxMessages);
  }

  for (const msg of eligibleMessages) {
    const isMsgFromCurrentCharacter = msg.role === ChatMessageRole.MODEL && msg.characterName === currentCharacter.name;
    const isMsgFromOtherCharacter = msg.role === ChatMessageRole.MODEL && msg.characterName && msg.characterName !== currentCharacter.name;
    
    let roleForThisMessage: 'user' | 'model';
    let contentForThisMessage = msg.content;

    if (settings?.aiSeesTimestamps) {
        contentForThisMessage = `[${isMsgFromCurrentCharacter ? 'SELF' : (msg.characterName || 'USER')} at ${new Date(msg.timestamp).toLocaleString()}] ${contentForThisMessage}`;
    }
    
    if (isMsgFromCurrentCharacter) {
      roleForThisMessage = 'model';
    } else { 
      roleForThisMessage = 'user';
      if (isMsgFromOtherCharacter) {
        contentForThisMessage = `${msg.characterName?.toUpperCase()}: ${contentForThisMessage}`;
      }
    }

    const messageAPIParts: Part[] = []; // Use SDK Part type
    if (contentForThisMessage.trim() || msg.isGithubContextMessage) {
      messageAPIParts.push({ text: contentForThisMessage });
    }
    if (msg.attachments) {
      msg.attachments.forEach(att => {
        if (att.fileUri && att.uploadState === 'completed_cloud_upload') {
          messageAPIParts.push({
            fileData: {
              mimeType: att.mimeType,
              fileUri: att.fileUri,
            }
          });
        } else if (att.base64Data && !att.error) {
          messageAPIParts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64Data,
            }
          });
        }
      });
    }
    
    if (messageAPIParts.length === 0) {
        messageAPIParts.push({ text: "" }); 
    }

    perspectiveHistory.push({ role: roleForThisMessage, parts: messageAPIParts });
  }
  
  return perspectiveHistory;
}

const POLLING_INTERVAL_MS = 2000; // 2 seconds
const MAX_POLLING_ATTEMPTS = 30; // Max 60 seconds of polling

async function pollFileStateUntilActive(
    ai: GoogleGenAI, 
    fileApiName: string, 
    logApiRequestCallback: LogApiRequestCallback,
    onStateChangeForPolling?: (state: AttachmentUploadState, message?: string) => void,
    signal?: AbortSignal // Added signal
): Promise<GeminiFileResource> {
    let attempts = 0;
    onStateChangeForPolling?.('processing_on_server', `Server processing file...`);
    while (attempts < MAX_POLLING_ATTEMPTS) {
        if (signal?.aborted) {
          throw new DOMException('Aborted by user', 'AbortError');
        }
        attempts++;
        try {
            if (logApiRequestCallback) {
                logApiRequestCallback({
                    requestType: 'files.getFile',
                    payload: { fileName: fileApiName }
                });
            }
            const fileResource = await ai.files.get({ name: fileApiName }) as GeminiFileResource;
            if (logApiRequestCallback && fileResource) {
                 logApiRequestCallback({
                    requestType: 'files.getFile', // Log response associated with getFile
                    payload: { fileName: fileApiName, fileApiResponse: fileResource }
                });
            }

            if (fileResource.state === 'ACTIVE') {
                onStateChangeForPolling?.('completed_cloud_upload', 'File ready on cloud.');
                return fileResource;
            }
            if (fileResource.state === 'FAILED') {
                const errorMsg = fileResource.error?.message || 'File processing failed on server.';
                onStateChangeForPolling?.('error_cloud_upload', `Error: ${errorMsg}`);
                throw new Error(errorMsg);
            }
            // Still PROCESSING, wait and poll again
            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
            if (signal?.aborted) { // Check again after timeout
              throw new DOMException('Aborted by user', 'AbortError');
            }
        } catch (error: any) {
            if (error.name === 'AbortError') throw error; // Re-throw AbortError immediately
            console.error(`Polling error for ${fileApiName}, attempt ${attempts}:`, error);
            onStateChangeForPolling?.('error_cloud_upload', `Polling failed: ${formatGeminiError(error)}`);
            throw error; // Rethrow to stop polling on significant errors
        }
    }
    onStateChangeForPolling?.('error_cloud_upload', 'File processing timed out on server.');
    throw new Error('File processing timed out after multiple polling attempts.');
}


export async function uploadFileViaApi(
  apiKey: string,
  fileToUpload: globalThis.File, // Use the global File type
  logApiRequestCallback: LogApiRequestCallback,
  onStateChange?: (state: AttachmentUploadState, fileApiName?: string, message?: string, progress?: number) => void,
  signal?: AbortSignal // Added signal
): Promise<FileUploadResult> {
  // IMPORTANT: This function sends the raw 'fileToUpload' to the Gemini File API.
  // Any client-side generation of 'dataUrl' or 'base64Data' (e.g., in ChatView.tsx)
  // is for UI preview purposes ONLY and is NOT used by this upload function for API communication.
  if (!apiKey) {
    const errorMsg = "API Key not configured for File API.";
    onStateChange?.('error_cloud_upload', undefined, errorMsg);
    return { mimeType: fileToUpload.type, originalFileName: fileToUpload.name, size: fileToUpload.size, error: errorMsg };
  }
  const ai = createAiInstance(apiKey);

  if (signal?.aborted) {
    const errorMsg = "Upload cancelled before starting.";
    onStateChange?.('error_cloud_upload', undefined, errorMsg);
    return { mimeType: fileToUpload.type, originalFileName: fileToUpload.name, size: fileToUpload.size, error: errorMsg };
  }

  try {
    onStateChange?.('uploading_to_cloud', undefined, 'Uploading to cloud...');
    
    if (logApiRequestCallback) {
        logApiRequestCallback({
            requestType: 'files.uploadFile',
            payload: { file: { name: fileToUpload.name, type: fileToUpload.type, size: fileToUpload.size } }
        });
    }

    // Note: ai.files.upload does not directly support AbortSignal.
    // Cancellation during this specific network call is not possible via this signal.
    // The signal will be primarily used for the polling phase.
    const initialFileResource = await ai.files.upload({
        file: fileToUpload,
        // name: `your-desired-resource-name/${fileToUpload.name}` // Optional: if you need to control the resource name
        // mimeType is inferred by the SDK from the File object (fileToUpload.type)
    }) as GeminiFileResource;

    if (signal?.aborted) { // Check immediately after upload attempt
      if (initialFileResource.name) { // If upload succeeded enough to get a name, attempt deletion
         try {
            await deleteFileViaApi(apiKey, initialFileResource.name, logApiRequestCallback);
         } catch (delErr) { console.warn("Failed to delete file after aborting during initial upload phase:", delErr); }
      }
      throw new DOMException('Aborted by user', 'AbortError');
    }

    if (logApiRequestCallback && initialFileResource) {
        logApiRequestCallback({
            requestType: 'files.uploadFile', // Log response associated with uploadFile
            payload: { file: { name: fileToUpload.name, type: fileToUpload.type, size: fileToUpload.size }, fileApiResponse: initialFileResource }
        });
    }


    if (initialFileResource.state === 'ACTIVE') {
      onStateChange?.('completed_cloud_upload', initialFileResource.name, 'Cloud upload complete.', 100);
      return {
        fileUri: initialFileResource.uri,
        fileApiName: initialFileResource.name,
        mimeType: initialFileResource.mimeType || fileToUpload.type,
        originalFileName: initialFileResource.displayName || fileToUpload.name,
        size: parseInt(initialFileResource.sizeBytes || String(fileToUpload.size), 10),
      };
    } else if (initialFileResource.state === 'PROCESSING') {
      const finalFileResource = await pollFileStateUntilActive(ai, initialFileResource.name, logApiRequestCallback, (state, message) => onStateChange?.(state, initialFileResource.name, message), signal);
      return {
        fileUri: finalFileResource.uri,
        fileApiName: finalFileResource.name,
        mimeType: finalFileResource.mimeType || fileToUpload.type,
        originalFileName: finalFileResource.displayName || fileToUpload.name,
        size: parseInt(finalFileResource.sizeBytes || String(fileToUpload.size), 10),
      };
    } else if (initialFileResource.state === 'FAILED') {
        const errorMsg = initialFileResource.error?.message || 'File upload failed on server immediately.';
        onStateChange?.('error_cloud_upload', initialFileResource.name, `Error: ${errorMsg}`);
        return { mimeType: fileToUpload.type, originalFileName: fileToUpload.name, size: fileToUpload.size, error: errorMsg };
    } else {
        const errorMsg = `Unexpected file state after upload: ${initialFileResource.state}`;
        onStateChange?.('error_cloud_upload', initialFileResource.name, errorMsg);
        return { mimeType: fileToUpload.type, originalFileName: fileToUpload.name, size: fileToUpload.size, error: errorMsg };
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
        const errorMsg = "Upload cancelled by user.";
        onStateChange?.('error_cloud_upload', undefined, errorMsg); // Use undefined for fileApiName if not known
        return { mimeType: fileToUpload.type, originalFileName: fileToUpload.name, size: fileToUpload.size, error: errorMsg };
    }
    console.error("File API upload error:", error);
    const formattedError = formatGeminiError(error);
    onStateChange?.('error_cloud_upload', undefined, `Error: ${formattedError}`);
    return { mimeType: fileToUpload.type, originalFileName: fileToUpload.name, size: fileToUpload.size, error: formattedError };
  }
}

export async function deleteFileViaApi(
  apiKey: string,
  fileApiName: string,
  logApiRequestCallback: LogApiRequestCallback
): Promise<void> {
  if (!apiKey) throw new Error("API Key not configured for File API.");
  const ai = createAiInstance(apiKey);

  try {
    if (logApiRequestCallback) {
      logApiRequestCallback({
        requestType: 'files.delete',
        payload: { fileName: fileApiName }
      });
    }
    await ai.files.delete({ name: fileApiName });
    // Log success? SDK does not return a body for successful delete.
  } catch (error: any) {
    console.error(`File API delete error for ${fileApiName}:`, error);
    // Log error response if available
    const formattedError = formatGeminiError(error);
    if (logApiRequestCallback) {
      logApiRequestCallback({
        requestType: 'files.delete',
        payload: { fileName: fileApiName, fileApiResponse: { error: formattedError } }
      });
    }
    throw new Error(formattedError); // Rethrow formatted error to be handled by caller
  }
}


export function clearCachedChat(_sessionId: string, _model: string, _settings: GeminiSettings): void {

  
  // As we no longer have a single 'activeChatInstances' map, this function is now a no-op
  // but is kept for API compatibility. The caching of AI instances is handled by createAiInstance.
  // We could clear the cache here if needed:
  // aiInstancesCache.clear(); // This would clear all cached keys.
  // console.log(`[GeminiService] Cleared cached chat instance for key: ${cacheKeyForSDKInstance}`);
}

export interface FullResponseData {
    text: string;
    groundingMetadata?: { groundingChunks?: GroundingChunk[] };
}

export interface UserMessageInput {
    text: string;
    attachments?: Attachment[]; 
}

export type LogApiRequestCallback = (logDetails: Omit<ApiRequestLog, 'id' | 'timestamp'>) => void;

export function formatGeminiError(error: any, requestPayloadForContext?: ApiRequestPayload): string {
  // Check for quota error first
  const errorMessage = (error.message || "").toLowerCase();
  const httpStatus = error.httpStatus || (error.response ? error.response.status : undefined);
  if (httpStatus === 429 || errorMessage.includes("quota")) {
      return error.message || "Quota exceeded. Please check your API key limits.";
  }
  
  // Log the full error object structure for developers, in case it changes or has more info
  // This could be very verbose.
  // console.debug("Full Gemini API Error Object:", JSON.stringify(error, null, 2));

  let detailedMessage = "Gemini API Error: ";

  // Primary message extraction
  if (error.message) {
    detailedMessage += error.message;
  } else if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
    detailedMessage += error.response.data.error.message;
  } else if (typeof error === 'string') {
    detailedMessage = error;
  } else {
    detailedMessage += "An unknown error occurred.";
  }
  
  const httpStatusCode = error.response?.status || error.code; // GoogleGenAIError often has 'code' directly
  if (httpStatusCode) {
    detailedMessage += ` (Status Code: ${httpStatusCode})`;
  }

  // Extracting deeper details if available (often under response.data.error.details for HTTP errors)
  let errorDetailsString = "";
  try {
    const geminiErrorDetails = error.response?.data?.error?.details;
    if (geminiErrorDetails && Array.isArray(geminiErrorDetails) && geminiErrorDetails.length > 0) {
      errorDetailsString = geminiErrorDetails.map(d => typeof d === 'object' ? JSON.stringify(d) : String(d)).join(", ");
    } else if (error.details && (!Array.isArray(error.details) || error.details.length > 0)) { // General 'details' property
      errorDetailsString = typeof error.details === 'object' ? JSON.stringify(error.details) : String(error.details);
    }
    if (errorDetailsString) {
      detailedMessage += `\nDetails: ${errorDetailsString}`;
    }
  } catch (e) { /* ignore serialization errors for details */ }
  
  if (error.cause) {
      detailedMessage += `\nCause: ${typeof error.cause === 'object' ? JSON.stringify(error.cause) : String(error.cause)}`;
  }

  // Contextual hints based on request and error code
  let involvedFileUri = false;
  if (requestPayloadForContext?.contents) {
    const contentsArray = Array.isArray(requestPayloadForContext.contents) ? requestPayloadForContext.contents : [requestPayloadForContext.contents];
    for (const contentItem of contentsArray) {
      if (contentItem && typeof contentItem === 'object' && 'parts' in contentItem && Array.isArray(contentItem.parts)) {
        for (const part of contentItem.parts) {
          if (part && typeof part === 'object' && 'fileData' in part && (part.fileData as FileData)?.fileUri) {
            involvedFileUri = true;
            break;
          }
        }
      }
      if (involvedFileUri) break;
    }
  }
  // Also check history if it was part of the context for this specific error
  if (!involvedFileUri && requestPayloadForContext?.history) {
      for (const historyItem of requestPayloadForContext.history) {
          if (historyItem && Array.isArray(historyItem.parts)) {
              for (const part of historyItem.parts) {
                  if (part && typeof part === 'object' && 'fileData' in part && (part.fileData as FileData)?.fileUri) {
                      involvedFileUri = true;
                      break;
                  }
              }
          }
          if (involvedFileUri) break;
      }
  }

  if (involvedFileUri && (httpStatusCode === 500 || httpStatusCode === 400)) { // 400 can also indicate bad file URI
    detailedMessage += "\nSuggestion: If your request included file attachments via URLs (fileUri), this error might be due to an invalid or inaccessible file URL. Please verify the attachments.";
  }
  
  if (detailedMessage.includes("Internal error encountered.") && (httpStatusCode === 500 || httpStatusCode === 503)) {
      detailedMessage += "\nThis is often a temporary issue on the Google server. Retrying later might resolve it.";
  }
  if (detailedMessage.includes("The model is overloaded. Please try again later.") && httpStatusCode === 503) {
       detailedMessage += "\n(Also known as a 503 Service Unavailable error).";
  }
   if (detailedMessage.includes("Resource has been exhausted") && (httpStatusCode === 429)) {
       detailedMessage += "\nThis indicates you may have exceeded your API quota or rate limits.";
  }

  return detailedMessage;
}


export async function getFullChatResponse( 
  apiKey: string,
  sessionId: string, 
  userMessageInput: UserMessageInput,
  model: string,
  baseSettings: GeminiSettings, 
  currentChatMessages: ChatMessage[], 
  onFullResponse: (data: FullResponseData) => void, 
  onError: (error: string, isAbortError?: boolean) => void,
  onComplete: () => void,
  logApiRequestCallback: LogApiRequestCallback,
  signal?: AbortSignal,
  settingsOverride?: Partial<GeminiSettings & { _characterIdForAPICall?: string }>, 
  allAiCharactersInSession?: AICharacter[]
): Promise<void> {
  if (!apiKey) {
    onError("API Key is not configured. Please add a key in Settings.", false);
    onComplete();
    return;
  }
  const ai = createAiInstance(apiKey);

  if (signal?.aborted) {
    onError("Request aborted by user before sending.", true);
    onComplete();
    return;
  }

  const combinedSettings = { ...baseSettings, ...settingsOverride }; 
  const characterIdForAPICall = (settingsOverride as any)?._characterIdForAPICall;

  const characterForCall = characterIdForAPICall && allAiCharactersInSession
    ? allAiCharactersInSession.find(c => c.id === characterIdForAPICall)
    : undefined;
  
  const isCharacterTurn = !!characterForCall;
  const characterNameForLogging = characterForCall ? characterForCall.name : undefined;
  const characterIdForCacheKey = characterForCall ? characterForCall.id : undefined;


  const messageParts: Part[] = []; // Use SDK Part type
  let effectiveUserText = userMessageInput.text;

  if (combinedSettings.aiSeesTimestamps) {
      const formattedTimestamp = new Date().toLocaleString(); 
      effectiveUserText = `[USER at ${formattedTimestamp}] ${effectiveUserText}`;
  }
  
  const configForChatCreate: any = {};
  
  if (combinedSettings.useGoogleSearch) {
    if(!configForChatCreate.tools) configForChatCreate.tools = [];
    if (!configForChatCreate.tools.some((tool: any) => 'googleSearch' in tool)) {
      configForChatCreate.tools.push({googleSearch: {}});
    }
  }

  if (combinedSettings.urlContext && combinedSettings.urlContext.length > 0 && userMessageInput.text.trim()) {
    const urlContextString = `\n\nProvided URL Context:\n${combinedSettings.urlContext.map(url => `- ${url}`).join('\n')}`;
    effectiveUserText = `${effectiveUserText}${urlContextString}`;
  }
  
  let textPartAdded = false;
  if (effectiveUserText.trim()) {
    messageParts.push({ text: effectiveUserText });
    textPartAdded = true;
  }

  if (userMessageInput.attachments) {
    userMessageInput.attachments.forEach(att => {
        if (att.fileUri && att.uploadState === 'completed_cloud_upload') {
          messageParts.push({ fileData: { mimeType: att.mimeType, fileUri: att.fileUri } });
        } else if (att.base64Data && !att.error) { // Fallback to inlineData
          messageParts.push({ inlineData: { mimeType: att.mimeType, data: att.base64Data } });
        }
    });
  }
  
  // Ensure a text part exists if other parts (like fileData) are present, and no text was initially added.
  if (!textPartAdded && messageParts.length > 0) {
    messageParts.unshift({ text: "" }); 
  }

  if (messageParts.length === 0) { 
      const hasValidAttachments = userMessageInput.attachments && userMessageInput.attachments.some(att => (att.fileUri && att.uploadState === 'completed_cloud_upload') || (att.base64Data && !att.error));
      if (!effectiveUserText.trim() && !hasValidAttachments) {
          onError("Cannot send an empty message with no valid attachments.", false);
          onComplete();
          return;
      }
      if(messageParts.length === 0) {
        messageParts.push({ text: "" });
      }
  }
  
  let effectiveSettingsForCacheKeyConstruction = { ...combinedSettings };
  if (characterIdForCacheKey && characterForCall) {
      effectiveSettingsForCacheKeyConstruction.systemInstruction = characterForCall.systemInstruction; 
      (effectiveSettingsForCacheKeyConstruction as any)._characterIdForCacheKey = characterIdForCacheKey;
      delete (effectiveSettingsForCacheKeyConstruction as any)._characterIdForAPICall;
  } else {
      delete (effectiveSettingsForCacheKeyConstruction as any)._characterIdForCacheKey;
      delete (effectiveSettingsForCacheKeyConstruction as any)._characterIdForAPICall;
  }
  const sortedSettingsForCacheKey = JSON.parse(JSON.stringify(effectiveSettingsForCacheKeyConstruction, Object.keys(effectiveSettingsForCacheKeyConstruction).sort()));

  const cacheKeyForSDKInstance = characterIdForCacheKey
      ? `${sessionId}_char_${characterIdForCacheKey}-${model}-${JSON.stringify(sortedSettingsForCacheKey)}`
      : `${sessionId}-${model}-${JSON.stringify(sortedSettingsForCacheKey)}`;

  let historyForChatInitialization: GeminiHistoryEntry[];
  if (isCharacterTurn && characterForCall && allAiCharactersInSession) {
    historyForChatInitialization = mapMessagesToCharacterPerspectiveHistory(currentChatMessages, characterForCall.id, allAiCharactersInSession, combinedSettings);
  } else {
    historyForChatInitialization = mapMessagesToGeminiHistoryInternal(currentChatMessages, combinedSettings);
  }

  
  let finalSystemInstructionText: string | undefined = undefined;

  if (characterForCall && characterForCall.systemInstruction) { 
      finalSystemInstructionText = characterForCall.systemInstruction;
  } else if (combinedSettings.systemInstruction) { 
      finalSystemInstructionText = combinedSettings.systemInstruction;
  }


  if (finalSystemInstructionText) {
    configForChatCreate.systemInstruction = { role: "system", parts: [{text: finalSystemInstructionText }] };
  }

  if (combinedSettings.temperature !== undefined) configForChatCreate.temperature = combinedSettings.temperature;
  if (combinedSettings.topP !== undefined) configForChatCreate.topP = combinedSettings.topP;
  if (combinedSettings.topK !== undefined) configForChatCreate.topK = combinedSettings.topK;
  if (combinedSettings.safetySettings) {
    configForChatCreate.safetySettings = combinedSettings.safetySettings.map(s => ({
        category: s.category,
        threshold: s.threshold,
    })) as GeminiSafetySettingFromSDK[];
  }
  
  if (MODELS_SENDING_THINKING_CONFIG_API.includes(model) && combinedSettings.thinkingBudget !== undefined) {
    configForChatCreate.thinkingConfig = { thinkingBudget: combinedSettings.thinkingBudget };
  }


  let chatForThisMessage: Chat;
  const contextPayloadForErrorFormatting: ApiRequestPayload = {
      model: model,
      history: historyForChatInitialization,
      config: configForChatCreate as Partial<LoggedGeminiGenerationConfig>,
      contents: [{ role: 'user', parts: JSON.parse(JSON.stringify(messageParts)) }],
      apiKeyUsed: `...${apiKey.slice(-4)}`
  };
  
  try {
    if (combinedSettings.debugApiRequests) {
      logApiRequestCallback({
        requestType: 'chat.create',
        payload: {
          model: model,
          history: historyForChatInitialization, 
          config: configForChatCreate as Partial<LoggedGeminiGenerationConfig>,
          apiKeyUsed: `...${apiKey.slice(-4)}`
        },
        characterName: characterNameForLogging,
        apiSessionId: cacheKeyForSDKInstance 
      });
    }
    chatForThisMessage = ai.chats.create({
      model: model,
      history: historyForChatInitialization as Content[], 
      config: configForChatCreate as GeminiGenerationConfigSDK, 
    });
  } catch (error: any) {
    const formattedError = formatGeminiError(error, contextPayloadForErrorFormatting);
    console.error("Error creating chat session:", formattedError, "Cache Key:", cacheKeyForSDKInstance);

    if (signal?.aborted) {
      onError(`Chat initialization aborted. Original error: ${formattedError}`, true);
    } else {
      onError(`Failed to initialize chat: ${formattedError}`, false);
    }
    onComplete();
    return;
  }
  
  try {
    if (combinedSettings.debugApiRequests) {
       logApiRequestCallback({
        requestType: 'chat.sendMessage',
        payload: { // Only log what's directly sent to sendMessage
          contents: JSON.parse(JSON.stringify(messageParts))
        },
        characterName: characterNameForLogging,
        apiSessionId: cacheKeyForSDKInstance 
      });
    }
    
    const response: GenerateContentResponse = await chatForThisMessage.sendMessage({ message: messageParts }); 
    
    const fullText = response.text;
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    
    const responseData: FullResponseData = {
        text: (fullText !== undefined && fullText !== null) ? fullText : "",
        groundingMetadata: groundingMetadata ? { groundingChunks: groundingMetadata.groundingChunks as GroundingChunk[] } : undefined
    };
    onFullResponse(responseData);
    onComplete();
  } catch (error: any) {
    const formattedError = formatGeminiError(error, contextPayloadForErrorFormatting);
    console.error("Error sending message:", formattedError, { originalError: error });
    if (signal?.aborted) {
        onError(`Request aborted. Original error: ${formattedError}`, true);
    } else {
        onError(formattedError, false);
    }
    onComplete();
  }
}

export async function generateMimicUserResponse(
    apiKey: string,
    modelId: string,
    standardChatHistory: GeminiHistoryEntry[], 
    userPersonaInstructionText: string, 
    baseSettings: GeminiSettings,
    logApiRequestCallback: LogApiRequestCallback, 
    signal?: AbortSignal,
    settingsOverride?: Partial<GeminiSettings> 
): Promise<string> {
    if (!apiKey) throw new Error("API Key is not configured.");
    const ai = createAiInstance(apiKey);

    if (signal?.aborted) {
        throw new Error("Request aborted by user before sending.");
    }
    
    const combinedSettings = { ...baseSettings, ...settingsOverride }; 
    
    const safetySettingsForSDK: GeminiSafetySettingFromSDK[] | undefined = combinedSettings.safetySettings
        ? combinedSettings.safetySettings.map(s => ({
            category: s.category,
            threshold: s.threshold,
          }))
        : undefined;

    const generationConfigForCall: any = {}; 
    if (combinedSettings.temperature !== undefined) generationConfigForCall.temperature = combinedSettings.temperature;
    if (combinedSettings.topP !== undefined) generationConfigForCall.topP = combinedSettings.topP;
    if (combinedSettings.topK !== undefined) generationConfigForCall.topK = combinedSettings.topK;
    
    if (userPersonaInstructionText) {
        generationConfigForCall.systemInstruction = { role: "system", parts: [{text: userPersonaInstructionText }] };
    }
    if (safetySettingsForSDK) {
        generationConfigForCall.safetySettings = safetySettingsForSDK;
    }

    if (MODELS_SENDING_THINKING_CONFIG_API.includes(modelId) && combinedSettings.thinkingBudget !== undefined) {
        generationConfigForCall.thinkingConfig = { thinkingBudget: combinedSettings.thinkingBudget };
    }

    const requestContents: Content[] = standardChatHistory.map(entry => ({
        role: entry.role,
        parts: entry.parts
    }));
    const requestPayloadForGenerateContent: ApiRequestPayload = {
        model: modelId,
        contents: requestContents,
        config: generationConfigForCall as Partial<LoggedGeminiGenerationConfig>,
        apiKeyUsed: `...${apiKey.slice(-4)}`
    };
    
    try {
        if (combinedSettings.debugApiRequests) {
           logApiRequestCallback({
                requestType: 'models.generateContent',
                payload: requestPayloadForGenerateContent,
                characterName: (combinedSettings as any)._characterNameForLog || "[User Mimic Instruction Active]"
           });
        }

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelId,
            contents: requestContents, 
            config: generationConfigForCall as GeminiGenerationConfigSDK, 
        });
        
        if (signal?.aborted) {
             throw new Error("Request aborted during generation.");
        }
        return response.text ?? ""; 
    } catch (error: any) {
        if (signal?.aborted) {
            throw error; 
        }
        console.error("Error in generateMimicUserResponse:", error, { originalError: error });
        const formattedError = formatGeminiError(error, requestPayloadForGenerateContent);
        throw new Error(formattedError);
    }
}
