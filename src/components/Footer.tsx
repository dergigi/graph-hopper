'use client';

import React from 'react';
import { useNDK } from '../hooks/useNDK';

export const Footer: React.FC = () => {
  const { ndk } = useNDK();
  
  // Safely get relay URLs
  const getRelayUrls = (): string[] => {
    try {
      if (!ndk || !ndk.pool) return [];
      
      // Get connected relays
      const relays = ndk.pool.relays || [];
      
      // Extract URLs from relay objects
      return Object.values(relays)
        .filter(relay => relay && relay.url)
        .map(relay => relay.url as string);
    } catch (e) {
      console.error('Error getting relay URLs:', e);
      return [];
    }
  };
  
  const relayUrls = getRelayUrls();
  
  return (
    <footer className="w-full border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div className="mb-4 md:mb-0">
            <p className="font-semibold mb-1">Connected Relays ({relayUrls.length})</p>
            <ul className="text-xs space-y-1 font-mono">
              {relayUrls.length > 0 ? (
                relayUrls.map((url, index) => (
                  <li key={`relay-${index}-${url}`} className="truncate max-w-xs md:max-w-md" title={url}>
                    {url}
                  </li>
                ))
              ) : (
                <li>No relays connected</li>
              )}
            </ul>
          </div>
          
          <div className="flex flex-col items-end">
            <p className="text-xs">
              Powered by <a 
                href="https://vertexlab.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700"
              >
                Vertex DVM
              </a> for Web of Trust
            </p>
            <p className="text-xs mt-1">
              Graph Hopper &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}; 