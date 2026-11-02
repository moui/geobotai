import React from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { MapLayer } from '../types';

interface LayerListProps {
  layers: MapLayer[];
  onToggleVisibility: (id: string) => void;
  onRemoveLayer: (id: string) => void;
  isVisible: boolean;
}

const LayerList: React.FC<LayerListProps> = ({ layers, onToggleVisibility, onRemoveLayer, isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="absolute top-4 right-20 z-[400] w-72 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl p-4 transition-all duration-200">
      <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Active Layers</h3>
        <span className="text-xs text-gray-500">{layers.length} items</span>
      </div>
      
      {layers.length === 0 ? (
        <p className="text-gray-500 text-sm italic text-center py-4">No active layers.<br/>Ask the bot to find data!</p>
      ) : (
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {layers.map(layer => (
            <li key={layer.id} className="group bg-gray-800/80 p-3 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
              <div className="flex items-center gap-3">
                {/* Legend Color Swatch */}
                <div 
                  className="w-3 h-3 rounded-full shadow-sm ring-1 ring-gray-600"
                  style={{ backgroundColor: layer.color }}
                />
                
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate" title={layer.name}>
                    {layer.name}
                  </p>
                  <p className="text-xs text-gray-500 uppercase">{layer.data.features.length} features</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-700/50">
                <button 
                  onClick={() => onToggleVisibility(layer.id)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                  title={layer.visible ? "Hide Layer" : "Show Layer"}
                >
                  {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button 
                  onClick={() => onRemoveLayer(layer.id)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                  title="Remove Layer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LayerList;