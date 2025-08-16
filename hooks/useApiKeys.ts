
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ApiKey } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRotationEnabled, setIsRotationEnabled] = useState(true);

  useEffect(() => {
    const loadKeysAndSettings = async () => {
      setIsLoading(true);
      try {
        const storedKeys = await dbService.getAppMetadata<ApiKey[]>(METADATA_KEYS.API_KEYS);
        setApiKeys(storedKeys || []);
        
        const storedRotationSetting = await dbService.getAppMetadata<boolean>(METADATA_KEYS.API_KEY_ROTATION);
        // If it's undefined (never set), default to true. If false, it's false.
        setIsRotationEnabled(storedRotationSetting !== false);
      } catch (error) {
        console.error("Failed to load API keys or settings from storage:", error);
        setApiKeys([]);
        setIsRotationEnabled(true); // Default on error
      } finally {
        setIsLoading(false);
      }
    };
    loadKeysAndSettings();
  }, []);

  const persistKeys = useCallback(async (keys: ApiKey[]) => {
    try {
      await dbService.setAppMetadata(METADATA_KEYS.API_KEYS, keys);
    } catch (error) {
      console.error("Failed to save API keys:", error);
    }
  }, []);

  const addApiKey = useCallback(() => {
    const newKey: ApiKey = {
      id: `apikey-${Date.now()}`,
      name: `Key ${apiKeys.length + 1}`,
      value: '',
    };
    const newKeys = [...apiKeys, newKey];
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const updateApiKey = useCallback((id: string, name: string, value: string) => {
    const newKeys = apiKeys.map(key =>
      key.id === id ? { ...key, name, value } : key
    );
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const deleteApiKey = useCallback((id: string) => {
    const newKeys = apiKeys.filter(key => key.id !== id);
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const moveKey = useCallback((id: string, direction: 'up' | 'down') => {
    const index = apiKeys.findIndex(key => key.id === id);
    if (index === -1) return;

    const newKeys = [...apiKeys];
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    if (newIndex < 0 || newIndex >= newKeys.length) return;

    [newKeys[index], newKeys[newIndex]] = [newKeys[newIndex], newKeys[index]];
    
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const moveKeyToEdge = useCallback((id: string, edge: 'top' | 'bottom') => {
    const index = apiKeys.findIndex(key => key.id === id);
    if (index === -1 || (edge === 'top' && index === 0) || (edge === 'bottom' && index === apiKeys.length - 1)) return;

    const newKeys = [...apiKeys];
    const [item] = newKeys.splice(index, 1);

    if (edge === 'top') {
      newKeys.unshift(item);
    } else {
      newKeys.push(item);
    }
    
    setApiKeys(newKeys);
    persistKeys(newKeys);
  }, [apiKeys, persistKeys]);

  const toggleRotation = useCallback(async () => {
    const newRotationState = !isRotationEnabled;
    setIsRotationEnabled(newRotationState);
    try {
      await dbService.setAppMetadata(METADATA_KEYS.API_KEY_ROTATION, newRotationState);
    } catch (error) {
      console.error("Failed to save API key rotation setting:", error);
    }
  }, [isRotationEnabled]);

  const rotateActiveKey = useCallback(async () => {
    if (!isRotationEnabled || apiKeys.length < 2) {
      return;
    }
    const newKeys = [...apiKeys.slice(1), apiKeys[0]];
    setApiKeys(newKeys);
    await persistKeys(newKeys);
  }, [apiKeys, persistKeys, isRotationEnabled]);

  const toggleKeyVisibility = useCallback(() => {
    setIsKeyVisible(prev => !prev);
  }, []);
  
  const activeApiKey = apiKeys.length > 0 ? apiKeys[0] : null;

  return useMemo(() => ({
    apiKeys,
    activeApiKey,
    isKeyVisible,
    isLoading,
    addApiKey,
    updateApiKey,
    deleteApiKey,
    toggleKeyVisibility,
    moveKey,
    moveKeyToEdge,
    rotateActiveKey,
    isRotationEnabled,
    toggleRotation,
  }), [apiKeys, activeApiKey, isKeyVisible, isLoading, addApiKey, updateApiKey, deleteApiKey, toggleKeyVisibility, moveKey, moveKeyToEdge, rotateActiveKey, isRotationEnabled, toggleRotation]);
}