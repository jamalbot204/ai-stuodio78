

import React, { memo, useCallback } from 'react';
import { DEFAULT_SETTINGS, THINKING_BUDGET_MIN, THINKING_BUDGET_MAX, THINKING_BUDGET_STEP, THINKING_BUDGET_MARKS } from '../constants.ts';

interface ThinkingBudgetControlProps {
  value: number | undefined;
  onChange: (newValue: number | undefined) => void;
  modelActuallyUsesApi: boolean; // True if current model uses this param in API calls
}

const ThinkingBudgetControl: React.FC<ThinkingBudgetControlProps> = memo(({
  value,
  onChange,
  modelActuallyUsesApi,
}) => {
  const internalValue = value ?? DEFAULT_SETTINGS.thinkingBudget ?? 0; // Default to 0 if undefined for slider

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseInt(event.target.value, 10));
  }, [onChange]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    if (rawValue === '') {
      onChange(undefined);
      return;
    }
    const numValue = parseInt(rawValue, 10);
    if (!isNaN(numValue) && numValue >= THINKING_BUDGET_MIN && numValue <= THINKING_BUDGET_MAX) {
      onChange(numValue);
    } else if (!isNaN(numValue) && numValue < THINKING_BUDGET_MIN) {
      onChange(THINKING_BUDGET_MIN);
    } else if (!isNaN(numValue) && numValue > THINKING_BUDGET_MAX) {
      onChange(THINKING_BUDGET_MAX);
    }
  }, [onChange]);
  
  const getBudgetValueDisplay = useCallback((val: number | undefined): string => {
    if (val === undefined) return "Default";
    if (val === -1) return "Dynamic";
    if (val === 0) return "Disabled";
    return val.toString();
  }, []);

  return (
    <div>
      <label htmlFor="thinkingBudget" className="block text-sm font-medium text-gray-300">
        Thinking Budget: <span className="font-semibold text-blue-400">{getBudgetValueDisplay(value)}</span>
      </label>
      <div className="flex items-center space-x-3 mt-1">
        <input
          type="range"
          id="thinkingBudgetSlider"
          name="thinkingBudgetSlider"
          min={THINKING_BUDGET_MIN}
          max={THINKING_BUDGET_MAX}
          step={THINKING_BUDGET_STEP}
          value={internalValue}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-600"
        />
        <input
          type="number"
          id="thinkingBudgetInput"
          name="thinkingBudgetInput"
          min={THINKING_BUDGET_MIN}
          max={THINKING_BUDGET_MAX}
          step={THINKING_BUDGET_STEP}
          value={value ?? ''} // Show empty string if undefined, otherwise the number
          onChange={handleInputChange}
          className="w-24 p-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
          placeholder="e.g. 1024"
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
        <span>{THINKING_BUDGET_MARKS[0]} (Dynamic)</span>
        <span>{THINKING_BUDGET_MARKS[1]} (Disabled)</span>
        <span>{THINKING_BUDGET_MARKS[2]} (Max)</span>
      </div>
      {modelActuallyUsesApi && (
          <p className="text-xs text-green-400 mt-1.5">
              Note: Thinking Budget will be applied for the selected model.
          </p>
      )}
    </div>
  );
});

export default ThinkingBudgetControl;