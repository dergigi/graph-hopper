'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import { loginWithNip07, isNip07Available, initializeNDK } from '../lib/nostr';
import { AuthContextType } from '../types';

// Create the auth context
const AuthContext = createContext<AuthContextType>({
  user: null,
  ndk: null,
  isLoading: false,
  error: null,
  login: async () => {},
  logout: () => {}
});

// Provider component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize NDK on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        const ndkInstance = await initializeNDK();
        setNdk(ndkInstance);
      } catch (err) {
        console.error('Failed to initialize NDK:', err);
        setError('Failed to initialize Nostr connection');
      }
    };
    
    initialize();
  }, []);
  
  // Check for existing connection on page load
  useEffect(() => {
    const checkExistingAuth = async () => {
      if (isNip07Available()) {
        try {
          setIsLoading(true);
          const result = await loginWithNip07();
          if (result.user && result.ndk) {
            setUser(result.user);
            setNdk(result.ndk);
          }
        } catch (err) {
          // Silent failure for auto login
          console.error('Auto login failed:', err);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    checkExistingAuth();
  }, []);
  
  // Login with NIP-07
  const login = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await loginWithNip07();
      
      if (result.error) {
        setError(result.error);
        return;
      }
      
      if (result.user && result.ndk) {
        setUser(result.user);
        setNdk(result.ndk);
      } else {
        setError('Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Unknown login error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Logout
  const logout = () => {
    setUser(null);
    // We keep the NDK instance but remove the signer
    if (ndk) {
      ndk.signer = undefined;
    }
  };
  
  return (
    <AuthContext.Provider value={{ user, ndk, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using the auth context
export const useAuth = () => useContext(AuthContext); 