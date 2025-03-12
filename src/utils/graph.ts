import { NDKUser } from '@nostr-dev-kit/ndk';
import { GraphNode, GraphEdge } from '../types';
import { getWebOfTrust, hexToNpub, npubToHex } from './vertex';

// Generate a random color based on pubkey
export const generateNodeColor = (pubkey: string): string => {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to HSL color - use only blue-green-purple palette (120° to 300°)
  const h = ((hash % 180) + 120) % 360; // Range from 120° to 300°
  const s = 70 + (hash % 20); // 70-90% saturation
  const l = 45 + (hash % 10); // 45-55% lightness
  
  return `hsl(${h}, ${s}%, ${l}%)`;
};

// Convert Vertex data to graph nodes and edges
export const createGraphFromWebOfTrust = async (
  rootPubkey: string,
  user: NDKUser,
  maxNodes: number = 20
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> => {
  if (!user.ndk) {
    throw new Error("User NDK is not initialized");
  }
  
  // Get web of trust data
  const webOfTrust = await getWebOfTrust(rootPubkey, user.ndk.signer!);
  
  if (!webOfTrust || !webOfTrust.results) {
    console.error('Failed to get web of trust data');
    return { nodes: [], edges: [] };
  }
  
  // Sort by score and take top N
  const topUsers = Object.entries(webOfTrust.results)
    .map(([pubkey, score]) => ({ pubkey, score: score as number }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNodes);
  
  // Create nodes for each user
  const nodes: GraphNode[] = [{
    id: rootPubkey,
    label: hexToNpub(rootPubkey).substring(0, 10),
    isCurrentUser: true,
    color: '#1E88E5', // Special color for root user
  }];
  
  // Create edges from root to each user
  const edges: GraphEdge[] = [];
  
  // Add other users as nodes and create edges
  for (const { pubkey, score } of topUsers) {
    // Skip if it's the root user
    if (pubkey === rootPubkey) continue;
    
    // Create node
    nodes.push({
      id: pubkey,
      label: hexToNpub(pubkey).substring(0, 10),
      color: generateNodeColor(pubkey),
    });
    
    // Create edge
    edges.push({
      id: `${rootPubkey}->${pubkey}`,
      source: rootPubkey,
      target: pubkey,
      size: Math.max(1, Math.min(5, score * 10)),
    });
  }
  
  return { nodes, edges };
};

// Load web of trust data from Vertex DVM
export const loadWebOfTrustData = async (
  pubkey: string,
  user: NDKUser
): Promise<{ nodes: GraphNode[], edges: GraphEdge[] }> => {
  try {
    // Normalize pubkey (convert npub to hex if needed)
    const hexPubkey = npubToHex(pubkey) || pubkey;
    
    // Fetch graph data from Vertex
    return await createGraphFromWebOfTrust(hexPubkey, user);
  } catch (error) {
    console.error('Error loading web of trust data:', error);
    return { nodes: [], edges: [] };
  }
}; 