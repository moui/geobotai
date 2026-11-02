import React, { useState } from 'react';
import { X, Plus, Trash2, Link, Shield, Save, Loader2 } from 'lucide-react';
import { generateToken } from '../services/arcgisService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  configLayers: { id: string, url: string }[];
  onUpdateConfig: (newLayers: { id: string, url: string }[]) => Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, configLayers, onUpdateConfig }) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'auth'>('layers');
  const [localLayers, setLocalLayers] = useState(configLayers);
  const [newLayerUrl, setNewLayerUrl] = useState('');
  const [newLayerId, setNewLayerId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Auth State
  const [portalUrl, setPortalUrl] = useState('https://www.arcgis.com');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState<{type: 'success' | 'error' | 'idle' | 'loading', msg: string}>({ type: 'idle', msg: '' });

  if (!isOpen) return null;

  const handleAddLayer = () => {
    if (newLayerId && newLayerUrl) {
      setLocalLayers([...localLayers, { id: newLayerId.trim(), url: newLayerUrl.trim() }]);
      setNewLayerId('');
      setNewLayerUrl('');
    }
  };

  const handleRemoveLayer = (id: string) => {
    setLocalLayers(localLayers.filter(l => l.id !== id));
  };

  const handleSaveLayers = async () => {
    setIsSaving(true);
    await onUpdateConfig(localLayers);
    setIsSaving(false);
    onClose();
  };

  const handleAuth = async () => {
    setAuthStatus({ type: 'loading', msg: 'Authenticating...' });
    try {
      await generateToken(username, password, portalUrl);
      setAuthStatus({ type: 'success', msg: 'Authenticated Successfully! Token stored.' });
    } catch (e: any) {
      setAuthStatus({ type: 'error', msg: e.message || 'Authentication Failed' });
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Application Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
            <button 
                onClick={() => setActiveTab('layers')}
                className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'layers' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/30' : 'text-gray-400 hover:text-white'}`}
            >
                <div className="flex items-center justify-center gap-2">
                    <Link size={16} /> Data Layers
                </div>
            </button>
            <button 
                onClick={() => setActiveTab('auth')}
                className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'auth' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/30' : 'text-gray-400 hover:text-white'}`}
            >
                <div className="flex items-center justify-center gap-2">
                    <Shield size={16} /> Portal Authentication
                </div>
            </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            
            {/* LAYERS TAB */}
            {activeTab === 'layers' && (
                <div className="space-y-6">
                    <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-xl text-sm text-blue-200">
                        Add REST endpoints for Feature Services or Map Services. The AI will automatically analyze their schema.
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Add New Layer</label>
                        <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                            <input 
                                value={newLayerId}
                                onChange={(e) => setNewLayerId(e.target.value)}
                                placeholder="ID (e.g. 'hydrants')"
                                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                            <input 
                                value={newLayerUrl}
                                onChange={(e) => setNewLayerUrl(e.target.value)}
                                placeholder="Service URL (https://.../FeatureServer/0)"
                                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                            />
                            <button 
                                onClick={handleAddLayer}
                                disabled={!newLayerId || !newLayerUrl}
                                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2 rounded-lg"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                         <label className="text-xs font-semibold text-gray-500 uppercase">Configured Layers</label>
                         <ul className="space-y-2">
                            {localLayers.map(layer => (
                                <li key={layer.id} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg border border-gray-700">
                                    <div className="overflow-hidden">
                                        <div className="font-semibold text-white text-sm">{layer.id}</div>
                                        <div className="text-xs text-gray-500 truncate" title={layer.url}>{layer.url}</div>
                                    </div>
                                    <button 
                                        onClick={() => handleRemoveLayer(layer.id)}
                                        className="text-gray-400 hover:text-red-400 p-2"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </li>
                            ))}
                         </ul>
                    </div>
                </div>
            )}

            {/* AUTH TAB */}
            {activeTab === 'auth' && (
                <div className="space-y-6">
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                         <h3 className="text-white font-semibold mb-4">ArcGIS Enterprise / Online Login</h3>
                         <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 uppercase mb-1">Portal URL</label>
                                <input 
                                    value={portalUrl}
                                    onChange={(e) => setPortalUrl(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-gray-400 uppercase mb-1">Username</label>
                                    <input 
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 uppercase mb-1">Password</label>
                                    <input 
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={handleAuth}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors flex justify-center"
                            >
                                Generate Token
                            </button>

                            {authStatus.type !== 'idle' && (
                                <div className={`p-3 rounded-lg text-sm ${
                                    authStatus.type === 'success' ? 'bg-green-900/30 text-green-400' : 
                                    authStatus.type === 'error' ? 'bg-red-900/30 text-red-400' : 
                                    'bg-blue-900/30 text-blue-400'
                                }`}>
                                    {authStatus.type === 'loading' && <Loader2 className="animate-spin inline mr-2" size={14}/>}
                                    {authStatus.msg}
                                </div>
                            )}
                         </div>
                    </div>
                </div>
            )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 bg-gray-900/50 rounded-b-2xl flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          {activeTab === 'layers' && (
            <button 
                onClick={handleSaveLayers}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
            >
                {isSaving && <Loader2 className="animate-spin" size={16} />}
                Save & Reload AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;