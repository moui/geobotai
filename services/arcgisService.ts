import { ArcGisQueryResult, GeoJSONCollection, LayerMetadata, ArcGISLayerInfo } from '../types';

// Store the token in memory for the session
let sessionToken: string | null = null;
// Store active layer configurations in memory so queryLayer knows where to look
let activeLayers: LayerMetadata[] = [];

export const setActiveLayers = (layers: LayerMetadata[]) => {
  activeLayers = layers;
};

export const setSessionToken = (token: string) => {
  sessionToken = token;
};

/**
 * Maps Esri Field Types to simplified types for the AI
 */
const mapEsriType = (esriType: string): string => {
  switch (esriType) {
    case 'esriFieldTypeString': return 'STRING';
    case 'esriFieldTypeInteger': 
    case 'esriFieldTypeSmallInteger':
    case 'esriFieldTypeOID': return 'INTEGER';
    case 'esriFieldTypeDouble':
    case 'esriFieldTypeSingle': return 'FLOAT';
    case 'esriFieldTypeDate': return 'DATE';
    case 'esriFieldTypeGeometry': return 'GEOMETRY';
    case 'esriFieldTypeBlob': return 'BLOB';
    case 'esriFieldTypeGlobalID': return 'STRING';
    case 'esriFieldTypeGUID': return 'STRING';
    case 'esriFieldTypeXML': return 'XML';
    default: return 'STRING'; // Default fallback
  }
};

/**
 * Fetches metadata (Schema, Description, Aliases) from the ArcGIS Service JSON endpoint
 */
export const fetchLayerMetadata = async (id: string, url: string): Promise<LayerMetadata> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const params = new URLSearchParams({ f: 'json' });
    if (sessionToken) params.append('token', sessionToken);

    const response = await fetch(`${url}?${params.toString()}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Failed to fetch metadata for ${url}`);
    
    const data: ArcGISLayerInfo = await response.json();

    if ((data as any).error) {
      throw new Error(`ArcGIS Error: ${(data as any).error.message}`);
    }

    return {
      id,
      url,
      name: data.name,
      description: data.description || "No description provided by service.",
      geometryType: data.geometryType,
      fields: data.fields ? data.fields.map(f => ({
        name: f.name,
        type: mapEsriType(f.type),
        alias: f.alias
      })) : []
    };
  } catch (error) {
    console.warn(`Could not load metadata for ${id}. Using basic fallback.`, error);
    // Fallback if metadata fails
    return {
      id,
      url,
      name: id,
      description: "Metadata could not be loaded. Please ensure the URL is correct and accessible.",
      geometryType: "Unknown",
      fields: []
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Authenticates against an ArcGIS Portal/Server to generate a token.
 */
export const generateToken = async (username: string, password: string, portalUrl: string): Promise<string> => {
  // Ensure we have a valid base URL without trailing slash
  let cleanUrl = portalUrl.trim().replace(/\/$/, '');
  
  // Try to intelligently append the token endpoint if not present
  if (cleanUrl.endsWith('/sharing/rest')) {
      // url is good
  } else if (cleanUrl.endsWith('/sharing')) {
      cleanUrl = `${cleanUrl}/rest`;
  } else if (!cleanUrl.includes('/sharing/rest')) {
      cleanUrl = `${cleanUrl}/sharing/rest`;
  }
  
  const tokenUrl = `${cleanUrl}/generateToken`;

  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);
  formData.append('client', 'referer');
  formData.append('referer', window.location.origin); // Use current origin
  formData.append('expiration', '60');
  formData.append('f', 'json');

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") === -1) {
       // Response is not JSON (likely HTML error page from web server)
       throw new Error(`Auth Error: Server returned non-JSON response. Check Portal URL.`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Auth Error: ${data.error.message || 'Invalid credentials or permissions.'}`);
    }

    if (!data.token) {
      throw new Error('Auth Error: No token received in response.');
    }

    sessionToken = data.token;
    return data.token;
  } catch (error) {
    console.error("Token Generation Failed:", error);
    throw error;
  }
};

/**
 * Strictly validates and cleans coordinate arrays.
 * Returns null if any coordinate is NaN or invalid.
 */
function validateCoordinates(coords: any): any {
  if (!Array.isArray(coords)) return null;

  // If leaf node (coordinate pair)
  if (coords.length >= 2 && typeof coords[0] !== 'object' && typeof coords[1] !== 'object') {
    const x = Number(coords[0]);
    const y = Number(coords[1]);
    
    // Strict check: must be finite numbers
    if (Number.isFinite(x) && Number.isFinite(y)) {
      // Normalize to 2D for now to ensure consistency, Leaflet ignores Z anyway
      return [x, y];
    }
    return null;
  }

  // Recursive check for arrays of arrays (Lines, Polygons)
  const cleaned = coords.map(c => validateCoordinates(c)).filter(c => c !== null);
  
  // If we lost data due to validation, the geometry is likely corrupt.
  // CRITICAL FIX: If cleaned length is 0 (all points filtered), return null.
  if (cleaned.length === 0 || cleaned.length !== coords.length) return null;
  
  return cleaned;
}

/**
 * Converts ArcGIS JSON geometry to GeoJSON
 */
function arcgisToGeoJSON(arcgisResult: ArcGisQueryResult): GeoJSONCollection {
  if (!arcgisResult.features) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = arcgisResult.features
    .map((f, index) => {
      let geometry: any = null;
      const geom = f.geometry as any;

      if (geom) {
        // Point
        if ('x' in geom) {
           const x = Number(geom.x);
           const y = Number(geom.y);
           if (Number.isFinite(x) && Number.isFinite(y)) {
             geometry = {
                type: 'Point',
                coordinates: [x, y]
             };
           }
        } 
        // Multipoint
        else if ('points' in geom && Array.isArray(geom.points) && geom.points.length > 0) {
           const validPoints = validateCoordinates(geom.points);
           if (validPoints && validPoints.length > 0) {
             geometry = {
                type: 'MultiPoint',
                coordinates: validPoints
             };
           }
        }
        // LineString / MultiLineString (Paths)
        else if ('paths' in geom && Array.isArray(geom.paths) && geom.paths.length > 0) {
          const validPaths = validateCoordinates(geom.paths);
          if (validPaths && validPaths.length > 0) {
            // Check if it's a single path (LineString) or multiple (MultiLineString)
            if (validPaths.length === 1) {
                geometry = {
                    type: 'LineString',
                    coordinates: validPaths[0]
                };
            } else {
                geometry = {
                    type: 'MultiLineString',
                    coordinates: validPaths
                };
            }
          }
        } 
        // Polygon / MultiPolygon (Rings)
        else if ('rings' in geom && Array.isArray(geom.rings) && geom.rings.length > 0) {
           const validRings = validateCoordinates(geom.rings);
           if (validRings && validRings.length > 0) {
             geometry = {
               type: 'Polygon',
               coordinates: validRings
             };
           }
        }
      }

      const attributes = f.attributes || {};
      const id = attributes.objectid || attributes.OBJECTID || index;

      return {
        type: 'Feature',
        id: id,
        properties: attributes,
        geometry: geometry // Can be null (for table rows or stats, or corrupt geom)
      };
    })
    .filter(f => f !== null);

  return {
    type: 'FeatureCollection',
    features: features as any[] 
  };
}

export const queryLayer = async (
  layerId: string, 
  where: string, 
  limit: number = 50,
  groupByFields?: string,
  outStatistics?: string
): Promise<GeoJSONCollection | null> => {
  
  // Look up URL from the active layers loaded in memory
  const layerConfig = activeLayers.find(l => l.id === layerId);
  
  if (!layerConfig) {
    throw new Error(`Layer with ID "${layerId}" not found. Available layers: ${activeLayers.map(l => l.id).join(', ')}`);
  }

  const url = layerConfig.url;
  const safeWhere = where && where.trim() !== '' ? where : '1=1';
  
  // If aggregating, we usually don't want geometry unless specifically requested
  const returnGeometry = (!groupByFields && !outStatistics).toString();

  const params = new URLSearchParams({
    where: safeWhere,
    outFields: '*',
    f: 'json',
    resultRecordCount: limit.toString(),
    outSR: '4326', // Request WGS84
    returnGeometry: returnGeometry
  });

  // Support Aggregation
  if (groupByFields) {
    params.append('groupByFieldsForStatistics', groupByFields);
  }

  if (outStatistics) {
    params.append('outStatistics', outStatistics);
  }

  if (sessionToken) {
    params.append('token', sessionToken);
  }

  try {
    const response = await fetch(`${url}/query?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`ArcGIS API Error: ${response.statusText}`);
    }
    const data: ArcGisQueryResult = await response.json();
    
    if ((data as any).error) {
      const errCode = (data as any).error.code;
      if (errCode === 498 || errCode === 499) {
         throw new Error(`ArcGIS Auth Error: Invalid or expired token. Please ask the user to log in again.`);
      }
      throw new Error(`ArcGIS Error: ${(data as any).error.message}`);
    }

    return arcgisToGeoJSON(data);
  } catch (error) {
    console.error("ArcGIS Query Failed:", error);
    throw error;
  }
};

/**
 * Converts a GeoJSON geometry object into an ArcGIS Geometry Object (JSON)
 */
const geoJSONGeometryToEsri = (geometry: any) => {
    if (!geometry) return null;
    
    const spatialReference = { wkid: 4326 };
    
    if (geometry.type === 'Point') {
        return {
            geometryType: 'esriGeometryPoint',
            geometry: JSON.stringify({
                x: geometry.coordinates[0],
                y: geometry.coordinates[1],
                spatialReference
            })
        };
    }
    if (geometry.type === 'MultiPoint') {
        return {
            geometryType: 'esriGeometryMultipoint',
            geometry: JSON.stringify({
                points: geometry.coordinates,
                spatialReference
            })
        };
    }
    if (geometry.type === 'Polygon') {
        return {
            geometryType: 'esriGeometryPolygon',
            geometry: JSON.stringify({
                rings: geometry.coordinates,
                spatialReference
            })
        };
    }
    if (geometry.type === 'MultiPolygon') {
         // Flatten MultiPolygon to simple Polygon with multiple rings (ArcGIS Style)
         return {
            geometryType: 'esriGeometryPolygon',
            geometry: JSON.stringify({
                rings: geometry.coordinates.flat(1), 
                spatialReference
            })
        };
    }
    if (geometry.type === 'LineString') {
        return {
           geometryType: 'esriGeometryPolyline',
           geometry: JSON.stringify({
               paths: [geometry.coordinates],
               spatialReference
           })
       };
   }
    if (geometry.type === 'MultiLineString') {
         return {
            geometryType: 'esriGeometryPolyline',
            geometry: JSON.stringify({
                paths: geometry.coordinates,
                spatialReference
            })
        };
    }
    return null;
};

export const querySpatialLayer = async (
  targetLayerId: string,
  geometry: any, // GeoJSON geometry
  spatialRelationship: string
): Promise<GeoJSONCollection | null> => {
    
    // Look up URL from the active layers loaded in memory
    const layerConfig = activeLayers.find(l => l.id === targetLayerId);
    
    if (!layerConfig) {
      throw new Error(`Layer with ID "${targetLayerId}" not found. Available layers: ${activeLayers.map(l => l.id).join(', ')}`);
    }

    const esriGeomInfo = geoJSONGeometryToEsri(geometry);
    if (!esriGeomInfo) {
        throw new Error(`Unsupported geometry type: ${geometry?.type}`);
    }

    const url = layerConfig.url;

    const params = new URLSearchParams({
        where: '1=1',
        geometry: esriGeomInfo.geometry,
        geometryType: esriGeomInfo.geometryType,
        spatialRel: spatialRelationship,
        inSR: '4326',
        outFields: '*',
        f: 'json',
        outSR: '4326',
        returnGeometry: 'true'
    });

    if (sessionToken) {
        params.append('token', sessionToken);
    }
    
    try {
        const response = await fetch(`${url}/query?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`ArcGIS API Error: ${response.statusText}`);
        }
        const data: ArcGisQueryResult = await response.json();
        
        if ((data as any).error) {
          const errCode = (data as any).error.code;
          if (errCode === 498 || errCode === 499) {
             throw new Error(`ArcGIS Auth Error: Invalid or expired token. Please ask the user to log in again.`);
          }
          throw new Error(`ArcGIS Error: ${(data as any).error.message}`);
        }
    
        return arcgisToGeoJSON(data);
      } catch (error) {
        console.error("ArcGIS Spatial Query Failed:", error);
        throw error;
      }
};
