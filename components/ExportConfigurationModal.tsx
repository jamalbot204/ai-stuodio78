



import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { ExportConfiguration } from '../types.ts';
import { useChatListStore } from '../store/useChatListStore.ts';
import { useModalStore } from '../store/useModalStore.ts';
import { DEFAULT_EXPORT_CONFIGURATION } from '../constants.ts';
import { CloseIcon, CheckIcon, ArrowPathIcon, UsersIcon, DocumentDuplicateIcon, KeyIcon } from './Icons.tsx';
import { useDataStore } from '../store/useDataStore.ts';
import { useToastStore } from '../store/useToastStore.ts';


const ToggleOption: React.FC<{
  id: keyof ExportConfiguration;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (id: keyof ExportConfiguration, checked: boolean) => void;
  indented?: boolean;
  warning?: string;
  disabled?: boolean;
}> = memo(({ id, label, description, checked, onChange, indented, warning, disabled }) => (
  <div className={`py-2.5 ${indented ? 'pl-6' : ''} ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex items-start">
      <div className="flex items-center h-5">
        <input
          id={id}
          name={id}
          type="checkbox"
          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-500 rounded bg-black/30 disabled:cursor-not-allowed"
          checked={checked}
          onChange={(e) => !disabled && onChange(id, e.target.checked)}
          disabled={disabled}
        />
      </div>
      <div className="ml-3 text-sm">
        <label htmlFor={id} className={`font-medium ${disabled ? 'text-gray-500' : 'text-gray-200'}`}>{label}</label>
        {description && <p className={`text-xs ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>{description}</p>}
        {warning && <p className="text-xs text-yellow-400 mt-0.5">{warning}</p>}
      </div>
    </div>
  </div>
));

const renderCategoryHeader = (title: string, icon?: React.ReactNode) => (
  <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider pt-3 pb-1 border-b border-[var(--aurora-border)] mb-1 flex items-center">
    {icon && <span className="mr-2">{icon}</span>}
    {title}
  </h4>
);

// No props are needed anymore!
const ExportConfigurationModal: React.FC = memo(() => {
  const { chatHistory } = useChatListStore();
  const { currentExportConfig, setCurrentExportConfig, handleExportChats, isExporting, exportProgress } = useDataStore();
  const { isExportConfigModalOpen, closeExportConfigurationModal } = useModalStore();
  const showToast = useToastStore(state => state.showToast);

  const [localConfig, setLocalConfig] = useState<ExportConfiguration>(currentExportConfig);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isExportConfigModalOpen) {
      setLocalConfig(currentExportConfig);
      setSelectedChatIds(chatHistory.length > 0 ? chatHistory.map(s => s.id) : []);
      setSearchTerm('');
    }
  }, [isExportConfigModalOpen, currentExportConfig, chatHistory]);

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return chatHistory;
    return chatHistory.filter(session =>
      session.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [chatHistory, searchTerm]);

  const handleToggleChange = useCallback((id: keyof ExportConfiguration, checked: boolean) => {
    setLocalConfig(prev => ({ ...prev, [id]: checked }));
  }, []);

  const handleChatSelectionChange = useCallback((chatId: string) => {
    setSelectedChatIds(prev =>
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  }, []);

  const handleSelectAllChats = useCallback(() => {
    setSelectedChatIds(filteredSessions.map(s => s.id));
  }, [filteredSessions]);

  const handleDeselectAllChats = useCallback(() => {
    setSelectedChatIds([]);
  }, []);

  const handleSaveCurrentConfig = useCallback(() => {
    setCurrentExportConfig(localConfig);
    showToast("Export preferences saved!", "success");
  }, [localConfig, setCurrentExportConfig, showToast]);
  
  const handleInitiateExport = useCallback(() => {
    if (selectedChatIds.length === 0) {
      alert("Please select at least one chat to export.");
      return;
    }
    handleExportChats(selectedChatIds, localConfig);
  }, [selectedChatIds, localConfig, handleExportChats]);

  const handleResetConfigDefaults = useCallback(() => {
    setLocalConfig(DEFAULT_EXPORT_CONFIGURATION);
  }, []);

  if (!isExportConfigModalOpen) return null;

  const isCoreDataDisabled = !localConfig.includeChatSessionsAndMessages;
  const exportButtonText = isExporting ? `Exporting... (${exportProgress}%)` : `Export Selected (${selectedChatIds.length})`;

  return (
    <div 
        className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-2 sm:p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-config-modal-title"
        onClick={closeExportConfigurationModal}
    >
      <div className="aurora-panel p-5 sm:p-6 rounded-lg shadow-2xl w-full sm:max-w-3xl max-h-[95vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 id="export-config-modal-title" className="text-xl font-semibold text-gray-100">Export Chats & Preferences</h2>
          <button
            onClick={closeExportConfigurationModal}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close export configuration"
          >
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-1 sm:pr-2 space-y-3">
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">
              Your export will be a single, organized <code className="text-xs bg-black/30 text-indigo-300 rounded px-1 py-0.5">.zip</code> file containing an <code className="text-xs bg-black/30 text-indigo-300 rounded px-1 py-0.5">export.json</code> file and folders for attachments and audio.
            </p>
            {renderCategoryHeader("Select Chats to Export", <DocumentDuplicateIcon className="w-4 h-4" />)}
            {chatHistory.length > 0 ? (
              <>
                <input
                  type="text"
                  placeholder="Search chats by title..."
                  className="w-full p-2 aurora-input mb-2 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">{selectedChatIds.length} of {filteredSessions.length} chat(s) selected.</span>
                  <div className="space-x-2">
                    <button onClick={handleSelectAllChats} className="text-xs text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)] disabled:opacity-50" disabled={filteredSessions.length === 0}>Select All Visible</button>
                    <button onClick={handleDeselectAllChats} className="text-xs text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)] disabled:opacity-50" disabled={selectedChatIds.length === 0}>Deselect All</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border border-[var(--aurora-border)] rounded-md p-2 space-y-1 bg-black/20">
                  {filteredSessions.map(session => (
                    <div key={session.id} className="flex items-center p-1.5 hover:bg-white/10 rounded-md">
                      <input
                        type="checkbox"
                        id={`export-chat-${session.id}`}
                        checked={selectedChatIds.includes(session.id)}
                        onChange={() => handleChatSelectionChange(session.id)}
                        className="h-4 w-4 text-blue-600 bg-black/30 border-white/20 rounded focus:ring-blue-500 focus:ring-offset-black"
                      />
                      <label htmlFor={`export-chat-${session.id}`} className="ml-2 text-sm text-gray-300 truncate cursor-pointer flex items-center">
                        {session.isCharacterModeActive && <UsersIcon className="w-3.5 h-3.5 mr-1.5 text-purple-400 flex-shrink-0"/>}
                        {session.title}
                      </label>
                    </div>
                  ))}
                  {filteredSessions.length === 0 && <p className="text-sm text-gray-500 italic text-center py-2">No chats match your search.</p>}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 italic">No chats available to export.</p>
            )}
          </div>

          <div className="divide-y divide-[var(--aurora-border)]">
            {renderCategoryHeader("Data Inclusion Preferences")}
            <ToggleOption id="includeChatSessionsAndMessages" label="Chat Sessions & Messages" description="Master toggle for all chat content. If off, most options below will be irrelevant for selected chats." checked={localConfig.includeChatSessionsAndMessages} onChange={handleToggleChange} />
            <ToggleOption id="includeMessageContent" label="Message Content" description="The text of user and AI messages." checked={localConfig.includeMessageContent} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeMessageTimestamps" label="Message Timestamps" checked={localConfig.includeMessageTimestamps} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeMessageRoleAndCharacterNames" label="Message Role & Character Names" checked={localConfig.includeMessageRoleAndCharacterNames} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeMessageAttachmentsMetadata" label="Message Attachments (Metadata Only)" description="Includes file name, type, size, and cloud URI (if applicable)." checked={localConfig.includeMessageAttachmentsMetadata} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeFullAttachmentFileData" label="Full Attachment File Data" description="Includes actual attachment files in the ZIP archive. Not applicable for File API uploads." checked={localConfig.includeFullAttachmentFileData} onChange={handleToggleChange} indented disabled={isCoreDataDisabled || !localConfig.includeMessageAttachmentsMetadata} />
            <ToggleOption id="includeCachedMessageAudio" label="Cached Message Audio (TTS)" description="Includes generated Text-to-Speech audio files in the ZIP archive." checked={localConfig.includeCachedMessageAudio} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />
            <ToggleOption id="includeGroundingMetadata" label="Grounding Metadata (Search Sources)" checked={localConfig.includeGroundingMetadata} onChange={handleToggleChange} indented disabled={isCoreDataDisabled} />

            {renderCategoryHeader("Chat-Specific Settings")}
            <ToggleOption id="includeChatSpecificSettings" label="Chat-Specific Settings" description="Model, temperature, safety settings, TTS settings, etc., for each selected chat session." checked={localConfig.includeChatSpecificSettings} onChange={handleToggleChange} disabled={isCoreDataDisabled} />

            {renderCategoryHeader("AI Character Definitions")}
            <ToggleOption id="includeAiCharacterDefinitions" label="AI Character Definitions" description="Names, system instructions, and contextual info for all AI characters within selected chats." checked={localConfig.includeAiCharacterDefinitions} onChange={handleToggleChange} disabled={isCoreDataDisabled} />
            
            {renderCategoryHeader("API Request Logs")}
            <ToggleOption id="includeApiLogs" label="API Request Logs" description="Verbose request/response logs for debugging (if logging was enabled for the chat)." warning="Warning: Can make the export file very large." checked={localConfig.includeApiLogs} onChange={handleToggleChange} disabled={isCoreDataDisabled} />

            {renderCategoryHeader("Global Application State")}
            <ToggleOption id="includeLastActiveChatId" label="Last Active Chat ID (as of export)" description="The ID of the chat that was last open when the export was created." checked={localConfig.includeLastActiveChatId} onChange={handleToggleChange} />
            <ToggleOption id="includeMessageGenerationTimes" label="Message Generation Times" description="Performance data: how long AI messages took to generate." checked={localConfig.includeMessageGenerationTimes} onChange={handleToggleChange} />
            <ToggleOption id="includeUiConfiguration" label="UI Configuration (Messages to Display)" description="Per-chat setting for how many messages are initially shown." checked={localConfig.includeUiConfiguration} onChange={handleToggleChange} />
            <ToggleOption id="includeUserDefinedGlobalDefaults" label="User-Defined Global Default Settings" description="Your saved default model, temperature, safety settings, etc." checked={localConfig.includeUserDefinedGlobalDefaults} onChange={handleToggleChange} />

            {renderCategoryHeader("Credentials", <KeyIcon className="w-4 h-4" />)}
            <ToggleOption
              id="includeApiKeys"
              label="API Keys"
              description="Your stored API keys."
              warning="Warning: Keep this file secure if you include API keys."
              checked={localConfig.includeApiKeys}
              onChange={handleToggleChange}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center pt-4 border-t border-[var(--aurora-border)] flex-shrink-0 space-y-3 sm:space-y-0">
          <button onClick={handleResetConfigDefaults} type="button" className="px-3 py-2 text-xs font-medium text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)] flex items-center sm:w-auto w-full justify-center"><ArrowPathIcon className="w-3.5 h-3.5 mr-1.5" /> Reset Preferences</button>
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 w-full sm:w-auto">
            <button onClick={closeExportConfigurationModal} type="button" className="px-4 py-2.5 text-sm font-medium text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] w-full sm:w-auto">Cancel</button>
            <button onClick={handleSaveCurrentConfig} type="button" className="px-4 py-2.5 text-sm font-medium text-white bg-green-600/80 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(34,197,94,0.6)] flex items-center justify-center w-full sm:w-auto"><CheckIcon className="w-4 h-4 mr-1.5" /> Save Preferences</button>
            <button onClick={handleInitiateExport} type="button" disabled={selectedChatIds.length === 0 || isExporting} className="px-4 py-2.5 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,254,0.6)] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"><DocumentDuplicateIcon className="w-4 h-4 mr-1.5" /> {exportButtonText}</button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ExportConfigurationModal;