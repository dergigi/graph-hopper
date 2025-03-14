'use client';

import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { GraphData, GraphNode, GraphContextType, NostrProfile } from '../types';
import { initializeGraph, createNodeFromUser } from '../lib/graph';
import { getUserNotes, createNotesSubscription, createFollowingSubscription } from '../lib/nostr';
import { useAuth } from './AuthProvider';
import { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk';

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
  navigationStack: [],
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
  const [navigationStack, setNavigationStack] = useState<GraphNode[]>([]);
  
  // Store active subscriptions to be able to close them when needed
  const activeSubscriptionsRef = useRef<Map<string, NDKSubscription>>(new Map());
  const graphRef = useRef<GraphData>(graph);
  
  // Update graphRef when graph changes
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);
  
  // Cleanup function for subscriptions
  const cleanupSubscriptions = useCallback(() => {
    activeSubscriptionsRef.current.forEach(subscription => {
      subscription.stop();
    });
    activeSubscriptionsRef.current.clear();
  }, []);
  
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
        () => {
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
          
          // Create a copy of the current graph from the ref to avoid dependency loops
          const currentGraph = graphRef.current;
          const updatedGraph = { ...currentGraph };
          
          // Add each followed user to the graph
          for (const followedPubkey of followingList) {
            // Check if node already exists
            if (!updatedGraph.nodes.some(node => node.id === followedPubkey)) {
              // Create a graph node for this user
              const graphNode = await createNodeFromUser(followedPubkey, false, profileCache, ndk);
              
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
  }, [ndk, profileCache]);
  
  // Set selected node and load its notes
  const handleSelectNode = useCallback(async (node: GraphNode | null) => {
    // Skip if it's the same node to prevent unnecessary updates
    if (selectedNode?.id === node?.id) {
      return;
    }
    
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
          
          // Load followers ONLY if node is not already loaded
          // This check helps prevent unnecessary data fetching
          const hasFollowersLoaded = graphRef.current.edges.some(
            edge => edge.source === node.id || edge.target === node.id
          );
          
          if (!hasFollowersLoaded) {
            // Only load followers if we haven't already loaded connections for this node
            loadFollowersForNode(node.id).catch(err => {
              console.error(`Error loading followers while adding to navigation stack:`, err);
            });
          }
        }
      }
      
      // Load notes for the selected node
      await loadNotesForNode(node.id);
    } else {
      setUserNotes([]);
      setNotesError(null);
      // Don't modify the navigation stack when deselecting
    }
  }, [loadNotesForNode, navigationStack, loadFollowersForNode]);
  
  // Ensure the NDK is connected to good relays
  const connectToRelays = useCallback(async () => {
    if (!ndk) {
      console.error('Cannot connect to relays: NDK instance is not available');
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
        'wss://nostr.mutinywallet.com'
      ];
      
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
        ndk.explicitRelayUrls = defaultRelays;
      }
      
      // Only reconnect if we have few or no connections
      if (currentConnections < 3) {
        console.log("Few or no connections, attempting a fresh connection to relays");
        
        try {
          // Connect with a timeout
          const connectPromise = ndk.connect();
          
          // Wait for connection with timeout
          await Promise.race([
            connectPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000))
          ]).catch(err => {
            console.warn("Connection timeout, but continuing as some relays may connect:", err);
          });
        } catch (err) {
          console.error("Error connecting to relays:", err);
        }
      }
    } catch (error) {
      console.error('Error in connectToRelays:', error);
    }
  }, [ndk]);
  
  // Handle cleaning up subscriptions on unmount or when the user changes
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions]);
  
  // Initialize the graph when user logs in
  useEffect(() => {
    const loadInitialGraph = async () => {
      if (!user || !ndk) {
        // Reset state on logout or when NDK is not available
        cleanupSubscriptions();
        setGraph({ nodes: [], edges: [] });
        setCurrentUserPubkey(null);
        setNavigationStack([]);
        setSelectedNode(null);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        setCurrentUserPubkey(user.pubkey);
        
        // Connect to relays
        await connectToRelays();
        
        // Initialize the graph with the current user at the center
        const initialGraph = await initializeGraph(user, ndk);
        setGraph(initialGraph);
        
        // Find the current user node
        const currentUserNode = initialGraph.nodes.find(node => node.id === user.pubkey);
        
        if (currentUserNode) {
          // Set selected node and initialize navigation stack with current user
          setSelectedNode(currentUserNode);
          setNavigationStack([currentUserNode]);
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
    
    // When user or ndk changes, we need to reset and reload the graph
    return () => {
      cleanupSubscriptions();
    };
  }, [user, ndk, connectToRelays, cleanupSubscriptions]);
  
  // Separate effect for loading followers and notes to avoid circular dependencies
  useEffect(() => {
    // Only load data if we have a user pubkey and NDK
    if (!currentUserPubkey || !ndk) return;
    
    // Load the user's following list
    loadFollowersForNode(currentUserPubkey).catch(error => {
      console.error("Error loading followers, but continuing:", error);
    });
    
    // Load notes for the current user
    loadNotesForNode(currentUserPubkey).catch(error => {
      console.error("Error loading notes, but continuing:", error);
    });
  }, [currentUserPubkey, ndk, loadFollowersForNode, loadNotesForNode]);
  
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
    navigationStack,
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
    navigationStack,
  ]);
  
  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  );
};

// Custom hook for using the graph context
export const useGraph = () => useContext(GraphContext); 