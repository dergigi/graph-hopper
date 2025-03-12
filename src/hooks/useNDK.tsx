'use client';

import { createContext, useContext } from 'react';
import NDK from '@nostr-dev-kit/ndk';

interface NDKContextType {
  ndk: NDK | null;
  isConnected: boolean;
}

// Create a context with a default value
export const NDKContext = createContext<NDKContextType>({
  ndk: null,
  isConnected: false
});

// Custom hook for using the NDK context
export const useNDK = () => {
  const context = useContext(NDKContext);
  if (!context) {
    throw new Error('useNDK must be used within an NDKProvider');
  }
  return context;
}; 