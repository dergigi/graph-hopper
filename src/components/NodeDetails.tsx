'use client';

import React from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NodeDetailsProps } from '../types';
import { truncatePubkey } from '../lib/graph';
import { NoteCard } from './NoteCard';

export const NodeDetails: React.FC<NodeDetailsProps> = ({
  node,
  onClose,
  notes,
  isLoading,
  error
}) => {
  if (!node) return null;
  
  const profile = node.profile || {};
  const displayName = profile.name || profile.displayName || truncatePubkey(node.id);
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 shadow-lg overflow-hidden z-10">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold">Profile Details</h2>
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center space-x-4">
          {profile.picture ? (
            <img 
              src={profile.picture} 
              alt={displayName} 
              className="w-16 h-16 rounded-full object-cover" 
            />
          ) : (
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: node.color }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          
          <div>
            <h3 className="text-lg font-semibold">{displayName}</h3>
            {profile.nip05 && (
              <p className="text-sm text-slate-600 dark:text-slate-400">{profile.nip05}</p>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 font-mono">
              {node.id}
            </p>
          </div>
        </div>
        
        {profile.about && (
          <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <p className="text-sm">{profile.about}</p>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Notes</h3>
        
        {isLoading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {error}
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center p-4 text-slate-500 dark:text-slate-400">
            No notes found
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note: NDKEvent) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}; 