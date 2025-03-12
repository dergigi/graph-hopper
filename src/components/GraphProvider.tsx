'use client';

import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { GraphData, GraphNode, GraphContextType, NostrProfile } from '../types';
import { initializeGraph, createNodeFromUser } from '../lib/graph';
import { getUserNotes } from '../lib/nostr';
import { useAuth } from './AuthProvider';
import { NDKEvent, NDKUser, NDKSubscription, NDKFilter } from '@nostr-dev-kit/ndk';
import { getWebOfTrust, connectToVertex } from '../utils/vertex';
import { getCachedTrustScores, cacheTrustScores, formatTrustScore } from '../utils/trustScoreCache';
import { connectToRelays, getUserRelays } from '../utils/relayManager';

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
  formatTrustScore: () => 0,
  navigationStack: [],
  isConnectedToRelays: false,
  isConnectedToVertex: false,
  activeSubscriptions: [],
});

// Export the useGraph hook
export const useGraph = () => React.useContext(GraphContext);

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
  // Add relay connection status
  const [isConnectedToRelays, setIsConnectedToRelays] = useState(false);
  const [isConnectedToVertex, setIsConnectedToVertex] = useState(false);
  // Track active subscriptions
  const [activeSubscriptions, setActiveSubscriptions] = useState<NDKSubscription[]>([]);
  
  // Add refs for tracking last queried pubkey and timestamp
  const lastQueriedPubkeyRef = useRef<string | null>(null);
  const lastQueriedTimestampRef = useRef<number>(0);
  
  // Add refs to track which subscriptions are active
  const activeNotesSubscriptionRef = useRef<NDKSubscription | null>(null);
  const notesLoadedForNodeRef = useRef<string | null>(null);
  
  // Get trust score for a specific pubkey
  const getTrustScore = useCallback((pubkey: string): number | undefined => {
    return trustScores.get(pubkey);
  }, [trustScores]);
  
  // Create a new subscription and add it to active subscriptions
  const createSubscription = useCallback((filter: NDKFilter, opts?: {
    groupable?: boolean;
    groupingDelay?: number;
    closeOnEose?: boolean;
  }) => {
    if (!ndk) return null;
    
    // Create a new subscription with the specified filter
    const subscription = ndk.subscribe(filter, {
      groupable: opts?.groupable ?? true, // Group similar subscriptions by default
      // @ts-expect-error - NDK types don't include groupingDelay but it's supported
      groupingDelay: opts?.groupingDelay ?? 100, // Wait 100ms for grouping by default
      closeOnEose: opts?.closeOnEose ?? false // Keep subscription open after EOSE by default
    });
    
    // Add to active subscriptions list
    setActiveSubscriptions(prev => [...prev, subscription]);
    
    // Return the subscription for event handling
    return subscription;
  }, [ndk]);
  
  // Load notes for a node using NDK subscriptions - with caching to prevent constant refreshes
  const loadNotesForNode = useCallback(async (nodeId: string) => {
    if (!ndk) {
      setNotesError('NDK not initialized');
      return;
    }
    
    // Skip if we're already showing notes for this node
    if (notesLoadedForNodeRef.current === nodeId) {
      console.log(`Already loaded notes for ${nodeId}, skipping duplicate request`);
      return;
    }
    
    // Stop any existing subscription
    if (activeNotesSubscriptionRef.current) {
      console.log('Stopping existing notes subscription');
      activeNotesSubscriptionRef.current.stop();
      activeNotesSubscriptionRef.current = null;
    }
    
    setIsLoadingNotes(true);
    setNotesError(null);
    
    try {
      // Define the filter for notes
      const filter: NDKFilter = {
        kinds: [1], // Regular notes
        authors: [nodeId],
        limit: 20,
      };
      
      // Create a subscription
      const notesSubscription = createSubscription(filter, {
        closeOnEose: true // Close when we receive all events
      });
      
      // Store the subscription reference
      activeNotesSubscriptionRef.current = notesSubscription;
      
      if (!notesSubscription) {
        throw new Error('Failed to create subscription');
      }
      
      // Collect notes
      const notes: NDKEvent[] = [];
      
      // Set up promise to wait for EOSE (End Of Stored Events)
      const eosePromise = new Promise<void>((resolve) => {
        notesSubscription.on('event', (event: NDKEvent) => {
          notes.push(event);
        });
        
        notesSubscription.on('eose', () => {
          resolve();
        });
      });
      
      // Wait for EOSE or timeout after 10 seconds
      await Promise.race([
        eosePromise,
        new Promise<void>((resolve) => setTimeout(resolve, 10000))
      ]);
      
      // Sort notes by created_at (newest first)
      notes.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
      
      // Update state with notes
      setUserNotes(notes);
      
      // Mark this node as loaded
      notesLoadedForNodeRef.current = nodeId;
    } catch (err) {
      console.error(`Error loading notes for ${nodeId}:`, err);
      setNotesError('Failed to load notes');
      setUserNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  }, [ndk, createSubscription]);
  
  // Connect to user's relays
  const connectToUserRelays = useCallback(async () => {
    if (!ndk || !user) {
      console.error('Cannot connect to relays: NDK or user not available');
      return false;
    }
    
    try {
      // Get user's preferred relays
      const userRelays = await getUserRelays(user);
      
      // Connect to relays
      const connectionStatus = await connectToRelays(ndk, userRelays);
      
      // Update connection state
      setIsConnectedToRelays(connectionStatus.connectedCount > 0);
      setIsConnectedToVertex(connectionStatus.vertexConnected);
      
      return connectionStatus.connectedCount > 0;
    } catch (error) {
      console.error('Error in connectToUserRelays:', error);
      setIsConnectedToRelays(false);
      setIsConnectedToVertex(false);
      return false;
    }
  }, [ndk, user]);
  
  // Load followers using NDK subscription
  const loadFollowersForNode = useCallback(async (pubkey: string) => {
    if (!ndk) {
      console.warn('NDK not initialized, cannot load followers');
      return;
    }
    
    // Skip if pubkey is empty
    if (!pubkey) {
      console.warn("Empty pubkey provided to loadFollowersForNode");
      return;
    }
    
    // Track if already loading this node's followers
    if (loading) {
      console.log(`Already loading data, skipping duplicate loadFollowersForNode request for ${pubkey}`);
      return;
    }
    
    console.log(`Loading followers for node: ${pubkey}`);
    
    // Track if component is mounted
    const isMountedRef = { current: true };
    
    // Set loading state
    setLoading(true);
    
    try {
      // First get the kind 3 event (contact list)
      const filter: NDKFilter = { 
        kinds: [3], 
        authors: [pubkey],
        limit: 1
      };
      
      const sub = ndk.subscribe(filter);
      
      let contactListEvent: NDKEvent | null = null;
      
      sub.on('event', (event: NDKEvent) => {
        contactListEvent = event;
        sub.stop(); // We only need one
      });
      
      // Wait for contact list with timeout
      await Promise.race([
        new Promise<void>(resolve => {
          sub.on('eose', () => resolve());
        }),
        new Promise<void>(resolve => setTimeout(resolve, 5000))
      ]);
      
      // Check if we found a contact list
      if (!contactListEvent) {
        console.log(`No contacts found for ${pubkey}`);
        if (isMountedRef.current) {
          setLoading(false);
        }
        return;
      }
      
      // Extract pubkeys from the contact list (p tags)
      const tags = contactListEvent.tags || [];
      // Use explicit typing to avoid linter errors
      const followedPubkeys = tags
        .filter((tag: any[]) => Array.isArray(tag) && tag[0] === 'p')
        .map((tag: any[]) => tag[1]);
      
      console.log(`Loaded ${followedPubkeys.length} contacts for ${pubkey}`);
      
      if (followedPubkeys.length === 0) {
        if (isMountedRef.current) {
          setLoading(false);
        }
        return;
      }
      
      // Limit the number of followed pubkeys to avoid overloading
      const maxFollowersToLoad = 50;
      const limitedFollowedPubkeys = followedPubkeys.slice(0, maxFollowersToLoad);
      
      if (followedPubkeys.length > maxFollowersToLoad) {
        console.log(`Limiting to ${maxFollowersToLoad} contacts to prevent performance issues (${followedPubkeys.length - maxFollowersToLoad} more available)`);
      }
      
      // Update the graph with new nodes
      // We'll create a new graph object to avoid reference issues
      setGraph(prevGraph => {
        // Create a copy of the current graph
        const updatedGraph = { 
          nodes: [...prevGraph.nodes],
          edges: [...prevGraph.edges]
        };
        
        // Add edges for followed pubkeys
        limitedFollowedPubkeys.forEach((followedPubkey: string) => {
          // Make sure the pubkey is valid
          if (!followedPubkey) return;
          
          // Create a minimal node if we don't have it yet
          const existingNode = updatedGraph.nodes.find(n => n.id === followedPubkey);
          if (!existingNode) {
            // Create a simple placeholder node - we'll update it with profile info later
            const newNode = {
              id: followedPubkey,
              label: 'Loading...',
              color: '#64748B', // Gray - will be updated with profile
              isCurrentUser: false
            };
            
            updatedGraph.nodes.push(newNode);
          }
          
          // Add the edge if it doesn't exist
          const edgeId = `${pubkey}-${followedPubkey}`;
          const existingEdge = updatedGraph.edges.find(e => e.id === edgeId);
          
          if (!existingEdge) {
            updatedGraph.edges.push({
              id: edgeId,
              source: pubkey,
              target: followedPubkey,
              size: 1,
              color: '#ccc'
            });
          }
        });
        
        console.log(`Updated graph: ${updatedGraph.nodes.length} nodes, ${updatedGraph.edges.length} edges`);
        return updatedGraph;
      });
      
      // Now load profiles for the followed users
      // Create a subscription to fetch profile information
      const profileFilter: NDKFilter = {
        kinds: [0], // Metadata (profiles)
        authors: limitedFollowedPubkeys,
      };
      
      // Create a new subscription
      const profileSub = ndk.subscribe(profileFilter);
      
      // Batch updates - collect profile updates and apply them in batches
      const profileUpdates: GraphNode[] = [];
      const batchSize = 10;
      let batchTimer: NodeJS.Timeout | null = null;
      
      // Create a function to flush updates
      const flushProfileUpdates = () => {
        if (profileUpdates.length === 0 || !isMountedRef.current) return;
        
        console.log(`Applying batch of ${profileUpdates.length} profile updates`);
        
        setGraph(prevGraph => {
          const updatedNodes = [...prevGraph.nodes];
          
          // Apply all updates in the batch
          profileUpdates.forEach(updatedNode => {
            const nodeIndex = updatedNodes.findIndex(n => n.id === updatedNode.id);
            
            if (nodeIndex === -1) {
              // Node doesn't exist, add it
              updatedNodes.push(updatedNode);
            } else {
              // Node exists, update it
              updatedNodes[nodeIndex] = {
                ...updatedNodes[nodeIndex],
                ...updatedNode
              };
            }
          });
          
          return {
            ...prevGraph,
            nodes: updatedNodes
          };
        });
        
        // Clear the updates array
        profileUpdates.length = 0;
      };
      
      // Process profiles as they come in
      profileSub.on('event', async (event: NDKEvent) => {
        if (event.kind !== 0 || !event.pubkey) return;
        
        try {
          // Parse the profile data from the event
          let profileData: any = {};
          try {
            profileData = JSON.parse(event.content);
          } catch (e) {
            console.warn(`Failed to parse profile for ${event.pubkey}:`, e);
          }
          
          // Create a GraphNode from the profile
          const updatedNode = {
            id: event.pubkey,
            label: profileData.name || profileData.display_name || event.pubkey.slice(0, 8),
            color: '#3B82F6', // Default blue
            isCurrentUser: false,
            profile: {
              name: profileData.name || '',
              displayName: profileData.display_name || '',
              about: profileData.about || '',
              picture: profileData.picture || '',
              banner: profileData.banner || '',
              website: profileData.website || '',
              nip05: profileData.nip05 || ''
            }
          };
          
          // Add to the batch
          profileUpdates.push(updatedNode);
          
          // Schedule a batch update if not already scheduled
          if (profileUpdates.length >= batchSize && !batchTimer) {
            flushProfileUpdates();
          } else if (!batchTimer) {
            batchTimer = setTimeout(() => {
              batchTimer = null;
              flushProfileUpdates();
            }, 500); // Flush every 500ms if batch size not reached
          }
        } catch (err) {
          console.error(`Error processing profile for ${event.pubkey}:`, err);
        }
      });
      
      // Set a timeout to close the profile subscription after a reasonable time
      setTimeout(() => {
        profileSub.stop();
        console.log("Profile subscription closed due to timeout");
        
        // Final flush of any remaining updates
        flushProfileUpdates();
        
        if (isMountedRef.current) {
          setLoading(false);
        }
      }, 8000);
      
      // Wait for EOSE and then close the subscription
      profileSub.on('eose', () => {
        console.log("Received EOSE for profile subscription");
        setTimeout(() => {
          profileSub.stop();
          
          // Final flush of any remaining updates
          flushProfileUpdates();
          
          if (isMountedRef.current) {
            setLoading(false);
          }
        }, 1000); // Give a small buffer after EOSE before closing
      });
    } catch (err) {
      console.error(`Error loading followers for ${pubkey}:`, err);
      if (isMountedRef.current) {
        setError('Failed to load followers');
        setLoading(false);
      }
    }
    
    // Return a cleanup function
    return () => {
      isMountedRef.current = false;
    };
  }, [ndk, loading]);
  
  // Load web of trust scores from Vertex DVM
  const loadWebOfTrustScores = useCallback(async (rootPubkey: string) => {
    if (!ndk || !ndk.signer) {
      console.error('NDK not initialized or signer not available');
      return;
    }
    
    // Skip if already loading trust scores
    if (isLoadingTrustScores) {
      console.log('Already loading trust scores, skipping duplicate request');
      return;
    }
    
    // Skip if we've already queried this pubkey recently (within last 5 minutes)
    if (lastQueriedPubkeyRef.current === rootPubkey) {
      const timeSinceLastQuery = Date.now() - lastQueriedTimestampRef.current;
      if (timeSinceLastQuery < 5 * 60 * 1000) { // 5 minutes
        console.log(`Skipping duplicate trust score query for ${rootPubkey} (queried ${timeSinceLastQuery/1000}s ago)`);
        return;
      }
    }
    
    try {
      setIsLoadingTrustScores(true);
      lastQueriedPubkeyRef.current = rootPubkey;
      lastQueriedTimestampRef.current = Date.now();
      
      // First try to get scores from cache
      const cachedScores = getCachedTrustScores();
      if (cachedScores.size > 0) {
        console.log(`Using ${cachedScores.size} cached trust scores`);
        setTrustScores(cachedScores);
        
        // Update the graph nodes with cached trust scores
        setGraph(prevGraph => {
          const updatedNodes = prevGraph.nodes.map(node => {
            const trustScore = cachedScores.get(node.id);
            return trustScore !== undefined 
              ? { ...node, trustScore } 
              : node;
          });
          
          return {
            ...prevGraph,
            nodes: updatedNodes
          };
        });
      }
      
      // Only continue if we have relay connections
      if (!isConnectedToVertex) {
        // Try to establish connection to Vertex
        await connectToVertex();
      }
      
      // Get web of trust data from Vertex DVM
      console.log(`Requesting web of trust data for: ${rootPubkey}`);
      const webOfTrustData = await getWebOfTrust(rootPubkey, ndk.signer).catch(err => {
        console.error("Error getting web of trust data:", err);
        return null;
      });
      
      if (!webOfTrustData || !webOfTrustData.results) {
        console.warn('No web of trust data returned from Vertex DVM');
        setIsLoadingTrustScores(false);
        return;
      }
      
      // Create a new Map of trust scores
      const newScores = new Map<string, number>();
      
      // Add scores to the map
      Object.entries(webOfTrustData.results).forEach(([pubkey, score]) => {
        newScores.set(pubkey, score as number);
      });
      
      console.log(`Loaded ${newScores.size} trust scores from Vertex DVM`);
      
      // Save scores to cache
      cacheTrustScores(newScores);
      
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
  }, [ndk, isConnectedToVertex, isLoadingTrustScores]);
  
  // Initialize the graph when user logs in - modified to follow proper initialization flow
  useEffect(() => {
    // Skip if not logged in
    if (!user?.pubkey) return;
    
    // Track if component is mounted to prevent state updates after unmounting
    const isMountedRef = { current: true };
    
    // Define the initialization flow
    const initializeApp = async () => {
      try {
        setLoading(true);
        
        // Step 1: Create initial graph with just the current user
        const currentUserNode = {
          id: user.pubkey,
          label: user.profile?.name || user.profile?.displayName || 'You',
          color: '#4C8BF5', // Google blue
          isCurrentUser: true,
          profile: user.profile || undefined,
          trustScore: 1.0 // Current user always has full trust
        };
        
        const initialGraph = {
          nodes: [currentUserNode],
          edges: [],
        };
        
        // Update graph immediately to show something
        if (isMountedRef.current) {
          setGraph(initialGraph);
          setSelectedNode(currentUserNode); // Select current user initially
          setCurrentUserPubkey(user.pubkey); // Set current user pubkey
          setNavigationStack([currentUserNode]); // Initialize navigation stack with current user
        }
        
        // Step 2: Connect to user's relays
        console.log("Step 2: Connecting to user's relays");
        const relaysConnected = await connectToUserRelays();
        
        if (!relaysConnected) {
          console.warn("Failed to connect to any relays, continuing with limited functionality");
        }
        
        // Step 3: Load user's followers (only if relays connected)
        if (relaysConnected && isMountedRef.current) {
          console.log("Step 3: Loading followers for current user");
          await loadFollowersForNode(user.pubkey);
        }
        
        // Step 4: Calculate web-of-trust for the logged-in user (only if relays connected)
        if (relaysConnected && isMountedRef.current) {
          console.log("Step 4: Loading web-of-trust data");
          await loadWebOfTrustScores(user.pubkey);
        }
        
        // Clear loading state
        if (isMountedRef.current) {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error initializing application:", error);
        if (isMountedRef.current) {
          setError("Failed to initialize application");
          setLoading(false);
        }
      }
    };
    
    // Start initialization
    initializeApp();
    
    // Cleanup function to cancel any pending operations
    return () => {
      isMountedRef.current = false;
      
      // Stop any active subscriptions
      if (activeNotesSubscriptionRef.current) {
        activeNotesSubscriptionRef.current.stop();
        activeNotesSubscriptionRef.current = null;
      }
      
      // Clear all active subscriptions
      activeSubscriptions.forEach(sub => {
        try {
          sub.stop();
        } catch (e) {
          console.warn("Error stopping subscription:", e);
        }
      });
    };
  }, [user?.pubkey, ndk, connectToUserRelays, loadFollowersForNode, loadWebOfTrustScores]);
  
  // Selected node and navigation stack handling - with stabilization
  const handleSelectNode = useCallback(async (node: GraphNode | null) => {
    // Skip if selecting the same node again to prevent unnecessary refreshes
    if (node && selectedNode && node.id === selectedNode.id) {
      console.log(`Already selected node ${node.id}, skipping duplicate selection`);
      return;
    }
    
    setSelectedNode(node);
    
    if (node) {
      // Update navigation stack
      if (node.isCurrentUser) {
        // If selecting the current user, clear the stack and just add them
        setNavigationStack([node]);
        
        // Clean up graph: keep ONLY the current user's direct connections
        // This is more aggressive cleanup for the root node
        setGraph(prevGraph => {
          // Create a completely fresh graph with just the current user
          const cleanGraph: GraphData = {
            nodes: [node], // Start with just the current user node
            edges: []
          };
          
          // Find only direct connections to the current user
          const directEdges = prevGraph.edges.filter(
            edge => edge.source === node.id || edge.target === node.id
          );
          
          // Get the IDs of all nodes that are directly connected to the current user
          const directConnectionIds = new Set<string>();
          directConnectionIds.add(node.id); // Always keep the current user
          
          // Add the direct connections
          directEdges.forEach(edge => {
            if (edge.source === node.id) directConnectionIds.add(edge.target);
            if (edge.target === node.id) directConnectionIds.add(edge.source);
          });
          
          // Find all directly connected nodes
          const directNodes = prevGraph.nodes.filter(n => 
            directConnectionIds.has(n.id)
          );
          
          // Add direct connection nodes to the clean graph
          cleanGraph.nodes.push(...directNodes.filter(n => n.id !== node.id)); // Exclude the current user as we already added it
          
          // Add edges between the current user and direct connections
          cleanGraph.edges = directEdges;
          
          console.log(`Root node cleanup: Reduced from ${prevGraph.nodes.length} to ${cleanGraph.nodes.length} nodes`);
          
          return cleanGraph;
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
      
      // Load notes for the selected node
      await loadNotesForNode(node.id);
      
      // Load followers only if needed and not already loading
      if (!loading && !graph.edges.some(edge => edge.source === node.id || edge.target === node.id)) {
        console.log(`Loading followers for ${node.id} (not in graph yet)`);
        await loadFollowersForNode(node.id);
      }
      
      // Load trust scores only for the selected node (not for every node)
      // This reduces DVM queries and prevents graph jumping
      loadWebOfTrustScores(node.id);
    } else {
      setUserNotes([]);
      setNotesError(null);
      // Reset notes tracking
      notesLoadedForNodeRef.current = null;
      // Don't modify the navigation stack when deselecting
    }
  }, [loadNotesForNode, loadFollowersForNode, navigationStack, graph.edges, loading, loadWebOfTrustScores, selectedNode]);
  
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
    formatTrustScore,
    navigationStack,
    isConnectedToRelays,
    isConnectedToVertex,
    activeSubscriptions,
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
    navigationStack,
    isConnectedToRelays,
    isConnectedToVertex,
    activeSubscriptions,
    loadFollowersForNode
  ]);
  
  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  );
}; 