

import React, { useState, useEffect, memo, useCallback } from 'react';
import { SafetySetting, HarmCategory, HarmBlockThreshold } from '../types.ts';
import { DEFAULT_SAFETY_SETTINGS, HARM_CATEGORY_LABELS, HARM_BLOCK_THRESHOLD_LABELS } from '../constants.ts';
import { CloseIcon } from './Icons.tsx';
interface SafetySettingsModalProps {
  isOpen: boolean;
  currentSafetySettings: SafetySetting[];
  onClose: () => void;
  onApply: (newSafetySettings: SafetySetting[]) => void;
}

const SafetySettingsModal: React.FC<SafetySettingsModalProps> = memo(({ isOpen, currentSafetySettings, onClose, onApply }) => {
  const [localSafetySettings, setLocalSafetySettings] = useState<SafetySetting[]>(currentSafetySettings);

  useEffect(() => {
    if (isOpen) {
      // Ensure all defined harm categories have a setting, defaulting if not present in currentSettings
      const allCategories = Object.values(HarmCategory).filter(cat => cat !== HarmCategory.HARM_CATEGORY_UNSPECIFIED);
      const updatedSettings = allCategories.map(category => {
        const existingSetting = currentSafetySettings.find(s => s.category === category);
        if (existingSetting) {
          return existingSetting;
        }
        // Fallback to default if a category is somehow missing from current chat's settings
        const defaultSettingForCategory = DEFAULT_SAFETY_SETTINGS.find(s => s.category === category) || 
                                          { category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE };
        return defaultSettingForCategory;
      });
      setLocalSafetySettings(updatedSettings);
    }
  }, [isOpen, currentSafetySettings]);

  const handleThresholdChange = useCallback((category: HarmCategory, threshold: HarmBlockThreshold) => {
    setLocalSafetySettings(prevSettings =>
      prevSettings.map(setting =>
        setting.category === category ? { ...setting, threshold } : setting
      )
    );
  }, []);

  const handleResetDefaults = useCallback(() => {
    setLocalSafetySettings(DEFAULT_SAFETY_SETTINGS);
  }, []);

  const handleSubmit = useCallback(() => {
    onApply(localSafetySettings);
    onClose();
  }, [onApply, localSafetySettings, onClose]);

  if (!isOpen) return null;

  const availableThresholds = Object.values(HarmBlockThreshold).filter(
    th => th !== HarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md" onClick={onClose}>
      <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto text-gray-200 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
          aria-label="Close safety settings"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-semibold mb-1 text-gray-100">Run safety settings</h2>
        <p className="text-sm text-gray-400 mb-6">
          Adjust how likely you are to see responses that could be harmful. Content is blocked based on the probability that it is harmful.
        </p>

        <div className="space-y-5">
          {localSafetySettings.map(setting => (
            <div key={setting.category}>
              <label htmlFor={`safety-${setting.category}`} className="block text-sm font-medium text-gray-300 mb-1">
                {HARM_CATEGORY_LABELS[setting.category]}
              </label>
              <select
                id={`safety-${setting.category}`}
                name={setting.category}
                className="w-full p-2.5 aurora-select"
                value={setting.threshold}
                onChange={(e) => handleThresholdChange(setting.category, e.target.value as HarmBlockThreshold)}
              >
                {availableThresholds.map(thresholdValue => (
                  <option key={thresholdValue} value={thresholdValue}>
                    {HARM_BLOCK_THRESHOLD_LABELS[thresholdValue]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
            <button
                onClick={handleResetDefaults}
                type="button"
                className="px-4 py-2 text-sm font-medium text-blue-400 transition-all hover:text-blue-300 hover:drop-shadow-[0_0_3px_rgba(147,197,253,0.8)]"
            >
                Reset defaults
            </button>
            <div className="flex space-x-3">
                <button
                    onClick={onClose}
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-gray-300 bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] w-full sm:w-auto"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-white bg-[var(--aurora-accent-primary)] rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] w-full sm:w-auto"
                >
                    Apply
                </button>
            </div>
        </div>
         <p className="text-xs text-gray-500 mt-4">
            You are responsible for ensuring that safety settings for your intended use case comply with the Terms and Use Policy. 
            <a href="#" className="text-blue-400 hover:underline ml-1">Learn more.</a>
        </p>
      </div>
    </div>
  );
});

export default SafetySettingsModal;