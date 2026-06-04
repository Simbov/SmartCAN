import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { CanLog } from '../store/useStore';
import { Play, Pause, Trash2, Download, Upload, Filter, ChevronDown, ChevronRight, Eye, Plus } from 'lucide-react';
import { saveTextFile } from '../lib/tauriAdapter';
import { parseJ1939Id } from '../lib/j1939';

export const LiveViewer: React.FC = () => {
  const {
    logs,
    pausedLogs,
    setPausedLogs,
    clearLogs,
    importLogsCsv,
    togglePlotSignal,
    plotSignals,
    protocol,
    devices,
    saveMessageToActiveDbc,
    dbcs,
    activeDbcName
  } = useStore();

  const [filterText, setFilterText] = useState('');
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);
  const [showNicknames, setShowNicknames] = useState(true);
  const [showInterpreted, setShowInterpreted] = useState(true);
  
  // Unrecognized message save form state
  const [unrecognizedMsg, setUnrecognizedMsg] = useState<{ id: number; dlc: number } | null>(null);
  const [newMsgName, setNewMsgName] = useState('');
  const [newMsgSender, setNewMsgSender] = useState('Vector_XXX');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to convert data bytes into a spaces-separated hex string
  const formatPayloadHex = (data: Uint8Array): string => {
    return Array.from(data)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
  };

  const getNickname = (nodeId: number): string => {
    const dev = devices.find((d) => d.nodeId === nodeId);
    return dev ? dev.name : `Node ${nodeId}`;
  };

  // Filter logs based on search string
  const filteredLogs = logs.filter((log) => {
    if (!filterText) return true;
    const query = filterText.toLowerCase();
    
    const idHex = `0x${log.id.toString(16).toUpperCase()}`;
    const nameMatch = log.name.toLowerCase().includes(query);
    const idMatch = idHex.toLowerCase().includes(query);
    const dataHex = formatPayloadHex(log.data).toLowerCase();
    const dataMatch = dataHex.includes(query);

    return nameMatch || idMatch || dataMatch;
  });

  const handleExportCsv = () => {
    if (logs.length === 0) return;
    
    let csv = 'Time,Ident,Flags,DLC,Data(0),Data(1),Data(2),Data(3),Data(4),Data(5),Data(6),Data(7)\n';
    logs.forEach((log) => {
      const timeSec = (log.timestamp / 1000).toFixed(6);
      const idHex = `0x${log.id.toString(16).toUpperCase()}`;
      const flags = log.direction === 'TX' ? 'Tx' : 'Rx';
      
      const dataCols = Array.from({ length: 8 }, (_, i) => {
        if (i < log.data.length) {
          return `0x${log.data[i].toString(16).padStart(2, '0').toUpperCase()}`;
        }
        return '';
      }).join(',');

      csv += `${timeSec},${idHex},${flags},${log.dlc},${dataCols}\n`;
    });

    const filename = `can_dump_${Date.now()}.csv`;
    saveTextFile(filename, csv, [{ name: 'CSV Log File', extensions: ['csv'] }]);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      
      // Auto-detect format: Linux candump vs CSV log
      if (content.includes('#') && (content.includes('can0') || content.includes('can1'))) {
        parseLinuxCanDump(content);
      } else {
        importLogsCsv(content);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveUnrecognized = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unrecognizedMsg || !newMsgName.trim()) return;
    
    saveMessageToActiveDbc(unrecognizedMsg.id, newMsgName.trim(), unrecognizedMsg.dlc, newMsgSender.trim());
    setUnrecognizedMsg(null);
    setNewMsgName('');
    setNewMsgSender('Vector_XXX');
  };

  // Helper to parse standard Linux socketcan candump file
  const parseLinuxCanDump = (text: string) => {
    clearLogs();
    const lines = text.split(/\r?\n/);
    let baseTime: number | null = null;
    
    // We will batch import
    const tempLogs: Omit<CanLog, 'delta' | 'decodedSignals' | 'name'>[] = [];

    const candumpRegex = /\((\d+\.\d+)\)\s+can\d+\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)/;

    for (const line of lines) {
      const match = line.trim().match(candumpRegex);
      if (!match) continue;

      const rawTs = parseFloat(match[1]);
      if (baseTime === null) baseTime = rawTs;
      
      // Convert to milliseconds offset relative to start
      const timestamp = Math.round((rawTs - baseTime) * 1000);
      const id = parseInt(match[2], 16);
      const hexPayload = match[3];
      const dataBytes = new Uint8Array(
        hexPayload.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );

      tempLogs.push({
        timestamp,
        direction: 'RX',
        id,
        dlc: dataBytes.length,
        data: dataBytes
      });
    }

    // Load sequentially into store
    tempLogs.sort((a, b) => a.timestamp - b.timestamp);
    
    const store = useStore.getState();
    tempLogs.forEach((log) => {
      store.addLog(log);
    });
  };

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 min-w-0">
          <Filter className={`w-4 h-4 shrink-0 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
          <span className="font-semibold text-[var(--text-color)] text-sm truncate">Live CAN Bus Traffic</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Pause Toggle */}
          <button
            onClick={() => setPausedLogs(!pausedLogs)}
            className={`glass-button text-xs ${pausedLogs ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' : ''}`}
            title={pausedLogs ? 'Resume Logging' : 'Pause Logging'}
          >
            {pausedLogs ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            {pausedLogs ? 'Resume' : 'Pause'}
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            className="glass-button text-xs"
            title="Export Logs in CANKing CSV format"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {/* Import Log */}
          <input
            type="file"
            accept=".csv,.log,.txt"
            ref={fileInputRef}
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="glass-button text-xs"
            title="Import candump or CSV Log"
          >
            <Upload className="w-3.5 h-3.5" />
            Import / Replay
          </button>

          {/* Clear Logs */}
          <button
            onClick={clearLogs}
            className="glass-button text-xs hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-500"
            title="Clear Traffic List"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Filter search and display toggles bar */}
      <div className="mb-3 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Filter logs by Hex ID, message name, payload bytes..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="glass-input w-full pl-8 py-1.5 text-xs rounded"
          />
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-3 text-xs bg-[var(--bg-card-sub)] border border-[var(--border-color)] px-3 py-1.5 rounded flex-shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showNicknames}
              onChange={(e) => setShowNicknames(e.target.checked)}
              className="rounded bg-black/10 border-[var(--border-color)] text-cyber-accent"
            />
            <span className="font-semibold text-[var(--text-color)]">Device Nicknames</span>
          </label>
          <div className="w-px h-3.5 bg-[var(--border-color)]" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInterpreted}
              onChange={(e) => setShowInterpreted(e.target.checked)}
              className="rounded bg-black/10 border-[var(--border-color)] text-cyber-accent"
            />
            <span className="font-semibold text-[var(--text-color)]">Interpreted Names</span>
          </label>
        </div>
      </div>

      {/* Logs Table Grid */}
      <div className="flex-1 overflow-auto rounded border border-[var(--border-sub)] bg-[var(--bg-card-sub)]">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-table-header)] text-[10px] text-[var(--text-muted)] border-b border-[var(--border-color)] uppercase tracking-wider select-none z-10">
            <tr>
              <th className="py-2.5 px-3">Time (ms)</th>
              <th className="py-2.5 px-3">Delta (ms)</th>
              <th className="py-2.5 px-3" title="Direction (Rx: Received, Tx: Transmitted)">Dir (Rx/Tx)</th>
              {protocol === 'j1939' ? (
                <>
                  <th className="py-2.5 px-3">CAN ID</th>
                  <th className="py-2.5 px-3">PGN</th>
                  <th className="py-2.5 px-3">Src Address (SA)</th>
                  <th className="py-2.5 px-3">Dest Address (DA)</th>
                </>
              ) : (
                <th className="py-2.5 px-3">CAN ID</th>
              )}
              <th className="py-2.5 px-3">DLC</th>
              <th className="py-2.5 px-3">Payload (Hex)</th>
              <th className="py-2.5 px-3">Message Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-sub)]">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={protocol === 'j1939' ? 10 : 7} className="py-8 text-center text-[var(--text-muted)] italic">
                  {pausedLogs ? 'Log Viewer Paused.' : 'No CAN traffic detected. Connect the bus or start simulation.'}
                </td>
              </tr>
            ) : (
              // Displaying newest logs on top
              [...filteredLogs].reverse().map((log, index) => {
                const logIdx = filteredLogs.length - 1 - index;
                const isExpanded = expandedLogIdx === logIdx;
                
                // Enforce full 8-hex nibble formatting for J1939 CAN IDs
                const idHex = protocol === 'j1939'
                  ? `0x${log.id.toString(16).padStart(8, '0').toUpperCase()}`
                  : `0x${log.id.toString(16).toUpperCase()}`;

                const j1939Details = protocol === 'j1939' ? parseJ1939Id(log.id) : null;

                // Check if message is unrecognized
                const activeDbc = dbcs[activeDbcName];
                let isUnrecognized = false;
                if (activeDbc) {
                  if (protocol === 'j1939' && j1939Details) {
                    const matchedMessage = Object.values(activeDbc.messages).find(msg => {
                      const dbMsgDetails = parseJ1939Id(msg.id);
                      return dbMsgDetails.pgn === j1939Details.pgn;
                    });
                    isUnrecognized = !matchedMessage;
                  } else {
                    isUnrecognized = !activeDbc.messages[log.id];
                  }
                }

                // Friendly description logic
                let displayDescription = log.name || 'Unknown Frame';
                if (showNicknames) {
                  // Replace "Node X" with the friendly name if matched
                  const nodeMatch = displayDescription.match(/Node\s+(\d+)/i);
                  if (nodeMatch) {
                    const nid = parseInt(nodeMatch[1], 10);
                    const dev = devices.find(d => d.nodeId === nid);
                    if (dev) {
                      displayDescription = displayDescription.replace(/Node\s+\d+/i, dev.name);
                    }
                  }
                }

                if (!showInterpreted) {
                  if (protocol === 'j1939' && j1939Details) {
                    displayDescription = `PGN 0x${j1939Details.pgn.toString(16).toUpperCase()} (${j1939Details.pgn})`;
                  } else {
                    const type = log.id & 0x780;
                    const nid = log.id & 0x07F;
                    const nodeStr = showNicknames ? getNickname(nid) : `Node ${nid}`;
                    displayDescription = `FC: 0x${type.toString(16).toUpperCase()} ${nodeStr}`;
                  }
                }

                return (
                  <React.Fragment key={logIdx}>
                    <tr
                      onClick={() => setExpandedLogIdx(isExpanded ? null : logIdx)}
                      className={`hover:bg-[var(--bg-input)] cursor-pointer transition-colors ${
                        log.direction === 'TX' ? 'bg-blue-500/5' : ''
                      }`}
                    >
                      {/* Time */}
                      <td className="py-2 px-3 text-[var(--text-muted)]">{log.timestamp}</td>
                      
                      {/* Delta (Format to 1 decimal place) */}
                      <td className={`py-2 px-3 font-semibold ${
                        log.delta > 200 ? 'text-amber-500' : 'text-[var(--text-muted)]'
                      }`}>
                        +{typeof log.delta === 'number' ? log.delta.toFixed(1) : log.delta}
                      </td>

                      {/* Direction */}
                      <td className="py-2 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          log.direction === 'TX'
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {log.direction}
                        </span>
                      </td>

                      {protocol === 'j1939' && j1939Details ? (
                        <>
                          {/* CAN ID (Padded) */}
                          <td className="py-2 px-3 text-cyber-j1939 font-semibold">{idHex}</td>
                          {/* PGN */}
                          <td className="py-2 px-3 text-[var(--text-color)] font-mono">
                            0x{j1939Details.pgn.toString(16).toUpperCase()}
                          </td>
                          {/* SA */}
                          <td className="py-2 px-3 text-[var(--text-color)] truncate max-w-[110px]" title={showNicknames ? getNickname(j1939Details.sa) : `SA: ${j1939Details.sa}`}>
                            {showNicknames ? getNickname(j1939Details.sa) : j1939Details.sa}
                          </td>
                          {/* DA */}
                          <td className="py-2 px-3 text-[var(--text-muted)] truncate max-w-[110px]" title={j1939Details.da !== null ? (showNicknames ? getNickname(j1939Details.da) : `DA: ${j1939Details.da}`) : 'Global Broadcast'}>
                            {j1939Details.da !== null ? (showNicknames ? getNickname(j1939Details.da) : j1939Details.da) : 'Global (255)'}
                          </td>
                        </>
                      ) : (
                        /* CAN ID */
                        <td className={`py-2 px-3 font-semibold ${
                          protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'
                        }`}>
                          {idHex}
                        </td>
                      )}

                      {/* DLC */}
                      <td className="py-2 px-3 text-[var(--text-muted)]">{log.dlc}</td>

                      {/* Payload Hex */}
                      <td className="py-2 px-3 font-mono text-[var(--text-color)]">
                        {formatPayloadHex(log.data)}
                      </td>

                      {/* Name / Desc + Quick Action inline DBC saver */}
                      <td className="py-2 px-3 text-[var(--text-color)] font-medium">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate max-w-[180px]">{displayDescription}</span>
                          <div className="flex items-center gap-1">
                            {isUnrecognized && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUnrecognizedMsg({ id: log.id, dlc: log.dlc });
                                  setNewMsgName(protocol === 'j1939' && j1939Details ? `PGN_${j1939Details.pgn}` : `COB_0x${log.id.toString(16).toUpperCase()}`);
                                }}
                                className="p-0.5 rounded hover:bg-[var(--bg-input)] text-cyber-canopen hover:text-amber-400 transition-colors"
                                title="Add Message Template to Active DBC"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Decoded Signals Sub-Panel */}
                    {isExpanded && (
                      <tr className="bg-[var(--bg-card-sub)]/80">
                        <td colSpan={protocol === 'j1939' ? 10 : 7} className="py-3 px-6">
                          <div className="border-l-2 border-[var(--border-color)] pl-4 space-y-2">
                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                              Decoded Database Signals
                            </div>
                            
                            {!log.decodedSignals || Object.keys(log.decodedSignals).length === 0 ? (
                              <div className="text-xs text-[var(--text-muted)] italic">No DBC databases matched this ID for real-time decoding.</div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {Object.entries(log.decodedSignals).map(([sigName, val]) => {
                                  const activeDbc = useStore.getState().dbcs[useStore.getState().activeDbcName];
                                  let unit = '';
                                  if (activeDbc) {
                                    Object.values(activeDbc.messages).forEach(m => {
                                      const matchedSig = m.signals.find(s => s.name === sigName);
                                      if (matchedSig) unit = matchedSig.unit;
                                    });
                                  }

                                  const isPlotted = plotSignals.includes(sigName);

                                  return (
                                    <div
                                      key={sigName}
                                      className="bg-[var(--bg-input)] rounded p-2 border border-[var(--border-sub)] flex items-center justify-between"
                                    >
                                      <div>
                                        <span className="text-[10px] font-semibold text-[var(--text-muted)] block">{sigName}</span>
                                        <span className="text-xs font-bold text-[var(--text-color)]">
                                          {typeof val === 'number' ? val.toFixed(3).replace(/\.?0+$/, '') : val}
                                          <span className="text-[9px] text-[var(--text-muted)] ml-1 font-medium">{unit}</span>
                                        </span>
                                      </div>

                                      {/* Plot Button Toggle */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          togglePlotSignal(sigName);
                                        }}
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold transition-all border bg-[var(--bg-card-sub)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)]"
                                      >
                                        <Eye className="w-2.5 h-2.5" />
                                        {isPlotted ? 'Plotted' : 'Plot'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Unrecognized Message to DBC Modal */}
      {unrecognizedMsg && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-[var(--text-color)] mb-4">Add Unrecognized Message to DBC</h3>
            <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-2.5 mb-3 text-xs space-y-1">
              <div>CAN ID: <strong className="font-mono">0x{unrecognizedMsg.id.toString(16).toUpperCase()}</strong></div>
              <div>DLC: <strong>{unrecognizedMsg.dlc} bytes</strong></div>
            </div>
            <form onSubmit={handleSaveUnrecognized} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Message Name</label>
                <input
                  type="text"
                  value={newMsgName}
                  onChange={e => setNewMsgName(e.target.value)}
                  className="glass-input w-full text-xs"
                  placeholder="e.g. EngineTempStatus"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Sender Node</label>
                <input
                  type="text"
                  value={newMsgSender}
                  onChange={e => setNewMsgSender(e.target.value)}
                  className="glass-input w-full text-xs"
                  placeholder="e.g. Vector_XXX"
                  required
                />
              </div>
              
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setUnrecognizedMsg(null)}
                  className="flex-1 glass-button text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-cyber-accent border border-cyber-accent/40 text-black hover:bg-emerald-400 text-xs font-bold rounded py-1.5 active:scale-95 transition-all"
                >
                  Save to DBC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
