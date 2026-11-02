import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("CRITICAL ERROR: API_KEY is not set in environment variables.");
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from dist in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, 'dist')));

// In-memory session store (Note: For production, use Redis or a database)
const sessions = new Map();

// Initialize the Gemini Client
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Tool Definitions (Must match the client-side expectations)
const tools = [{
  functionDeclarations: [
    {
      name: 'query_layer',
      description: 'Query an ArcGIS feature layer using a SQL WHERE clause.',
      parameters: {
        type: 'OBJECT',
        properties: {
          layer_name: { type: 'STRING' },
          where_clause: { type: 'STRING' },
          limit: { type: 'NUMBER' }
        },
        required: ['layer_name', 'where_clause']
      }
    },
    {
      name: 'update_map_view',
      description: 'Move the map to a specific location.',
      parameters: {
        type: 'OBJECT',
        properties: {
          latitude: { type: 'NUMBER' },
          longitude: { type: 'NUMBER' },
          zoom: { type: 'NUMBER' }
        },
        required: ['latitude', 'longitude', 'zoom']
      }
    },
    {
      name: 'plot_on_map',
      description: 'Visualize data on the map.',
      parameters: {
        type: 'OBJECT',
        properties: {
          layer_id: { type: 'STRING' },
          layer_name: { type: 'STRING' }
        },
        required: ['layer_id', 'layer_name']
      }
    },
    {
      name: 'connect_to_portal',
      description: 'Authenticate with ArcGIS Portal.',
      parameters: {
        type: 'OBJECT',
        properties: {
          username: { type: 'STRING' },
          password: { type: 'STRING' },
          portal_url: { type: 'STRING' }
        },
        required: ['username', 'password', 'portal_url']
      }
    },
    {
      name: 'spatial_query',
      description: 'Perform a spatial query (intersects, contains) using geometry from a previous layer.',
      parameters: {
        type: 'OBJECT',
        properties: {
          target_layer_id: { type: 'STRING', description: 'Layer to query against' },
          geometry_source_layer_id: { type: 'STRING', description: 'Layer providing the geometry' },
          spatial_relationship: { type: 'STRING', description: 'esriSpatialRelIntersects, esriSpatialRelContains, etc.' }
        },
        required: ['target_layer_id', 'geometry_source_layer_id', 'spatial_relationship']
      }
    }
  ]
}];

/**
 * Endpoint: Initialize Chat Session
 * Body: { sessionId, systemInstruction }
 */
app.post('/api/chat/init', (req, res) => {
  try {
    const { sessionId, systemInstruction } = req.body;
    
    // Create new chat session
    const chat = ai.chats.create({
      model: 'gemini-3-pro-preview',
      config: {
        systemInstruction: systemInstruction,
        tools: tools
      }
    });

    sessions.set(sessionId, chat);
    console.log(`[Server] Session created: ${sessionId}`);
    res.json({ status: 'ok' });
  } catch (error) {
    console.error("Init Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Send Message
 * Body: { sessionId, message }
 */
app.post('/api/chat/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    const chat = sessions.get(sessionId);
    
    if (!chat) {
      return res.status(404).json({ error: "Session not found. Please refresh." });
    }

    const result = await chat.sendMessage({ message });
    
    // Check for tool calls
    if (result.functionCalls && result.functionCalls.length > 0) {
       // Return tool calls to client to execute
       return res.json({
         type: 'tool_call',
         calls: result.functionCalls
       });
    }

    res.json({
      type: 'text',
      content: result.text
    });

  } catch (error) {
    console.error("Message Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Endpoint: Send Tool Response
 * Body: { sessionId, toolResponses }
 */
app.post('/api/chat/tool-response', async (req, res) => {
  try {
    const { sessionId, toolResponses } = req.body;
    const chat = sessions.get(sessionId);

    if (!chat) {
      return res.status(404).json({ error: "Session not found." });
    }

    // Send tool output back to model
    const result = await chat.sendMessage({ message: toolResponses });

    // Handle potential recursive tool calls (model asks for another tool)
    if (result.functionCalls && result.functionCalls.length > 0) {
      return res.json({
        type: 'tool_call',
        calls: result.functionCalls
      });
    }

    res.json({
      type: 'text',
      content: result.text
    });

  } catch (error) {
    console.error("Tool Response Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`GeoBot Server running on http://localhost:${PORT}`);
});
