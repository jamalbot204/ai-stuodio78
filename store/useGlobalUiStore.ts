
import { create } from 'zustand';
import * as layoutService from '../services/layoutService.ts';

interface GlobalUiState {
  isSidebarOpen: boolean;
  layoutDirection: 'ltr' | 'rtl';
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleLayoutDirection: () => void;
  _setLayoutDirection: (direction: 'ltr' | 'rtl') => void;
}

const getInitialSidebarState = (): boolean => {
  if (typeof window !== 'undefined') {
    const storedState = localStorage.getItem('geminiChatSidebarOpen');
    if (storedState !== null) {
      return JSON.parse(storedState);
    }
    return window.matchMedia('(min-width: 768px)').matches;
  }
  return false;
};

export const useGlobalUiStore = create<GlobalUiState>((set) => ({
  isSidebarOpen: getInitialSidebarState(),
  layoutDirection: layoutService.getLayoutDirection(),

  toggleSidebar: () => {
    set(state => {
      const newSidebarState = !state.isSidebarOpen;
      localStorage.setItem('geminiChatSidebarOpen', JSON.stringify(newSidebarState));
      return { isSidebarOpen: newSidebarState };
    });
  },

  closeSidebar: () => {
    localStorage.setItem('geminiChatSidebarOpen', JSON.stringify(false));
    set({ isSidebarOpen: false });
  },
  
  toggleLayoutDirection: () => {
    // The service handles localStorage and document.dir mutation.
    // The event listener below will sync the store's state.
    layoutService.toggleLayoutDirection();
  },

  _setLayoutDirection: (direction: 'ltr' | 'rtl') => {
    set({ layoutDirection: direction });
  },
}));

// Initialize layout service and listen for changes to sync the store state.
if (typeof window !== 'undefined') {
  layoutService.initializeLayout();
  window.addEventListener('layoutDirectionChange', (event: Event) => {
    useGlobalUiStore.getState()._setLayoutDirection((event as CustomEvent).detail);
  });
}
