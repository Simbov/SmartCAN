import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Shield, Send, CheckCircle2, RefreshCw, Play, Square, Loader2 } from 'lucide-react';
import { parseJ1939Id, segmentBamMessage } from '../lib/j1939';

const commonSdoIndices: Record<number, string> = {
  0x1000: 'Device Type',
  0x1001: 'Error Register',
  0x1008: 'Manufacturer Device Name',
  0x1009: 'Manufacturer Hardware Version',
  0x100A: 'Manufacturer Software Version',
  0x1017: 'Producer Heartbeat Time',
  0x1018: 'Identity Object',
  0x1800: 'Transmit PDO 1 Comm Parameter',
  0x1A00: 'Transmit PDO 1 Mapping Parameter'
};

export const ProtocolDiagnostics: React.FC = () => {
  const {
    protocol,
    sendNmtCommand,
    sendSdoRequest,
    sendJ1939AddressClaim,
    sendJ1939Request,
    canopenNodes,
    logs,
    transmitFrame
  } = useStore();

  const [activeTab, setActiveTab] = useState<'nmt' | 'sdo' | 'scanner' | 'generic'>('nmt');

  // CANopen NMT state
  const [nmtNodeId, setNmtNodeId] = useState(1);
  
  // CANopen SDO state
  const [sdoNodeId, setSdoNodeId] = useState(1);
  const [sdoIndexHex, setSdoIndexHex] = useState('1008');
  const [sdoSubIndexHex, setSdoSubIndexHex] = useState('00');
  const [sdoWriteValue, setSdoWriteValue] = useState('');
  const [sdoWriteSize, setSdoWriteSize] = useState<1 | 2 | 4>(1);
  const [sdoFeedback, setSdoFeedback] = useState<{ status: 'idle' | 'success' | 'error'; msg: string }>({ status: 'idle', msg: '' });

  // CANopen SDO Scanner state
  const [scanNodeId, setScanNodeId] = useState(1);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [scanIndex, setScanIndex] = useState(0);
  const [scanResults, setScanResults] = useState<Array<{ index: number; name: string; status: 'found' | 'not_found'; valHex: string; valAscii: string }>>([]);
  const [scanList, setScanList] = useState<number[]>([]);

  // CANopen Generic state
  const [genericCobIdHex, setGenericCobIdHex] = useState('181');
  const [genericPayloadHex, setGenericPayloadHex] = useState('00 00 00 00 00 00 00 00');

  // J1939 address claim state
  const [j1939Sa, setJ1939Sa] = useState(128);
  const [j1939NameHex, setJ1939NameHex] = useState('00000000000000FF');
  const [claimStatus, setClaimStatus] = useState<string>('Not Claimed');

  // J1939 PGN Request state
  const [reqPgn, setReqPgn] = useState(65262); // ET1 PGN
  const [reqDa, setReqDa] = useState(255); // Global Broadcast

  // J1939 BAM Send State
  const [bamPgn, setBamPgn] = useState(65226); // Active DM1 fault codes
  const [bamPayloadString, setBamPayloadString] = useState('Trouble Code: Oil Pressure Low');

  // SDO active request refs
  const sdoRequestActive = useRef(false);
  const lastLogsLength = useRef(logs.length);
  const sdoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SDO Scanner refs
  const scanActive = useRef(false);
  const scanIndexRef = useRef(0);
  const scanListRef = useRef<number[]>([]);
  const scanStepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start & Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (sdoTimeoutRef.current) clearTimeout(sdoTimeoutRef.current);
      if (scanStepTimerRef.current) clearTimeout(scanStepTimerRef.current);
    };
  }, []);

  const startSdoTimeout = () => {
    if (sdoTimeoutRef.current) clearTimeout(sdoTimeoutRef.current);
    sdoTimeoutRef.current = setTimeout(() => {
      if (sdoRequestActive.current) {
        sdoRequestActive.current = false;
        setSdoFeedback({
          status: 'error',
          msg: 'SDO Timeout: No response from node.'
        });
      }
    }, 1500);
  };

  // Asynchronous Scanner step loop
  const scanNextStep = () => {
    if (!scanActive.current) return;

    const list = scanListRef.current;
    if (scanIndexRef.current >= list.length) {
      scanActive.current = false;
      setScanStatus('done');
      return;
    }

    const currentIdxVal = list[scanIndexRef.current];
    setScanIndex(currentIdxVal);

    // Send SDO Upload Request (0x40)
    sendSdoRequest(scanNodeId, currentIdxVal, 0, new Uint8Array(4), 0x40);

    // Timeout for this index step (120ms is plenty for local simulated/physical response)
    if (scanStepTimerRef.current) clearTimeout(scanStepTimerRef.current);
    scanStepTimerRef.current = setTimeout(() => {
      if (scanActive.current) {
        setScanResults(prev => [
          ...prev,
          {
            index: currentIdxVal,
            name: commonSdoIndices[currentIdxVal] || 'Unknown Object',
            status: 'not_found',
            valHex: '',
            valAscii: ''
          }
        ]);
        scanIndexRef.current += 1;
        scanNextStep();
      }
    }, 120);
  };

  const startScan = () => {
    setScanResults([]);
    setScanStatus('scanning');
    const list = Object.keys(commonSdoIndices).map(Number);
    setScanList(list);
    scanListRef.current = list;
    scanIndexRef.current = 0;
    scanActive.current = true;
    
    setTimeout(() => {
      scanNextStep();
    }, 50);
  };

  const stopScan = () => {
    scanActive.current = false;
    if (scanStepTimerRef.current) {
      clearTimeout(scanStepTimerRef.current);
      scanStepTimerRef.current = null;
    }
    setScanStatus('idle');
  };

  // Monitor incoming logs for SDO Explorer and SDO Scanner
  useEffect(() => {
    const hasNewLog = logs.length > lastLogsLength.current;
    lastLogsLength.current = logs.length;

    if (!hasNewLog || logs.length === 0 || protocol !== 'canopen') return;

    const latestLog = logs[logs.length - 1];
    const type = latestLog.id & 0x780;
    const senderNode = latestLog.id & 0x07F;

    // Handle Active SDO Scanner responses
    if (scanActive.current && type === 0x580 && senderNode === scanNodeId && latestLog.direction === 'RX') {
      const data = latestLog.data;
      if (data.length >= 4) {
        const cs = data[0];
        const index = data[1] | (data[2] << 8);
        const currentIdxVal = scanListRef.current[scanIndexRef.current];

        if (index === currentIdxVal) {
          if (scanStepTimerRef.current) {
            clearTimeout(scanStepTimerRef.current);
            scanStepTimerRef.current = null;
          }

          if (cs !== 0x80) {
            const sizeIndicated = (cs & 0x01) !== 0;
            let len = 4;
            if (sizeIndicated) {
              len = 4 - ((cs >> 2) & 0x03);
            }

            const valueBytes = data.slice(4, 4 + len);
            const hex = Array.from(valueBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            const ascii = new TextDecoder().decode(valueBytes).replace(/[^\x20-\x7E]/g, '.');

            setScanResults(prev => [
              ...prev,
              {
                index: currentIdxVal,
                name: commonSdoIndices[currentIdxVal] || 'Unknown Object',
                status: 'found',
                valHex: hex,
                valAscii: ascii
              }
            ]);
          } else {
            setScanResults(prev => [
              ...prev,
              {
                index: currentIdxVal,
                name: commonSdoIndices[currentIdxVal] || 'Unknown Object',
                status: 'not_found',
                valHex: 'Abort Code',
                valAscii: ''
              }
            ]);
          }

          scanIndexRef.current += 1;
          setTimeout(() => {
            scanNextStep();
          }, 10);
          return;
        }
      }
    }

    // Handle standard SDO Explorer responses
    if (sdoRequestActive.current && type === 0x580 && senderNode === sdoNodeId && latestLog.direction === 'RX') {
      const data = latestLog.data;
      if (data.length < 4) return;
      const cs = data[0];
      const index = data[1] | (data[2] << 8);
      const sub = data[3];

      const expectedIdx = parseInt(sdoIndexHex, 16);
      const expectedSub = parseInt(sdoSubIndexHex, 16);
      if (index !== expectedIdx || sub !== expectedSub) return;

      sdoRequestActive.current = false;
      if (sdoTimeoutRef.current) {
        clearTimeout(sdoTimeoutRef.current);
        sdoTimeoutRef.current = null;
      }

      if (cs === 0x80) {
        const code = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
        setTimeout(() => {
          setSdoFeedback({
            status: 'error',
            msg: `SDO Abort: Code 0x${code.toString(16).padStart(8, '0').toUpperCase()}`
          });
        }, 0);
      } else if (cs === 0x60) {
        setTimeout(() => {
          setSdoFeedback({
            status: 'success',
            msg: 'SDO Write download successful!'
          });
        }, 0);
      } else {
        const sizeIndicated = (cs & 0x01) !== 0;
        let len = 4;
        if (sizeIndicated) {
          len = 4 - ((cs >> 2) & 0x03);
        }

        const valueBytes = data.slice(4, 4 + len);
        const hex = Array.from(valueBytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = new TextDecoder().decode(valueBytes).replace(/[^\x20-\x7E]/g, '.');
        setTimeout(() => {
          setSdoFeedback({
            status: 'success',
            msg: `Read Value: [Hex] ${hex} | [ASCII] "${ascii}"`
          });
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, protocol, sdoNodeId, sdoIndexHex, sdoSubIndexHex, scanNodeId]);

  // Handle trigger SDO Write / Read
  const handleSdoRead = () => {
    const idx = parseInt(sdoIndexHex, 16);
    const sub = parseInt(sdoSubIndexHex, 16);
    if (isNaN(idx) || isNaN(sub)) return;

    setSdoFeedback({ status: 'idle', msg: 'Awaiting response...' });
    sdoRequestActive.current = true;
    startSdoTimeout();
    sendSdoRequest(sdoNodeId, idx, sub, new Uint8Array(4), 0x40); // 0x40 upload initiation
  };

  const handleSdoWrite = () => {
    const idx = parseInt(sdoIndexHex, 16);
    const sub = parseInt(sdoSubIndexHex, 16);
    if (isNaN(idx) || isNaN(sub)) return;

    let payload = new Uint8Array(4);
    let cs: number;

    if (sdoWriteValue.trim().startsWith('"') && sdoWriteValue.trim().endsWith('"')) {
      const str = sdoWriteValue.trim().slice(1, -1);
      payload = new TextEncoder().encode(str);
      cs = 0x21; // segment SDO
    } else {
      const num = parseInt(sdoWriteValue, 10);
      if (isNaN(num)) return;
      if (sdoWriteSize === 1) {
        payload[0] = num & 0xFF;
        cs = 0x2F; // 1 byte expedited download
      } else if (sdoWriteSize === 2) {
        payload[0] = num & 0xFF;
        payload[1] = (num >> 8) & 0xFF;
        cs = 0x2B; // 2 bytes expedited download
      } else {
        payload[0] = num & 0xFF;
        payload[1] = (num >> 8) & 0xFF;
        payload[2] = (num >> 16) & 0xFF;
        payload[3] = (num >> 24) & 0xFF;
        cs = 0x23; // 4 bytes expedited download
      }
    }

    setSdoFeedback({ status: 'idle', msg: 'Awaiting write response...' });
    sdoRequestActive.current = true;
    startSdoTimeout();
    sendSdoRequest(sdoNodeId, idx, sub, payload, cs);
  };

  // Handle generic CANopen send
  const handleSendGenericCanopen = () => {
    const cobId = parseInt(genericCobIdHex, 16);
    if (isNaN(cobId)) return;

    const cleanHex = genericPayloadHex.replace(/[^0-9A-Fa-f]/g, '');
    const dataBytes = new Uint8Array(
      (cleanHex.match(/.{1,2}/g) || []).map(b => parseInt(b, 16) || 0)
    );
    transmitFrame(cobId, dataBytes);
  };

  // J1939 Address Claiming trigger
  const handleJ1939Claim = () => {
    try {
      const name = BigInt(`0x${j1939NameHex.replace(/\s+/g, '')}`);
      setClaimStatus('Claiming...');
      sendJ1939AddressClaim(j1939Sa, name);

      setTimeout(() => {
        const currentLogs = useStore.getState().logs;
        const contested = currentLogs.some(log => {
          const det = parseJ1939Id(log.id);
          return det.pgn === 60928 && det.sa === j1939Sa && log.direction === 'RX';
        });

        if (contested) {
          setClaimStatus('Contested / Failed');
        } else {
          setClaimStatus('Address Claimed Successfully');
        }
      }, 500);

    } catch {
      alert('Invalid NAME hex. Please input exactly 16 hexadecimal characters.');
    }
  };

  // J1939 BAM Segment sender
  const handleSendBam = () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode(bamPayloadString);
    const segmentedFrames = segmentBamMessage(bamPgn, 254, payload, 7);
    
    segmentedFrames.forEach((frame, idx) => {
      setTimeout(() => {
        transmitFrame(frame.id, frame.data);
      }, idx * 50);
    });
  };

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <Shield className={`w-4 h-4 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
          <span className="font-semibold text-[var(--text-color)] text-sm">Protocol Diagnostics Console</span>
        </div>
      </div>

      {protocol === 'canopen' ? (
        /* CANopen Diagnostics Panels */
        <div className="flex-1 flex flex-col overflow-hidden gap-4">
          {/* Subtabs */}
          <div className="flex bg-[var(--bg-input)] rounded p-0.5 border border-[var(--border-color)] text-[11px] flex-shrink-0">
            <button
              onClick={() => setActiveTab('nmt')}
              className={`flex-1 py-1 rounded font-semibold transition-all duration-150 ${activeTab === 'nmt' ? 'bg-[var(--bg-card)] text-[var(--text-color)] border border-[var(--border-color)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'}`}
            >
              NMT Master
            </button>
            <button
              onClick={() => setActiveTab('sdo')}
              className={`flex-1 py-1 rounded font-semibold transition-all duration-150 ${activeTab === 'sdo' ? 'bg-[var(--bg-card)] text-[var(--text-color)] border border-[var(--border-color)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'}`}
            >
              SDO Explorer
            </button>
            <button
              onClick={() => setActiveTab('scanner')}
              className={`flex-1 py-1 rounded font-semibold transition-all duration-150 ${activeTab === 'scanner' ? 'bg-[var(--bg-card)] text-[var(--text-color)] border border-[var(--border-color)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'}`}
            >
              SDO Scanner
            </button>
            <button
              onClick={() => setActiveTab('generic')}
              className={`flex-1 py-1 rounded font-semibold transition-all duration-150 ${activeTab === 'generic' ? 'bg-[var(--bg-card)] text-[var(--text-color)] border border-[var(--border-color)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'}`}
            >
              Generic
            </button>
          </div>

          {activeTab === 'nmt' && (
            <div className="flex-1 flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-3">
                <div className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-3">
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1.5">Target Node ID (0 = Broadcast)</label>
                  <input
                    type="number"
                    value={nmtNodeId}
                    onChange={e => setNmtNodeId(Number(e.target.value))}
                    min={0}
                    max={127}
                    className="glass-input text-xs w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => sendNmtCommand(0x01, nmtNodeId)}
                    className="glass-button bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold"
                  >
                    Start Node (Operational)
                  </button>
                  <button
                    onClick={() => sendNmtCommand(0x80, nmtNodeId)}
                    className="glass-button bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 font-bold"
                  >
                    Enter Pre-Operational
                  </button>
                  <button
                    onClick={() => sendNmtCommand(0x02, nmtNodeId)}
                    className="glass-button bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-bold col-span-2"
                  >
                    Stop Node (Stopped)
                  </button>
                  <button
                    onClick={() => sendNmtCommand(0x81, nmtNodeId)}
                    className="glass-button hover:text-[var(--text-color)]"
                  >
                    Reset Node ID
                  </button>
                  <button
                    onClick={() => sendNmtCommand(0x82, nmtNodeId)}
                    className="glass-button hover:text-[var(--text-color)]"
                  >
                    Reset Communication
                  </button>
                </div>
              </div>

              {/* Heartbeat Status Monitor Grid */}
              <div className="border border-[var(--border-sub)] bg-[var(--bg-input)] rounded p-3 space-y-2">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Heartbeat Node Monitor</span>
                <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                  {Object.values(canopenNodes).map(node => (
                    <div key={node.nodeId} className="flex items-center justify-between text-[10px] bg-[var(--bg-input)] border border-[var(--border-sub)] px-2.5 py-1.5 rounded">
                      <span className="font-semibold text-[var(--text-muted)]">Node #{node.nodeId}</span>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className={`w-2 h-2 rounded-full ${
                          node.nmtState === 'OPERATIONAL'
                            ? 'bg-cyber-accent animate-pulse shadow-emerald-500/50 shadow-sm'
                            : node.nmtState === 'PRE_OPERATIONAL'
                            ? 'bg-cyber-canopen animate-pulse'
                            : 'bg-red-500'
                        }`} />
                        <span className="text-[var(--text-color)] text-[9px] truncate max-w-[80px]" title={node.nmtState}>
                          {node.nmtState.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sdo' && (
            /* SDO Explorer Read/Write Console */
            <div className="flex-1 flex flex-col justify-between overflow-y-auto space-y-3.5">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Node ID</label>
                    <input
                      type="number"
                      value={sdoNodeId}
                      onChange={e => setSdoNodeId(Number(e.target.value))}
                      min={1}
                      max={127}
                      className="glass-input text-xs w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Index (Hex)</label>
                    <input
                      type="text"
                      value={sdoIndexHex}
                      onChange={e => setSdoIndexHex(e.target.value)}
                      className="glass-input text-xs w-full font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Subindex</label>
                    <input
                      type="text"
                      value={sdoSubIndexHex}
                      onChange={e => setSdoSubIndexHex(e.target.value)}
                      className="glass-input text-xs w-full font-mono"
                    />
                  </div>
                </div>

                <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-2.5 space-y-2">
                  <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase">Write Value (Expedited Download)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 500 or &quot;NodeName&quot;"
                      value={sdoWriteValue}
                      onChange={e => setSdoWriteValue(e.target.value)}
                      className="glass-input text-xs flex-1"
                    />
                    <select
                      value={sdoWriteSize}
                      onChange={e => setSdoWriteSize(Number(e.target.value) as 1 | 2 | 4)}
                      className="glass-input text-xs w-16"
                    >
                      <option value={1}>1B</option>
                      <option value={2}>2B</option>
                      <option value={4}>4B</option>
                    </select>
                  </div>
                </div>

                {/* Feedback Panel */}
                {sdoFeedback.msg && (
                  <div className={`p-2.5 rounded border text-[11px] font-mono leading-relaxed ${
                    sdoFeedback.status === 'success'
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : sdoFeedback.status === 'error'
                      ? 'bg-red-500/5 border-red-500/20 text-red-500'
                      : 'bg-[var(--bg-card-sub)] border border-[var(--border-color)] text-[var(--text-muted)] animate-pulse'
                  }`}>
                    {sdoFeedback.msg}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSdoRead}
                  className="flex-1 glass-button text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Read (Upload)
                </button>
                <button
                  onClick={handleSdoWrite}
                  className="flex-1 bg-cyber-canopen hover:bg-amber-400 text-black font-bold text-xs py-1.5 rounded active:scale-95 transition-all"
                >
                  Write (Download)
                </button>
              </div>
            </div>
          )}

          {activeTab === 'scanner' && (
            /* SDO Index Scan Tool */
            <div className="flex-1 flex flex-col overflow-hidden gap-3">
              <div className="flex items-center gap-3 bg-[var(--bg-card-sub)] border border-[var(--border-color)] p-2.5 rounded text-xs">
                <div className="flex-1">
                  <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Scan Target Node ID</label>
                  <input
                    type="number"
                    value={scanNodeId}
                    disabled={scanStatus === 'scanning'}
                    onChange={e => setScanNodeId(Number(e.target.value))}
                    min={1}
                    max={127}
                    className="glass-input text-xs w-full"
                  />
                </div>
                
                <div className="flex items-end h-full pt-4">
                  {scanStatus === 'scanning' ? (
                    <button
                      onClick={stopScan}
                      className="glass-button text-xs hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-500 font-bold"
                    >
                      <Square className="w-3.5 h-3.5 text-red-500 fill-current" />
                      Stop Scan
                    </button>
                  ) : (
                    <button
                      onClick={startScan}
                      className="glass-button text-xs bg-cyber-canopen text-black hover:bg-amber-400 font-bold border border-amber-500/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Scan Node
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {scanStatus === 'scanning' && (
                <div className="space-y-1 bg-[var(--bg-card-sub)] border border-[var(--border-color)] p-2 rounded text-xs">
                  <div className="flex justify-between font-semibold">
                    <span className="flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-cyber-canopen" />
                      Scanning Object 0x{scanIndex.toString(16).toUpperCase()}...
                    </span>
                    <span>{scanList.length > 0 ? Math.round((scanResults.length / scanList.length) * 100) : 0}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--bg-input)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyber-canopen transition-all duration-150"
                      style={{ width: `${scanList.length > 0 ? Math.round((scanResults.length / scanList.length) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Results Table */}
              <div className="flex-1 overflow-y-auto border border-[var(--border-sub)] bg-[var(--bg-input)] rounded">
                <table className="w-full text-left text-[11px] font-mono border-collapse">
                  <thead className="sticky top-0 bg-[var(--bg-table-header)] text-[9px] text-[var(--text-muted)] border-b border-[var(--border-color)] uppercase tracking-wider select-none z-10">
                    <tr>
                      <th className="py-2 px-2.5">Index</th>
                      <th className="py-2 px-2.5">Object Name</th>
                      <th className="py-2 px-2.5">Status</th>
                      <th className="py-2 px-2.5">Data (Hex / ASCII)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-sub)]">
                    {scanResults.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-[var(--text-muted)] italic">
                          {scanStatus === 'scanning' ? 'Starting scan...' : 'No scan results. Choose node and click Scan Node.'}
                        </td>
                      </tr>
                    ) : (
                      scanResults.map(res => (
                        <tr key={res.index} className="hover:bg-white/5">
                          <td className="py-1.5 px-2.5 font-bold">0x{res.index.toString(16).toUpperCase()}</td>
                          <td className="py-1.5 px-2.5 text-[var(--text-muted)] truncate max-w-[120px]" title={res.name}>{res.name}</td>
                          <td className="py-1.5 px-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              res.status === 'found'
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                              {res.status === 'found' ? 'Found' : 'Not Found'}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5">
                            {res.status === 'found' ? (
                              <span className="text-[var(--text-color)]">
                                {res.valHex} {res.valAscii ? `("${res.valAscii}")` : ''}
                              </span>
                            ) : (
                              <span className="text-red-500/60">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'generic' && (
            /* Generic CANopen Messaging */
            <div className="flex-1 flex flex-col justify-between overflow-y-auto space-y-3.5">
              <div className="space-y-3.5">
                <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] p-3 rounded space-y-3">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Generic COB-ID Transmitter</span>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">COB-ID (Hex)</label>
                      <input
                        type="text"
                        value={genericCobIdHex}
                        onChange={e => setGenericCobIdHex(e.target.value)}
                        className="glass-input text-xs w-full font-mono"
                        placeholder="e.g. 181"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">DLC (Calculated)</label>
                      <input
                        type="text"
                        value={Math.max(0, Math.min(8, genericPayloadHex.replace(/[^0-9A-Fa-f]/g, '').length / 2))}
                        disabled
                        className="glass-input text-xs w-full bg-[var(--bg-input)] opacity-60 font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Hex Payload Data</label>
                    <input
                      type="text"
                      value={genericPayloadHex}
                      onChange={e => setGenericPayloadHex(e.target.value)}
                      placeholder="00 11 22 33 44 55 66 77"
                      className="glass-input text-xs w-full font-mono"
                    />
                  </div>
                </div>

                <div className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Use this console to transmit arbitrary CANopen frames. Standard functions map to standard COB-IDs (e.g. NMT 0x000, SYNC 0x080, Emergency 0x080, PDOs 0x180-0x57F, SDOs 0x580-0x67F, Heartbeat 0x700).
                </div>
              </div>

              <button
                onClick={handleSendGenericCanopen}
                className="w-full flex items-center justify-center gap-2 bg-cyber-canopen hover:bg-amber-400 text-black text-xs font-bold py-2 rounded shadow transition-all duration-150 active:scale-95"
              >
                <Send className="w-3.5 h-3.5 fill-current" />
                Transmit Generic Frame
              </button>
            </div>
          )}
        </div>
      ) : (
        /* J1939 Diagnostics Panel */
        <div className="flex-1 flex flex-col overflow-y-auto space-y-4">
          {/* Address Claiming */}
          <div className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-3 space-y-3">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Address Claim Simulator (PGN 60928)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[9px] text-[var(--text-muted)] mb-1">Source Address</label>
                <input
                  type="number"
                  value={j1939Sa}
                  onChange={e => setJ1939Sa(Number(e.target.value))}
                  min={0}
                  max={253}
                  className="glass-input text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-[9px] text-[var(--text-muted)] mb-1">ECU Name (64-bit Hex)</label>
                <input
                  type="text"
                  value={j1939NameHex}
                  onChange={e => setJ1939NameHex(e.target.value)}
                  className="glass-input text-xs w-full font-mono"
                  placeholder="00000000000000FF"
                />
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-[var(--bg-input)] border border-[var(--border-sub)] p-2 rounded text-[10px]">
              <span className="text-[var(--text-muted)]">Claim Status:</span>
              <span className={`font-bold ${
                claimStatus.includes('Successfully')
                  ? 'text-cyber-accent'
                  : claimStatus.includes('Failed')
                  ? 'text-red-400 animate-pulse'
                  : 'text-[var(--text-color)]'
              }`}>
                {claimStatus}
              </span>
            </div>

            <button
              onClick={handleJ1939Claim}
              className="w-full flex items-center justify-center gap-1.5 bg-[var(--bg-input)] hover:bg-[var(--bg-card-sub)] border border-[var(--border-color)] text-xs font-semibold py-1.5 rounded text-[var(--text-color)]"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-cyber-j1939" /> Send Address Claim Frame
            </button>
          </div>

          {/* BAM Broadcast segmenter */}
          <div className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-3 space-y-2.5">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">BAM Transport Protocol Sender</div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-2">
                <label className="block text-[9px] text-[var(--text-muted)] mb-1">PGN to Broadcast (Payload &gt; 8B)</label>
                <input
                  type="number"
                  value={bamPgn}
                  onChange={e => setBamPgn(Number(e.target.value))}
                  className="glass-input text-xs w-full"
                />
              </div>
              <button
                onClick={handleSendBam}
                className="bg-cyber-j1939 hover:bg-cyan-400 text-black font-bold text-xs py-1.5 rounded active:scale-95 transition-all text-center"
              >
                Send BAM
              </button>
            </div>
            <div>
              <label className="block text-[9px] text-[var(--text-muted)] mb-1">BAM Payload String (ASCII)</label>
              <input
                type="text"
                value={bamPayloadString}
                onChange={e => setBamPayloadString(e.target.value)}
                className="glass-input text-xs w-full font-mono"
              />
            </div>
          </div>

          {/* PGN Requester */}
          <div className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-3 space-y-2.5">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">PGN Request Engine (PGN 59904)</div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <div>
                <label className="block text-[9px] text-[var(--text-muted)] mb-1">Request PGN</label>
                <input
                  type="number"
                  value={reqPgn}
                  onChange={e => setReqPgn(Number(e.target.value))}
                  className="glass-input text-xs w-full font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] text-[var(--text-muted)] mb-1">Dest. Addr</label>
                <input
                  type="number"
                  value={reqDa}
                  onChange={e => setReqDa(Number(e.target.value))}
                  min={0}
                  max={255}
                  className="glass-input text-xs w-full font-mono"
                />
              </div>
              <button
                onClick={() => sendJ1939Request(reqPgn, reqDa)}
                className="glass-button text-xs flex justify-center text-center font-bold"
              >
                <Send className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
