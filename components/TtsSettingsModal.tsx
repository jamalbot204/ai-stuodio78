import React, { useState, useEffect, memo, useCallback } from 'react';
import { useModalStore } from '../store/useModalStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { TTSSettings, TTSModelId, TTSVoiceId } from '../types.ts';
import { DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { CloseIcon, PencilIcon } from './Icons.tsx';
import { TTS_MODELS, TTS_VOICES } from '../constants.ts';
import InstructionEditModal from './InstructionEditModal.tsx';

// No props are needed anymore!
const TtsSettingsModal: React.FC = memo(() => {
  const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
  const { isTtsSettingsModalOpen, closeTtsSettingsModal } = useModalStore();

  const [localTtsSettings, setLocalTtsSettings] = useState<TTSSettings>(currentChatSession?.settings.ttsSettings || DEFAULT_TTS_SETTINGS);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);

  useEffect(() => {
    if (isTtsSettingsModalOpen && currentChatSession) {
      const currentSettings = currentChatSession.settings.ttsSettings || DEFAULT_TTS_SETTINGS;
      setLocalTtsSettings(currentSettings);
    }
  }, [isTtsSettingsModalOpen, currentChatSession]);

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, model: e.target.value as TTSModelId }));
  }, []);

  const handleVoiceChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, voice: e.target.value as TTSVoiceId }));
  }, []);
  
  const handleAutoPlayChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalTtsSettings(prev => ({ ...prev, autoPlayNewMessages: e.target.checked }));
  }, []);

  const handleMaxWordsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const valueString = e.target.value;
    if (valueString === '') {
        setLocalTtsSettings(prev => ({
            ...prev,
            maxWordsPerSegment: 999999
        }));
        return;
    }
    const value = parseInt(valueString, 10);
    setLocalTtsSettings(prev => ({
      ...prev,
      maxWordsPerSegment: (Number.isInteger(value) && value > 0) ? value : 999999
    }));
  }, []);

  const handleOpenInstructionModal = useCallback(() => {
    setIsInstructionModalOpen(true);
  }, []);

  const handleApplyInstructionChange = useCallback((newInstruction: string) => {
    setLocalTtsSettings(prev => ({ ...prev, systemInstruction: newInstruction }));
    setIsInstructionModalOpen(false);
  }, []);

  const handleApplySettings = useCallback(() => {
    if (!currentChatSession) return;

    // The local state now directly holds the value to be saved (e.g., 999999 for no split).
    // No translation is needed on apply.
    updateCurrentChatSession(session => session ? ({
        ...session,
        settings: { ...session.settings, ttsSettings: localTtsSettings }
    }) : null);
    closeTtsSettingsModal();
  }, [currentChatSession, updateCurrentChatSession, localTtsSettings, closeTtsSettingsModal]);
  
  const handleResetDefaults = useCallback(() => {
    setLocalTtsSettings(DEFAULT_TTS_SETTINGS);
  }, []);

  if (!isTtsSettingsModalOpen || !currentChatSession) return null;

  const systemInstructionPlaceholder = "e.g., Speak in a calm and informative tone.";

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md" onClick={closeTtsSettingsModal}>
        <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-100">Text-to-Speech Settings</h2>
            <button
              onClick={closeTtsSettingsModal}
              className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
              aria-label="Close TTS settings"
            >
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-5 mb-6 overflow-y-auto flex-grow pr-1">
            <div>
              <label htmlFor="tts-model" className="block text-sm font-medium text-gray-300 mb-1">TTS Model</label>
              <select id="tts-model" name="tts-model" className="w-full p-2.5 aurora-select" value={localTtsSettings.model} onChange={handleModelChange}>
                {TTS_MODELS.map(model => (<option key={model.id} value={model.id}>{model.name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="tts-voice" className="block text-sm font-medium text-gray-300 mb-1">Voice</label>
              <select id="tts-voice" name="tts-voice" className="w-full p-2.5 aurora-select" value={localTtsSettings.voice} onChange={handleVoiceChange}>
                {TTS_VOICES.map(voice => (<option key={voice.id} value={voice.id}>{voice.name} ({voice.description})</option>))}
              </select>
              <p className="text-xs text-gray-400 mt-1">The availability of voices may vary by model and language.</p>
            </div>
            <div>
              <label htmlFor="tts-max-words" className="block text-sm font-medium text-gray-300 mb-1">Max Words Per TTS Segment</label>
              <input 
                type="number" 
                id="tts-max-words" 
                name="tts-max-words" 
                className="w-full p-2.5 aurora-input" 
                value={localTtsSettings.maxWordsPerSegment ?? ''} 
                onChange={handleMaxWordsChange} 
                step="10" 
                placeholder="Default: No split (999999)" 
              />
              <p className="text-xs text-gray-400 mt-1">Defines max words per audio segment. Empty for no split (defaults to 999999). Positive number to set limit.</p>
            </div>
            <div className="border-t border-[var(--aurora-border)] pt-4">
              <label className="block text-sm font-medium text-gray-300 mb-1">System Instruction (for TTS Model)</label>
              <button type="button" onClick={handleOpenInstructionModal} className="w-full p-2.5 aurora-input text-left flex justify-between items-center transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]">
                <span className={`truncate ${localTtsSettings.systemInstruction ? 'text-gray-200' : 'text-gray-400'}`} title={localTtsSettings.systemInstruction || systemInstructionPlaceholder}>{localTtsSettings.systemInstruction ? (localTtsSettings.systemInstruction.length > 40 ? localTtsSettings.systemInstruction.substring(0, 40) + "..." : localTtsSettings.systemInstruction) : systemInstructionPlaceholder}</span>
                <PencilIcon className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
              </button>
              <p className="text-xs text-gray-400 mt-1">Provide guidance to the TTS model on tone, style, or persona. (Optional)</p>
            </div>
            <div className="border-t border-[var(--aurora-border)] pt-4">
              <div className="flex items-center">
                <input id="autoPlayNewMessages" name="autoPlayNewMessages" type="checkbox" className="h-4 w-4 text-blue-600 bg-black/30 border-white/20 rounded focus:ring-blue-500 focus:ring-offset-black" checked={localTtsSettings.autoPlayNewMessages ?? false} onChange={handleAutoPlayChange} />
                <label htmlFor="autoPlayNewMessages" className="ml-2 block text-sm text-gray-300">Auto-Play New AI Messages</label>
              </div>
              <p className="text-xs text-gray-400 mt-1 ml-6">If enabled, new AI messages will automatically start playing after a short delay.</p>
            </div>
          </div>
          <div className="mt-auto flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <button onClick={handleResetDefaults} type="button" className="px-4 py-2 text-sm font-medium text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)]">Reset to Defaults</button>
            <div className="flex space-x-3">
              <button onClick={closeTtsSettingsModal} type="button" className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] w-full sm:w-auto">Cancel</button>
              <button onClick={handleApplySettings} type="button" className="px-4 py-2 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] w-full sm:w-auto">Apply TTS Settings</button>
            </div>
          </div>
        </div>
      </div>
      {isInstructionModalOpen && (
        <InstructionEditModal
          isOpen={isInstructionModalOpen}
          title="Edit TTS System Instruction"
          currentInstruction={localTtsSettings.systemInstruction || ''}
          onApply={handleApplyInstructionChange}
          onClose={() => setIsInstructionModalOpen(false)}
        />
      )}
    </>
  );
});

export default TtsSettingsModal;