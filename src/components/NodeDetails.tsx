'use client';

import React from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { NodeDetailsProps } from '../types';
import { truncatePubkey } from '../lib/graph';
import { NoteCard } from './NoteCard';
import { useGraph } from './GraphProvider';

export const NodeDetails: React.FC<NodeDetailsProps> = ({
  node,
  onClose,
  notes,
  isLoading,
  error
}) => {
  const { formatTrustScore } = useGraph();
  
  if (!node) return null;
  
  const profile = node.profile || {};
  const displayName = profile.name || profile.displayName || truncatePubkey(node.id);
  const trustScore = node.trustScore !== undefined ? node.trustScore : 0;
  const displayScore = formatTrustScore(trustScore);
  
  // Calculate score color based on value
  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return '#10B981'; // Green
    if (score >= 0.6) return '#22C55E'; // Light green
    if (score >= 0.4) return '#FBBF24'; // Yellow
    if (score >= 0.2) return '#F97316'; // Orange
    return '#EF4444'; // Red
  };
  
  // Get trust level label
  const getTrustLabel = (score: number): string => {
    if (score >= 0.8) return 'High Trust';
    if (score >= 0.6) return 'Good Trust';
    if (score >= 0.4) return 'Moderate Trust';
    if (score >= 0.2) return 'Low Trust';
    return 'Very Low Trust';
  };
  
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
          {/* Profile picture with trust score ring */}
          <div className="relative">
            {/* Trust score ring */}
            {trustScore > 0 && (
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  border: `3px solid ${getScoreColor(trustScore)}`,
                  transform: 'scale(1.08)',
                  zIndex: 1
                }}
              ></div>
            )}
            
            {profile.picture ? (
              <img 
                src={profile.picture} 
                alt={displayName} 
                className="w-16 h-16 rounded-full object-cover z-10 relative" 
              />
            ) : (
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-white z-10 relative"
                style={{ backgroundColor: node.color }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          
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
        
        {/* Trust Score Card */}
        {trustScore > 0 && (
          <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: getScoreColor(trustScore) }}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-sm">Web of Trust Score</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Based on Vertex DVM reputation data
                </p>
              </div>
              <div 
                className="text-white text-xl font-bold px-3 py-1 rounded-full"
                style={{ backgroundColor: getScoreColor(trustScore) }}
              >
                {displayScore}
              </div>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div className="h-2.5 rounded-full" 
                  style={{ 
                    width: `${displayScore}%`, 
                    backgroundColor: getScoreColor(trustScore)
                  }}
                ></div>
              </div>
              <p className="mt-1 text-sm font-medium" style={{ color: getScoreColor(trustScore) }}>
                {getTrustLabel(trustScore)}
              </p>
            </div>
          </div>
        )}
        
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