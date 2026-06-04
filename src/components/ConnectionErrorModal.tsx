import React from 'react';
import { useStore } from '../store/useStore';
import { AlertTriangle, X, RefreshCw, Play } from 'lucide-react';

export const ConnectionErrorModal: React.FC = () => {
  const { 
    connectionError, 
    dismissConnectionError, 
    setConnected, 
    startSimulationMode 
  } = useStore();

  if (!connectionError) return null;

  const handleTryAgain = () => {
    setConnected(true);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div 
        className="glass-panel p-6 w-full max-w-md border border-red-500/20 bg-[var(--bg-card)] text-[var(--text-color)] shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={dismissConnectionError}
          className="absolute top-4 right-4 p-1 rounded-full text-gray-500 hover:text-[var(--text-color)] hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 pr-6 mb-4">
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 shrink-0">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-wide">
              Kvaser Connection Failed
            </h3>
            <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mt-0.5">
              Hardware/Driver Interface Error
            </p>
          </div>
        </div>

        {/* Error Detail Box */}
        <div className="bg-red-500/5 border border-red-500/10 rounded p-4 mb-5 text-xs text-[var(--text-color)] font-mono leading-relaxed break-words max-h-40 overflow-y-auto">
          {connectionError}
        </div>

        {/* Help Tip */}
        <p className="text-[11px] text-[var(--text-muted)] mb-5 leading-normal">
          If you do not have physical Kvaser Leaf hardware connected, or have not installed the driver libraries, you can run in simulated mode instead.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              onClick={dismissConnectionError}
              className="flex-1 glass-button text-xs font-semibold py-2.5"
            >
              Cancel
            </button>
            <button
              onClick={handleTryAgain}
              className="flex-1 bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 text-xs font-bold rounded py-2.5 flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          </div>

          <button
            onClick={startSimulationMode}
            className="w-full bg-cyber-accent border border-cyber-accent/40 text-black hover:bg-emerald-400 text-xs font-bold rounded py-2.5 flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-95 mt-1 glow-accent-btn"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run Simulated Bus
          </button>
        </div>
      </div>
    </div>
  );
};
