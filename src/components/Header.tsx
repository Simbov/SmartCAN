import React from 'react';
import { useStore } from '../store/useStore';
import { Play, Square, Activity, Trash2, Cpu, Sun, Moon, LayoutGrid, RefreshCw } from 'lucide-react';
import { isTauriEnv } from '../lib/tauriAdapter';

export const Header: React.FC = () => {
  const {
    protocol,
    setProtocol,
    baudRate,
    setBaudRate,
    isConnected,
    setConnected,
    clearLogs,
    logs,
    theme,
    toggleTheme,
    isEditingLayout,
    setEditingLayout,
    kvaserStatus,
    kvaserDeviceName
  } = useStore();

  const handleConnectToggle = () => {
    setConnected(!isConnected);
  };



  return (
    <header className="h-16 border-b border-cyber-border bg-black/10 backdrop-blur-md px-6 flex items-center justify-between z-50 select-none">
      {/* Title */}
      <div className="flex items-center gap-3">
        <Cpu className={`w-6 h-6 ${
          protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'
        }`} />
        <span className="text-xl font-bold tracking-wider flex items-center gap-2">
          SmartCAN
          <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${
            protocol === 'j1939' 
              ? 'bg-cyber-j1939/10 border-cyber-j1939/30 text-cyber-j1939 glow-j1939' 
              : 'bg-cyber-canopen/10 border-cyber-canopen/30 text-cyber-canopen glow-canopen'
          }`}>
            {protocol}
          </span>
        </span>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-6">
        {/* Protocol Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Protocol:</span>
          <div className="bg-black/15 p-0.5 rounded border border-white/5 flex">
            <button
              onClick={() => !isConnected && setProtocol('j1939')}
              disabled={isConnected}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                protocol === 'j1939'
                  ? 'bg-cyber-j1939 text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'
              }`}
            >
              J1939
            </button>
            <button
              onClick={() => !isConnected && setProtocol('canopen')}
              disabled={isConnected}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                protocol === 'canopen'
                  ? 'bg-cyber-canopen text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'
              }`}
            >
              CANopen
            </button>
          </div>
        </div>

        {/* Baud Rate */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Baud Rate:</span>
          <select
            value={baudRate}
            disabled={isConnected}
            onChange={(e) => setBaudRate(Number(e.target.value))}
            className="glass-input pr-4 font-semibold"
          >
            <option value={125000}>125 kbps</option>
            <option value={250000}>250 kbps</option>
            <option value={500000}>500 kbps</option>
            <option value={1000000}>1 Mbps</option>
          </select>
        </div>

        {/* Kvaser Static Label */}
        <div className="flex items-center gap-2.5 text-xs font-semibold bg-black/10 border border-[var(--border-color)] px-3 py-1.5 rounded">
          <span className="text-gray-500 font-medium">Interface:</span>
          <span className={protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}>
            {kvaserDeviceName || 'Kvaser Leaf Light'}
          </span>
          <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-gray-300 dark:border-white/10">
            {kvaserStatus === 'physical' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse glow-accent" />
                <span className="text-[10px] text-emerald-500 font-mono uppercase tracking-wider">Physical</span>
              </>
            )}
            {kvaserStatus === 'simulated' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] text-amber-500 font-mono uppercase tracking-wider">Simulated</span>
              </>
            )}
            {kvaserStatus === 'offline' && (
              <>
                <span className="w-2 h-2 rounded-full bg-gray-500 dark:bg-gray-600" />
                <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Offline</span>
              </>
            )}
          </div>
        </div>

        {/* Connection Toggle */}
        <button
          onClick={handleConnectToggle}
          className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded transition-all duration-150 active:scale-95 ${
            isConnected
              ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
              : 'bg-cyber-accent border border-cyber-accent/40 text-black hover:bg-emerald-400 font-bold'
          }`}
        >
          {isConnected ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              Disconnect
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              Connect Bus
            </>
          )}
        </button>
      </div>

      {/* Auxiliary Workspace Toolbar */}
      <div className="flex items-center gap-4">
        {/* Edit Layout Toggle */}
        <button
          onClick={() => setEditingLayout(!isEditingLayout)}
          className={`glass-button text-xs transition-all duration-150 ${
            isEditingLayout
              ? 'bg-cyber-accent border-cyber-accent text-black font-bold animate-pulse-glow shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              : ''
          }`}
          title={isEditingLayout ? "Exit Layout Editor" : "Enter Layout Editor"}
        >
          <LayoutGrid className={`w-4 h-4 ${isEditingLayout ? 'text-black' : 'text-gray-500'}`} />
          <span>{isEditingLayout ? 'Done Editing' : 'Edit Layout'}</span>
        </button>

        {/* Update Checker (Tauri Desktop Only) */}
        {isTauriEnv() && (
          <button
            onClick={() => {
              import('../lib/updater').then(({ checkForUpdates }) => {
                checkForUpdates({ silent: false });
              });
            }}
            className="glass-button text-xs"
            title="Check for Software Updates"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Updates</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="glass-button !p-2"
          title={theme === 'dark' ? 'Switch to Light (Beige) Mode' : 'Switch to Dark (Cyberpunk) Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>

        {/* Log Stats / Clear */}
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-black/10 border border-white/5 px-3 py-1.5 rounded">
          <Activity className={`w-3.5 h-3.5 ${isConnected ? 'text-cyber-accent animate-pulse' : 'text-gray-500'}`} />
          <span>Frames: <strong className="text-[var(--text-color)]">{logs.length}</strong></span>
        </div>

        <button
          onClick={clearLogs}
          title="Clear Live Logs"
          className="glass-button !p-2"
        >
          <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-400" />
        </button>
      </div>
    </header>
  );
};
