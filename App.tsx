import React, { useState, useCallback, useEffect } from 'react';
import MapComponent from './components/MapComponent';
import ChatInterface from './components/ChatInterface';
import ConfigHelp from './components/ConfigHelp';
import SettingsModal from './components/SettingsModal';
import LayerList from './components/LayerList';
import { sendMessageToGemini, resetChat, startChatSession } from './services/geminiService';
import { fetchLayerMetadata, generateToken } from './services/arcgisService';
import { Message, MapViewState, MapLayer, LayerMetadata } from './types';
import { INITIAL_CENTER, INITIAL_ZOOM, DEFAULT_LAYER_URLS, getRandomColor, DEFAULT_USERNAME, DEFAULT_PASSWORD, DEFAULT_PORTAL_URL } from './constants';
import { Layers, HelpCircle, Loader2, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialization Status
  const [initStatus, setInitStatus] = useState<'idle' | 'authenticating' | 'fetching_metadata' | 'ready' | 'error'>('idle');
  const [initError, setInitError] = useState<string | null>(null);
  
  // Configuration State
  const [configLayers, setConfigLayers] = useState(DEFAULT_LAYER_URLS);

  // UI State
  const [showConfigHelp, setShowConfigHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLayerList, setShowLayerList] = useState(false);
  
  // Map State
  const [viewState, setViewState] = useState<MapViewState>({
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM
  });
  
  const [activeMapLayers, setActiveMapLayers] = useState<MapLayer[]>([]);

  // Function to load metadata and start/restart AI
  // Only called AFTER auth is attempted
  const loadAndInitializeAI = useCallback(async (layersToLoad: {id: string, url: string}[]) => {
    setInitStatus('fetching_metadata');
    setInitError(null);
    try {
        console.log("Fetching metadata for:", layersToLoad);
        const metadataPromises = layersToLoad.map(l => fetchLayerMetadata(l.id, l.url));
        const loadedMetadata: LayerMetadata[] = await Promise.all(metadataPromises);
        
        await startChatSession(loadedMetadata);
        
        setInitStatus('ready');
    } catch (e: any) {
        console.error("Initialization failed", e);
        setInitError(e.message || "Failed to load application.");
        setInitStatus('error');
    }
  }, []);

  // Initial Load with Auto-Auth
  useEffect(() => {
    const initializeApp = async () => {
        // Attempt Auto-Login if credentials are in constants
        if (DEFAULT_USERNAME && DEFAULT_PASSWORD) {
            setInitStatus('authenticating');
            try {
                console.log("Attempting auto-login with default credentials...");
                await generateToken(DEFAULT_USERNAME, DEFAULT_PASSWORD, DEFAULT_PORTAL_URL);
                console.log("Auto-login successful.");
            } catch (e) {
                console.warn("Auto-login failed:", e);
                // We continue anyway, as layers might be public.
                // If they are secured, metadata fetch might fail or return partial data, but app won't crash.
            }
        }
        
        // After auth is done (or failed), load metadata.
        // This ensures the token is in place before metadata requests are made.
        await loadAndInitializeAI(configLayers);
    };

    initializeApp();
  }, []); // Run once on mount

  // --- Callbacks for Gemini Service ---

  const handleMapUpdate = useCallback((lat: number, lng: number, zoom: number) => {
    // Strictly validate incoming update to prevent NaN crashes in Leaflet
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
        setViewState({ center: [lat, lng], zoom });
    } else {
        console.warn("Invalid map update received from AI (ignoring):", { lat, lng, zoom });
    }
  }, []);

  const handleLayerAdd = useCallback((layer: { id: string, name: string, data: any }) => {
    setActiveMapLayers(prev => {
        // Remove existing if overwriting
        const filtered = prev.filter(l => l.name !== layer.name);
        return [...filtered, {
            ...layer,
            color: getRandomColor(),
            type: 'point', // Default, will be handled by GeoJSON anyway
            visible: true
        }];
    });
    // Open layer list to show the user something happened
    setShowLayerList(true);
  }, []);

  const handleGetLayerData = useCallback((layerId: string) => {
    const layer = activeMapLayers.find(l => l.id === layerId);
    return layer?.data;
  }, [activeMapLayers]);

  // --- Map Layer Controls ---
  const toggleLayerVisibility = (id: string) => {
    setActiveMapLayers(prev => prev.map(l => 
        l.id === id ? { ...l, visible: !l.visible } : l
    ));
  };

  const removeLayer = (id: string) => {
    setActiveMapLayers(prev => prev.filter(l => l.id !== id));
  };

  // --- Configuration Handler ---
  const handleUpdateConfig = async (newLayerConfig: {id: string, url: string}[]) => {
    setConfigLayers(newLayerConfig);
    // Reset chat history when config changes because context is different
    setMessages([]);
    resetChat();
    setActiveMapLayers([]); 
    await loadAndInitializeAI(newLayerConfig);
  };

  // --- Chat Handlers ---

  const handleSendMessage = async (content: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const responseText = await sendMessageToGemini(
        content, 
        messages, 
        { 
            onMapUpdate: handleMapUpdate, 
            onLayerAdd: handleLayerAdd,
            onGetLayerData: handleGetLayerData
        }
      );

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMsg]);

    } catch (error) {
      console.error(error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: "Sorry, I had trouble connecting to the service. Please try again.",
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setActiveMapLayers([]);
    setViewState({ center: INITIAL_CENTER, zoom: INITIAL_ZOOM });
    resetChat();
    // Re-init with current config
    loadAndInitializeAI(configLayers);
  };

  // --- Render Loading State ---
  if (initStatus !== 'ready' && initStatus !== 'idle') {
    if (initStatus === 'error') {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white flex-col gap-6 p-4 text-center">
              <div className="bg-red-900/30 p-6 rounded-2xl border border-red-800 max-w-md">
                  <h2 className="text-xl font-bold text-red-400 mb-2">Initialization Failed</h2>
                  <p className="text-gray-300 mb-4">{initError}</p>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="bg-red-600 hover:bg-red-500 px-6 py-2 rounded-lg text-white font-medium transition-colors"
                  >
                    Retry
                  </button>
              </div>
            </div>
          );
    }

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white flex-col gap-4">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <h2 className="text-xl font-semibold">Initializing GeoBot AI...</h2>
        <div className="flex flex-col gap-2 items-center text-sm text-gray-400">
            <span className={initStatus === 'authenticating' ? 'text-blue-400 font-bold' : 'opacity-50'}>
                {initStatus === 'authenticating' ? '➤ ' : '✓ '} Authenticating with Portal...
            </span>
            <span className={initStatus === 'fetching_metadata' ? 'text-blue-400 font-bold' : 'opacity-50'}>
                {initStatus === 'fetching_metadata' ? '➤ ' : '✓ '} Fetching ArcGIS Schema...
            </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-900 text-white font-sans">
      
      {/* Sidebar / Chat Interface */}
      <div className="w-full md:w-[450px] flex-shrink-0 z-20 shadow-2xl h-full absolute md:relative pointer-events-auto">
        <ChatInterface 
          messages={messages} 
          onSendMessage={handleSendMessage} 
          onReset={handleReset}
          isLoading={isLoading}
        />
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative z-0 h-full w-full min-w-0">
        <MapComponent 
            viewState={viewState} 
            layers={activeMapLayers} 
        />

        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 z-[400] flex flex-col gap-3">
            {/* Settings Button */}
            <button 
                onClick={() => setShowSettings(true)}
                className="bg-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-700 transition text-gray-300 hover:text-white border border-gray-600"
                title="Application Settings"
            >
                <Settings size={20} />
            </button>

            {/* Help Button */}
            <button 
                onClick={() => setShowConfigHelp(true)}
                className="bg-gray-800 p-3 rounded-full shadow-lg hover:bg-gray-700 transition text-gray-300 hover:text-white border border-gray-600"
                title="Configuration Help"
            >
                <HelpCircle size={20} />
            </button>

            {/* Layers Button */}
            <div className="relative">
                <button 
                    onClick={() => setShowLayerList(!showLayerList)}
                    className={`p-3 rounded-full shadow-lg transition border border-gray-600 ${showLayerList ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'}`}
                    title="Toggle Layers List"
                >
                    <Layers size={20} />
                </button>
                {/* Layer Counter Badge */}
                {activeMapLayers.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-sm border border-gray-900">
                        {activeMapLayers.length}
                    </span>
                )}
            </div>
        </div>

        {/* Layer List Component (positioned below buttons) */}
        <LayerList 
            layers={activeMapLayers}
            isVisible={showLayerList}
            onRemoveLayer={removeLayer}
            onToggleVisibility={toggleLayerVisibility}
        />
      </div>

      <ConfigHelp isOpen={showConfigHelp} onClose={() => setShowConfigHelp(false)} />
      
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        configLayers={configLayers}
        onUpdateConfig={handleUpdateConfig}
      />
    </div>
  );
};

export default App;