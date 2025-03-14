'use client';

import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { GraphData, GraphNode, GraphContextType, NostrProfile } from '../types';
import { initializeGraph, createNodeFromUser } from '../lib/graph';
import { getUserNotes, createNotesSubscription, createFollowingSubscription } from '../lib/nostr';
import { useAuth } from './AuthProvider';
import { NDKEvent, NDKUser, NDKSubscription } from '@nostr-dev-kit/ndk';
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
  
  // Store active subscriptions to be able to close them when needed
  const activeSubscriptionsRef = useRef<Map<string, NDKSubscription>>(new Map());
  
  // Cleanup function for subscriptions
  const cleanupSubscriptions = useCallback(() => {
    activeSubscriptionsRef.current.forEach(subscription => {
      subscription.stop();
    });
    activeSubscriptionsRef.current.clear();
  }, []);
  
  // Get trust score for a specific pubkey
  const getTrustScore = useCallback((pubkey: string): number | undefined => {
    return trustScores.get(pubkey);
  }, [trustScores]);
  
  // Load notes for a node using WebSocket subscription
  const loadNotesForNode = useCallback(async (nodeId: string) => {
    if (!ndk) {
      setNotesError('NDK not initialized');
      return;
    }
    
    // Close any existing notes subscription
    const existingNotesSubscription = activeSubscriptionsRef.current.get(`notes:${nodeId}`);
    if (existingNotesSubscription) {
      existingNotesSubscription.stop();
      activeSubscriptionsRef.current.delete(`notes:${nodeId}`);
    }
    
    setIsLoadingNotes(true);
    setNotesError(null);
    
    try {
      // Initial load to populate notes quickly
      const initialNotes = await getUserNotes(nodeId, 20, ndk);
      setUserNotes(initialNotes);
      
      // Then set up a subscription for real-time updates
      const { subscription, notes } = createNotesSubscription(
        nodeId, 
        20, 
        // This callback is called whenever a new note is received
        (event) => {
          // Update the notes state with the latest notes array
          setUserNotes([...notes]);
        },
        ndk
      );
      
      // Store the subscription for cleanup
      activeSubscriptionsRef.current.set(`notes:${nodeId}`, subscription);
      
    } catch (err) {
      console.error(`Error loading notes for ${nodeId}:`, err);
      setNotesError('Failed to load notes');
      setUserNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  }, [ndk]);
  
  // Load followers for a specific node using WebSocket subscription
  const loadFollowersForNode = useCallback(async (nodeId: string) => {
    if (!ndk) {
      setError('NDK not initialized');
      return;
    }
    
    // Close any existing followers subscription for this node
    const existingFollowersSubscription = activeSubscriptionsRef.current.get(`followers:${nodeId}`);
    if (existingFollowersSubscription) {
      existingFollowersSubscription.stop();
      activeSubscriptionsRef.current.delete(`followers:${nodeId}`);
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Create a live subscription for following list changes
      const { subscription } = createFollowingSubscription(
        nodeId,
        // This callback is called whenever the following list changes
        async (followingList) => {
          console.log(`Received updated following list for ${nodeId}: ${followingList.length} users`);
          
          if (followingList.length === 0) {
            return;
          }
          
          // Create a copy of the current graph
          const updatedGraph = { ...graph };
          
          // Add each followed user to the graph
          for (const followedPubkey of followingList) {
            // Check if node already exists
            if (!updatedGraph.nodes.some(node => node.id === followedPubkey)) {
              // Create a graph node for this user
              const graphNode = await createNodeFromUser(followedPubkey, false, profileCache, ndk);
              
              // Apply trust score if available
              const trustScore = trustScores.get(followedPubkey);
              if (trustScore !== undefined) {
                graphNode.trustScore = trustScore;
              }
              
              // Add the node
              updatedGraph.nodes.push(graphNode);
            }
            
            // Add the edge if it doesn't exist
            if (!updatedGraph.edges.some(edge => 
              (edge.source === nodeId && edge.target === followedPubkey) || 
              (edge.source === followedPubkey && edge.target === nodeId)
            )) {
              updatedGraph.edges.push({
                id: `${nodeId}-${followedPubkey}`,
                source: nodeId,
                target: followedPubkey,
                size: 1,
                color: '#ccc'
              });
            }
          }
          
          // Update the graph
          setGraph(updatedGraph);
        },
        ndk
      );
      
      // Store the subscription for cleanup
      activeSubscriptionsRef.current.set(`followers:${nodeId}`, subscription);
      
    } catch (err) {
      console.error(`Error loading followers for ${nodeId}:`, err);
      setError('Failed to load followers');
    } finally {
      setLoading(false);
    }
  }, [ndk, graph, profileCache, trustScores]);
  
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
          
          // More aggressive cleanup: only keep nodes in the navigation stack and their direct connections
          setGraph(prevGraph => {
            // Get all the node IDs in the navigation stack
            const stackNodeIds = new Set(newStack.map(n => n.id));
            
            // Step 1: Identify edges connecting stack nodes to their direct followers
            const relevantEdges = prevGraph.edges.filter(edge => {
              // Keep only edges where one end is in the stack
              return stackNodeIds.has(edge.source) || stackNodeIds.has(edge.target);
            });
            
            // Step 2: Identify all nodes we want to keep
            const keepNodeIds = new Set<string>();
            
            // Add all nodes in the stack
            stackNodeIds.forEach(id => keepNodeIds.add(id));
            
            // Add direct connections to stack nodes
            relevantEdges.forEach(edge => {
              if (stackNodeIds.has(edge.source)) {
                keepNodeIds.add(edge.target);
              }
              if (stackNodeIds.has(edge.target)) {
                keepNodeIds.add(edge.source);
              }
            });
            
            // Filter nodes to keep only those in the stack or direct connections
            const filteredNodes = prevGraph.nodes.filter(n => keepNodeIds.has(n.id));
            
            console.log(`Graph cleanup: Reduced from ${prevGraph.nodes.length} to ${filteredNodes.length} nodes`);
            
            return {
              nodes: filteredNodes,
              edges: relevantEdges
            };
          });
        } else {
          // If adding a new node to the stack
          setNavigationStack(prevStack => [...prevStack, node]);
          
          // No need to clean up when adding new nodes
          // But we should load followers for this node to show its connections
          loadFollowersForNode(node.id).catch(err => {
            console.error(`Error loading followers while adding to navigation stack:`, err);
          });
        }
      }
      
      await loadNotesForNode(node.id);
    } else {
      setUserNotes([]);
      setNotesError(null);
      // Don't modify the navigation stack when deselecting
    }
  }, [loadNotesForNode, navigationStack, loadFollowersForNode]);
  
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
      
      // Check if we have existing connections
      let currentConnections = 0;
      if (ndk.pool?.relays) {
        currentConnections = Object.values(ndk.pool.relays).filter(r => r.status === 1).length;
      }
      
      console.log(`Current active relay connections: ${currentConnections}`);
      
      // If we already have good connections, we might not need to reconnect
      if (currentConnections >= 3) {
        console.log("Already have good relay connections, skipping reconnect");
        return;
      }
      
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
        // Only reconnect if we have few or no connections
        if (currentConnections < 3) {
          console.log("Few or no connections, attempting a fresh connection to relays");
          
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
        }
        
        // Check connection status
        const connectedRelays = ndk.pool?.relays ? 
          Object.values(ndk.pool.relays).filter(r => r.status === 1).length : 0;
        
        console.log(`NDK is now connected to ${connectedRelays} active relays`);
        
        if (connectedRelays === 0) {
          console.error("Failed to connect to any relays! Retrying with just the essential ones...");
          
          // Try one more time with just the most reliable relays
          const essentialRelays = [
            'wss://relay.damus.io',
            'wss://relay.nostr.band',
            'wss://nos.lol',
            'wss://relay.current.fyi'
          ];
          
          console.log("Attempting connection to essential relays:", essentialRelays);
          
          // Update NDK's relay list
          ndk.explicitRelayUrls = essentialRelays;
          
          await ndk.connect();
          
          // Wait again for connections
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const retriedConnections = ndk.pool?.relays ? 
            Object.values(ndk.pool.relays).filter(r => r.status === 1).length : 0;
            
          console.log(`After retry: connected to ${retriedConnections} relays`);
          
          if (retriedConnections === 0) {
            console.error("Still failed to connect to any relays. WebSocket connections might be blocked.");
          }
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
  
  // Handle cleaning up subscriptions on unmount or when the user changes
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions, user]);
  
  // Initialize the graph when user logs in
  useEffect(() => {
    const loadInitialGraph = async () => {
      if (!user || !ndk) {
        setGraph({ nodes: [], edges: [] });
        setCurrentUserPubkey(null);
        setNavigationStack([]); // Clear navigation stack
        cleanupSubscriptions(); // Clean up any active subscriptions
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
        
        // Find the current user node
        const currentUserNode = initialGraph.nodes.find(node => node.id === user.pubkey);
        
        if (currentUserNode) {
          // Set selected node and initialize navigation stack with current user
          setSelectedNode(currentUserNode);
          setNavigationStack([currentUserNode]);
          
          // Load the user's following list
          try {
            console.log("Loading followers for current user");
            await loadFollowersForNode(user.pubkey);
          } catch (error) {
            console.error("Error loading followers, but continuing:", error);
          }
          
          // Load web of trust scores
          try {
            console.log("Loading web of trust scores");
            await loadWebOfTrustScores(user.pubkey);
          } catch (error) {
            console.error("Error loading trust scores, but continuing:", error);
          }
          
          // Load notes for the current user
          try {
            console.log("Loading notes for current user");
            await loadNotesForNode(user.pubkey);
          } catch (error) {
            console.error("Error loading notes, but continuing:", error);
          }
        } else {
          console.error("Could not find current user node in initial graph");
        }
      } catch (err) {
        console.error('Error loading initial graph:', err);
        setError('Failed to load your social graph');
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialGraph();
  }, [user, ndk, loadNotesForNode, loadFollowersForNode, loadWebOfTrustScores, cleanupSubscriptions]);
  
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
    loadFollowersForNode,
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