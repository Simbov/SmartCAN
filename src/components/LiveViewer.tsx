import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import type { CanLog } from '../store/useStore';
import { Play, Pause, Trash2, Download, Upload, Filter, ChevronDown, ChevronRight, Eye, Plus, ArrowUp, ArrowDown, SlidersHorizontal, RotateCcw, Activity, Binary } from 'lucide-react';
import { saveTextFile } from '../lib/tauriAdapter';
import { parseJ1939Id } from '../lib/j1939';
import { parseCanopenId, parseCanopenSdo } from '../lib/canopen';

export const LiveViewer: React.FC = () => {
  const {
    logs,
    fixedLogs,
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
    activeDbcName,
    liveViewerMode: viewMode,
    setLiveViewerMode: setViewMode,
    trackedBits,
    toggleTrackBit,
    showToast
  } = useStore();

  const [filterText, setFilterText] = useState('');
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advFilters, setAdvFilters] = useState({
    dbcMatchMode: 'all' as 'all' | 'dbc-only' | 'unrecognized-only',
    minId: '',
    maxId: '',
    idMask: '',
    idMaskValue: '',
    minInterval: '',
    maxInterval: '',
    direction: 'all' as 'all' | 'rx' | 'tx',
    payloadByteOffset: '', // '' (Any) or '0'-'7'
    payloadByteOp: '==' as '==' | '!=' | '>' | '<' | 'contains',
    payloadByteVal: '',
    highlightActiveBytes: true
  });

  const [tick, setTick] = useState(0);

  const parseNumericInput = (val: string): number | null => {
    const clean = val.trim();
    if (!clean) return null;
    if (clean.toLowerCase().startsWith('0x')) {
      const parsed = parseInt(clean.substring(2), 16);
      return isNaN(parsed) ? null : parsed;
    }
    const parsed = parseInt(clean, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (advFilters.dbcMatchMode !== 'all') count++;
    if (advFilters.direction !== 'all') count++;
    if (advFilters.minId) count++;
    if (advFilters.maxId) count++;
    if (advFilters.idMask || advFilters.idMaskValue) count++;
    if (advFilters.minInterval) count++;
    if (advFilters.maxInterval) count++;
    if (advFilters.payloadByteVal) count++;
    return count;
  };
  
  // Columns and View Modes Config
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    time: true,
    delta: true,
    dir: true,
    id: true,
    pgn: true,
    sa: true,
    da: false,
    dlc: true,
    payload: true,
    dbcName: true,
    srcDevice: true,
    decodedData: true,
    functionCode: true,
    nodeId: true,
    canopenIndex: true,
  });
  const [sortField, setSortField] = useState<string>('id');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  
  // Unrecognized message save form state
  const [unrecognizedMsg, setUnrecognizedMsg] = useState<{ id: number; dlc: number } | null>(null);
  const [newMsgName, setNewMsgName] = useState('');
  const [newMsgSender, setNewMsgSender] = useState('Vector__XXX');

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

  const getWellKnownSdoName = (index: number): string | null => {
    switch (index) {
      case 0x1000: return 'Device Type';
      case 0x1001: return 'Error Register';
      case 0x1002: return 'Manufacturer Status Register';
      case 0x1003: return 'Pre-defined Error Field';
      case 0x1005: return 'COB-ID SYNC Message';
      case 0x1006: return 'Communication Cycle Period';
      case 0x1007: return 'Synchronous Window Length';
      case 0x1008: return 'Manufacturer Device Name';
      case 0x1009: return 'Manufacturer Hardware Version';
      case 0x100A: return 'Manufacturer Software Version';
      case 0x100C: return 'Guard Time';
      case 0x100D: return 'Life Time Factor';
      case 0x1014: return 'COB-ID Emergency Object';
      case 0x1016: return 'Consumer Heartbeat Time';
      case 0x1017: return 'Producer Heartbeat Time';
      case 0x1018: return 'Identity Object';
      case 0x1200: return 'SDO Server Parameter';
      case 0x1400: return 'RPDO1 Parameter';
      case 0x1401: return 'RPDO2 Parameter';
      case 0x1402: return 'RPDO3 Parameter';
      case 0x1403: return 'RPDO4 Parameter';
      case 0x1600: return 'RPDO1 Mapping';
      case 0x1601: return 'RPDO2 Mapping';
      case 0x1602: return 'RPDO3 Mapping';
      case 0x1603: return 'RPDO4 Mapping';
      case 0x1800: return 'TPDO1 Parameter';
      case 0x1801: return 'TPDO2 Parameter';
      case 0x1802: return 'TPDO3 Parameter';
      case 0x1803: return 'TPDO4 Parameter';
      case 0x1A00: return 'TPDO1 Mapping';
      case 0x1A01: return 'TPDO2 Mapping';
      case 0x1A02: return 'TPDO3 Mapping';
      case 0x1A03: return 'TPDO4 Mapping';
      case 0x2000: return 'Digital & Analog Inputs (Custom Node)';
      default: return null;
    }
  };

  // Helper to render inline decoded signals summary
  const formatDecodedSignals = (decoded: Record<string, number> | null, activeDbcName: string): string => {
    if (!decoded || Object.keys(decoded).length === 0) return '—';
    return Object.entries(decoded)
      .map(([sigName, val]) => {
        let unit = '';
        let valDesc = '';
        let found = false;
        
        const activeDbc = dbcs[activeDbcName];
        if (activeDbc) {
          Object.values(activeDbc.messages).forEach(m => {
            const matchedSig = m.signals.find(s => s.name === sigName);
            if (matchedSig) {
              unit = matchedSig.unit;
              if (matchedSig.valueDescriptions && matchedSig.valueDescriptions[val] !== undefined) {
                valDesc = matchedSig.valueDescriptions[val];
              }
              found = true;
            }
          });
        }
        
        if (!found) {
          for (const db of Object.values(dbcs)) {
            Object.values(db.messages).forEach(m => {
              const matchedSig = m.signals.find(s => s.name === sigName);
              if (matchedSig) {
                unit = matchedSig.unit;
                if (matchedSig.valueDescriptions && matchedSig.valueDescriptions[val] !== undefined) {
                  valDesc = matchedSig.valueDescriptions[val];
                }
              }
            });
          }
        }

        const formattedVal = typeof val === 'number' ? val.toFixed(2).replace(/\.?0+$/, '') : val;
        const displayVal = valDesc ? `${valDesc} (${formattedVal})` : formattedVal;
        return `${sigName}: ${displayVal}${unit ? ' ' + unit : ''}`;
      })
      .join(', ');
  };

  // Filter logs based on search string and advanced filters
  const filterLogItem = (log: CanLog) => {
    // 1. Text Search
    if (filterText) {
      const query = filterText.toLowerCase();
      const idHex = protocol === 'j1939'
        ? `0x${log.id.toString(16).padStart(8, '0').toUpperCase()}`
        : `0x${log.id.toString(16).toUpperCase()}`;
      const nameMatch = log.name.toLowerCase().includes(query);
      const idMatch = idHex.toLowerCase().includes(query);
      const dataHex = formatPayloadHex(log.data).toLowerCase();
      const dataMatch = dataHex.includes(query);
      if (!nameMatch && !idMatch && !dataMatch) return false;
    }

    // 2. DBC Match Mode Filter
    const activeDbc = dbcs[activeDbcName];
    let isMatched = false;
    if (activeDbc) {
      if (protocol === 'j1939') {
        const j1939Details = parseJ1939Id(log.id);
        isMatched = !!Object.values(activeDbc.messages).find(
          msg => parseJ1939Id(msg.id).pgn === j1939Details.pgn
        );
      } else {
        isMatched = !!activeDbc.messages[log.id];
      }
    }
    
    if (advFilters.dbcMatchMode === 'dbc-only' && !isMatched) return false;
    if (advFilters.dbcMatchMode === 'unrecognized-only' && isMatched) return false;

    // 3. Direction Filter
    if (advFilters.direction === 'rx' && log.direction !== 'RX') return false;
    if (advFilters.direction === 'tx' && log.direction !== 'TX') return false;

    // 4. Min/Max ID Filter
    if (advFilters.minId) {
      const minVal = parseNumericInput(advFilters.minId);
      if (minVal !== null && log.id < minVal) return false;
    }
    if (advFilters.maxId) {
      const maxVal = parseNumericInput(advFilters.maxId);
      if (maxVal !== null && log.id > maxVal) return false;
    }

    // 5. Mask Filter
    if (advFilters.idMask) {
      const mask = parseNumericInput(advFilters.idMask);
      const maskVal = parseNumericInput(advFilters.idMaskValue);
      if (mask !== null && maskVal !== null) {
        if ((log.id & mask) !== maskVal) return false;
      }
    }

    // 6. Interval Filter
    if (advFilters.minInterval) {
      const minInt = parseFloat(advFilters.minInterval);
      if (!isNaN(minInt) && log.delta < minInt) return false;
    }
    if (advFilters.maxInterval) {
      const maxInt = parseFloat(advFilters.maxInterval);
      if (!isNaN(maxInt) && log.delta > maxInt) return false;
    }

    // 7. Payload Byte Filter
    if (advFilters.payloadByteVal) {
      const compareVal = parseNumericInput(advFilters.payloadByteVal);
      if (compareVal !== null) {
        if (advFilters.payloadByteOffset !== '') {
          const offset = parseInt(advFilters.payloadByteOffset, 10);
          if (offset >= 0 && offset < log.data.length) {
            const byteVal = log.data[offset];
            const op = advFilters.payloadByteOp;
            if (op === '==' && byteVal !== compareVal) return false;
            if (op === '!=' && byteVal === compareVal) return false;
            if (op === '>' && byteVal <= compareVal) return false;
            if (op === '<' && byteVal >= compareVal) return false;
          } else {
            return false; // Offset out of bounds
          }
        } else if (advFilters.payloadByteOp === 'contains') {
          if (!log.data.includes(compareVal)) return false;
        }
      }
    }

    return true;
  };

  const latestLogs = Object.values(fixedLogs);

  const filteredScrollLogs = logs.filter(filterLogItem);
  const filteredFixedLogs = latestLogs.filter(filterLogItem);

  const getSortValue = (log: CanLog, field: string) => {
    switch (field) {
      case 'time': return log.timestamp;
      case 'delta': return log.delta;
      case 'dir': return log.direction;
      case 'id': return log.id;
      case 'pgn': return protocol === 'j1939' ? parseJ1939Id(log.id).pgn : log.id;
      case 'sa': return protocol === 'j1939' ? parseJ1939Id(log.id).sa : log.id;
      case 'da': return protocol === 'j1939' ? (parseJ1939Id(log.id).da ?? 255) : 255;
      case 'functionCode': return protocol === 'canopen' ? parseCanopenId(log.id).functionCode : 0;
      case 'nodeId': return protocol === 'canopen' ? parseCanopenId(log.id).nodeId : 0;
      case 'canopenIndex': {
        if (protocol !== 'canopen') return 0;
        const sdo = parseCanopenSdo(log.data);
        return sdo ? (sdo.index << 8) | sdo.subIndex : 0;
      }
      case 'dlc': return log.dlc;
      case 'payload': return formatPayloadHex(log.data);
      case 'dbcName': return log.name;
      case 'srcDevice': return protocol === 'j1939' ? getNickname(parseJ1939Id(log.id).sa) : getNickname(log.id & 0x07F);
      default: return log.id;
    }
  };

  const sortedFixedLogs = [...filteredFixedLogs].sort((a, b) => {
    const valA = getSortValue(a, sortField);
    const valB = getSortValue(b, sortField);

    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    if (strA < strB) return sortAsc ? -1 : 1;
    if (strA > strB) return sortAsc ? 1 : -1;
    return 0;
  });

  const displayLogs = viewMode === 'scroll'
    ? [...filteredScrollLogs].reverse()
    : sortedFixedLogs;

  // React ticker to smoothly re-render visual byte fades every 100ms
  React.useEffect(() => {
    if (!advFilters.highlightActiveBytes) return;
    
    const hasActiveChanges = displayLogs.some(log => {
      if (!log.lastChangedTimes) return false;
      return log.lastChangedTimes.some(t => Date.now() - t < 1500);
    });

    if (hasActiveChanges) {
      const timer = setTimeout(() => {
        setTick(t => t + 1);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [displayLogs, tick, advFilters.highlightActiveBytes]);

  const handleHeaderClick = (field: string) => {
    if (viewMode !== 'fixed') return;
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderSortIndicator = (field: string) => {
    if (viewMode !== 'fixed' || sortField !== field) return null;
    return sortAsc ? (
      <ArrowUp className="w-3 h-3 inline ml-1 text-cyber-accent" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-1 text-cyber-accent" />
    );
  };

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
    saveTextFile(filename, csv, [{ name: 'CSV Log File', extensions: ['csv'] }]).then(success => {
      if (success) {
        showToast(`Successfully exported log: ${filename}`, 'success');
      }
    });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
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
    setNewMsgSender('Vector__XXX');
  };

  const parseLinuxCanDump = (text: string) => {
    clearLogs();
    const lines = text.split(/\r?\n/);
    let baseTime: number | null = null;
    const tempLogs: Omit<CanLog, 'delta' | 'decodedSignals' | 'name'>[] = [];
    const candumpRegex = /\((\d+\.\d+)\)\s+can\d+\s+([0-9A-Fa-f]+)#([0-9A-Fa-f]*)/;

    for (const line of lines) {
      const match = line.trim().match(candumpRegex);
      if (!match) continue;
      const rawTs = parseFloat(match[1]);
      if (baseTime === null) baseTime = rawTs;
      const timestamp = Math.round((rawTs - baseTime) * 1000);
      const id = parseInt(match[2], 16);
      const hexPayload = match[3];
      const dataBytes = new Uint8Array(
        hexPayload.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      tempLogs.push({ timestamp, direction: 'RX', id, dlc: dataBytes.length, data: dataBytes });
    }
    tempLogs.sort((a, b) => a.timestamp - b.timestamp);
    const store = useStore.getState();
    tempLogs.forEach((log) => store.addLog(log));
  };

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden live-viewer-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2 min-w-0">
          <Filter className={`w-4 h-4 shrink-0 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
          <span className="font-semibold text-[var(--text-color)] text-sm truncate">Live CAN Bus Traffic</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPausedLogs(!pausedLogs)}
            className={`glass-button text-xs ${pausedLogs ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25' : ''}`}
            title={pausedLogs ? 'Resume Logging' : 'Pause Logging'}
          >
            {pausedLogs ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            {pausedLogs ? 'Resume' : 'Pause'}
          </button>
          <button onClick={handleExportCsv} disabled={logs.length === 0} className="glass-button text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <input type="file" accept=".csv,.log,.txt" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="glass-button text-xs">
            <Upload className="w-3.5 h-3.5" /> Import / Replay
          </button>
          <button onClick={clearLogs} className="glass-button text-xs hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-500">
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 justify-between font-sans">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Filter logs by Hex ID, message name, payload bytes..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="glass-input w-full py-1.5 text-xs rounded-[3px] font-light"
              style={{ paddingLeft: '2.25rem' }}
            />
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`glass-button text-xs py-1.5 px-3 flex items-center gap-1.5 rounded-[3px] shrink-0 ${
              showAdvancedFilters || getActiveFiltersCount() > 0 
                ? 'bg-cyber-accent/15 border-cyber-accent text-cyber-accent font-normal' 
                : ''
            }`}
            title="Toggle Advanced Filter & Analyzer Panel"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Advanced Filters</span>
            {getActiveFiltersCount() > 0 && (
              <span className="bg-cyber-accent text-black font-normal text-[9px] w-4 h-4 rounded-[2px] flex items-center justify-center">
                {getActiveFiltersCount()}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3 bg-[var(--bg-card-sub)] border border-[var(--border-color)] p-1 rounded-[3px] flex-shrink-0">
          <div className="flex bg-[var(--bg-input)] rounded-[3px] p-0.5 border border-[var(--border-color)]">
            <button
              onClick={() => setViewMode('scroll')}
              className={`px-2.5 py-1 text-[10px] font-light rounded-[2px] transition-all duration-150 ease-out-expo ${viewMode === 'scroll' ? 'bg-[var(--text-color)] text-[var(--bg-color)] border border-[var(--text-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-color)] border border-transparent'}`}
            >
              Scroll Feed
            </button>
            <button
              onClick={() => setViewMode('fixed')}
              className={`px-2.5 py-1 text-[10px] font-light rounded-[2px] transition-all duration-150 ease-out-expo ${viewMode === 'fixed' ? 'bg-[var(--text-color)] text-[var(--bg-color)] border border-[var(--text-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-color)] border border-transparent'}`}
            >
              Fixed ID Grid
            </button>
          </div>
          <div className="w-px h-4 bg-[var(--border-color)]" />
          <div className="relative">
            <button onClick={() => setShowColumnDropdown(!showColumnDropdown)} className="glass-button text-xs flex items-center gap-1.5 px-2.5 py-1" title="Configure Columns Visibility">
              <Eye className="w-3.5 h-3.5" /> Columns
            </button>
            {showColumnDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColumnDropdown(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded-[3px] shadow-none p-3 z-50 text-left space-y-2 text-xs">
                  <div className="font-light text-[9px] text-[var(--text-muted)] uppercase tracking-wider pb-1 border-b border-[var(--border-color)]">Visible Columns</div>
                  <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto">
                    {Object.entries({
                      time: 'Time (ms)', delta: 'Delta (ms)', dir: 'Direction', id: 'CAN ID',
                      ...(protocol === 'j1939'
                        ? { pgn: 'PGN', sa: 'Source Address (SA)', da: 'Destination Address (DA)' }
                        : { functionCode: 'Function Code', nodeId: 'Node ID', canopenIndex: 'SDO Index / Sub' }),
                      dlc: 'DLC', payload: 'Payload (Hex)', dbcName: 'DBC Message Name', srcDevice: 'Source Device', decodedData: 'Decoded Signals',
                    }).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-[var(--bg-input)] p-1 rounded-[2px] transition-colors select-none">
                        <input type="checkbox" checked={visibleColumns[key]} onChange={() => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))} className="rounded-[2px] bg-black/10 border-[var(--border-color)] text-cyber-accent focus:ring-0 w-3.5 h-3.5" />
                        <span className="text-[var(--text-color)] text-xs">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showAdvancedFilters && (
        <div className="glass-panel p-4 mb-3 border border-[var(--border-sub)] bg-[var(--bg-card-sub)] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs select-none">
          
          {/* Column 1: DBC Match & Direction */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DBC Recognition Status</label>
              <select
                value={advFilters.dbcMatchMode}
                onChange={(e) => setAdvFilters(prev => ({ ...prev, dbcMatchMode: e.target.value as 'all' | 'dbc-only' | 'unrecognized-only' }))}
                className="glass-input w-full py-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)]"
              >
                <option value="all">Show All Traffic</option>
                <option value="dbc-only">Decoded Messages Only (Known)</option>
                <option value="unrecognized-only">Unrecognized Messages Only (Unknown)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Direction</label>
              <select
                value={advFilters.direction}
                onChange={(e) => setAdvFilters(prev => ({ ...prev, direction: e.target.value as 'all' | 'rx' | 'tx' }))}
                className="glass-input w-full py-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)]"
              >
                <option value="all">All Directions</option>
                <option value="rx">RX (Received) Only</option>
                <option value="tx">TX (Transmitted) Only</option>
              </select>
            </div>
          </div>

          {/* Column 2: CAN ID Range & Mask */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">CAN ID Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Min (e.g. 0x100)"
                  value={advFilters.minId}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, minId: e.target.value }))}
                  className="glass-input w-full py-1 text-xs"
                />
                <span className="text-[var(--text-muted)] text-[10px]">to</span>
                <input
                  type="text"
                  placeholder="Max (e.g. 0x200)"
                  value={advFilters.maxId}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, maxId: e.target.value }))}
                  className="glass-input w-full py-1 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">ID Mask Match</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Mask (e.g. 0x7F0)"
                  value={advFilters.idMask}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, idMask: e.target.value }))}
                  className="glass-input w-full py-1 text-xs"
                />
                <span className="text-[var(--text-muted)] font-mono">==</span>
                <input
                  type="text"
                  placeholder="Val (e.g. 0x100)"
                  value={advFilters.idMaskValue}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, idMaskValue: e.target.value }))}
                  className="glass-input w-full py-1 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Column 3: Payload Byte Value Comparison */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Payload Byte Filter</label>
              <div className="grid grid-cols-12 gap-1.5 items-center">
                <select
                  value={advFilters.payloadByteOffset}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, payloadByteOffset: e.target.value }))}
                  className="glass-input col-span-5 py-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)]"
                >
                  <option value="">Any Byte</option>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <option key={i} value={String(i)}>Byte {i}</option>
                  ))}
                </select>
                <select
                  value={advFilters.payloadByteOp}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, payloadByteOp: e.target.value as '==' | '!=' | '>' | '<' | 'contains' }))}
                  className="glass-input col-span-3 py-1 px-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)]"
                >
                  <option value="==">==</option>
                  <option value="!=">!=</option>
                  <option value=">">&gt;</option>
                  <option value="&lt;">&lt;</option>
                  {advFilters.payloadByteOffset === '' && <option value="contains">has</option>}
                </select>
                <input
                  type="text"
                  placeholder="Val (e.g. 0xFF)"
                  value={advFilters.payloadByteVal}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, payloadByteVal: e.target.value }))}
                  className="glass-input col-span-4 py-1 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Change Heatmap Legend</label>
              <div className="flex gap-2 items-center text-[10px] py-1">
                <span className="w-2.5 h-2.5 rounded bg-cyber-accent/20 border border-cyber-accent/40 shadow shadow-cyber-accent/30" />
                <span className="text-[var(--text-muted)]">Active Changes (&lt;1.5s)</span>
                <span className="w-2.5 h-2.5 rounded bg-transparent border border-[var(--border-color)]" />
                <span className="text-[var(--text-muted)]">Static Byte</span>
              </div>
            </div>
          </div>

          {/* Column 4: Interval & Heatmap Toggle */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Message Interval (ms)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Min ms"
                  value={advFilters.minInterval}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, minInterval: e.target.value }))}
                  className="glass-input w-full py-1 text-xs"
                />
                <span className="text-[var(--text-muted)] text-[10px]">to</span>
                <input
                  type="number"
                  placeholder="Max ms"
                  value={advFilters.maxInterval}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, maxInterval: e.target.value }))}
                  className="glass-input w-full py-1 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={advFilters.highlightActiveBytes}
                  onChange={(e) => setAdvFilters(prev => ({ ...prev, highlightActiveBytes: e.target.checked }))}
                  className="rounded bg-black/10 border-[var(--border-color)] text-cyber-accent focus:ring-0 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Heatmap</span>
              </label>
              <button
                onClick={() => setAdvFilters({
                  dbcMatchMode: 'all',
                  minId: '',
                  maxId: '',
                  idMask: '',
                  idMaskValue: '',
                  minInterval: '',
                  maxInterval: '',
                  direction: 'all',
                  payloadByteOffset: '',
                  payloadByteOp: '==',
                  payloadByteVal: '',
                  highlightActiveBytes: true
                })}
                className="text-[10px] text-red-500 hover:text-red-600 dark:hover:text-red-400 font-light flex items-center gap-1 transition-colors border border-transparent hover:border-red-500/20 px-2 py-0.5 rounded-[2px]"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

        </div>
      )}

      <div className="flex-1 overflow-auto rounded-[3px] border border-[var(--border-color)] bg-[var(--bg-card-sub)]">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead className="sticky top-0 bg-[var(--bg-table-header)] text-[10px] text-[var(--text-muted)] border-b border-[var(--border-color)] uppercase tracking-wider select-none z-10">
            <tr>
              {visibleColumns.time && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('time')}>Time (ms) {renderSortIndicator('time')}</th>}
              {visibleColumns.delta && <th className={`py-2.5 px-3 col-hide-narrow ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('delta')}>Delta (ms) {renderSortIndicator('delta')}</th>}
              {visibleColumns.dir && <th className={`py-2.5 px-3 col-hide-narrow ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('dir')}>Dir (Rx/Tx) {renderSortIndicator('dir')}</th>}
              {visibleColumns.id && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('id')}>CAN ID {renderSortIndicator('id')}</th>}
              {protocol === 'j1939' && visibleColumns.pgn && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('pgn')}>PGN {renderSortIndicator('pgn')}</th>}
              {protocol === 'j1939' && visibleColumns.sa && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('sa')}>Src Address (SA) {renderSortIndicator('sa')}</th>}
              {protocol === 'j1939' && visibleColumns.da && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('da')}>Dest Address (DA) {renderSortIndicator('da')}</th>}
              {protocol === 'canopen' && visibleColumns.functionCode && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('functionCode')}>Func Code {renderSortIndicator('functionCode')}</th>}
              {protocol === 'canopen' && visibleColumns.nodeId && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('nodeId')}>Node ID {renderSortIndicator('nodeId')}</th>}
              {protocol === 'canopen' && visibleColumns.canopenIndex && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('canopenIndex')}>SDO Index {renderSortIndicator('canopenIndex')}</th>}
              {visibleColumns.dlc && <th className={`py-2.5 px-3 col-hide-narrow ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('dlc')}>DLC {renderSortIndicator('dlc')}</th>}
              {visibleColumns.payload && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('payload')}>Payload (Hex) {renderSortIndicator('payload')}</th>}
              {visibleColumns.dbcName && <th className={`py-2.5 px-3 ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('dbcName')}>DBC Message Name {renderSortIndicator('dbcName')}</th>}
              {visibleColumns.srcDevice && <th className={`py-2.5 px-3 col-hide-narrow ${viewMode === 'fixed' ? 'cursor-pointer hover:bg-[var(--bg-input)] select-none' : ''}`} onClick={() => handleHeaderClick('srcDevice')}>Source Device {renderSortIndicator('srcDevice')}</th>}
              {visibleColumns.decodedData && <th className="py-2.5 px-3">Decoded Signals</th>}
              <th className="py-2.5 px-3 w-16 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-sub)]">
            {displayLogs.length === 0 ? (
              <tr><td colSpan={100} className="py-8 text-center text-[var(--text-muted)] italic">{pausedLogs ? 'Log Viewer Paused.' : 'No CAN traffic detected.'}</td></tr>
            ) : (
              displayLogs.map((log, index) => {
                const logIdx = viewMode === 'scroll' ? filteredScrollLogs.length - 1 - index : index;
                const rowExpansionKey = viewMode === 'scroll' ? `scroll-${logIdx}` : `fixed-${log.id}`;
                const isExpanded = expandedRowKey === rowExpansionKey;
                const rowKey = viewMode === 'scroll' ? `scroll-${logIdx}-${log.id}-${log.timestamp}` : `fixed-${log.id}`;
                const idHex = protocol === 'j1939' ? `0x${log.id.toString(16).padStart(8, '0').toUpperCase()}` : `0x${log.id.toString(16).toUpperCase()}`;
                const j1939Details = protocol === 'j1939' ? parseJ1939Id(log.id) : null;
                const canopenDetails = protocol === 'canopen' ? parseCanopenId(log.id) : null;
                const canopenSdoDetails = protocol === 'canopen' ? parseCanopenSdo(log.data) : null;
                const activeDbc = dbcs[activeDbcName];
                let isUnrecognized = false;
                if (activeDbc) {
                  if (protocol === 'j1939' && j1939Details) {
                    const matchedMessage = Object.values(activeDbc.messages).find(msg => parseJ1939Id(msg.id).pgn === j1939Details.pgn);
                    isUnrecognized = !matchedMessage;
                  } else { isUnrecognized = !activeDbc.messages[log.id]; }
                }

                return (
                  <React.Fragment key={rowKey}>
                    <tr onClick={() => setExpandedRowKey(isExpanded ? null : rowExpansionKey)} className={`hover:bg-[var(--bg-input)] cursor-pointer transition-colors ${log.direction === 'TX' ? 'bg-blue-500/5' : ''}`}>
                      {visibleColumns.time && <td className="py-2 px-3 text-[var(--text-muted)]">{log.timestamp}</td>}
                      {visibleColumns.delta && <td className={`py-2 px-3 col-hide-narrow font-semibold ${log.delta > 200 ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}>+{typeof log.delta === 'number' ? log.delta.toFixed(1) : log.delta}</td>}
                      {visibleColumns.dir && <td className="py-2 px-3 col-hide-narrow"><span className={`px-1.5 py-0.5 rounded-[2px] text-[9px] font-light ${log.direction === 'TX' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'}`}>{log.direction}</span></td>}
                      {visibleColumns.id && <td className={`py-2 px-3 font-semibold ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`}>{idHex}</td>}
                      {protocol === 'j1939' && (
                        <>
                          {visibleColumns.pgn && <td className="py-2 px-3 text-[var(--text-color)] font-mono">{j1939Details ? `0x${j1939Details.pgn.toString(16).toUpperCase()}` : '—'}</td>}
                          {visibleColumns.sa && <td className="py-2 px-3 text-[var(--text-color)] font-mono truncate max-w-[110px]" title={j1939Details ? getNickname(j1939Details.sa) : '—'}>{j1939Details ? j1939Details.sa : '—'}</td>}
                          {visibleColumns.da && <td className="py-2 px-3 text-[var(--text-muted)] truncate max-w-[110px]" title={j1939Details ? (j1939Details.da !== null ? getNickname(j1939Details.da) : 'Global Broadcast') : '—'}>{j1939Details ? (j1939Details.da !== null ? getNickname(j1939Details.da) : 'Global (255)') : '—'}</td>}
                        </>
                      )}
                      {protocol === 'canopen' && (
                        <>
                          {visibleColumns.functionCode && (
                            <td className="py-2 px-3 text-[var(--text-color)] font-medium truncate max-w-[150px]" title={canopenDetails?.interpretation || '—'}>
                              {canopenDetails ? `0x${canopenDetails.functionCode.toString(16).toUpperCase()} (${canopenDetails.interpretation})` : '—'}
                            </td>
                          )}
                          {visibleColumns.nodeId && (
                            <td className="py-2 px-3 text-[var(--text-color)] font-mono">
                              {canopenDetails ? `0x${canopenDetails.nodeId.toString(16).padStart(2, '0').toUpperCase()} (${canopenDetails.nodeId})` : '—'}
                            </td>
                          )}
                          {visibleColumns.canopenIndex && (
                            <td className="py-2 px-3 text-[var(--text-color)] font-mono">
                              {canopenSdoDetails ? `0x${canopenSdoDetails.index.toString(16).padStart(4, '0').toUpperCase()}:${canopenSdoDetails.subIndex.toString(16).padStart(2, '0').toUpperCase()}` : '—'}
                            </td>
                          )}
                        </>
                      )}
                      {visibleColumns.dlc && <td className="py-2 px-3 col-hide-narrow text-[var(--text-muted)]">{log.dlc}</td>}
                      {visibleColumns.payload && (
                        <td className="py-2 px-3 font-mono text-[var(--text-color)]">
                          <div className="flex flex-wrap gap-1">
                            {Array.from(log.data).map((byte, idx) => {
                              // Highlight active changes if enabled
                              let bgStyle = {};
                              let textStyle = {};
                              if (advFilters.highlightActiveBytes && log.lastChangedTimes?.[idx]) {
                                const age = Date.now() - log.lastChangedTimes[idx];
                                if (age < 1500) {
                                  const ratio = 1 - age / 1500;
                                  // Vibrant cyber cyan color fading over 1.5s
                                  const r = 6;
                                  const g = 182;
                                  const b = 212;
                                  bgStyle = {
                                    backgroundColor: `rgba(${r}, ${g}, ${b}, ${ratio * 0.3})`,
                                    border: `1px solid rgba(${r}, ${g}, ${b}, ${ratio * 0.45})`,
                                    boxShadow: `0 0 ${ratio * 6}px rgba(${r}, ${g}, ${b}, ${ratio * 0.25})`
                                  };
                                  textStyle = {
                                    fontWeight: 'normal',
                                    color: 'var(--text-color)'
                                  };
                                }
                              }
                              return (
                                <span
                                  key={idx}
                                  className="px-1 py-0.5 rounded-[2px] border border-transparent text-[11px] transition-colors duration-150"
                                  style={{ ...bgStyle, ...textStyle }}
                                  title={`Byte ${idx}: Dec ${byte} | Bin ${byte.toString(2).padStart(8, '0')}`}
                                >
                                  {byte.toString(16).padStart(2, '0').toUpperCase()}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                      )}
                      {visibleColumns.dbcName && <td className="py-2 px-3 text-[var(--text-color)] font-normal"><span className="truncate max-w-[150px] block" title={log.name || 'Unknown'}>{log.name || 'Unknown'}</span></td>}
                      {visibleColumns.srcDevice && <td className="py-2 px-3 col-hide-narrow text-[var(--text-color)] font-normal"><span className="truncate max-w-[150px] block" title={protocol === 'j1939' && j1939Details ? getNickname(j1939Details.sa) : getNickname(log.id & 0x07F)}>{protocol === 'j1939' && j1939Details ? getNickname(j1939Details.sa) : getNickname(log.id & 0x07F)}</span></td>}
                      {visibleColumns.decodedData && <td className="py-2 px-3 text-[var(--text-color)] font-normal"><span className="truncate max-w-[280px] block text-[10px]" title={formatDecodedSignals(log.decodedSignals, activeDbcName)}>{formatDecodedSignals(log.decodedSignals, activeDbcName)}</span></td>}
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isUnrecognized && (
                            <button onClick={(e) => { e.stopPropagation(); setUnrecognizedMsg({ id: log.id, dlc: log.dlc }); setNewMsgName(protocol === 'j1939' && j1939Details ? `PGN_${j1939Details.pgn}` : `COB_0x${log.id.toString(16).toUpperCase()}`); }} className="p-0.5 rounded-[2px] hover:bg-[var(--bg-input)] text-cyber-canopen hover:text-amber-400 transition-colors" title="Add Message Template to Active DBC"><Plus className="w-3.5 h-3.5" /></button>
                          )}
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[var(--bg-card-sub)]/80">
                        <td colSpan={100} className="py-4 px-6">
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 border-l-2 border-[var(--border-color)] pl-4">
                            
                            {/* Column Left: Decoded DBC Signals */}
                            <div className="lg:col-span-5 space-y-3 font-sans">
                              {/* CANopen Protocol Inspector */}
                              {protocol === 'canopen' && canopenDetails && (
                                <div className="bg-[var(--bg-input)] rounded-[3px] p-3 border border-cyber-canopen/20 space-y-2">
                                  <div className="text-[10px] font-light text-cyber-canopen uppercase tracking-wider flex items-center gap-1.5 border-b border-cyber-canopen/10 pb-1.5 select-none">
                                    <Activity className="w-3.5 h-3.5" /> CANopen Protocol Inspector
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                                    <div className="bg-[var(--bg-card-sub)] p-1.5 rounded-[2px] border border-[var(--border-color)]">
                                      <span className="text-[8px] text-[var(--text-muted)] block font-sans">COB-ID</span>
                                      <span className="font-normal text-[var(--text-color)]">0x{log.id.toString(16).toUpperCase()}</span>
                                    </div>
                                    <div className="bg-[var(--bg-card-sub)] p-1.5 rounded-[2px] border border-[var(--border-color)]">
                                      <span className="text-[8px] text-[var(--text-muted)] block font-sans">Node ID</span>
                                      <span className="font-normal text-[var(--text-color)]">{canopenDetails.nodeId} (0x{canopenDetails.nodeId.toString(16).toUpperCase()})</span>
                                    </div>
                                    <div className="bg-[var(--bg-card-sub)] p-1.5 rounded-[2px] border border-[var(--border-color)] col-span-2">
                                      <span className="text-[8px] text-[var(--text-muted)] block font-sans">Function Code</span>
                                      <span className="font-normal text-cyber-canopen">0x{canopenDetails.functionCode.toString(16).toUpperCase()} ({canopenDetails.interpretation})</span>
                                    </div>
                                    {canopenSdoDetails && (
                                      <>
                                        <div className="bg-[var(--bg-card-sub)] p-1.5 rounded-[2px] border border-[var(--border-color)]">
                                          <span className="text-[8px] text-[var(--text-muted)] block font-sans">SDO Index</span>
                                          <span className="font-normal text-[var(--text-color)]">0x{canopenSdoDetails.index.toString(16).toUpperCase()}</span>
                                        </div>
                                        <div className="bg-[var(--bg-card-sub)] p-1.5 rounded-[2px] border border-[var(--border-color)]">
                                          <span className="text-[8px] text-[var(--text-muted)] block font-sans">SDO Sub</span>
                                          <span className="font-normal text-[var(--text-color)]">0x{canopenSdoDetails.subIndex.toString(16).toUpperCase()}</span>
                                        </div>
                                        {getWellKnownSdoName(canopenSdoDetails.index) && (
                                          <div className="bg-cyber-canopen/5 p-2 rounded-[2px] border border-cyber-canopen/15 col-span-2 text-[9px] font-sans text-cyber-canopen">
                                            <strong>Object:</strong> {getWellKnownSdoName(canopenSdoDetails.index)}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="text-[10px] font-light text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5" /> Decoded Database Signals
                              </div>
                              {!log.decodedSignals || Object.keys(log.decodedSignals).length === 0 ? (
                                <div className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--bg-input)] rounded-[3px] border border-[var(--border-color)]">
                                  No DBC signals matched this message. Add signals in the DBC Manager to decode it.
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {Object.entries(log.decodedSignals).map(([sigName, val]) => {
                                    let unit = '';
                                    let valDesc = '';
                                    let found = false;
                                    
                                    const activeDbcObj = dbcs[activeDbcName];
                                    if (activeDbcObj) { 
                                      Object.values(activeDbcObj.messages).forEach(m => { 
                                        const s = m.signals.find(s => s.name === sigName); 
                                        if (s) {
                                          unit = s.unit; 
                                          if (s.valueDescriptions && s.valueDescriptions[val] !== undefined) {
                                            valDesc = s.valueDescriptions[val];
                                          }
                                          found = true;
                                        }
                                      }); 
                                    }
                                    
                                    if (!found) {
                                      for (const db of Object.values(dbcs)) {
                                        Object.values(db.messages).forEach(m => {
                                          const s = m.signals.find(s => s.name === sigName);
                                          if (s) {
                                            unit = s.unit;
                                            if (s.valueDescriptions && s.valueDescriptions[val] !== undefined) {
                                              valDesc = s.valueDescriptions[val];
                                            }
                                          }
                                        });
                                      }
                                    }

                                    const isPlotted = plotSignals.includes(sigName);
                                    const formattedVal = typeof val === 'number' ? val.toFixed(3).replace(/\.?0+$/, '') : val;
                                    const displayVal = valDesc ? `${valDesc} (${formattedVal})` : formattedVal;

                                    return (
                                      <div key={sigName} className="bg-[var(--bg-input)] rounded-[3px] p-2.5 border border-[var(--border-color)] flex items-center justify-between shadow-none font-sans">
                                        <div className="text-left min-w-0 pr-2">
                                          <span className="text-[10px] font-light text-[var(--text-muted)] block truncate" title={sigName}>{sigName}</span>
                                          <span className="text-xs font-normal text-[var(--text-color)] block truncate">
                                            {displayVal}
                                            <span className="text-[9px] text-[var(--text-muted)] ml-1 font-light">{unit}</span>
                                          </span>
                                        </div>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); togglePlotSignal(sigName); }} 
                                          className={`flex items-center gap-1 px-2 py-1 rounded-[2px] text-[8px] font-light transition-all border shrink-0 ${
                                            isPlotted 
                                              ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400 font-normal' 
                                              : 'bg-[var(--bg-card-sub)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)]'
                                          }`}
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

                            {/* Column Right: Bit & Byte Analyzer (Reverse Engineering) */}
                            <div className="lg:col-span-7 space-y-4 font-sans">
                              <div className="text-[10px] font-light text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                <Binary className="w-3.5 h-3.5" /> Bit & Byte Analyzer (Reverse Engineering)
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                {/* 8x8 Bit Matrix Visualizer */}
                                <div className="md:col-span-5 flex flex-col justify-center items-center bg-[var(--bg-input)] border border-[var(--border-color)] rounded-[3px] p-3 shadow-none">
                                  <div className="text-[10px] font-light text-[var(--text-muted)] mb-2 uppercase tracking-wide">64-Bit Grid</div>
                                  <div className="grid grid-cols-8 gap-1 p-1 bg-black/10 rounded-[3px]">
                                    {Array.from({ length: 8 }).map((_, byteIdx) => {
                                      const byteVal = byteIdx < log.data.length ? log.data[byteIdx] : 0;
                                      return Array.from({ length: 8 }).map((_, bitIdx) => {
                                        const bitPos = 7 - bitIdx; // MSB (7) to LSB (0)
                                        const bitMask = 1 << bitPos;
                                        const isBitSet = (byteVal & bitMask) !== 0;
                                        const globalBitIdx = byteIdx * 8 + bitPos;
                                        const isTracked = trackedBits.some(
                                          tb => tb.msgId === log.id && tb.byteIdx === byteIdx && tb.bitIdx === bitPos
                                        );

                                        return (
                                          <div
                                            key={`${byteIdx}-${bitIdx}`}
                                            onClick={() => toggleTrackBit(log.id, byteIdx, bitPos)}
                                            className={`w-6 h-6 rounded-[2px] flex items-center justify-center text-[10px] font-normal cursor-pointer transition-all select-none border ${
                                              isTracked
                                                ? 'bg-blue-500/30 border-blue-400 text-blue-400'
                                                : isBitSet
                                                  ? 'bg-cyber-accent/20 border-cyber-accent/50 text-cyber-accent'
                                                  : 'bg-[var(--bg-card-sub)] border-[var(--border-color)]/60 text-[var(--text-muted)]/60'
                                            }`}
                                            title={`Global Bit ${globalBitIdx} (Byte ${byteIdx}, Bit ${bitPos}) ${isTracked ? '[TRACKED]' : '[Click to Track]'}`}
                                          >
                                            {isBitSet ? '1' : '0'}
                                          </div>
                                        );
                                      });
                                    })}
                                  </div>
                                  <div className="flex justify-between w-full max-w-[210px] mt-2 text-[8px] text-[var(--text-muted)] font-light uppercase px-1">
                                    <span>B0 LSB</span>
                                    <span>B7 MSB</span>
                                  </div>
                                </div>

                                {/* Byte Details Table */}
                                <div className="md:col-span-7 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-[3px] p-2.5 overflow-x-auto shadow-none">
                                  <table className="w-full text-left border-collapse text-[10px] font-mono">
                                    <thead>
                                      <tr className="text-[9px] text-[var(--text-muted)] uppercase border-b border-[var(--border-color)] pb-1">
                                        <th className="pb-1">Byte</th>
                                        <th className="pb-1 text-center">Hex</th>
                                        <th className="pb-1 text-right">Dec</th>
                                        <th className="pb-1 text-center">ASCII</th>
                                        <th className="pb-1 text-center">Min/Max</th>
                                        <th className="pb-1 text-right" title="Value shift count">Changes</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-sub)]/50">
                                      {Array.from({ length: Math.max(8, log.data.length) }).map((_, byteIdx) => {
                                        const hasData = byteIdx < log.data.length;
                                        const val = hasData ? log.data[byteIdx] : 0;
                                        const minVal = log.minValues?.[byteIdx] ?? val;
                                        const maxVal = log.maxValues?.[byteIdx] ?? val;
                                        const changes = log.byteChanges?.[byteIdx] ?? 0;
                                        
                                        // Hex, Bin, ASCII, Dec Representation
                                        const hexStr = hasData ? val.toString(16).padStart(2, '0').toUpperCase() : '—';
                                        const decStr = hasData ? val.toString(10) : '—';
                                        const asciiChar = hasData && val >= 32 && val <= 126 ? String.fromCharCode(val) : '·';
                                        
                                        // Color highlighting if recently changed
                                        let changeHighlightClass = '';
                                        if (log.lastChangedTimes?.[byteIdx]) {
                                          const age = Date.now() - log.lastChangedTimes[byteIdx];
                                          if (age < 1500) {
                                            changeHighlightClass = 'bg-cyber-accent/15 font-bold';
                                          }
                                        }

                                        return (
                                          <tr key={byteIdx} className={`hover:bg-black/5 ${changeHighlightClass}`}>
                                            <td className="py-1.5 font-bold text-[var(--text-muted)]">B{byteIdx}</td>
                                            <td className="py-1.5 text-center font-bold text-[var(--text-color)]">{hexStr}</td>
                                            <td className="py-1.5 text-right text-[var(--text-color)]">{decStr}</td>
                                            <td className="py-1.5 text-center text-[var(--text-muted)]">{asciiChar}</td>
                                            <td className="py-1.5 text-center text-[var(--text-muted)]">
                                              {hasData ? `0x${minVal.toString(16).toUpperCase()}-0x${maxVal.toString(16).toUpperCase()}` : '—'}
                                            </td>
                                            <td className={`py-1.5 text-right font-bold ${changes > 0 ? 'text-amber-500' : 'text-[var(--text-muted)]'}`}>
                                              {hasData ? `${changes}x` : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Help tips / Action */}
                              <div className="flex items-center justify-between text-[10px] bg-cyber-j1939/5 border border-cyber-j1939/20 rounded-[3px] p-2 text-cyan-600 dark:text-cyan-400">
                                <span>
                                  <strong>💡 Decoding Tip:</strong> Look for bytes with high <strong>Changes</strong> and shifting <strong>Min/Max</strong> ranges. These represent changing variables (counters, sensors). Static bytes (0 changes) are configuration status fields.
                                </span>
                              </div>
                            </div>
                            
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

      {unrecognizedMsg && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="glass-panel p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-light text-[var(--text-color)] mb-4">Add Unrecognized Message to DBC</h3>
            <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded-[3px] p-2.5 mb-3 text-xs space-y-1 font-sans">
              <div>CAN ID: <strong className="font-mono">0x{unrecognizedMsg.id.toString(16).toUpperCase()}</strong></div>
              <div>DLC: <strong>{unrecognizedMsg.dlc} bytes</strong></div>
            </div>
            <form onSubmit={handleSaveUnrecognized} className="space-y-3.5 font-sans">
              <div>
                <label className="block text-[10px] font-light text-[var(--text-muted)] uppercase mb-1">Message Name</label>
                <input type="text" value={newMsgName} onChange={e => setNewMsgName(e.target.value)} className="glass-input w-full text-xs" placeholder="e.g. EngineTempStatus" required />
              </div>
              <div>
                <label className="block text-[10px] font-light text-[var(--text-muted)] uppercase mb-1">Sender Node</label>
                <input type="text" value={newMsgSender} onChange={e => setNewMsgSender(e.target.value)} className="glass-input w-full text-xs" placeholder="e.g. Vector__XXX" required />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => setUnrecognizedMsg(null)} className="flex-1 glass-button text-xs">Cancel</button>
                <button type="submit" className="flex-1 bg-[var(--text-color)] text-[var(--bg-color)] border border-[var(--text-color)] hover:opacity-85 text-xs font-light rounded-[3px] py-1.5 transition-all ease-out-expo">Save to DBC</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
