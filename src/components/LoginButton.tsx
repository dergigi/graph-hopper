'use client';

import React from 'react';
import { useAuth } from './AuthProvider';
import { truncatePubkey } from '../lib/graph';

export const LoginButton: React.FC = () => {
  const { user, isLoading, error, login, logout } = useAuth();
  
  const handleAuth = async () => {
    if (user) {
      logout();
    } else {
      login();
    }
  };
  
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleAuth}
        disabled={isLoading}
        className={`
          px-6 py-2 rounded-full font-semibold text-white transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50
          ${isLoading ? 'bg-gray-400 cursor-not-allowed' : user ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}
        `}
      >
        {isLoading ? (
          <div className="flex items-center">
            <span className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full"></span>
            Connecting...
          </div>
        ) : user ? (
          <div className="flex items-center">
            <span>Logout</span>
            <span className="ml-2 text-xs opacity-70">({truncatePubkey(user.pubkey)})</span>
          </div>
        ) : (
          'Connect with Nostr'
        )}
      </button>
      
      {error && (
        <div className="mt-2 text-red-500 text-sm">
          {error}
        </div>
      )}
      
      {!user && !isLoading && (
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400 text-center">
          <p>You need a Nostr extension like</p>
          <p>nos2x, Alby, or Nostr NIP-07</p>
        </div>
      )}
    </div>
  );
}; 