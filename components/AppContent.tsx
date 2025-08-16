import React, { useRef, useCallback, useState, memo, useEffect } from 'react';
import { useAudioStore } from '../store/useAudioStore.ts';
import { useApiKeyStore } from '../store/useApiKeyStore.ts';
import { useGlobalUiStore } from '../store/useGlobalUiStore.ts';
import { useToastStore } from '../store/useToastStore.ts';
import { useSelectionStore } from '../store/useSelectionStore.ts';
import { useModalStore } from '../store/useModalStore.ts';
import { useChatListStore } from '../store/useChatListStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { useGithubStore } from '../store/useGithubStore.ts'; // Import the new store
import { useInteractionStore } from '../store/useInteractionStore.ts';

// Direct imports
import Sidebar from './Sidebar.tsx';
import ChatView from './ChatView.tsx';
import ReadModeView from './ReadModeView.tsx';
import SettingsPanel from './SettingsPanel.tsx';
import EditMessagePanel from './EditMessagePanel.tsx';
import CharacterManagementModal from './CharacterManagementModal.tsx';
import CharacterContextualInfoModal from './CharacterContextualInfoModal.tsx';
import DebugTerminalPanel from './DebugTerminalPanel.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import ToastNotification from './ToastNotification.tsx';
import TtsSettingsModal from './TtsSettingsModal.tsx';
import AdvancedAudioPlayer from './AdvancedAudioPlayer.tsx';
import ExportConfigurationModal from './ExportConfigurationModal.tsx';
import FilenameInputModal from './FilenameInputModal.tsx';
import ChatAttachmentsModal from './ChatAttachmentsModal.tsx';
import MultiSelectActionBar from './MultiSelectActionBar.tsx';
import ApiKeyModal from './ApiKeyModal.tsx';
import GitHubImportModal from './GitHubImportModal.tsx';
import InjectedMessageEditModal from './InjectedMessageEditModal.tsx';
import MermaidModal from './MermaidModal.tsx';

const AppContent: React.FC = memo(() => {
  const { currentChatSession } = useActiveChatStore();
  const isLoadingData = useChatListStore(state => state.isLoadingData);
  const { deleteMessageAndSubsequent, resetAudioCache } = useInteractionStore();
  const modalStore = useModalStore();
  const { audioPlayerState, handleClosePlayerViewOnly, seekRelative, seekToAbsolute, togglePlayPause, increaseSpeed, decreaseSpeed } = useAudioStore();
  const deleteApiKey = useApiKeyStore(state => state.deleteApiKey);
  const { isSidebarOpen, closeSidebar } = useGlobalUiStore();
  const showToast = useToastStore(state => state.showToast);
  const { isSelectionModeActive } = useSelectionStore();
  const { setGithubRepo } = useGithubStore(); // Get action from the new store
  const chatViewRef = useRef<any>(null);

  const [isReadModeOpen, setIsReadModeOpen] = useState(false);
  const [readModeContent, setReadModeContent] = useState('');

  const handleEnterReadMode = useCallback((content: string) => {
    setReadModeContent(content);
    setIsReadModeOpen(true);
  }, []);

  const handleCloseReadMode = useCallback(() => {
    setIsReadModeOpen(false);
    setReadModeContent('');
  }, []);

  const handleGoToMessage = useCallback(() => {
    if (audioPlayerState.currentMessageId && chatViewRef.current) {
      const baseMessageId = audioPlayerState.currentMessageId.split('_part_')[0];
      chatViewRef.current.scrollToMessage(baseMessageId);
    }
  }, [audioPlayerState.currentMessageId]);

  const getFullTextForAudioBar = useCallback(() => {
    if (!audioPlayerState.currentMessageId || !currentChatSession) return audioPlayerState.currentPlayingText || "Playing audio...";
    const baseId = audioPlayerState.currentMessageId.split('_part_')[0];
    const message = currentChatSession.messages.find(m => m.id === baseId);
    return message ? message.content : (audioPlayerState.currentPlayingText || "Playing audio...");
  }, [audioPlayerState, currentChatSession]);
  
  const handleEnterReadModeFromPlayer = useCallback(() => {
    const content = getFullTextForAudioBar();
    if (content) {
        handleEnterReadMode(content);
    }
  }, [getFullTextForAudioBar, handleEnterReadMode]);

  const handleGoToAttachmentInChat = useCallback((messageId: string) => {
    modalStore.closeChatAttachmentsModal();
    if (chatViewRef.current) {
      chatViewRef.current.scrollToMessage(messageId);
    }
  }, [modalStore]);

  // Keyboard shortcut for audio play/pause with spacebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Guard: Only act if spacebar is pressed and an audio is primed in the player.
      if (event.code !== 'Space' || !audioPlayerState.currentMessageId) {
        return;
      }
      
      const activeElement = document.activeElement;
      const isTyping = activeElement instanceof HTMLElement && (
                       activeElement.tagName === 'INPUT' || 
                       activeElement.tagName === 'TEXTAREA' || 
                       activeElement.isContentEditable);

      // Guard: Don't interfere if the user is typing.
      if (isTyping) {
        return;
      }

      // We have a green light, prevent default action and toggle play/pause.
      event.preventDefault();
      togglePlayPause();
    };

    window.addEventListener('keydown', handleKeyDown);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [audioPlayerState.currentMessageId, togglePlayPause]);

  const handleConfirmDeletion = useCallback(() => {
    if (modalStore.deleteTarget) {
      if (modalStore.deleteTarget.messageId === 'api-key') {
        deleteApiKey(modalStore.deleteTarget.sessionId);
        showToast("API Key deleted.", "success");
      } else {
        deleteMessageAndSubsequent(modalStore.deleteTarget.messageId);
        showToast("Message and history deleted.", "success");
      }
    }
    modalStore.cancelDeleteConfirmation();
  }, [modalStore, deleteApiKey, deleteMessageAndSubsequent, showToast]);

  const isAudioBarVisible = !!(audioPlayerState.currentMessageId || audioPlayerState.isLoading || audioPlayerState.isPlaying || audioPlayerState.currentPlayingText) && !isReadModeOpen;
  
  if (isLoadingData) {
    return <div className="flex justify-center items-center h-screen bg-transparent text-white text-lg">Loading Chat Sessions...</div>;
  }

  return (
    <div className="flex h-screen antialiased text-[var(--aurora-text-primary)] bg-transparent overflow-hidden">
      
        <div className={`fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
          <Sidebar />
        </div>

        {isSidebarOpen && <div className="fixed inset-0 z-20 bg-black bg-opacity-50" onClick={closeSidebar} aria-hidden="true" />}
        
        <main className={`relative z-10 flex-1 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-72' : 'ml-0'} ${isAudioBarVisible ? 'pt-[76px]' : ''}`}>
          <ChatView ref={chatViewRef} onEnterReadMode={handleEnterReadMode} />
        </main>
        
        <div className='absolute'>
          {isAudioBarVisible && (
              <div className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:left-72' : 'left-0'}`}>
                <AdvancedAudioPlayer
                  audioPlayerState={audioPlayerState}
                  onCloseView={handleClosePlayerViewOnly} 
                  onSeekRelative={seekRelative}
                  onSeekToAbsolute={seekToAbsolute}
                  onTogglePlayPause={togglePlayPause}
                  currentMessageText={getFullTextForAudioBar()}
                  onGoToMessage={handleGoToMessage}
                  onIncreaseSpeed={increaseSpeed} 
                  onDecreaseSpeed={decreaseSpeed}
                  onEnterReadMode={handleEnterReadModeFromPlayer}
                />
              </div>
          )}

          <ReadModeView 
            isOpen={isReadModeOpen} 
            content={readModeContent} 
            onClose={handleCloseReadMode}
            onGoToMessage={handleGoToMessage} 
          />
          
          <SettingsPanel />
          <ApiKeyModal isOpen={modalStore.isApiKeyModalOpen} onClose={modalStore.closeApiKeyModal} />
          <GitHubImportModal
              isOpen={modalStore.isGitHubImportModalOpen}
              onClose={modalStore.closeGitHubImportModal}
              onImport={setGithubRepo}
          />
          <ExportConfigurationModal />
          <TtsSettingsModal />
          <EditMessagePanel />
          <CharacterManagementModal />
          <CharacterContextualInfoModal />
          <DebugTerminalPanel />
          {isSelectionModeActive && <MultiSelectActionBar />}
          <ChatAttachmentsModal
              isOpen={modalStore.isChatAttachmentsModalOpen}
              attachments={modalStore.attachmentsForModal}
              chatTitle={currentChatSession?.title || "Current Chat"}
              onClose={modalStore.closeChatAttachmentsModal}
              onGoToMessage={handleGoToAttachmentInChat}
          />

          {modalStore.isFilenameInputModalOpen && modalStore.filenameInputModalProps && (
            <FilenameInputModal
              isOpen={modalStore.isFilenameInputModalOpen}
              defaultFilename={modalStore.filenameInputModalProps.defaultFilename}
              promptMessage={modalStore.filenameInputModalProps.promptMessage}
              onSubmit={modalStore.submitFilenameInputModal}
              onClose={modalStore.closeFilenameInputModal}
            />
          )}

          <ConfirmationModal
            isOpen={modalStore.isDeleteConfirmationOpen}
            title="Confirm Deletion"
            message={modalStore.deleteTarget?.messageId === 'api-key' ? 'Are you sure you want to permanently delete this API key?' : <>Are you sure you want to delete this message and all <strong className="text-red-400">subsequent messages</strong> in this chat? <br/>This action cannot be undone.</>}
            confirmText="Yes, Delete" cancelText="No, Cancel"
            onConfirm={handleConfirmDeletion}
            onCancel={modalStore.cancelDeleteConfirmation}
            isDestructive={true}
          />
          <ConfirmationModal
            isOpen={modalStore.isResetAudioConfirmationOpen}
            title="Confirm Audio Reset"
            message="Are you sure you want to reset the audio cache for this message? This action cannot be undone."
            confirmText="Yes, Reset Audio" cancelText="No, Cancel"
            onConfirm={() => { 
              if(modalStore.resetAudioTarget) {
                resetAudioCache(modalStore.resetAudioTarget.messageId);
              }
              modalStore.cancelResetAudioCacheConfirmation(); 
            }} 
            onCancel={modalStore.cancelResetAudioCacheConfirmation}
            isDestructive={true}
          />
          <InjectedMessageEditModal />
          {/* --- OLD CODE --- */}
          {/* <ToastNotification /> */}
          {/* --- NEW CODE --- */}
          <MermaidModal />
          <ToastNotification />
        </div>
    </div>
  );
});

export default AppContent;