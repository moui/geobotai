# GeoBot AI

A browser-based GIS chatbot that uses Google Gemini function calling to query ArcGIS feature layers, run attribute, statistics and spatial queries, and plot the results on a Leaflet map.

<!-- TODO: add a screenshot or short recording of the running app (e.g. docs/screenshot.png). -->

## Problem and intended users

ArcGIS feature services are queried through SQL `WHERE` clauses, statistics definitions and spatial filters, which is a barrier for people who just want to ask "how many events happened in 2023, grouped by status?". GeoBot AI lets a user ask that question in natural language against their own ArcGIS layers. It is aimed at GIS analysts and developers who already publish data as ArcGIS REST feature services.

## Features in the current version

- **Layer discovery from service metadata.** On startup, and whenever layers change in Settings, the app fetches each layer's REST metadata (name, description, fields, aliases) and injects it into the Gemini system prompt.
- **Attribute queries** with SQL `WHERE` clauses (`query_layer`).
- **Aggregation and statistics** (count, sum, avg, min, max) with `groupByFieldsForStatistics` / `outStatistics` (`query_layer`).
- **Spatial queries** (`spatial_query`): uses the first feature of a previous result as the geometry filter against another layer (intersects, contains, within).
- **Map visualization** (`plot_on_map`, `update_map_view`): results are rendered as GeoJSON on a Leaflet map with a toggleable layer list.
- **ArcGIS authentication** via `generateToken`, either from the Settings dialog or by asking the bot to log in (`connect_to_portal`).

## Architecture

```
User ──► ChatInterface ──► geminiService (Gemini chat, tool declarations)
                                │  functionCalls
                                ▼
                         tool dispatcher ──► arcgisService ──► ArcGIS REST /query
                                │                     (WHERE, stats, geometry, token)
                                ▼
                     App state (GeoJSON layers) ──► MapComponent (Leaflet)
```

- `services/geminiService.ts` creates a Gemini chat session (`@google/genai`, model `gemini-3-pro-preview`) with five function declarations. It loops while the model returns `functionCalls`, executes each one, and sends the results back as function responses.
- Tool calls map to ArcGIS REST requests in `services/arcgisService.ts`:

  | Gemini tool | What it does |
  | --- | --- |
  | `query_layer` | `GET <layer>/query` with `where`, `resultRecordCount`, `outSR=4326`, and optional `groupByFieldsForStatistics` / `outStatistics`. Esri JSON is converted to GeoJSON and cached under a generated layer id. |
  | `spatial_query` | Converts a cached GeoJSON geometry back to Esri geometry and calls `<layer>/query` with `geometry`, `geometryType` and `spatialRel`. |
  | `plot_on_map` | Adds a cached result to the map and returns the feature count plus an attribute sample so the model can describe what was plotted. |
  | `update_map_view` | Pans/zooms the Leaflet map. |
  | `connect_to_portal` | Calls the portal/server `generateToken` endpoint; the token is kept in memory and appended to later requests. |

- `constants.ts` holds the default layer list, map center and the system prompt template.
- `server.js` is an optional Express server that serves `dist/` and exposes `/api/chat/*` endpoints that proxy Gemini. **The current client does not call these endpoints**; it talks to Gemini directly from the browser.

More on preparing ArcGIS services so the model understands them (descriptions, field aliases, domains): [docs/arcgis-configuration.md](docs/arcgis-configuration.md).

## Quick start

Prerequisites: Node.js 18+ (verified with Node 24), a [Gemini API key](https://aistudio.google.com/apikey), and at least one ArcGIS feature layer URL that supports the `Query` operation.

```bash
npm install
cp .env.example .env        # then set GEMINI_API_KEY
npm run dev                 # http://localhost:5173
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` (or `API_KEY`) | yes | Gemini API key, inlined into the client bundle at build time. |
| `PORT` | no | Port for `npm start` (`server.js`), default `3000`. |

No layers are configured by default. Open **Settings** in the app and add one or more layer URLs (`https://<host>/arcgis/rest/services/<Service>/FeatureServer/<n>`), or add them to `DEFAULT_LAYER_URLS` in `constants.ts`. Secured layers need a portal login from Settings or the chat.

Production build:

```bash
npm run build               # outputs dist/
npm start                   # serves dist/ with Express
```

## Verification

```bash
npm run typecheck           # tsc --noEmit
npm run build               # vite build
```

There are no automated tests or lint configuration yet.

## Known limitations

- **The Gemini API key is exposed to the browser.** It is inlined into the JavaScript bundle, so only deploy with a key restricted by HTTP referrer/quota, or move the Gemini calls behind `server.js`.
- Chat sessions and ArcGIS tokens live in memory and are lost on reload.
- `spatial_query` uses only the first feature of the source result as its geometry.
- `query_layer` defaults to 20 records unless the model requests a higher `limit`; server-side max record counts still apply.
- Answer quality depends heavily on the layer descriptions and field aliases published in ArcGIS.
- The production bundle is a single ~750 kB chunk (no code splitting).
- `server.js` declares its own, slightly older tool definitions and is not wired to the client.

## Dependencies and licensing

Uses Google Gemini (`@google/genai`), React, Leaflet / React Leaflet, and CARTO dark basemap tiles with OpenStreetMap data; each is subject to its own terms. Use of ArcGIS services is subject to the terms of the service provider.

## Author

Mauricio Barrera ([@moui](https://github.com/moui)).
