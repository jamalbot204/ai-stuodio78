import { create } from 'zustand';

interface SelectionState {
  isSelectionModeActive: boolean;
  selectedMessageIds: string[]; // Changed from Set<string> to string[]
  getSelectionOrder: (messageId: string) => number; // New selector
  toggleSelectionMode: () => void;
  toggleMessageSelection: (messageId: string) => void;
  clearSelection: () => void;
  selectAllVisible: (visibleMessageIds: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  isSelectionModeActive: false,
  selectedMessageIds: [], // Changed from new Set() to []

  getSelectionOrder: (messageId: string) => {
    return get().selectedMessageIds.indexOf(messageId) + 1;
  },

  clearSelection: () => {
    set({ selectedMessageIds: [] }); // Changed from new Set() to []
  },

  toggleSelectionMode: () => {
    const isNowActive = !get().isSelectionModeActive;
    if (!isNowActive) {
      get().clearSelection();
    }
    set({ isSelectionModeActive: isNowActive });
  },

  toggleMessageSelection: (messageId: string) => {
    set(state => {
      const currentSelection = state.selectedMessageIds;
      if (currentSelection.includes(messageId)) {
        // Remove message
        return { selectedMessageIds: currentSelection.filter(id => id !== messageId) };
      } else {
        // Add message
        return { selectedMessageIds: [...currentSelection, messageId] };
      }
    });
  },

  selectAllVisible: (visibleMessageIds: string[]) => {
    // Select all visible messages while preserving their order of appearance
    set({ selectedMessageIds: [...visibleMessageIds] });
  },
}));
