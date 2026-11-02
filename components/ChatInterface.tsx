import React, { useState, useRef, useEffect } from 'react';
import { Send, Map as MapIcon, RotateCcw, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  onReset: () => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, onReset, isLoading }) => {
  const [input, setInput] = useState('');
  const [logoError, setLogoError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900/95 backdrop-blur-md border-r border-gray-700 shadow-2xl text-white w-full md:w-[450px] relative z-20 transition-all duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-3">
          {/* Logo Logic: Tries to load assets/logo.png, falls back to MapIcon on error */}
          {!logoError ? (
            <div className="h-12 bg-white rounded-lg p-1 flex items-center justify-center min-w-[3rem]">
               <img 
                 src="/assets/logo.png" 
                 alt="App Logo" 
                 className="h-full w-auto object-contain"
                 onError={() => setLogoError(true)}
               />
            </div>
          ) : (
            <div className="p-2 bg-blue-600 rounded-lg">
              <MapIcon size={20} className="text-white" />
            </div>
          )}

          <div>
            <h1 className="font-bold text-lg leading-tight">GeoBot AI</h1>
            <p className="text-xs text-gray-400">Powered by Gemini 3 Pro</p>
          </div>
        </div>
        <button 
          onClick={onReset}
          className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
          title="Reset Chat"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-10 p-4">
            <p className="mb-2">👋 Welcome to GeoBot!</p>
            <p className="text-sm">Ask me to query map data, find locations, or analyze features.</p>
            <div className="mt-6 space-y-2 text-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Try asking:</p>
                <button onClick={() => onSendMessage("Show active fire events")} className="block w-full text-left p-2 rounded hover:bg-gray-800 transition-colors border border-gray-800 hover:border-gray-700">
                    "Show active fire events"
                </button>
                <button onClick={() => onSendMessage("Where are the Inumet weather stations?")} className="block w-full text-left p-2 rounded hover:bg-gray-800 transition-colors border border-gray-800 hover:border-gray-700">
                    "Where are the Inumet weather stations?"
                </button>
                <button onClick={() => onSendMessage("Find affected areas larger than 50 hectares")} className="block w-full text-left p-2 rounded hover:bg-gray-800 transition-colors border border-gray-800 hover:border-gray-700">
                    "Find affected areas larger than 50 hectares"
                </button>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
              }`}
            >
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-none px-4 py-3 border border-gray-700 flex items-center gap-2">
              <Loader2 className="animate-spin text-blue-400" size={16} />
              <span className="text-sm text-gray-400">Processing spatial query...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700 bg-gray-900">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about the map..."
            className="w-full bg-gray-800 border-none rounded-xl py-3 pl-4 pr-12 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;