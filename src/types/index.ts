import { NDKUser, NDKEvent } from '@nostr-dev-kit/ndk';
import NDK from '@nostr-dev-kit/ndk';
import { SigmaNodeEventPayload } from 'react-sigma';

export interface NostrProfile {
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
  banner?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  size?: number;
  color: string;
  x?: number;
  y?: number;
  image?: string;
  isCurrentUser?: boolean;
  profile?: NostrProfile;
  trustScore?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  size?: number;
  color?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AuthContextType {
  user: NDKUser | null;
  ndk: NDK | null;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
}

export interface ProfileDetailsProps {
  user: NDKUser | null;
  notes: NDKEvent[];
  isLoading: boolean;
  error: string | null;
}

export interface NodeDetailsProps {
  node: GraphNode | null;
  onClose: () => void;
  notes: NDKEvent[];
  isLoading: boolean;
  error: string | null;
}

export interface GraphHopperProps {
  user: NDKUser | null;
  ndk: NDK | null;
}

export interface GraphControlsProps {
  zoomIn: () => void;
  zoomOut: () => void;
  resetCamera: () => void;
  selectedNode: GraphNode | null;
}

export interface GraphContextType {
  graph: GraphData;
  selectedNode: GraphNode | null;
  setSelectedNode: (node: GraphNode | null) => void;
  loading: boolean;
  error: string | null;
  loadFollowersForNode: (nodeId: string) => Promise<void>;
  currentUserPubkey: string | null;
  userNotes: NDKEvent[];
  isLoadingNotes: boolean;
  notesError: string | null;
  navigationStack: GraphNode[];
}

export interface NodeInteractionHandlerProps {
  children: React.ReactNode;
  onNodeClick: (event: SigmaNodeEventPayload) => void;
} 