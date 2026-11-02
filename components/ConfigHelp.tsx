import React from 'react';
import { X, Info, Settings, Database } from 'lucide-react';

interface ConfigHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConfigHelp: React.FC<ConfigHelpProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 p-2 rounded-lg">
              <Settings className="text-blue-400" size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">Configuring ArcGIS Services</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 text-gray-300">
          
          <div className="bg-blue-900/20 border border-blue-800 p-4 rounded-xl">
            <p className="text-sm text-blue-200">
              GeoBot automatically fetches metadata from your ArcGIS services. To ensure the AI understands your data, configure your services properly in ArcGIS Server or ArcGIS Online.
            </p>
          </div>

          <section>
            <h3 className="flex items-center gap-2 text-white font-semibold text-lg mb-3">
              <Database size={18} />
              1. Layer Description
            </h3>
            <p className="mb-2">
              The AI uses the layer description to understand <em>what</em> data the layer contains.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-gray-400">
              <li>Open your Service in ArcGIS Server Manager or ArcGIS Online.</li>
              <li>Edit the <strong>Description</strong> or <strong>Summary</strong>.</li>
              <li>Write a clear sentence: <em>"Contains point locations of all fire hydrants in the city with inspection dates."</em></li>
            </ul>
          </section>

          <section>
            <h3 className="flex items-center gap-2 text-white font-semibold text-lg mb-3">
              <Info size={18} />
              2. Field Aliases
            </h3>
            <p className="mb-2">
              Database field names (e.g., <code>POP_2000_EST</code>) are often cryptic. The AI reads <strong>Field Aliases</strong> to understand the meaning of columns.
            </p>
            <div className="bg-gray-800 p-4 rounded-lg font-mono text-sm">
              <div className="grid grid-cols-2 gap-4 border-b border-gray-700 pb-2 mb-2">
                <span className="text-gray-500">Field Name</span>
                <span className="text-green-400">Alias (What AI Sees)</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <span>ST_FIPS</span>
                <span className="text-green-300">State FIPS Code</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <span>C_TYPE</span>
                <span className="text-green-300">City Classification Type</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-400">
              Set these aliases in your MXD/Pro Project before publishing, or edit them in the Feature Layer settings in ArcGIS Online.
            </p>
          </section>

          <section>
             <h3 className="flex items-center gap-2 text-white font-semibold text-lg mb-3">
              3. Coded Value Domains
            </h3>
            <p className="text-sm text-gray-400">
              If your data uses integer codes (e.g., 1=High, 2=Low), assign a <strong>Coded Value Domain</strong>. The AI will be able to map the user's natural language ("High") to the database code ("1").
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 bg-gray-900/50 rounded-b-2xl">
          <button 
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigHelp;