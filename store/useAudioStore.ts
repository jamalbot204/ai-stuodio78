import { create } from 'zustand';
import { AudioPlayerState, ChatMessage } from '../types.ts';
import { generateSpeech, playPcmAudio } from '../services/ttsService.ts';
import { strictAbort } from '../services/cancellationService.ts';
import * as audioUtils from '../services/audioUtils.ts';
import * as dbService from '../services/dbService.ts';
import { splitTextForTts, sanitizeFilename, triggerDownload } from '../services/utils.ts';
import { MAX_WORDS_PER_TTS_SEGMENT, PLAYBACK_SPEEDS, APP_TITLE } from '../constants.ts';
import { useSelectionStore } from './useSelectionStore.ts';
import { useToastStore } from './useToastStore.ts';
import { useModalStore } from './useModalStore.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useGeminiApiStore } from './useGeminiApiStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useDummyAudioStore } from './useDummyAudioStore.ts';

interface AudioState {
  audioPlayerState: AudioPlayerState;
  fetchingSegmentIds: Set<string>;
  segmentFetchErrors: Map<string, string>;
  activeMultiPartFetches: Set<string>;
}

interface AudioActions {
  init: () => void;
  cleanup: () => void;
  handlePlayTextForMessage: (text: string, messageId: string, partIndex?: number) => Promise<void>;
  handleStopAndCancelAllForCurrentAudio: () => void;
  handleClosePlayerViewOnly: () => void;
  handleDownloadAudio: (messageId: string, userProvidedName?: string) => void;
  handleBatchDownloadAudios: () => Promise<void>;
  handleResetAudioCache: (messageId: string) => void;
  handleResetAudioCacheForMultipleMessages: (messageIds: string[]) => Promise<void>;
  isMainButtonMultiFetchingApi: (baseId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  onCancelApiFetchThisSegment: (uniqueSegmentId: string, showToastNotification?: boolean) => void;
  handleCancelMultiPartFetch: (baseMessageId: string) => void;
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  increaseSpeed: () => void;
  decreaseSpeed: () => void;
  triggerAutoPlayForNewMessage: (newAiMessage: ChatMessage) => Promise<void>;
}

export const useAudioStore = create<AudioState & AudioActions>((set, get) => {
  let audioContext: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let currentPcmDataBuffer: ArrayBuffer | null = null;
  let animationFrameId: number | null = null;
  let audioStartTime = 0;

  const activeFetchControllers = new Map<string, AbortController>();
  const multiPartFetchControllers = new Map<string, AbortController>();
  const processedNewMessagesForAutoplay = new Set<string>();
  let autoPlayTimeout: number | null = null;

  const stopCurrentPlayback = (clearFullState = false) => {
    if (audioSource) {
      try {
        audioSource.onended = null;
        audioSource.stop();
      } catch (e) { /* ignore */ }
      audioSource.disconnect();
      audioSource = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (clearFullState) {
      currentPcmDataBuffer = null;
      set(state => ({
        audioPlayerState: {
          ...state.audioPlayerState,
          isLoading: false, isPlaying: false, currentMessageId: null, currentPlayingText: null,
          currentTime: 0, duration: 0, error: null,
        }
      }));
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    } else {
      set(state => ({ audioPlayerState: { ...state.audioPlayerState, isPlaying: false } }));
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
    useDummyAudioStore.getState().pauseDummyAudio();
  };

  const updateProgress = () => {
    if (!audioContext || !audioSource?.buffer) {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return;
    }
    set(state => {
      if (!state.audioPlayerState.isPlaying || state.audioPlayerState.currentMessageId === null || state.audioPlayerState.duration === undefined) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        return state;
      }
      const elapsed = audioContext!.currentTime - audioStartTime;
      const newCurrentTime = elapsed * (audioSource?.playbackRate.value || 1.0);
      animationFrameId = requestAnimationFrame(updateProgress);
      return {
        audioPlayerState: {
          ...state.audioPlayerState,
          currentTime: Math.min(state.audioPlayerState.duration, Math.max(0, newCurrentTime)),
        }
      };
    });
  };

  const startPlaybackInternal = async (pcmBuffer: ArrayBuffer, startTimeOffset: number, textSegment: string, uniqueSegmentId: string) => {
    if (!audioContext) throw new Error("AudioContext not available.");
    stopCurrentPlayback(false);
    currentPcmDataBuffer = pcmBuffer;

    const { sourceNode, duration } = await playPcmAudio(audioContext, pcmBuffer, 24000);
    audioSource = sourceNode;
    audioSource.playbackRate.value = get().audioPlayerState.playbackRate;

    set(state => ({
      audioPlayerState: {
        ...state.audioPlayerState, isLoading: false, isPlaying: true, currentMessageId: uniqueSegmentId,
        error: null, currentTime: startTimeOffset, duration: duration, currentPlayingText: textSegment,
      },
      segmentFetchErrors: new Map(state.segmentFetchErrors).set(uniqueSegmentId, undefined as any) // Clear error on successful play
    }));

    useDummyAudioStore.getState().playDummyAudio();

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: textSegment, artist: APP_TITLE });
      navigator.mediaSession.playbackState = 'playing';
    }

    audioStartTime = audioContext.currentTime - (startTimeOffset / get().audioPlayerState.playbackRate);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(updateProgress);

    audioSource.onended = () => {
      if (audioSource === sourceNode) {
        stopCurrentPlayback(false);
        const parts = uniqueSegmentId.split('_part_');
        if (parts.length === 2) {
          const baseMessageId = parts[0];
          const playedPartIndex = parseInt(parts[1], 10);
          if (!isNaN(playedPartIndex)) {
            const currentChatSession = useActiveChatStore.getState().currentChatSession;
            const message = currentChatSession?.messages.find(m => m.id === baseMessageId);
            if(message) {
              const maxWords = message.ttsWordsPerSegmentCache ?? currentChatSession?.settings.ttsSettings?.maxWordsPerSegment ?? MAX_WORDS_PER_TTS_SEGMENT;
              const allTextSegments = splitTextForTts(message.content, maxWords);
              if (playedPartIndex + 1 < allTextSegments.length) {
                get().handlePlayTextForMessage(message.content, baseMessageId, playedPartIndex + 1);
              }
            }
          }
        }
      }
    };
    audioSource.start(0, startTimeOffset);
  };

  const resumePlayback = async () => {
    const { isPlaying, currentMessageId, currentTime, currentPlayingText } = get().audioPlayerState;
    if (!isPlaying && currentMessageId && currentPcmDataBuffer) {
      if (!audioContext) return;
      if (audioContext.state === 'suspended') await audioContext.resume();
      try {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: true, error: null } }));
        await startPlaybackInternal(currentPcmDataBuffer, currentTime || 0, currentPlayingText || "", currentMessageId);
      } catch (e: any) {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: false, isPlaying: false, error: e.message || "Failed to resume." } }));
      }
    }
  };

  return {
    audioPlayerState: { isLoading: false, isPlaying: false, currentMessageId: null, error: null, currentTime: 0, duration: 0, currentPlayingText: null, playbackRate: 1.0 },
    fetchingSegmentIds: new Set(),
    segmentFetchErrors: new Map(),
    activeMultiPartFetches: new Set(),

    init: () => {
      if (typeof window !== 'undefined' && !audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        if ('mediaSession' in navigator) {
          navigator.mediaSession.setActionHandler('play', () => { get().togglePlayPause(); });
          navigator.mediaSession.setActionHandler('pause', () => { get().togglePlayPause(); });
          navigator.mediaSession.setActionHandler('seekbackward', (details) => { get().seekRelative(-(details.seekOffset || 10)); });
          navigator.mediaSession.setActionHandler('seekforward', (details) => { get().seekRelative(details.seekOffset || 10); });
        }
      }
    },
    cleanup: () => {
      stopCurrentPlayback(true);
      activeFetchControllers.forEach(c => strictAbort(c));
      activeFetchControllers.clear();
      multiPartFetchControllers.forEach(c => strictAbort(c));
      multiPartFetchControllers.clear();
      if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
      audioContext?.close();
      audioContext = null;
    },

    handlePlayTextForMessage: async (originalFullText, baseMessageId, partIndexToPlay) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { logApiRequest } = useGeminiApiStore.getState();
        const { updateMessages } = useDataStore.getState(); // Get this once
    
        if (!currentChatSession || !currentChatSession.settings?.ttsSettings || !originalFullText.trim()) {
            useToastStore.getState().showToast("TTS settings or message not available.", "error");
            return;
        }
        if (audioContext?.state === 'suspended') await audioContext.resume();
    
        const ttsSettings = currentChatSession.settings.ttsSettings;
        const message = currentChatSession.messages.find(m => m.id === baseMessageId);
        if (!message) return;

        const maxWordsForThisMessage = message.ttsWordsPerSegmentCache ?? ttsSettings.maxWordsPerSegment;
        const textSegments = splitTextForTts(originalFullText, maxWordsForThisMessage);
    
        const fetchAndPlaySegment = async (partIndex: number) => {
          const uniqueSegmentId = `${baseMessageId}_part_${partIndex}`;
          const textSegment = textSegments[partIndex];
          await useApiKeyStore.getState().rotateActiveKey();
          const apiKey = useApiKeyStore.getState().activeApiKey?.value;
          if (!apiKey) {
            useToastStore.getState().showToast("API key not available for TTS.", "error");
            return;
          }

          const controller = new AbortController();
          activeFetchControllers.set(uniqueSegmentId, controller);
          set(s => ({
            fetchingSegmentIds: new Set(s.fetchingSegmentIds).add(uniqueSegmentId),
            audioPlayerState: { ...s.audioPlayerState, isLoading: true, currentMessageId: uniqueSegmentId, currentPlayingText: textSegment }
          }));

          try {
            const pcmData = await generateSpeech(apiKey, textSegment, ttsSettings, logApiRequest, controller.signal);
            if (controller.signal.aborted) throw new DOMException('Aborted');

            await dbService.setAudioBuffer(uniqueSegmentId, pcmData);

            const sessionForUpdate = useActiveChatStore.getState().currentChatSession;
            if (sessionForUpdate) {
              const msgIndex = sessionForUpdate.messages.findIndex(m => m.id === baseMessageId);
              if (msgIndex !== -1) {
                const newMsgs = [...sessionForUpdate.messages];
                const oldMsg = newMsgs[msgIndex];
                const newBuffers = [...(oldMsg.cachedAudioBuffers || [])];
                newBuffers[partIndex] = pcmData;
                newMsgs[msgIndex] = {
                  ...oldMsg,
                  cachedAudioBuffers: newBuffers,
                  cachedAudioSegmentCount: textSegments.length,
                  ttsWordsPerSegmentCache: maxWordsForThisMessage,
                };
                await updateMessages(sessionForUpdate.id, newMsgs);
                await updateCurrentChatSession(s => s ? { ...s, messages: newMsgs } : null);
              }
            }
            
            set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)) }));
            await startPlaybackInternal(pcmData, 0, textSegment, uniqueSegmentId);
          } catch (e: any) {
            if (e.name !== 'AbortError') {
              set(s => ({
                fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)),
                audioPlayerState: { ...s.audioPlayerState, isLoading: false, error: e.message },
                segmentFetchErrors: new Map(s.segmentFetchErrors).set(uniqueSegmentId, e.message)
              }));
            }
          } finally {
            activeFetchControllers.delete(uniqueSegmentId);
          }
        };

        const playSinglePart = async (partIndex: number) => {
            const uniqueSegmentId = `${baseMessageId}_part_${partIndex}`;
            const textSegment = textSegments[partIndex];
            
            let buffer = message.cachedAudioBuffers?.[partIndex] ?? null;

            if (!buffer) {
                buffer = await dbService.getAudioBuffer(uniqueSegmentId) || null;
                if (buffer) {
                    await updateCurrentChatSession(s => {
                        if (!s) return null;
                        const msgIndex = s.messages.findIndex(m => m.id === baseMessageId);
                        if (msgIndex === -1) return s;
                        const newMsgs = [...s.messages];
                        const oldMsg = newMsgs[msgIndex];
                        const newBuffers = [...(oldMsg.cachedAudioBuffers || [])];
                        newBuffers[partIndex] = buffer;
                        newMsgs[msgIndex] = { ...oldMsg, cachedAudioBuffers: newBuffers };
                        return { ...s, messages: newMsgs };
                    });
                }
            }

            if (buffer) {
                try {
                    if (buffer.byteLength === 0) throw new Error("Cached audio buffer is empty.");
                    await startPlaybackInternal(buffer, 0, textSegment, uniqueSegmentId);
                } catch (e) {
                    console.error("Cached audio playback failed, fetching from network.", e);
                    await fetchAndPlaySegment(partIndex);
                }
            } else {
                await fetchAndPlaySegment(partIndex);
            }
        };

        const playAllParts = async () => {
            const allBuffers: (ArrayBuffer | null)[] = [];
            
            for (let i = 0; i < textSegments.length; i++) {
                let buffer = message.cachedAudioBuffers?.[i] || null;
                if (!buffer) {
                    buffer = await dbService.getAudioBuffer(`${baseMessageId}_part_${i}`) || null;
                }
                allBuffers.push(buffer);
            }

            if (allBuffers.every(b => b)) {
                await playSinglePart(0);
            } else {
                const totalParts = textSegments.length;
                const partsToFetchCount = allBuffers.filter(b => !b).length;
                if (partsToFetchCount > 0) {
                    if (totalParts > 1) {
                        useToastStore.getState().showToast(`Fetching audio for ${totalParts} parts. Please wait until ready.`, "success", 3000);
                    } else {
                        useToastStore.getState().showToast(`Fetching audio, please wait...`, "success", 2000);
                    }
                }
                const controller = new AbortController();
                multiPartFetchControllers.set(baseMessageId, controller);
                set(s => ({ activeMultiPartFetches: new Set(s.activeMultiPartFetches).add(baseMessageId) }));

                await useApiKeyStore.getState().rotateActiveKey();
                const apiKey = useApiKeyStore.getState().activeApiKey?.value;
                if (!apiKey) {
                  useToastStore.getState().showToast("API key not available for TTS.", "error");
                  set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
                  return;
                }

                try {
                  const fetchPromises = textSegments.map((segment, i) => 
                    allBuffers[i] ? Promise.resolve(allBuffers[i]) : generateSpeech(apiKey, segment, ttsSettings, logApiRequest, controller.signal)
                  );
                  
                  const fetchedBuffers = await Promise.all(fetchPromises);
                  if (controller.signal.aborted) return;
                  
                  const dbSavePromises: Promise<void>[] = [];
                  for(let i=0; i<fetchedBuffers.length; i++) {
                      if(fetchedBuffers[i] && !allBuffers[i]) {
                          dbSavePromises.push(dbService.setAudioBuffer(`${baseMessageId}_part_${i}`, fetchedBuffers[i]!));
                      }
                  }
                  await Promise.all(dbSavePromises);

                  // **START OF FIX**
                  const sessionForUpdate = useActiveChatStore.getState().currentChatSession;
                  if (sessionForUpdate) {
                    const msgIndex = sessionForUpdate.messages.findIndex(m => m.id === baseMessageId);
                    if (msgIndex !== -1) {
                      const newMsgs = [...sessionForUpdate.messages];
                      newMsgs[msgIndex] = {
                        ...newMsgs[msgIndex],
                        cachedAudioBuffers: fetchedBuffers,
                        cachedAudioSegmentCount: textSegments.length,
                        ttsWordsPerSegmentCache: maxWordsForThisMessage
                      };
                      
                      // Persist to DB first
                      await updateMessages(sessionForUpdate.id, newMsgs);
                      
                      // Then update the Zustand state
                      await updateCurrentChatSession(s => s ? { ...s, messages: newMsgs } : null);
                    }
                  }
                  // **END OF FIX**
                  
                  useToastStore.getState().showToast("All audio parts ready. Click play.", "success");
                } catch(e: any) {
                  if (e.name !== 'AbortError') {
                    useToastStore.getState().showToast(`Audio fetch failed: ${e.message}`, "error");
                  }
                } finally {
                  multiPartFetchControllers.delete(baseMessageId);
                  set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
                }
            }
        };

        if (partIndexToPlay !== undefined) {
            await playSinglePart(partIndexToPlay);
        } else {
            await playAllParts();
        }
    },
    handleStopAndCancelAllForCurrentAudio: () => {
      const { currentMessageId } = get().audioPlayerState;
      if (currentMessageId) {
        get().handleCancelMultiPartFetch(currentMessageId.split('_part_')[0]);
        get().onCancelApiFetchThisSegment(currentMessageId, false);
      }
      stopCurrentPlayback(true);
    },
    handleClosePlayerViewOnly: () => stopCurrentPlayback(true),
    handleDownloadAudio: async (messageId, userProvidedName) => {
      const chat = useActiveChatStore.getState().currentChatSession;
      const message = chat?.messages.find(m => m.id === messageId);
      if (!chat || !message || !message.cachedAudioSegmentCount) {
        useToastStore.getState().showToast("Audio not fully ready for download.", "error");
        return;
      }

      const buffers: ArrayBuffer[] = [];
      for(let i = 0; i < message.cachedAudioSegmentCount; i++) {
          const buffer = await dbService.getAudioBuffer(`${messageId}_part_${i}`);
          if (buffer) {
              buffers.push(buffer);
          } else {
              useToastStore.getState().showToast(`Could not retrieve audio part ${i+1} for download.`, "error");
              return;
          }
      }

      const finalFilename = `${sanitizeFilename(userProvidedName || 'audio', 100)}.mp3`;
      const combinedPcm = audioUtils.concatenateAudioBuffers(buffers);
      if (combinedPcm.byteLength === 0) return;
      const audioBlob = audioUtils.createAudioFileFromPcm(combinedPcm, 'audio/mpeg');
      triggerDownload(audioBlob, finalFilename);
      useToastStore.getState().showToast(`Download started as "${finalFilename}".`, "success");
    },
    handleBatchDownloadAudios: async () => {
        const { selectedMessageIds, toggleSelectionMode } = useSelectionStore.getState();
        const { currentChatSession } = useActiveChatStore.getState();
        const showToast = useToastStore.getState().showToast;
    
        if (selectedMessageIds.length === 0 || !currentChatSession) {
            showToast("No messages selected for audio download.", "error");
            return;
        }
    
        showToast(`Starting download for up to ${selectedMessageIds.length} audio file(s).`, "success", 4000);
        let downloadCounter = 1;
        const allMessages = currentChatSession.messages;
    
        for (const messageId of selectedMessageIds) {
            const message = allMessages.find(m => m.id === messageId);
            if (!message || !message.cachedAudioSegmentCount || message.cachedAudioSegmentCount === 0) {
                // Silently skip messages without audio
                continue;
            }
    
            try {
                const buffers: ArrayBuffer[] = [];
                for (let i = 0; i < message.cachedAudioSegmentCount; i++) {
                    const buffer = await dbService.getAudioBuffer(`${messageId}_part_${i}`);
                    if (buffer) {
                        buffers.push(buffer);
                    } else {
                        console.warn(`Could not retrieve audio part ${i+1} for message ${messageId}. Skipping download for this message.`);
                        throw new Error(`Missing audio part ${i+1}`);
                    }
                }
    
                if (buffers.length > 0) {
                    const finalFilename = `${downloadCounter}.mp3`;
                    const combinedPcm = audioUtils.concatenateAudioBuffers(buffers);
                    if (combinedPcm.byteLength > 0) {
                        const audioBlob = audioUtils.createAudioFileFromPcm(combinedPcm, 'audio/mpeg');
                        triggerDownload(audioBlob, finalFilename);
                        downloadCounter++; // Only increment after a successful download trigger
                    }
                }
            } catch (error: any) {
                console.error(`Failed to process download for message ${messageId}:`, error.message);
            }
    
            // Add a delay to prevent the browser from blocking multiple downloads
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        if (downloadCounter > 1) {
            showToast(`Successfully initiated ${downloadCounter - 1} audio downloads.`, "success");
        } else {
            showToast("No messages with valid audio found to download.", "error");
        }
    
        toggleSelectionMode(); // Exit multi-select mode after completion
    },
    handleResetAudioCache: (messageId) => {
      const chat = useActiveChatStore.getState().currentChatSession;
      if (!chat) return;
      useModalStore.getState().requestResetAudioCacheConfirmation(chat.id, messageId);
    },
    handleResetAudioCacheForMultipleMessages: async (messageIds) => {
      const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
      const { updateMessages } = useDataStore.getState();
      if (!currentChatSession) return;

      const idSet = new Set(messageIds);
      const messagesToReset = currentChatSession.messages.filter(m => idSet.has(m.id));

      const anyPlaying = messagesToReset.some(m => get().audioPlayerState.currentMessageId?.startsWith(m.id));
      if (anyPlaying) get().handleStopAndCancelAllForCurrentAudio();

      const deletePromises: Promise<void>[] = [];
      messagesToReset.forEach(msg => {
        if(msg.cachedAudioSegmentCount) {
            for(let i=0; i<msg.cachedAudioSegmentCount; i++) {
                deletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
            }
        }
      });
      await Promise.all(deletePromises);

      await updateCurrentChatSession(session => {
          if (!session) return null;
          const newMessages = session.messages.map(m => {
            if (idSet.has(m.id)) {
                const { cachedAudioBuffers, cachedAudioSegmentCount, ttsWordsPerSegmentCache, ...rest } = m;
                return rest;
            }
            return m;
          });
          return { ...session, messages: newMessages as ChatMessage[] };
      });

      const updatedSession = useActiveChatStore.getState().currentChatSession;
      if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
      }

      useToastStore.getState().showToast(`Audio cache reset for ${messageIds.length} message(s).`, "success");
      useSelectionStore.getState().toggleSelectionMode();
    },
    isMainButtonMultiFetchingApi: (baseId) => get().activeMultiPartFetches.has(baseId),
    getSegmentFetchError: (id) => get().segmentFetchErrors.get(id),
    isApiFetchingThisSegment: (id) => get().fetchingSegmentIds.has(id),
    onCancelApiFetchThisSegment: (uniqueSegmentId: string, showToastNotification = true) => {
      set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)) }));
      activeFetchControllers.get(uniqueSegmentId)?.abort();
      if(showToastNotification) {
        useToastStore.getState().showToast("Audio fetch for segment canceled.", "success");
      }
  },

  handleCancelMultiPartFetch: (baseMessageId: string) => {
      set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
      multiPartFetchControllers.get(baseMessageId)?.abort();
      useToastStore.getState().showToast("Audio fetch for all parts canceled.", "success");
  },
    seekRelative: async (offset) => {
      const { duration, currentTime } = get().audioPlayerState;
      if (duration === undefined || currentTime === undefined) return;
      await startPlaybackInternal(currentPcmDataBuffer!, currentTime + offset, get().audioPlayerState.currentPlayingText || "", get().audioPlayerState.currentMessageId!);
    },
    seekToAbsolute: async (time) => {
      await startPlaybackInternal(currentPcmDataBuffer!, time, get().audioPlayerState.currentPlayingText || "", get().audioPlayerState.currentMessageId!);
    },
    togglePlayPause: async () => {
      if (get().audioPlayerState.isPlaying) stopCurrentPlayback(false);
      else await resumePlayback();
    },
    increaseSpeed: () => {
        const { playbackRate } = get().audioPlayerState;
        const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
        const newRate = PLAYBACK_SPEEDS[Math.min(currentIndex + 1, PLAYBACK_SPEEDS.length - 1)];
        if (audioSource) audioSource.playbackRate.value = newRate;
        set(s => ({ audioPlayerState: {...s.audioPlayerState, playbackRate: newRate} }));
    },
    decreaseSpeed: () => {
        const { playbackRate } = get().audioPlayerState;
        const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
        const newRate = PLAYBACK_SPEEDS[Math.max(currentIndex - 1, 0)];
        if (audioSource) audioSource.playbackRate.value = newRate;
        set(s => ({ audioPlayerState: {...s.audioPlayerState, playbackRate: newRate} }));
    },
    triggerAutoPlayForNewMessage: async (newAiMessage) => {
        const autoPlayIsEnabled = useActiveChatStore.getState().currentChatSession?.settings?.ttsSettings?.autoPlayNewMessages ?? false;
        if (!autoPlayIsEnabled || newAiMessage.isStreaming || processedNewMessagesForAutoplay.has(newAiMessage.id)) return;
        processedNewMessagesForAutoplay.add(newAiMessage.id);
        if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
        autoPlayTimeout = window.setTimeout(() => {
            get().handlePlayTextForMessage(newAiMessage.content, newAiMessage.id, undefined);
        }, 750);
    },
  };
});