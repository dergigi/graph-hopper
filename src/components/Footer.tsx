'use client';

import React from 'react';
import { useNDK } from '../hooks/useNDK';
import { useGraph } from './GraphProvider';

export const Footer: React.FC = () => {
  const { ndk } = useNDK();
  const { isConnectedToRelays, isConnectedToVertex } = useGraph();
  
  // Safely get relay URLs
  const getRelayUrls = (): string[] => {
    try {
      if (!ndk || !ndk.pool) return [];
      
      // Get connected relays
      const relays = ndk.pool.relays || [];
      
      // Extract URLs from relay objects
      return Object.values(relays)
        .filter(relay => relay && relay.url && relay.status === 1) // Only include connected relays
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
            <div className="flex items-center mb-1">
              <p className="font-semibold">Connected Relays ({relayUrls.length})</p>
              <div className={`ml-2 w-2 h-2 rounded-full ${isConnectedToRelays ? 'bg-green-500' : 'bg-red-500'}`}></div>
            </div>
            <ul className="text-xs space-y-1 font-mono">
              {relayUrls.length > 0 ? (
                relayUrls.map((url, index) => (
                  <li 
                    key={`relay-${index}-${url}`} 
                    className={`truncate max-w-xs md:max-w-md ${url.includes('relay.vertexlab.io') ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}`} 
                    title={url}
                  >
                    {url.includes('relay.vertexlab.io') ? '⭐ ' : ''}{url}
                  </li>
                ))
              ) : (
                <li className="text-red-500">No relays connected</li>
              )}
            </ul>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="flex items-center mb-2">
              <p className="text-xs mr-2">Vertex DVM Connection:</p>
              <span 
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isConnectedToVertex 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}
              >
                {isConnectedToVertex ? 'Connected' : 'Disconnected'}
              </span>
            </div>
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