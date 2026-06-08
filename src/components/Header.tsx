import React from 'react';
import { useStore } from '../store/useStore';
import { 
  Play, 
  Square, 
  Activity, 
  Trash2, 
  Cpu, 
  Sun, 
  Moon, 
  LayoutGrid, 
  RefreshCw, 
  ChevronDown, 
  Plug 
} from 'lucide-react';
import { isTauriEnv } from '../lib/tauriAdapter';
import { checkForUpdates } from '../lib/updater';

export const Header: React.FC = () => {
  const {
    protocol,
    setProtocol,
    baudRate,
    setBaudRate,
    isConnected,
    setConnected,
    clearLogs,
    theme,
    toggleTheme,
    isEditingLayout,
    setEditingLayout,
    kvaserStatus,
    kvaserDeviceName,
    totalFramesReceived
  } = useStore();

  const handleConnectToggle = () => {
    setConnected(!isConnected);
  };

  return (
    <header className="h-16 border-b border-[var(--border-color)] bg-[var(--bg-header)] backdrop-blur-md px-4 lg:px-6 flex items-center justify-between z-50 select-none min-w-0">
      {/* Title */}
      <div className="flex items-center gap-2 lg:gap-3 shrink-0">
        <Cpu className={`w-6 h-6 ${
          protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'
        }`} />
        <span className="text-lg font-bold tracking-wider flex items-center gap-2">
          SmartCAN
          <span className={`text-[9px] uppercase font-semibold px-2 py-0.5 rounded-full border ${
            protocol === 'j1939' 
              ? 'bg-cyber-j1939/10 border-cyber-j1939/30 text-cyber-j1939 glow-j1939' 
              : 'bg-cyber-canopen/10 border-cyber-canopen/30 text-cyber-canopen glow-canopen'
          }`}>
            {protocol}
          </span>
        </span>
      </div>

      {/* Control Actions */}
      <div className="flex items-center gap-2 lg:gap-4 shrink-0 min-w-0">
        {/* Protocol Selector */}
        <div className="flex items-center gap-2">
          <span className="hidden xl:inline text-[11px] text-gray-500 font-bold uppercase tracking-wider">Protocol:</span>
          <div className="bg-[var(--bg-input)] p-0.5 rounded border border-[var(--border-color)] flex h-8 items-center shadow-sm">
            <button
              onClick={() => !isConnected && setProtocol('j1939')}
              disabled={isConnected}
              className={`px-2.5 lg:px-3.5 h-7 flex items-center text-xs rounded font-bold transition-all duration-150 ${
                protocol === 'j1939'
                  ? 'bg-cyber-j1939 text-black shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-color)] disabled:opacity-30'
              }`}
            >
              J1939
            </button>
            <button
              onClick={() => !isConnected && setProtocol('canopen')}
              disabled={isConnected}
              className={`px-2.5 lg:px-3.5 h-7 flex items-center text-xs rounded font-bold transition-all duration-150 ${
                protocol === 'canopen'
                  ? 'bg-cyber-canopen text-black shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-color)] disabled:opacity-30'
              }`}
            >
              CANopen
            </button>
          </div>
        </div>

        {/* Baud Rate */}
        <div className="flex items-center gap-2">
          <span className="hidden xl:inline text-[11px] text-gray-500 font-bold uppercase tracking-wider">Baud Rate:</span>
          <div className="relative flex items-center">
            <select
              value={baudRate}
              disabled={isConnected}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              className="glass-input appearance-none h-8 py-0 pr-8 pl-2.5 text-xs font-semibold max-w-[95px] xl:max-w-none cursor-pointer disabled:cursor-not-allowed shadow-sm"
            >
              <option value={125000}>125 kbps</option>
              <option value={250000}>250 kbps</option>
              <option value={500000}>500 kbps</option>
              <option value={1000000}>1 Mbps</option>
            </select>
            <ChevronDown className="absolute right-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>
        </div>

        {/* Kvaser Interface Info Badge */}
        <div 
          className="flex items-center h-8 gap-2 text-xs font-semibold bg-[var(--bg-input)] border border-[var(--border-color)] px-2.5 rounded shadow-sm min-w-0"
          title={`Interface: ${kvaserDeviceName || 'Kvaser Leaf Light'} (${kvaserStatus.toUpperCase()})`}
        >
          <Plug className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className={`${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'} truncate max-w-[80px] sm:max-w-[120px] xl:max-w-none`}>
            {kvaserDeviceName || 'Kvaser Leaf Light'}
          </span>
          <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-[var(--border-color)] shrink-0">
            {kvaserStatus === 'physical' && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse glow-accent" />
                <span className="text-[10px] text-emerald-500 font-mono uppercase tracking-wider hidden xl:inline">Physical</span>
              </>
            )}
            {kvaserStatus === 'simulated' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] text-amber-500 font-mono uppercase tracking-wider hidden xl:inline">Simulated</span>
              </>
            )}
            {kvaserStatus === 'offline' && (
              <>
                <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-600" />
                <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider hidden xl:inline">Offline</span>
              </>
            )}
          </div>
        </div>

        {/* Connection Toggle */}
        <button
          onClick={handleConnectToggle}
          className={`flex items-center h-8 gap-1.5 px-3 lg:px-4 text-xs font-bold rounded transition-all duration-150 active:scale-95 shrink-0 ${
            isConnected
              ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
              : 'bg-cyber-accent border border-cyber-accent/20 text-black hover:bg-cyber-accent/80 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]'
          }`}
        >
          {isConnected ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Disconnect</span>
              <span className="inline sm:hidden">Stop</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Connect Bus</span>
            </>
          )}
        </button>
      </div>

      {/* Auxiliary Workspace Toolbar */}
      <div className="flex items-center gap-2 lg:gap-3 shrink-0">
        {/* Edit Layout Toggle */}
        <button
          onClick={() => setEditingLayout(!isEditingLayout)}
          className={`glass-button h-8 px-2.5 lg:px-3 text-xs transition-all duration-150 shrink-0 ${
            isEditingLayout
              ? 'bg-cyber-accent border-cyber-accent text-black font-bold animate-pulse-glow shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              : ''
          }`}
          title={isEditingLayout ? "Exit Layout Editor" : "Enter Layout Editor"}
        >
          <LayoutGrid className={`w-3.5 h-3.5 ${isEditingLayout ? 'text-black' : 'text-gray-500'}`} />
          <span className="hidden xl:inline">{isEditingLayout ? 'Done Editing' : 'Edit Layout'}</span>
        </button>

        {/* Update Checker (Tauri Desktop Only) */}
        {isTauriEnv() && (
          <button
            onClick={() => checkForUpdates({ silent: false })}
            className="glass-button h-8 px-2.5 lg:px-3 text-xs shrink-0"
            title="Check for Software Updates"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Check Updates</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="glass-button h-8 w-8 !p-0 flex items-center justify-center shrink-0 shadow-sm"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>

        {/* Log Stats */}
        <div className="flex items-center h-8 gap-1.5 px-2.5 lg:px-3 text-xs text-gray-500 bg-[var(--bg-input)] border border-[var(--border-color)] rounded shrink-0 shadow-sm">
          <Activity className={`w-3.5 h-3.5 ${isConnected ? 'text-cyber-accent animate-pulse' : 'text-gray-500'}`} />
          <span><span className="hidden xl:inline">Frames: </span><strong className="text-[var(--text-color)]">{totalFramesReceived}</strong></span>
        </div>

        {/* Clear Logs */}
        <button
          onClick={clearLogs}
          title="Clear Live Logs"
          className="glass-button h-8 w-8 !p-0 flex items-center justify-center shrink-0 shadow-sm"
        >
          <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-400" />
        </button>
      </div>
    </header>
  );
};
