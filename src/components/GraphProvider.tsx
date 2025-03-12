'use client';

import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { GraphData, GraphNode, GraphContextType, NostrProfile } from '../types';
import { initializeGraph, createNodeFromUser } from '../lib/graph';
import { getUserNotes } from '../lib/nostr';
import { useAuth } from './AuthProvider';
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { getWebOfTrust, connectToVertex } from '../utils/vertex';

// Create the graph context
const GraphContext = createContext<GraphContextType>({
  graph: { nodes: [], edges: [] },
  selectedNode: null,
  setSelectedNode: () => {},
  loading: false,
  error: null,
  loadFollowersForNode: async () => {},
  currentUserPubkey: null,
  userNotes: [],
  isLoadingNotes: false,
  notesError: null,
  isLoadingTrustScores: false,
  getTrustScore: () => undefined,
  navigationStack: [], // Add empty navigation stack to initial context
});

// Provider component
export const GraphProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, ndk } = useAuth();
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileCache] = useState<Map<string, NostrProfile>>(new Map());
  const [currentUserPubkey, setCurrentUserPubkey] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState<NDKEvent[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [trustScores, setTrustScores] = useState<Map<string, number>>(new Map());
  const [isLoadingTrustScores, setIsLoadingTrustScores] = useState(false);
  // Add navigation stack state
  const [navigationStack, setNavigationStack] = useState<GraphNode[]>([]);
  
  // Get trust score for a specific pubkey
  const getTrustScore = useCallback((pubkey: string): number | undefined => {
    return trustScores.get(pubkey);
  }, [trustScores]);
  
  // Load notes for a node
  const loadNotesForNode = useCallback(async (nodeId: string) => {
    if (!ndk) {
      setNotesError('NDK not initialized');
      return;
    }
    
    setIsLoadingNotes(true);
    setNotesError(null);
    
    try {
      const notes = await getUserNotes(nodeId, 20, ndk);
      setUserNotes(notes);
    } catch (err) {
      console.error(`Error loading notes for ${nodeId}:`, err);
      setNotesError('Failed to load notes');
      setUserNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  }, [ndk]);
  
  // Set selected node and load its notes
  const handleSelectNode = useCallback(async (node: GraphNode | null) => {
    setSelectedNode(node);
    
    if (node) {
      // Update navigation stack
      if (node.isCurrentUser) {
        // If selecting the current user, clear the stack and just add them
        setNavigationStack([node]);
        
        // Clean up graph: remove all nodes except current user and their direct followers
        setGraph(prevGraph => {
          // Keep only the current user and their direct followers
          const currentUserEdges = prevGraph.edges.filter(
            edge => edge.source === node.id || edge.target === node.id
          );
          
          // Get the IDs of all nodes that are direct followers of the current user
          const directConnectionIds = new Set<string>();
          directConnectionIds.add(node.id); // Always keep the current user
          
          currentUserEdges.forEach(edge => {
            if (edge.source === node.id) directConnectionIds.add(edge.target);
            if (edge.target === node.id) directConnectionIds.add(edge.source);
          });
          
          // Filter nodes to keep only direct connections
          const filteredNodes = prevGraph.nodes.filter(n => 
            directConnectionIds.has(n.id)
          );
          
          console.log(`Graph cleanup: Reduced from ${prevGraph.nodes.length} to ${filteredNodes.length} nodes`);
          
          return {
            nodes: filteredNodes,
            edges: currentUserEdges
          };
        });
      } else {
        // Check if the node is already in the stack
        const nodeIndex = navigationStack.findIndex(n => n.id === node.id);
        
        if (nodeIndex >= 0) {
          // If node is in the stack, trim the stack up to this node
          const newStack = navigationStack.slice(0, nodeIndex + 1);
          setNavigationStack(newStack);
          
          // Clean up graph: remove nodes that were removed from the stack and any disconnected nodes
          setGraph(prevGraph => {
            // Get all the nodes that should remain in the graph
            const stackNodeIds = new Set(newStack.map(n => n.id));
            
            // First, keep only the edges that connect nodes in the stack or direct connections to stack nodes
            const relevantEdges = prevGraph.edges.filter(edge => 
              (stackNodeIds.has(edge.source) || stackNodeIds.has(edge.target))
            );
            
            // Identify all nodes that are connected to the stack nodes
            const connectedNodeIds = new Set<string>();
            
            // Add all nodes in the stack
            stackNodeIds.forEach(id => connectedNodeIds.add(id));
            
            // Add all nodes connected to stack nodes
            relevantEdges.forEach(edge => {
              connectedNodeIds.add(edge.source);
              connectedNodeIds.add(edge.target);
            });
            
            // Filter nodes to keep only connected ones
            const filteredNodes = prevGraph.nodes.filter(n => 
              connectedNodeIds.has(n.id)
            );
            
            console.log(`Graph cleanup: Reduced from ${prevGraph.nodes.length} to ${filteredNodes.length} nodes`);
            
            return {
              nodes: filteredNodes,
              edges: relevantEdges
            };
          });
        } else {
          // Otherwise, add the node to the stack
          setNavigationStack(prevStack => [...prevStack, node]);
        }
      }
      
      await loadNotesForNode(node.id);
    } else {
      setUserNotes([]);
      setNotesError(null);
      // Don't modify the navigation stack when deselecting
    }
  }, [loadNotesForNode, navigationStack]);
  
  // Ensure the NDK is connected to good relays and user relays
  const connectToUserRelays = useCallback(async () => {
    if (!ndk) {
      console.error('Cannot connect to relays: NDK instance is not available');
      return;
    }
    
    if (!user) {
      console.error('Cannot connect to relays: User is not available');
      return;
    }
    
    try {
      console.log('Connecting NDK to relays...');
      
      // Default relays - always include these for reliability
      const defaultRelays = [
        'wss://relay.damus.io',
        'wss://relay.nostr.band',
        'wss://nos.lol',
        'wss://relay.current.fyi',
        'wss://relay.snort.social',
        'wss://relay.primal.net',
        'wss://relay.nostr.wirednet.jp',
        'wss://offchain.pub',
        'wss://nostr.mutinywallet.com'
      ];
      
      // First, make sure we have some connections using defaults
      let relayUrls = [...defaultRelays];
      
      // Try to get user's preferred relays from profile metadata
      try {
        if (ndk && user.ndk === ndk) {
          // Attempt to get relays from extension in a more compatible way
          // Some extensions support getRelays, others have different methods
          try {
            // @ts-expect-error - NIP-07 extensions may have getRelays method
            const nip07Relays = await user.ndk?.signer?.getRelays?.();
            if (nip07Relays && Object.keys(nip07Relays).length > 0) {
              console.log("Found NIP-07 relays:", nip07Relays);
              relayUrls = [...relayUrls, ...Object.keys(nip07Relays)];
            }
          } catch {
            // Silently ignore if extension doesn't support getRelays
            console.log("Extension doesn't support getRelays method");
          }
        }
        
        // Also try to get relays from user profile metadata
        const profile = await user.fetchProfile();
        if (profile?.relays && Array.isArray(profile.relays)) {
          console.log("Found relays in profile:", profile.relays);
          relayUrls = [...relayUrls, ...profile.relays];
        }
      } catch (err) {
        console.warn("Error fetching user's relays:", err);
      }
      
      // Add Vertex relay as a must-have relay
      const vertexRelay = 'wss://relay.vertexlab.io';
      if (!relayUrls.includes(vertexRelay)) {
        relayUrls.push(vertexRelay);
      }
      
      // Remove duplicates and filter out invalid URLs
      relayUrls = [...new Set(relayUrls)].filter(url => {
        try {
          // Check if URL is valid
          new URL(url);
          return true;
        } catch {
          console.warn(`Invalid relay URL: ${url}`);
          return false;
        }
      });
      
      console.log(`Connecting to ${relayUrls.length} relays:`, relayUrls);
      
      // Make sure explicitRelayUrls are set on the NDK instance
      if (!ndk.explicitRelayUrls || ndk.explicitRelayUrls.length === 0) {
        ndk.explicitRelayUrls = relayUrls;
      } else {
        // Add any missing relays to the existing list
        for (const url of relayUrls) {
          if (!ndk.explicitRelayUrls.includes(url)) {
            ndk.explicitRelayUrls.push(url);
          }
        }
      }
      
      // Connect to all relays
      try {
        // Reset connections if needed by creating a fresh connect() call
        
        // Connect with a timeout
        const connectPromise = ndk.connect();
        
        // Wait for connection with timeout
        await Promise.race([
          connectPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000))
        ]).catch(err => {
          console.warn("Connection timeout, but continuing as some relays may connect:", err);
        });
        
        // Wait a bit to allow connections to establish
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check connection status
        const connectedRelays = ndk.pool?.relays ? 
          Object.values(ndk.pool.relays).filter(r => r.status === 1).length : 0;
        
        console.log(`NDK is now connected to ${connectedRelays} active relays`);
        
        if (connectedRelays === 0) {
          console.error("Failed to connect to any relays! Retrying with just the essential ones...");
          
          // Try one more time with just the most reliable relays
          ndk.explicitRelayUrls = [
            'wss://relay.damus.io',
            'wss://relay.nostr.band',
            'wss://nos.lol',
            'wss://relay.current.fyi'
          ];
          
          await ndk.connect();
          
          // Wait again for connections
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const retriedConnections = ndk.pool?.relays ? 
            Object.values(ndk.pool.relays).filter(r => r.status === 1).length : 0;
            
          console.log(`After retry: connected to ${retriedConnections} relays`);
        }
      } catch (err) {
        console.error("Error connecting to relays:", err);
      }
    } catch (error) {
      console.error('Error in connectToUserRelays:', error);
    }
  }, [ndk, user]);
  
  // Load web of trust scores from Vertex DVM
  const loadWebOfTrustScores = useCallback(async (rootPubkey: string) => {
    if (!ndk || !ndk.signer) {
      console.error('NDK not initialized or signer not available');
      return;
    }
    
    try {
      setIsLoadingTrustScores(true);
      
      // Make sure we're connected to Vertex relay
      await connectToVertex();
      
      // Ensure we have a connection to multiple relays for redundancy
      await connectToUserRelays();
      
      // Get web of trust data from Vertex DVM
      const webOfTrustData = await getWebOfTrust(rootPubkey, ndk.signer).catch(err => {
        console.error("Error getting web of trust data:", err);
        return null;
      });
      
      if (!webOfTrustData || !webOfTrustData.results) {
        console.warn('No web of trust data returned from Vertex DVM');
        return;
      }
      
      // Create a new Map of trust scores
      const newScores = new Map<string, number>();
      
      // Add scores to the map
      Object.entries(webOfTrustData.results).forEach(([pubkey, score]) => {
        newScores.set(pubkey, score as number);
      });
      
      console.log(`Loaded ${newScores.size} trust scores from Vertex DVM`);
      
      // Update the graph nodes with trust scores
      setGraph(prevGraph => {
        const updatedNodes = prevGraph.nodes.map(node => {
          const trustScore = newScores.get(node.id);
          return trustScore !== undefined 
            ? { ...node, trustScore } 
            : node;
        });
        
        return {
          ...prevGraph,
          nodes: updatedNodes
        };
      });
      
      // Update trust scores state
      setTrustScores(newScores);
    } catch (err) {
      console.error('Error loading web of trust scores:', err);
    } finally {
      setIsLoadingTrustScores(false);
    }
  }, [ndk, connectToUserRelays]);
  
  // Load followers for a specific node using NDK's follows() method
  const loadFollowersForNode = async (nodeId: string) => {
    if (!ndk) {
      setError('NDK not initialized');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Create NDKUser for this node
      const ndkUser = new NDKUser({ pubkey: nodeId });
      ndkUser.ndk = ndk;
      
      // Get the following list using NDK's built-in follows() method
      const followedUsers = await ndkUser.follows();
      console.log(`Loaded ${followedUsers.size} followings for ${nodeId}`);
      
      if (followedUsers.size === 0) {
        setLoading(false);
        return;
      }
      
      // Create a copy of the current graph
      const updatedGraph = { ...graph };
      
      // Add each followed user to the graph
      for (const followedUser of followedUsers) {
        // Create a graph node from the NDKUser
        const graphNode = await createNodeFromUser(followedUser.pubkey, false, profileCache, ndk);
        
        // Apply trust score if available
        const trustScore = trustScores.get(followedUser.pubkey);
        if (trustScore !== undefined) {
          graphNode.trustScore = trustScore;
        }
        
        // Check if node already exists
        if (!updatedGraph.nodes.some(node => node.id === followedUser.pubkey)) {
          // Add the node
          updatedGraph.nodes.push(graphNode);
        }
        
        // Add the edge if it doesn't exist
        if (!updatedGraph.edges.some(edge => 
          (edge.source === nodeId && edge.target === followedUser.pubkey) || 
          (edge.source === followedUser.pubkey && edge.target === nodeId)
        )) {
          updatedGraph.edges.push({
            id: `${nodeId}-${followedUser.pubkey}`,
            source: nodeId,
            target: followedUser.pubkey,
            size: 1,
            color: '#ccc'
          });
        }
      }
      
      setGraph(updatedGraph);
    } catch (err) {
      console.error(`Error loading followers for ${nodeId}:`, err);
      setError('Failed to load followers');
    } finally {
      setLoading(false);
    }
  };
  
  // Initialize the graph when user logs in
  useEffect(() => {
    const loadInitialGraph = async () => {
      if (!user || !ndk) {
        setGraph({ nodes: [], edges: [] });
        setCurrentUserPubkey(null);
        setNavigationStack([]); // Clear navigation stack
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        setCurrentUserPubkey(user.pubkey);
        
        // Connect to user's relays and continue regardless of errors
        try {
          await connectToUserRelays();
        } catch (error) {
          console.error("Error connecting to relays, but continuing:", error);
        }
        
        // Connect to Vertex relay but continue even if it fails
        try {
          await connectToVertex();
        } catch (error) {
          console.error("Error connecting to Vertex relay, but continuing:", error);
        }
        
        // Initialize the graph with the current user at the center
        const initialGraph = await initializeGraph(user, ndk);
        setGraph(initialGraph);
        
        // Load the user's following list
        try {
          await loadFollowersForNode(user.pubkey);
        } catch (error) {
          console.error("Error loading followers, but continuing:", error);
        }
        
        // Load web of trust scores
        try {
          await loadWebOfTrustScores(user.pubkey);
        } catch (error) {
          console.error("Error loading trust scores, but continuing:", error);
        }
        
        // Select the current user by default
        const currentUserNode = initialGraph.nodes.find(node => node.id === user.pubkey);
        if (currentUserNode) {
          setSelectedNode(currentUserNode);
          // Initialize navigation stack with current user
          setNavigationStack([currentUserNode]);
          // Load notes for the current user
          await loadNotesForNode(user.pubkey);
        }
      } catch (err) {
        console.error('Error loading initial graph:', err);
        setError('Failed to load your social graph');
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialGraph();
  }, [user, ndk, loadNotesForNode, connectToUserRelays, loadWebOfTrustScores]);
  
  // Create context value with useMemo to avoid unnecessary rerenders
  const contextValue = useMemo(() => ({
    graph,
    selectedNode,
    setSelectedNode: handleSelectNode,
    loading,
    error,
    loadFollowersForNode,
    currentUserPubkey,
    userNotes,
    isLoadingNotes,
    notesError,
    isLoadingTrustScores,
    getTrustScore,
    navigationStack, // Add navigation stack to the context
  }), [
    graph,
    selectedNode,
    handleSelectNode,
    loading,
    error,
    currentUserPubkey,
    userNotes,
    isLoadingNotes,
    notesError,
    isLoadingTrustScores,
    getTrustScore,
    navigationStack, // Add navigation stack to dependencies
  ]);
  
  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  );
};

// Custom hook for using the graph context
export const useGraph = () => useContext(GraphContext); 