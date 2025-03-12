import { NDKNip07Signer, NDKUser, NDKEvent, NDKSigner, NDKFilter } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import { NostrProfile } from '../types';

// Initialize cache
const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'nostr-graph-hopper-cache' });

// Bootstrap relays
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.current.fyi',
  'wss://relay.snort.social',
  'wss://nostr.wine'
];

// NDK instance
let ndk: NDK;

/**
 * Initialize the NDK instance
 */
export const initializeNDK = async (signer?: NDKSigner): Promise<NDK> => {
  if (!ndk) {
    ndk = new NDK({
      explicitRelayUrls: RELAYS,
      cacheAdapter,
      signer
    });
    
    await ndk.connect();
  } else if (signer && ndk.signer !== signer) {
    ndk.signer = signer;
  }
  
  return ndk;
};

/**
 * Check if NIP-07 is available
 */
export const isNip07Available = (): boolean => {
  return typeof window !== 'undefined' && 
    window.nostr !== undefined;
};

/**
 * Login with NIP-07
 */
export const loginWithNip07 = async (): Promise<{ user: NDKUser | null, ndk: NDK | null, error?: string }> => {
  try {
    if (!isNip07Available()) {
      return { 
        user: null, 
        ndk: null, 
        error: 'NIP-07 extension not found. Please install a Nostr browser extension.' 
      };
    }
    
    const signer = new NDKNip07Signer();
    const ndkInstance = await initializeNDK(signer);
    
    // Get user public key
    const user = await signer.user();
    if (!user) {
      return { user: null, ndk: null, error: 'Failed to get user from signer' };
    }
    
    return { user, ndk: ndkInstance };
  } catch (error) {
    console.error('Login error:', error);
    return { 
      user: null, 
      ndk: null, 
      error: error instanceof Error ? error.message : 'Unknown error during login' 
    };
  }
};

/**
 * Get a user's following list
 */
export const getFollowingList = async (pubkey: string, ndkInstance?: NDK): Promise<string[]> => {
  // Use the provided NDK instance or fall back to the global one
  const ndkToUse = ndkInstance || ndk;
  
  if (!ndkToUse) {
    throw new Error('NDK not initialized');
  }
  
  const filter: NDKFilter = {
    kinds: [3], // kind 3 is "contacts"
    authors: [pubkey]
  };
  
  const contactListEvents = await ndkToUse.fetchEvents(filter);
  
  // Get the most recent contact list event
  let latestEvent: NDKEvent | null = null;
  for (const event of contactListEvents) {
    if (!latestEvent || event.created_at! > latestEvent.created_at!) {
      latestEvent = event;
    }
  }
  
  if (!latestEvent) {
    return [];
  }
  
  // Extract the pubkeys from the tags
  const following: string[] = [];
  for (const tag of latestEvent.tags) {
    if (tag[0] === 'p') {
      following.push(tag[1]);
    }
  }
  
  return following;
};

/**
 * Get user notes
 */
export const getUserNotes = async (pubkey: string, limit: number = 20, ndkInstance?: NDK): Promise<NDKEvent[]> => {
  // Use the provided NDK instance or fall back to the global one
  const ndkToUse = ndkInstance || ndk;
  
  if (!ndkToUse) {
    throw new Error('NDK not initialized');
  }
  
  const filter: NDKFilter = {
    kinds: [1], // kind 1 is "text note"
    authors: [pubkey],
    limit
  };
  
  const events = await ndkToUse.fetchEvents(filter);
  
  // Sort by created_at (newest first)
  return Array.from(events).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
};

/**
 * Get a user's profile data
 */
export const getUserProfile = async (pubkey: string, ndkInstance?: NDK): Promise<NostrProfile> => {
  // Use the provided NDK instance or fall back to the global one
  const ndkToUse = ndkInstance || ndk;
  
  if (!ndkToUse) {
    throw new Error('NDK not initialized');
  }
  
  const user = new NDKUser({ pubkey });
  // Attach NDK instance to the user
  user.ndk = ndkToUse;
  await user.fetchProfile();
  return user.profile || {};
}; 