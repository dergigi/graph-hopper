'use client';

import React from 'react';
import { Header } from '../components/Header';
import { GraphVisualization } from '../components/Graph';
import { AuthProvider } from '../components/AuthProvider';
import { GraphProvider } from '../components/GraphProvider';

export default function Home() {
  return (
    <AuthProvider>
      <GraphProvider>
        <div className="flex flex-col h-screen">
          <Header />
          <main className="flex-1 relative">
            <GraphVisualization />
          </main>
          <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-4">
            <div className="container mx-auto px-4 text-center text-slate-500 dark:text-slate-400 text-sm">
              <p>
                Nostr Graph Hopper - Explore your social graph on Nostr
              </p>
              <p className="mt-1">
                <a 
                  href="https://github.com/nostr-protocol/nips/blob/master/07.md" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-blue-500"
                >
                  Using NIP-07
                </a> for authentication
              </p>
            </div>
          </footer>
        </div>
      </GraphProvider>
    </AuthProvider>
  );
}
