export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  isError?: boolean;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any[];
  };
  properties: Record<string, any>;
}

export interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface MapLayer {
  id: string;
  name: string;
  data: GeoJSONCollection;
  color: string;
  type: 'point' | 'line' | 'polygon';
  visible: boolean;
}

export interface MapViewState {
  center: [number, number];
  zoom: number;
}

export interface ArcGisQueryResult {
  features: Array<{
    attributes: Record<string, any>;
    geometry?: {
      x?: number;
      y?: number;
      paths?: number[][][];
      rings?: number[][][];
    } | any;
  }>;
  geometryType?: string;
}

// --- Dynamic Metadata Interfaces ---

export interface LayerField {
  name: string;
  alias: string;
  type: string;
}

export interface LayerMetadata {
  id: string;
  url: string;
  name: string;
  description: string;
  geometryType: string;
  fields: LayerField[];
}

// Raw response from ArcGIS Service /json endpoint
export interface ArcGISLayerInfo {
  name: string;
  type: string;
  description: string;
  geometryType: string;
  fields: Array<{
    name: string;
    type: string;
    alias: string;
  }>;
}

export interface AppConfig {
  portalUrl: string;
  layerUrls: { id: string, url: string }[];
}