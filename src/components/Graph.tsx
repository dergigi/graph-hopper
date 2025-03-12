'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { NodeDetails } from './NodeDetails';
import { useGraph } from './GraphProvider';
import { Footer } from './Footer';
import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '../types/index';
import { hexToNpub } from '../utils/vertex'; // Import the utility function

// Extended type for simulation nodes
type SimNode = GraphNode & d3.SimulationNodeDatum & {
  npub?: string; // Add npub field to the type
};
// Extended type for simulation links
type SimLink = d3.SimulationLinkDatum<SimNode> & GraphEdge;

// Add a utility function near the top of the file, after imports
const safeHexToNpub = (id: string | undefined): string => {
  try {
    if (!id) {
      console.warn('Empty or undefined id provided to safeHexToNpub');
      return 'invalid-id';
    }
    return hexToNpub(id);
  } catch (error) {
    console.error('Error in safeHexToNpub:', error);
    return 'invalid-id';
  }
};

export const GraphVisualization = () => {
  const { 
    graph, 
    selectedNode, 
    setSelectedNode, 
    loadFollowersForNode,
    currentUserPubkey,
    formatTrustScore,
    navigationStack,
    userNotes,
    isLoadingNotes,
    notesError,
    isLoadingTrustScores
  } = useGraph();

  // Convert to GraphData type for D3 visualization
  const graphData = graph || { nodes: [], edges: [] };
  
  // Track whether the component is initially rendering
  const isFirstRenderRef = useRef<boolean>(true); // Use ref instead of state to avoid re-renders
  
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  
  // Add ref for tracking graph hash to prevent unnecessary updates
  const lastGraphHashRef = useRef<string>('');
  
  // Debug the graph data without causing renders
  useEffect(() => {
    console.log("Graph data updated:", {
      nodes: graphData.nodes.length,
      edges: graphData.edges.length,
      currentUserPubkey,
      isFirstRender: isFirstRenderRef.current
    });
    
    // Check if container is available
    if (containerRef.current) {
      console.log("Container dimensions:", {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    } else {
      console.warn("Container ref is not available");
    }
    
    // Check if SVG is available
    if (svgRef.current) {
      console.log("SVG element is available");
    } else {
      console.warn("SVG ref is not available");
    }
  }, [graphData, currentUserPubkey]);
  
  // Center on current user when graph is first created - separate effect to avoid re-renders
  useEffect(() => {
    if (currentUserPubkey && isFirstRenderRef.current && graphData.nodes.length > 0) {
      console.log("First render with data, will center on current user", currentUserPubkey);
      
      // Set first render flag to false to prevent this from running again
      isFirstRenderRef.current = false;
      
      // Allow time for D3 to initialize before trying to center
      setTimeout(() => {
        if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
        
        // Find current user node
        const currentUserNode = graphData.nodes.find(node => node.id === currentUserPubkey);
        if (!currentUserNode || currentUserNode.x === undefined || currentUserNode.y === undefined) {
          console.warn("Cannot center on current user - position unknown");
          return;
        }
        
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        
        console.log("Centering on current user node", {
          x: currentUserNode.x, 
          y: currentUserNode.y
        });
        
        const scale = 1.5; // Slightly zoomed in
        const translateX = width / 2 - currentUserNode.x * scale;
        const translateY = height / 2 - currentUserNode.y * scale;
        
        // Apply zoom transform
        d3.select(svgRef.current)
          .transition()
          .duration(750)
          .call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
      }, 500);
    }
  }, [currentUserPubkey, graphData.nodes]);
  
  // Handle node selection with proper typing
  const handleNodeSelect = useCallback(async (nodeId: string, nodeX?: number, nodeY?: number) => {
    if (!graphData.nodes.length) return;
    
    // Find the clicked node
    const clickedNode = graphData.nodes.find(node => node.id === nodeId);
    if (!clickedNode) return;
    
    console.log("Selecting node:", clickedNode);
    
    // Set the selected node and load notes (handled in the context now)
    setSelectedNode(clickedNode);
    
    // Load the followers for this node
    await loadFollowersForNode(nodeId);
    
    // Always center the view on the clicked node
    centerNodeInViewport(nodeId, nodeX, nodeY);
  }, [selectedNode, setSelectedNode, loadFollowersForNode, graphData.nodes]);
  
  // Center a node in the viewport
  const centerNodeInViewport = useCallback((nodeId: string, nodeX?: number, nodeY?: number) => {
    if (
      (nodeX === undefined || nodeY === undefined) &&
      svgRef.current
    ) {
      // Find the node in the DOM if coordinates weren't provided
      const nodeElement = svgRef.current.querySelector(`g.node[data-id="${nodeId}"]`);
      if (nodeElement) {
        const transform = nodeElement.getAttribute('transform');
        if (transform) {
          const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
          if (match) {
            nodeX = parseFloat(match[1]);
            nodeY = parseFloat(match[2]);
          }
        }
      } else {
        console.warn(`Node element with data-id="${nodeId}" not found in SVG`);
      }
    }
    
    if (nodeX !== undefined && nodeY !== undefined && containerRef.current && svgRef.current && zoomRef.current) {
      console.log("Centering viewport on:", {nodeId, nodeX, nodeY});
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      // Calculate the position to center the view on the node
      const scale = 1.2; // Slightly zoomed in
      const translateX = width / 2 - nodeX * scale;
      const translateY = height / 2 - nodeY * scale;
      
      // Apply smooth transition to the new view
      d3.select(svgRef.current)
        .transition()
        .duration(750)
        .call(
          zoomRef.current.transform,
          d3.zoomIdentity.translate(translateX, translateY).scale(scale)
        );
    } else {
      console.warn("Unable to center viewport - missing required references or coordinates", {
        hasNodeX: nodeX !== undefined,
        hasNodeY: nodeY !== undefined,
        hasContainer: !!containerRef.current,
        hasSvg: !!svgRef.current,
        hasZoom: !!zoomRef.current
      });
    }
  }, []);
  
  const closeNodeDetails = () => {
    setSelectedNode(null);
  };
  
  // D3 graph visualization - stabilized to prevent constant refreshing
  useEffect(() => {
    console.log("Running D3 graph visualization effect");
    
    if (!svgRef.current || !containerRef.current) {
      console.warn("Skipping D3 visualization - missing refs", {
        hasSvgRef: !!svgRef.current,
        hasContainerRef: !!containerRef.current
      });
      return;
    }
    
    // Check if we have graph data
    if (graphData.nodes.length === 0) {
      console.log("No graph data available, showing placeholder");
      
      // Clear any existing graph
      d3.select(svgRef.current).selectAll("*").remove();
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      // Create an SVG element for the placeholder
      const svg = d3.select(svgRef.current)
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);
      
      // Add a placeholder message
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "currentColor")
        .attr("class", "text-lg text-gray-500 dark:text-gray-400")
        .text("Initializing your Nostr graph...");
      
      return;
    }
    
    // Skip unnecessary updates - use a JSON hash to compare graph states
    const graphHash = JSON.stringify({
      nodeIds: graphData.nodes.map(n => n.id).sort().join(','),
      edgeIds: graphData.edges.map(e => e.id).sort().join(','),
      selectedId: selectedNode?.id || 'none'
    });
    
    // If the graph hasn't changed (same nodes, edges, and selection), skip update
    // Only add this optimization after initial render
    if (!isFirstRenderRef.current && graphHash === lastGraphHashRef.current) {
      console.log("Graph hasn't changed, skipping D3 update");
      return;
    }
    
    // Update the hash reference
    lastGraphHashRef.current = graphHash;
    
    // If we get here, we have graph data to visualize
    
    // Calculate trust score color based on value
    const getScoreColor = (score: number): string => {
      if (score >= 0.8) return '#10B981'; // Green
      if (score >= 0.6) return '#22C55E'; // Light green
      if (score >= 0.4) return '#FBBF24'; // Yellow
      if (score >= 0.2) return '#F97316'; // Orange
      return '#EF4444'; // Red
    };
    
    // Clear any existing graph
    d3.select(svgRef.current).selectAll("*").remove();
    
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    console.log("Container dimensions for D3:", {width, height});
    
    // Ensure the container has size before proceeding
    if (width === 0 || height === 0) {
      console.warn("Container has zero width or height, D3 visualization may not work");
    }
    
    // Convert hex pubkeys to npubs for display
    const nodeObjects = graphData.nodes.map(node => ({
      ...node,
      // Store the npub version of the ID for display
      npub: safeHexToNpub(node.id),
      // Initialize D3 simulation properties with explicit positioning
      x: node.x !== undefined ? node.x : width / 2 + (Math.random() - 0.5) * 200,
      y: node.y !== undefined ? node.y : height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      index: undefined,
      fx: undefined,
      fy: undefined
    }));
    
    console.log("Processed node objects:", nodeObjects.length);
    
    // Create a proper copy of links with references to node objects
    const linkObjects = graphData.edges.map(edge => {
      const source = nodeObjects.find(n => n.id === edge.source) || edge.source;
      const target = nodeObjects.find(n => n.id === edge.target) || edge.target;
      return { ...edge, source, target };
    });
    
    console.log("Processed link objects:", linkObjects.length);
    
    try {
      // Create the SVG elements
      const svg = d3.select(svgRef.current)
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height]);
      
      // Add zoom functionality
      const g = svg.append("g")
        .attr("class", "graph-container");
      
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .extent([[0, 0], [width, height]])
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        });
      
      svg.call(zoom);
      
      // Save zoom instance for later use
      zoomRef.current = zoom;
      
      // Create the simulation with proper typing
      const simulation = d3.forceSimulation<SimNode>()
        .nodes(nodeObjects as SimNode[])
        .force("link", d3.forceLink<SimNode, SimLink>(
          linkObjects as SimLink[]
        ).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-700))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("x", d3.forceX(width / 2).strength(0.1))
        .force("y", d3.forceY(height / 2).strength(0.1))
        // Reduce the number of iterations to make it less jumpy
        .alphaDecay(0.05) // Faster convergence
        .alpha(0.3) // Start with lower energy
        .alphaTarget(0); // Target zero movement
      
      console.log("D3 simulation created");
      
      // Create edges
      const link = g.append("g")
        .attr("class", "links")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .selectAll<SVGLineElement, SimLink>("line")
        .data(linkObjects as SimLink[])
        .join("line")
        .attr("stroke-width", d => d.size || 1)
        .attr("marker-end", "url(#arrowhead)");
      
      // Add arrowhead marker for directed edges
      svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#999");
      
      // Add defs for profile image clipping
      const defs = svg.append("defs");
      defs.append("clipPath")
        .attr("id", "circle-clip")
        .append("circle")
        .attr("r", 15);
      
      // Create node groups
      const node = g.append("g")
        .attr("class", "nodes")
        .selectAll<SVGGElement, SimNode>(".node")
        .data(nodeObjects as SimNode[])
        .join("g")
        .attr("class", "node")
        .attr("data-id", d => d.id) // Add data-id for easy selection
        .on("click", (event, d) => {
          event.stopPropagation();
          handleNodeSelect(d.id, d.x, d.y);
        })
        .call(
          d3.drag<SVGGElement, SimNode>()
            .on("start", (event, d) => dragstarted(event, d))
            .on("drag", (event, d) => dragged(event, d))
            .on("end", (event, d) => dragended(event, d))
        );
      
      // Add circles for nodes background (will show if image fails or is missing)
      node.append("circle")
        .attr("r", 15)
        .attr("fill", d => d.color || '#1E88E5')
        .attr("stroke", d => (selectedNode && d.id === selectedNode.id) ? "#FF5722" : 
                            (d.isCurrentUser === true) ? "#FFC107" : "#fff")
        .attr("stroke-width", d => (selectedNode && d.id === selectedNode.id) || d.isCurrentUser === true ? 3 : 1.5);
      
      // Add profile images to nodes
      node.append("image")
        .attr("xlink:href", d => d.profile?.picture || '')
        .attr("x", -15)
        .attr("y", -15)
        .attr("width", 30)
        .attr("height", 30)
        .attr("clip-path", "url(#circle-clip)")
        .attr("preserveAspectRatio", "xMidYMid slice")
        .style("opacity", 0) // Start invisible
        .on("load", function() {
          // Make visible when loaded
          d3.select(this).style("opacity", 1);
        })
        .on("error", function() {
          // Hide if error loading
          d3.select(this).style("opacity", 0);
        });
      
      // Add initials for nodes without images
      node.append("text")
        .attr("class", "node-initial")
        .attr("text-anchor", "middle")
        .attr("dy", ".35em")
        .attr("fill", "white")
        .attr("pointer-events", "none")
        .text(d => {
          const label = d.label || 'U';
          return label.charAt(0).toUpperCase();
        });
      
      // Add trust score badges to nodes
      node.append("g")
        .attr("class", "trust-score-badge")
        .attr("transform", "translate(15, -15)")
        .each(function(d) {
          const trustScore = d.trustScore !== undefined ? d.trustScore : 0;
          if (trustScore > 0) {
            const badge = d3.select(this);
            badge.append("circle")
              .attr("r", 10)
              .attr("fill", getScoreColor(trustScore));
            
            badge.append("text")
              .attr("text-anchor", "middle")
              .attr("dy", ".35em")
              .attr("fill", "white")
              .attr("font-size", "10px")
              .attr("font-weight", "bold")
              .text(formatTrustScore(trustScore));
          }
        });
      
      // Add a trust score ring around nodes with scores
      node.each(function(d) {
        const trustScore = d.trustScore !== undefined ? d.trustScore : 0;
        if (trustScore > 0) {
          d3.select(this).append("circle")
            .attr("r", 18)
            .attr("fill", "none")
            .attr("stroke", getScoreColor(trustScore))
            .attr("stroke-width", 2)
            .attr("opacity", 0.8);
        }
      });
      
      // Add title with full npub for hover tooltip
      node.append("title")
        .text(d => {
          const label = d.label || 'Unknown';
          const npub = d.npub || 'invalid-id';
          const score = d.trustScore !== undefined ? ` (Trust Score: ${formatTrustScore(d.trustScore)})` : '';
          return `${label}\n${npub}${score}`;
        });
      
      // Add selection ring to highlight the selected node
      if (selectedNode) {
        const selectedNodes = node.filter(d => d.id === selectedNode.id);
        
        // Highlight
        selectedNodes.select("circle")
          .attr("stroke", "#FF5722")
          .attr("stroke-width", 3);
        
        // Add selection indicator
        selectedNodes.append("circle")
          .attr("r", 20)
          .attr("fill", "none")
          .attr("stroke", "#FF5722")
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "3,3")
          .attr("class", "selection-indicator");
        
        // Center view on the selected node if it exists in the graph
        if (selectedNodes.size() > 0) {
          const selectedData = selectedNodes.datum();
          if (selectedData && selectedData.x !== undefined && selectedData.y !== undefined) {
            console.log("Found selected node in graph, centering view", {
              id: selectedData.id,
              x: selectedData.x,
              y: selectedData.y
            });
            // Use a small delay to allow the graph to settle first
            setTimeout(() => {
              handleNodeSelect(selectedNode.id, selectedData.x, selectedData.y);
            }, 100);
          }
        }
      }
      
      // Highlight current user node
      node.filter(d => d.isCurrentUser === true)
        .select("circle")
        .attr("stroke", "#FFC107")
        .attr("stroke-width", 3);
      
      // Define drag handlers
      function dragstarted(event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      
      function dragged(event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) {
        d.fx = event.x;
        d.fy = event.y;
      }
      
      function dragended(event: d3.D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      
      // Update positions on each tick
      simulation.on("tick", () => {
        link
          .attr("x1", d => {
            const source = d.source as SimNode;
            return source.x || 0;
          })
          .attr("y1", d => {
            const source = d.source as SimNode;
            return source.y || 0;
          })
          .attr("x2", d => {
            const target = d.target as SimNode;
            return target.x || 0;
          })
          .attr("y2", d => {
            const target = d.target as SimNode;
            return target.y || 0;
          });
        
        node
          .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`);
      });
      
      // Double-click on background to reset zoom
      svg.on("dblclick.zoom", () => {
        svg.transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity.translate(0, 0).scale(1)
          );
      });
      
      // Pause simulation after a short time to stabilize the graph
      setTimeout(() => {
        console.log("Pausing simulation to stabilize graph");
        simulation.alphaTarget(0).alpha(0).stop();
      }, 3000);
      
      // Add debug outline to svg container
      svg.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "5,5");
      
      // Cleanup function
      return () => {
        console.log("Cleaning up D3 simulation");
        simulation.stop();
      };
    } catch (error) {
      console.error("Error in D3 graph visualization:", error);
    }
  }, [graphData, selectedNode, handleNodeSelect, currentUserPubkey]);
  
  if (graphData.nodes.length === 0) {
    console.log("No graph data available, showing placeholder");
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <h3 className="text-xl font-semibold mb-2">No Graph Data</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Please log in to view your social graph
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }
  
  // Separate the current user node and other nodes
  const currentUserNode = graphData.nodes.find(node => node.id === currentUserPubkey);
  
  // Sort other nodes by trust score (highest first)
  const sortedOtherNodes = graphData.nodes
    .filter(node => node && node.id !== currentUserPubkey) // Add null check
    .sort((a, b) => {
      // First by trust score (high to low)
      const scoreA = a.trustScore || 0;
      const scoreB = b.trustScore || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      
      // Then alphabetically by label (safely handle undefined labels)
      const labelA = a.label || 'Unknown';
      const labelB = b.label || 'Unknown';
      return labelA.localeCompare(labelB);
    });
  
  console.log("Rendering with graph data:", {
    total: graphData.nodes.length,
    currentUser: currentUserNode ? 1 : 0,
    others: sortedOtherNodes.length
  });
  
  // Create a node item component for reuse
  const NodeItem = ({ node, isInStack = false }: { node: GraphNode, isInStack?: boolean }) => {
    // Skip rendering completely if node is undefined
    if (!node) {
      console.warn("Received undefined node in NodeItem");
      return null;
    }

    // Generate a safe key
    const nodeKey = `${isInStack ? 'stack' : 'node'}-${node.id || 'unknown'}`;
    
    const isSelected = selectedNode && selectedNode.id === node.id;
    const nodeId = node.id || '';
    const npub = safeHexToNpub(nodeId);
    const trustScore = node.trustScore !== undefined ? node.trustScore : 0;
    const displayScore = formatTrustScore(trustScore);
    const nodeLabel = node.label || 'Unknown';
    const nodeColor = node.color || '#3B82F6';
    
    // Calculate score color based on value
    // Green for high scores, yellow for medium, orange for low, red for very low
    const getScoreColor = (score: number): string => {
      if (score >= 0.8) return '#10B981'; // Green
      if (score >= 0.6) return '#22C55E'; // Light green
      if (score >= 0.4) return '#FBBF24'; // Yellow
      if (score >= 0.2) return '#F97316'; // Orange
      return '#EF4444'; // Red
    };
    
    return (
      <div 
        key={nodeKey}
        onClick={() => nodeId && handleNodeSelect(nodeId)}
        className={`p-3 mb-2 rounded cursor-pointer transition-colors ${
          isSelected ? 
          'bg-blue-100 dark:bg-blue-900 border-2 border-blue-400 dark:border-blue-600' : 
          isInStack ?
          'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600' :
          'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
        title={npub}
      >
        <div className="flex items-center">
          {/* Avatar with trust score ring */}
          <div className="relative mr-3 flex-shrink-0">
            {/* Trust score ring */}
            {trustScore > 0 && (
              <div 
                className="absolute inset-0 rounded-full"
                style={{
                  border: `2px solid ${getScoreColor(trustScore)}`,
                  transform: 'scale(1.1)',
                  zIndex: 1
                }}
              ></div>
            )}
            
            {/* Profile picture */}
            {node.profile?.picture ? (
              <img 
                src={node.profile.picture} 
                alt={nodeLabel}
                className="w-8 h-8 rounded-full object-cover z-10 relative"
                onError={(e) => {
                  // Fallback on error
                  const imgElement = e.target as HTMLImageElement;
                  imgElement.style.display = 'none';
                  const fallbackElement = imgElement.nextElementSibling as HTMLElement;
                  if (fallbackElement) {
                    fallbackElement.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            
            {/* Fallback avatar */}
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white z-10 relative ${node.profile?.picture ? 'hidden' : ''}`}
              style={{ backgroundColor: nodeColor }}
            >
              {nodeLabel.charAt(0).toUpperCase()}
            </div>
          </div>
          
          <div className="truncate">
            <div className="font-semibold text-sm">{nodeLabel}</div>
            <div className="text-xs text-gray-500 font-mono truncate">{npub.substring(0, 10)}...</div>
          </div>
          
          {/* Trust score badge */}
          {trustScore > 0 && (
            <div className="ml-auto flex-shrink-0 flex items-center">
              <div 
                className="text-white text-xs font-bold px-2 py-1 rounded-full"
                style={{ backgroundColor: getScoreColor(trustScore) }}
              >
                {displayScore}
              </div>
            </div>
          )}
          
          {/* Selected indicator */}
          {isSelected && (
            <div className="ml-2 flex-shrink-0">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="relative h-screen flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar with node list */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
          <div className="p-4 overflow-y-auto flex-1">
            <h2 className="text-lg font-semibold mb-4">Nodes ({graphData.nodes.length})</h2>
            
            {/* Navigation Stack - only show if we have nodes in the stack */}
            {navigationStack.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-1">
                    <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                  Navigation Path
                </h3>
                <div className="space-y-1">
                  {navigationStack.map((node, index) => (
                    <NodeItem key={`nav-stack-${node.id}-${index}`} node={node} isInStack={true} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Current user at the top - only show if not already in navigation stack */}
            {currentUserNode && navigationStack.length === 0 && (
              <>
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Your Profile</h3>
                  <NodeItem key={`current-user-${currentUserNode.id}`} node={currentUserNode} />
                </div>
                
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">
                    Following ({sortedOtherNodes.length})
                    {isLoadingTrustScores && (
                      <span className="ml-2 text-xs text-blue-500">
                        Loading trust scores...
                      </span>
                    )}
                  </h3>
                </div>
              </>
            )}
            
            {/* If we have a navigation stack, show "Other Nodes" section */}
            {navigationStack.length > 0 && (
              <div className="mb-3">
                <h3 className="text-sm font-medium text-gray-500 mb-2">
                  Other Nodes ({sortedOtherNodes.length})
                  {isLoadingTrustScores && (
                    <span className="ml-2 text-xs text-blue-500">
                      Loading trust scores...
                    </span>
                  )}
                </h3>
              </div>
            )}
            
            {/* Other nodes below, sorted by trust score */}
            <div>
              {sortedOtherNodes
                // Filter out nodes that are already in the navigation stack
                .filter(node => !navigationStack.some(stackNode => stackNode.id === node.id))
                .map((node, index) => (
                  <NodeItem key={`other-node-${node.id}-${index}`} node={node} />
                ))
              }
            </div>
          </div>
        </div>
        
        {/* Main content area - D3 graph visualization */}
        <div 
          ref={containerRef}
          className="flex-1 bg-gray-50 dark:bg-gray-900 relative border border-gray-300 dark:border-gray-700"
          style={{ height: "100%" }}
        >
          <div className="absolute top-2 left-2 z-10 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-lg opacity-80">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {graphData.nodes.length} nodes / {graphData.edges.length} connections
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Showing follow connections with trust scores from Vertex DVM
            </p>
          </div>
          
          <div className="absolute bottom-4 right-4 z-10 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-lg opacity-80 text-sm">
            <p>📌 Click node to select</p>
            <p>🖱️ Drag to move nodes</p>
            <p>🔍 Scroll to zoom</p>
            <p>💥 Double-click to reset view</p>
          </div>
          
          <svg ref={svgRef} className="w-full h-full absolute top-0 left-0"></svg>
          
          {graphData.nodes.length > 0 && graphData.edges.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 bg-opacity-80 dark:bg-opacity-80">
              <div className="text-center p-8 bg-white dark:bg-gray-700 rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold mb-2">No Connections Found</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  We found nodes but no connections between them.
                </p>
                <button
                  onClick={() => currentUserPubkey && loadFollowersForNode(currentUserPubkey)}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Reload Connections
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Right sidebar with node details */}
        {selectedNode && (
          <div className="w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 h-full overflow-hidden">
            <NodeDetails 
              node={selectedNode} 
              onClose={closeNodeDetails} 
              notes={userNotes}
              isLoading={isLoadingNotes}
              error={notesError}
            />
          </div>
        )}
      </div>
      
      {/* Footer with relay information */}
      <div className="flex-shrink-0">
        <Footer />
      </div>
    </div>
  );
}; 