import NDK, { NDKUser, NDKRelay } from '@nostr-dev-kit/ndk';

// List of default relays for reliability
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.current.fyi',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://offchain.pub',
  'wss://nostr.mutinywallet.com'
];

// Vertex relay is essential for trust scores
const VERTEX_RELAY = 'wss://relay.vertexlab.io';

/**
 * Get the user's preferred relays from various sources
 */
export async function getUserRelays(user: NDKUser): Promise<string[]> {
  const relayUrls: string[] = [...DEFAULT_RELAYS];
  
  try {
    // Add Vertex relay at the beginning to prioritize it
    if (!relayUrls.includes(VERTEX_RELAY)) {
      relayUrls.unshift(VERTEX_RELAY);
    }
    
    // Get relays from NIP-07 extension if available
    try {
      // @ts-expect-error - NIP-07 extensions may have getRelays method
      const nip07Relays = await user.ndk?.signer?.getRelays?.();
      if (nip07Relays && Object.keys(nip07Relays).length > 0) {
        console.log("Found NIP-07 relays:", nip07Relays);
        relayUrls.push(...Object.keys(nip07Relays));
      }
    } catch {
      // Silently ignore if extension doesn't support getRelays
      console.log("Extension doesn't support getRelays method");
    }
    
    // Get relays from user profile metadata
    const profile = await user.fetchProfile();
    if (profile?.relays && Array.isArray(profile.relays)) {
      console.log("Found relays in profile:", profile.relays);
      relayUrls.push(...profile.relays);
    }
    
    // Clean and deduplicate the relay URLs
    return cleanRelayUrls(relayUrls);
  } catch (error) {
    console.error("Error getting user relays:", error);
    // Return default relays if there's an error
    return cleanRelayUrls([...DEFAULT_RELAYS, VERTEX_RELAY]);
  }
}

/**
 * Clean relay URLs by removing duplicates and invalid URLs
 */
export function cleanRelayUrls(urls: string[]): string[] {
  // Remove duplicates and filter out invalid URLs
  return [...new Set(urls)].filter(url => {
    try {
      // Check if URL is valid
      new URL(url);
      return url.startsWith('wss://') || url.startsWith('ws://');
    } catch {
      console.warn(`Invalid relay URL: ${url}`);
      return false;
    }
  });
}

/**
 * Connect NDK to relays with improved connection management
 */
export async function connectToRelays(
  ndk: NDK, 
  relayUrls: string[]
): Promise<{ connectedCount: number; vertexConnected: boolean }> {
  if (!ndk) {
    console.error('Cannot connect to relays: NDK instance is not available');
    return { connectedCount: 0, vertexConnected: false };
  }
  
  // Make sure relay URLs are set on the NDK instance
  ndk.explicitRelayUrls = relayUrls;
  
  let connectedCount = 0;
  let vertexConnected = false;
  
  try {
    console.log(`Connecting to ${relayUrls.length} relays...`);
    
    // Connect to relays using NDK's connect method
    await Promise.race([
      ndk.connect(),
      // Add timeout for connections
      new Promise(resolve => setTimeout(resolve, 8000))
    ]);
    
    // Wait a moment for connections to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Count connected relays
    if (ndk.pool?.relays) {
      connectedCount = Object.values(ndk.pool.relays)
        .filter(relay => {
          // NDKRelay has a status property that equals 1 when connected
          return (relay as NDKRelay).status === 1;
        })
        .length;
      
      // Check specifically for Vertex connection
      vertexConnected = Object.entries(ndk.pool.relays).some(
        ([url, relay]) => url.includes("vertexlab.io") && (relay as NDKRelay).status === 1
      );
    }
    
    console.log(`Connected to ${connectedCount} relays ${vertexConnected ? '(including Vertex)' : '(Vertex NOT connected)'}`);
    
    // If no connections were established, try again with just essential relays
    if (connectedCount === 0) {
      console.warn("Failed to connect to any relays! Trying again with essential relays only...");
      
      // Reset explicit relay URLs to just the essential ones
      const essentialRelays = [
        VERTEX_RELAY,
        'wss://relay.damus.io',
        'wss://relay.nostr.band',
        'wss://nos.lol'
      ];
      
      ndk.explicitRelayUrls = essentialRelays;
      
      // Try connecting again
      await Promise.race([
        ndk.connect(),
        new Promise(resolve => setTimeout(resolve, 10000))
      ]);
      
      // Wait a moment for connections to establish
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Recount connected relays
      if (ndk.pool?.relays) {
        connectedCount = Object.values(ndk.pool.relays)
          .filter(relay => (relay as NDKRelay).status === 1)
          .length;
        
        // Check specifically for Vertex connection
        vertexConnected = Object.entries(ndk.pool.relays).some(
          ([url, relay]) => url.includes("vertexlab.io") && (relay as NDKRelay).status === 1
        );
      }
      
      console.log(`Second attempt: Connected to ${connectedCount} relays ${vertexConnected ? '(including Vertex)' : '(Vertex NOT connected)'}`);
    }
    
    return { connectedCount, vertexConnected };
  } catch (error) {
    console.error("Error connecting to relays:", error);
    return { connectedCount: 0, vertexConnected: false };
  }
}

/**
 * Get the list of currently connected relay URLs
 */
export function getConnectedRelays(ndk: NDK | null): string[] {
  if (!ndk || !ndk.pool?.relays) {
    return [];
  }
  
  return Object.entries(ndk.pool.relays)
    .filter(([, relay]) => (relay as NDKRelay).status === 1)
    .map(([url]) => url);
} 