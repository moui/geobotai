import React, { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapViewState, MapLayer } from '../types';

// Fix for default marker icons in Leaflet without using file imports that fail in browser environments
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: iconUrl,
    iconRetinaUrl: iconRetinaUrl,
    shadowUrl: shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
  viewState: MapViewState;
  layers: MapLayer[];
}

// Component to handle view updates programmatically
const MapViewUpdater: React.FC<{ viewState: MapViewState }> = ({ viewState }) => {
  const map = useMap();
  useEffect(() => {
    // CRITICAL: Strictly validate coordinates before calling Leaflet methods
    const isValid = 
        viewState.center && 
        Array.isArray(viewState.center) &&
        viewState.center.length === 2 &&
        Number.isFinite(viewState.center[0]) && 
        Number.isFinite(viewState.center[1]) && 
        Number.isFinite(viewState.zoom);

    if (isValid) {
        map.flyTo(viewState.center, viewState.zoom, { duration: 1.5 });
    } else {
        // Log warning but don't crash
        // console.warn("MapComponent received invalid view state, ignoring update:", viewState);
    }
  }, [viewState, map]);
  return null;
};

// Helper to format values for display
const formatValue = (key: string, val: any): string => {
  if (val === null || val === undefined) return 'N/A';
  
  // Check if it's an ArcGIS Timestamp (huge integer) and the key hints at a date
  if (typeof val === 'number' && val > 100000000000) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('date') || lowerKey.includes('time') || lowerKey.includes('created') || lowerKey.includes('updated')) {
        try {
            return new Date(val).toLocaleDateString() + ' ' + new Date(val).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } catch (e) {
            return val.toString();
        }
    }
  }
  
  // Format long numbers
  if (typeof val === 'number' && !Number.isInteger(val)) {
      return val.toFixed(2);
  }

  // Handle URLS
  if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('www'))) {
      return `<a href="${val}" target="_blank" class="text-blue-500 hover:underline">Link</a>`;
  }

  return val.toString();
};

const MapComponent: React.FC<MapComponentProps> = ({ viewState, layers }) => {
  // Ensure the map never mounts with invalid center (NaN)
  const isCenterValid = 
    viewState.center && 
    Array.isArray(viewState.center) &&
    viewState.center.length === 2 &&
    Number.isFinite(viewState.center[0]) && 
    Number.isFinite(viewState.center[1]);

  const safeCenter: [number, number] = isCenterValid ? viewState.center : [0, 0];

  const onEachFeature = (feature: any, layer: L.Layer) => {
    if (feature.properties) {
      // Find a suitable title (Name, Title, ID, or just 'Feature')
      const titleKey = Object.keys(feature.properties).find(k => ['name', 'title', 'id', 'station'].includes(k.toLowerCase()));
      const title = titleKey ? feature.properties[titleKey] : 'Feature Info';

      const popupContent = `
        <div class="font-sans text-sm min-w-[200px] max-w-[300px] max-h-[300px] overflow-y-auto custom-scrollbar">
          <strong class="block border-b border-gray-200 pb-1 mb-2 text-base text-gray-800 sticky top-0 bg-white">
            ${title}
          </strong>
          <div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          ${Object.entries(feature.properties)
            .filter(([key]) => key !== 'Shape' && key !== 'objectid' && key !== 'OBJECTID' && key !== 'globalid' && key !== titleKey)
            .map(([key, val]) => `
                <span class="text-gray-500 text-xs font-bold uppercase text-right self-center">${key}:</span> 
                <span class="text-gray-800 break-words">${formatValue(key, val)}</span>
            `)
            .join('')}
          </div>
        </div>
      `;
      layer.bindPopup(popupContent, { maxWidth: 300 });
    }
  };

  return (
    <MapContainer 
      center={safeCenter} 
      zoom={viewState.zoom} 
      scrollWheelZoom={true} 
      className="w-full h-full z-0"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapViewUpdater viewState={viewState} />
      
      {layers.map((layer) => {
        if (!layer.visible) return null;

        return (
            <GeoJSON 
                key={`${layer.id}-${layer.visible}`} // Force re-render on visibility change
                data={layer.data} 
                onEachFeature={onEachFeature}
                filter={(feature) => {
                    // 1. Filter out features with null geometry (e.g. statistics results)
                    if (!feature.geometry || feature.geometry === null) return false;

                    const geometry = feature.geometry;

                    // Exclude GeometryCollection as it does not have a coordinates property
                    if (geometry.type === 'GeometryCollection') return false;

                    // 2. Extra safety checks for invalid coordinates to prevent Leaflet crash
                    if (geometry.type === 'Point') {
                        const coords = geometry.coordinates;
                        if (!coords || coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return false;
                    }
                    else if (geometry.type === 'MultiPoint') {
                        // All points must be valid
                        const points = geometry.coordinates;
                        if (!Array.isArray(points)) return false;
                        return points.every((p: any) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
                    }
                    
                    // 3. LineStrings / Polygons generally handled by upstream arcgisService validation, 
                    // but we ensure coordinates exists.
                    // Access coordinates safely by checking property existence or casting
                    if ('coordinates' in geometry) {
                         const g = geometry as any;
                         if (!g.coordinates || g.coordinates.length === 0) return false;
                    }

                    return true;
                }}
                pointToLayer={(feature, latlng) => {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        fillColor: layer.color,
                        color: "#fff",
                        weight: 1.5,
                        opacity: 1,
                        fillOpacity: 0.8
                    });
                }}
                style={() => ({
                    color: layer.color,
                    weight: 3,
                    opacity: 0.8,
                    fillColor: layer.color,
                    fillOpacity: 0.2
                })}
            />
        );
      })}
    </MapContainer>
  );
};

export default MapComponent;