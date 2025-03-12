declare module 'react-sigma' {
  import { FC, ReactNode } from 'react';
  
  export interface SigmaNodeEventPayload {
    node: string;
    event: MouseEvent;
    preventSigmaDefault(): void;
  }
  
  export interface SigmaSettings {
    nodeProgramClasses?: {
      image?: any;
    };
    defaultNodeType?: string;
    defaultEdgeType?: string;
    labelDensity?: number;
    labelGridCellSize?: number;
    labelRenderedSizeThreshold?: number;
    labelFont?: string;
    zIndex?: boolean;
    [key: string]: any;
  }
  
  export interface SigmaContainerProps {
    style?: React.CSSProperties;
    graph: {
      nodes: any[];
      edges: any[];
    };
    settings?: SigmaSettings;
    children?: ReactNode;
  }
  
  export const SigmaContainer: FC<SigmaContainerProps>;
  export const ControlsContainer: FC<{ position: string; children?: ReactNode }>;
  export const ZoomControl: FC;
  export const FullScreenControl: FC;
}

declare module 'sigma' {
  export class Sigma {
    on(event: string, callback: (event: any) => void): void;
  }
}

declare module 'sigma/rendering' {
  export class NodeCircleProgram {
    constructor();
  }
  
  export class NodePointProgram {
    constructor();
  }
}

declare module 'graphology-layout-forceatlas2' {
  import { AbstractGraph } from 'graphology-types';
  
  export interface ForceAtlasSettings {
    gravity?: number;
    scalingRatio?: number;
    slowDown?: number;
    barnesHutOptimize?: boolean;
    barnesHutTheta?: number;
    [key: string]: any;
  }
  
  export interface ForceAtlasOptions {
    settings: ForceAtlasSettings;
    iterationsPerRender?: number;
    timeout?: number;
  }
  
  export default class ForceAtlas2 {
    static assign(options: ForceAtlasOptions, context: any): { stop: () => void };
  }
}

declare module 'graphology-types' {
  export interface Attributes {
    [key: string]: any;
  }
  
  export interface AbstractGraph<
    NodeAttributes extends Attributes = Attributes,
    EdgeAttributes extends Attributes = Attributes,
    GraphAttributes extends Attributes = Attributes
  > {
    [key: string]: any;
  }
} 