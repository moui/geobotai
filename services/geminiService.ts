import { GoogleGenAI, FunctionDeclaration, Tool, Type } from "@google/genai";
import { queryLayer, generateToken, setActiveLayers, querySpatialLayer } from './arcgisService';
import { generateSystemInstruction } from '../constants';
import { GeoJSONCollection, LayerMetadata } from '../types';

let chatSession: any = null;
let currentLayers: LayerMetadata[] = [];
// Cache to store layer data by ID so plot_on_map can retrieve context
const layerDataCache = new Map<string, GeoJSONCollection>();

// --- Interface for App Callbacks ---

interface ChatCallbacks {
  onMapUpdate: (lat: number, lng: number, zoom: number) => void;
  onLayerAdd: (layer: { id: string, name: string, data: GeoJSONCollection }) => void;
  onGetLayerData: (layerId: string) => GeoJSONCollection | undefined;
}

// --- Tool Definitions ---

const tools: Tool[] = [{
  functionDeclarations: [
    {
      name: 'query_layer',
      description: 'Query an ArcGIS feature layer. Supports SQL WHERE clauses, Aggregation (GroupBy), and Statistics.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          layer_name: { type: Type.STRING },
          where_clause: { type: Type.STRING },
          limit: { type: Type.NUMBER },
          group_by_fields: { type: Type.STRING, description: "Comma separated list of fields to group by." },
          out_statistics: { type: Type.STRING, description: "JSON Array String defining stats (e.g. [{'statisticType': 'sum', 'onStatisticField': 'POP', 'outStatisticFieldName': 'SumPop'}])" }
        },
        required: ['layer_name', 'where_clause']
      }
    },
    {
      name: 'update_map_view',
      description: 'Move the map to a specific location.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          latitude: { type: Type.NUMBER },
          longitude: { type: Type.NUMBER },
          zoom: { type: Type.NUMBER }
        },
        required: ['latitude', 'longitude', 'zoom']
      }
    },
    {
      name: 'plot_on_map',
      description: 'Visualize data on the map. Always call this after getting query results. Returns a summary of plotted data.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          layer_id: { type: Type.STRING },
          layer_name: { type: Type.STRING }
        },
        required: ['layer_id', 'layer_name']
      }
    },
    {
      name: 'connect_to_portal',
      description: 'Authenticate with ArcGIS Portal.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          username: { type: Type.STRING },
          password: { type: Type.STRING },
          portal_url: { type: Type.STRING }
        },
        required: ['username', 'password', 'portal_url']
      }
    },
    {
      name: 'spatial_query',
      description: 'Perform a spatial query (intersects, contains) using geometry from a previous layer.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          target_layer_id: { type: Type.STRING, description: 'Layer to query against' },
          geometry_source_layer_id: { type: Type.STRING, description: 'Layer providing the geometry' },
          spatial_relationship: { type: Type.STRING, description: 'esriSpatialRelIntersects, esriSpatialRelContains, etc.' }
        },
        required: ['target_layer_id', 'geometry_source_layer_id', 'spatial_relationship']
      }
    }
  ]
}];

// --- Initialization ---

export const startChatSession = async (layers: LayerMetadata[]): Promise<void> => {
  setActiveLayers(layers);
  currentLayers = layers;
  layerDataCache.clear();

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  chatSession = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: generateSystemInstruction(layers),
      tools: tools
    }
  });

  console.log("Client-Side Gemini Session Initialized");
};

// --- Helper to strictly sanitize tool results ---

// Recursively clean object for Protobuf Struct.
// CRITICAL FIX: Replace null/undefined with explicit strings.
// The SDK fails if values are null or undefined in some contexts (ContentUnion error).
const cleanForStruct = (obj: any): any => {
  if (obj === undefined) return "undefined";
  if (obj === null) return "null";
  
  if (Array.isArray(obj)) {
    // Map all items, preserving structure
    return obj.map(cleanForStruct);
  }
  
  if (typeof obj === 'object') {
    const newObj: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = cleanForStruct(obj[key]);
      }
    }
    return newObj;
  }
  
  return obj;
};

// Fixes "ContentUnion is required" by strictly enforcing Record<string, any> return type
// and ensuring NO null/undefined values exist in the object.
const sanitizeToolResult = (result: any): Record<string, any> => {
  if (result === undefined || result === null) {
    return { status: 'no_data' };
  }
  
  try {
    let cleanResult = result;
    
    // 1. Wrap primitives because Struct must be an object
    if (typeof result !== 'object' || Array.isArray(result)) {
       cleanResult = { result: result };
    }
    
    // 2. Deep Clean (convert nulls to strings)
    const sanitized = cleanForStruct(cleanResult);

    // 3. Ensure we return a non-empty object
    if (!sanitized || (typeof sanitized === 'object' && Object.keys(sanitized).length === 0)) {
        return { status: 'success', note: 'Operation completed (no data returned)' }; 
    }
    
    return sanitized;

  } catch (e) {
    return { error: 'failed_to_serialize_tool_output' };
  }
};

// --- Execution Logic ---

export const sendMessageToGemini = async (
  message: string, 
  history: any[], 
  callbacks: ChatCallbacks
): Promise<string> => {
  
  if (!chatSession) {
    throw new Error("Chat session not initialized.");
  }

  try {
    // 1. Send Message
    let response = await chatSession.sendMessage({ message });
    
    // 2. Loop through function calls
    while (response.functionCalls && response.functionCalls.length > 0) {
      const toolResponses = [];

      for (const call of response.functionCalls) {
        const { name, args, id } = call;
        console.log(`[Tool Call] ${name}`, args);
        
        let result: any = { status: 'ok' };

        try {
          if (name === 'query_layer') {
            const data = await queryLayer(
                args.layer_name, 
                args.where_clause, 
                args.limit || 20,
                args.group_by_fields,
                args.out_statistics
            );

            if (data && data.features.length > 0) {
               const stableLayerId = `layer-${Date.now()}-${Math.floor(Math.random()*1000)}`;
               
               // Cache the data for plot_on_map
               layerDataCache.set(stableLayerId, data);

               // Simplify result to avoid sending huge JSON to LLM immediately
               result = { 
                 count: data.features.length,
                 returned_layer_id: stableLayerId,
                 info: `Found ${data.features.length} features. Call plot_on_map with layer_id="${stableLayerId}" to visualize and analyze them.`
               };
               
               // We notify app immediately
               callbacks.onLayerAdd({
                 id: stableLayerId,
                 name: `${args.layer_name}`,
                 data: data
               });
            } else {
              result = { count: 0, info: "No features found matching query." };
            }
          } 
          else if (name === 'update_map_view') {
            const lat = Number(args.latitude);
            const lng = Number(args.longitude);
            const zoom = Number(args.zoom);

            if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
                callbacks.onMapUpdate(lat, lng, zoom);
                result = { status: 'Map updated' };
            } else {
                result = { error: "Invalid coordinates provided." };
            }
          }
          else if (name === 'plot_on_map') {
            const layerId = args.layer_id;
            const data = layerDataCache.get(layerId);
            
            if (data) {
                // Return a rich sample so the AI can explain what it just plotted
                // We perform a strict clean here to ensure attributes (which might be null) don't crash the tool response
                const safeAttributes = data.features.slice(0, 2).map(f => cleanForStruct(f.properties));

                result = { 
                    status: 'success',
                    plotted_layer_name: args.layer_name,
                    feature_count: data.features.length,
                    attribute_sample: safeAttributes, 
                    system_note: "IMPERATIVE: You must now explain these features to the user. Describe what they represent based on the 'attribute_sample' and their count. Do not just say 'I plotted them'."
                };
            } else {
                result = { status: 'error', message: 'Layer ID not found in cache. Ensure query_layer was called first.' };
            }
          }
          else if (name === 'connect_to_portal') {
            const token = await generateToken(args.username, args.password, args.portal_url);
            result = { status: 'Authenticated', token_preview: token.substring(0, 5) };
          }
          else if (name === 'spatial_query') {
            // First try to get from cache (preferred), then callback
            let geometrySource = layerDataCache.get(args.geometry_source_layer_id);
            if (!geometrySource) {
                geometrySource = callbacks.onGetLayerData(args.geometry_source_layer_id);
            }

            if (!geometrySource || geometrySource.features.length === 0) {
               throw new Error(`Geometry source layer ${args.geometry_source_layer_id} empty or not found.`);
            }
            const geometry = geometrySource.features[0].geometry;
            const data = await querySpatialLayer(args.target_layer_id, geometry, args.spatial_relationship);
            
            if (data && data.features.length > 0) {
                 const stableLayerId = `spatial-${Date.now()}`;
                 
                 layerDataCache.set(stableLayerId, data);
                 
                 result = {
                     count: data.features.length,
                     returned_layer_id: stableLayerId,
                     info: `Spatial query successful. Found ${data.features.length} features. Call plot_on_map to visualize.`
                 };
                 callbacks.onLayerAdd({
                     id: stableLayerId,
                     name: `Spatial Query Result`,
                     data: data
                 });
            } else {
                result = { count: 0, info: "No intersecting features found." };
            }
          }
        } catch (e: any) {
          console.error(`Tool Error (${name}):`, e);
          result = { error: e.message || "Unknown tool error" };
        }

        // Construct response object
        const responsePart: any = {
          functionResponse: {
            name: name,
            response: sanitizeToolResult(result)
          }
        };
        
        // Only add ID if it exists.
        if (id) {
           responsePart.functionResponse.id = id;
        }

        toolResponses.push(responsePart);
      }

      // Send tool outputs back to model
      response = await chatSession.sendMessage(toolResponses);
    }

    return response.text;

  } catch (error: any) {
    console.error("Gemini Interaction Error:", error);
    return `System Error: ${error.message || "An unexpected error occurred during the conversation."}`;
  }
};

export const resetChat = () => {
  chatSession = null;
  layerDataCache.clear();
};
