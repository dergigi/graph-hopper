import { nip19 } from 'nostr-tools';
import NDK, { NDKEvent, NDKFilter, NDKSigner, NDKSubscription } from '@nostr-dev-kit/ndk';

// Define a return type for getWebOfTrust
interface WebOfTrustResult {
  event: NDKEvent | null;
  results: Record<string, number>;
}

// Vertex relay
const VERTEX_RELAY_URL = 'wss://relay.vertexlab.io';

// Initialize NDK with Vertex relay
const vertexNDK = new NDK({
  explicitRelayUrls: [VERTEX_RELAY_URL],
  enableOutboxModel: false, // We only need to read from Vertex
});

// Connect to Vertex relay
export const connectToVertex = async () => {
  try {
    await vertexNDK.connect();
    console.log('Connected to Vertex relay');
    return true;
  } catch (error) {
    console.error('Failed to connect to Vertex relay:', error);
    return false;
  }
};

// Convert hex pubkey to npub
export const hexToNpub = (hex: string): string => {
  try {
    return nip19.npubEncode(hex);
  } catch (error) {
    console.error('Failed to convert hex to npub:', error);
    return hex;
  }
};

// Convert npub to hex
export const npubToHex = (npub: string): string | null => {
  try {
    if (npub.startsWith('npub')) {
      const { data } = nip19.decode(npub);
      return data as string;
    }
    return npub; // Already hex
  } catch (error) {
    console.error('Failed to convert npub to hex:', error);
    return null;
  }
};

// Define custom NDK kinds for Vertex
const VERTEX_KIND_REQUEST = 5900;
const VERTEX_KIND_RESPONSE = 5901;

// Create a vertex DVM event for "Verify Reputation" 
export const createVerifyReputationEvent = async (
  pubkey: string, 
  signer: NDKSigner
): Promise<NDKEvent> => {
  // Convert to hex if it's an npub
  const hexPubkey = npubToHex(pubkey) || pubkey;
  
  // Create event in NIP-90 format
  const event = new NDKEvent(vertexNDK);
  // Manually set kind for Vertex
  event.kind = VERTEX_KIND_REQUEST as any; // Using any to avoid TypeScript errors
  event.tags = [
    ['p', hexPubkey],
    ['method', 'verify_reputation'],
    ['algorithm', 'pagerank_personalized'], // personalized pagerank algorithm
  ];
  event.content = '';
  
  // Sign the event
  await event.sign(signer);
  return event;
};

// Get Web of Trust data for a user
export const getWebOfTrust = async (
  pubkey: string,
  signer: NDKSigner
): Promise<WebOfTrustResult> => {
  try {
    // Connect if not connected
    const hasConnectedRelays = vertexNDK.pool?.relays && 
      Object.values(vertexNDK.pool.relays).some(r => r.status === 1);
    
    if (!hasConnectedRelays) {
      console.log("Attempting to connect to Vertex relay...");
      const connected = await connectToVertex();
      if (!connected) {
        console.error("Failed to connect to Vertex relay, retrying once more");
        // Retry connection once
        await new Promise(resolve => setTimeout(resolve, 1000));
        await connectToVertex();
      }
    }
    
    // Check again if we're connected
    const isConnected = vertexNDK.pool?.relays && 
      Object.values(vertexNDK.pool.relays).some(r => r.status === 1);
    
    if (!isConnected) {
      console.error("Could not connect to Vertex relay - trust scores will not be available");
      // Return empty results instead of throwing an error
      return {
        event: null,
        results: {}
      };
    }
    
    // Create and send the request event
    const requestEvent = await createVerifyReputationEvent(pubkey, signer);
    
    // Publish with options
    await requestEvent.publish();
    console.log("Published verify_reputation request:", requestEvent.id);
    
    // Wait for the response with a timeout
    const filter: NDKFilter = {
      kinds: [VERTEX_KIND_RESPONSE as any], // Using any to avoid TypeScript errors
      '#e': [requestEvent.id],
      limit: 1,
    };
    
    console.log("Waiting for Vertex DVM response...");

    // Create a promise that will resolve with the response or timeout
    const responsePromise = new Promise<NDKEvent | null>((resolve) => {
      let responseReceived = false;
      
      // Set up subscription
      const sub = new NDKSubscription(vertexNDK, filter);
      
      sub.on('event', (event: NDKEvent) => {
        responseReceived = true;
        sub.stop();
        resolve(event);
      });
      
      // Start the subscription
      sub.start();
      
      // Set timeout to stop waiting after 15 seconds
      setTimeout(() => {
        if (!responseReceived) {
          sub.stop();
          resolve(null);
        }
      }, 15000);
    });
    
    const responseEvent = await responsePromise;
    
    if (!responseEvent) {
      throw new Error('No response from Vertex DVM within timeout period');
    }
    
    console.log("Received Vertex DVM response");
    
    // Parse and return the results
    let results: Record<string, number>;
    try {
      results = JSON.parse(responseEvent.content);
    } catch (e) {
      console.error("Error parsing Vertex DVM response:", e);
      throw new Error("Invalid response format from Vertex DVM");
    }
    
    return {
      event: responseEvent,
      results: results,
    };
  } catch (error) {
    console.error('Error getting Web of Trust data:', error);
    // Return empty results rather than null
    return { 
      event: null,
      results: {}
    };
  }
};

// Get top trusted users for a given pubkey
export const getTopTrustedUsers = async (
  pubkey: string,
  signer: NDKSigner,
  limit: number = 20
): Promise<{ pubkey: string; score: number }[]> => {
  const result = await getWebOfTrust(pubkey, signer);
  
  if (!result || !result.results) {
    return [];
  }
  
  // Sort by score (descending) and take top N
  return Object.entries(result.results)
    .map(([key, value]) => ({
      pubkey: key,
      score: value
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}; 