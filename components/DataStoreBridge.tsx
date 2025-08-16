


import { useEffect } from 'react';
import { useDataStore } from '../store/useDataStore.ts';

export const DataStoreBridge = () => {
  const { init } = useDataStore.getState();

  // This effect handles the initial data load.
  useEffect(() => {
    init();
  }, [init]);


  return null; // This component renders nothing.
};