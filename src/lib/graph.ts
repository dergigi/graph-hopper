import { NDKUser } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import { GraphData, GraphNode, GraphEdge, NostrProfile } from '../types';
import { getUserProfile } from './nostr';

// Generate a consistent color from a pubkey
export const generateColor = (pubkey: string): string => {
  // Get a hash of the pubkey
  let hash = 0;
  for (let i = 0; i < pubkey.length; i++) {
    hash = pubkey.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate a vibrant, visually pleasing color
  const h = Math.abs(hash % 360);
  const s = 60 + Math.abs((hash >> 3) % 40); // Between 60-100%
  const l = 45 + Math.abs((hash >> 6) % 30); // Between 45-75%
  
  return `hsl(${h}, ${s}%, ${l}%)`;
};

// Truncate a pubkey for display
export const truncatePubkey = (pubkey: string): string => {
  if (!pubkey) return '';
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`;
};

// Create a node from a user
export const createNodeFromUser = async (
  pubkey: string, 
  isCurrentUser = false, 
  existingProfiles: Map<string, NostrProfile> = new Map(),
  ndkInstance?: NDK
): Promise<GraphNode> => {
  let profile: NostrProfile = existingProfiles.get(pubkey) || {};
  
  if (!existingProfiles.has(pubkey)) {
    try {
      profile = await getUserProfile(pubkey, ndkInstance);
      existingProfiles.set(pubkey, profile);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  }
  
  const displayName = profile.name || profile.displayName || truncatePubkey(pubkey);
  
  return {
    id: pubkey,
    label: displayName,
    size: isCurrentUser ? 15 : 10,
    color: isCurrentUser ? '#FF5722' : generateColor(pubkey),
    image: profile.picture,
    isCurrentUser,
    profile
  };
};

// Create an edge between two nodes
export const createEdge = (sourceId: string, targetId: string): GraphEdge => {
  return {
    id: `${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    size: 1,
    color: '#ccc'
  };
};

// Initialize a graph with a central user
export const initializeGraph = async (user: NDKUser, ndkInstance?: NDK): Promise<GraphData> => {
  const centralNode = await createNodeFromUser(user.pubkey, true, undefined, ndkInstance);
  
  return {
    nodes: [centralNode],
    edges: []
  };
};

// Add a connection to the graph
export const addUserToGraph = async (
  graph: GraphData, 
  pubkey: string, 
  connectedTo: string,
  existingProfiles: Map<string, NostrProfile> = new Map(),
  ndkInstance?: NDK
): Promise<GraphData> => {
  // Check if node already exists
  if (graph.nodes.some(node => node.id === pubkey)) {
    // Just add the edge if it doesn't exist
    if (!graph.edges.some(edge => 
      (edge.source === connectedTo && edge.target === pubkey) || 
      (edge.source === pubkey && edge.target === connectedTo)
    )) {
      graph.edges.push(createEdge(connectedTo, pubkey));
    }
    return graph;
  }
  
  // Create and add the new node
  const newNode = await createNodeFromUser(pubkey, false, existingProfiles, ndkInstance);
  
  // Create and add the edge
  const newEdge = createEdge(connectedTo, pubkey);
  
  return {
    nodes: [...graph.nodes, newNode],
    edges: [...graph.edges, newEdge]
  };
}; 