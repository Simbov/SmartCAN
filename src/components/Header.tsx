import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Play, Square, Activity, Trash2, Cpu, Sun, Moon, LayoutGrid } from 'lucide-react';

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
    visiblePanels,
    togglePanelVisibility,
    panelPositions,
    setPanelPosition,
    kvaserStatus
  } = useStore();

  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

  const handleConnectToggle = () => {
    setConnected(!isConnected);
  };

  const panelNamesMapping: Record<string, string> = {
    deviceManager: 'Logical ECUs Tree',
    dbcManager: 'DBC Database Inspector',
    liveViewer: 'Live CAN Log Grid',
    livePlotter: 'Real-Time SVG Plotter',
    transmitter: 'Message Transmitter Console',
    diagnostics: 'Protocol Diagnostics Console',
    falseSender: 'False CAN oscillo-simulator'
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
            Kvaser Leaf Light
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
        {/* Customize Panels Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutMenu(!showLayoutMenu)}
            className="glass-button text-xs"
            title="Configure Workspace Layout"
          >
            <LayoutGrid className="w-4 h-4 text-gray-500" />
            <span>Customize Layout</span>
          </button>
          
          {showLayoutMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowLayoutMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-72 glass-panel p-4 shadow-2xl z-50 border border-[var(--border-color)] space-y-3.5 text-left bg-[var(--bg-card)] text-[var(--text-color)]">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block border-b border-[var(--border-color)] pb-2 mb-2">
                  Workspace Layout Configuration
                </span>
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {Object.entries(panelNamesMapping).map(([key, label]) => {
                    const isVisible = visiblePanels[key];
                    const pos = panelPositions[key] || 'sidebar';
                    return (
                      <div key={key} className="flex flex-col gap-1.5 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-[var(--border-color)]">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--text-color)] truncate max-w-[180px]">{label}</span>
                          <button
                            onClick={() => togglePanelVisibility(key)}
                            className={`w-8 h-4 rounded-full p-0.5 transition-colors focus:outline-none ${
                              isVisible ? 'bg-cyber-accent animate-pulse-glow' : 'bg-gray-300 dark:bg-gray-700'
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-full bg-white transition-transform ${
                              isVisible ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>
                        {isVisible && (
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pl-1">
                            <span>Position:</span>
                            <select
                              value={pos}
                              onChange={(e) => setPanelPosition(key, e.target.value as 'sidebar' | 'main-top' | 'main-bottom')}
                              className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-1.5 py-0.5 text-[10px] outline-none font-semibold focus:border-cyber-accent/40"
                            >
                              <option value="sidebar">Left Sidebar</option>
                              <option value="main-top">Dashboard Top</option>
                              <option value="main-bottom">Dashboard Bottom</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

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
