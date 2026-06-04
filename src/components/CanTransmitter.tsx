import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Send, Clock } from 'lucide-react';
import { encodeFrame } from '../lib/dbcParser';
import { buildJ1939Id, parseJ1939Id } from '../lib/j1939';

export const CanTransmitter: React.FC = () => {
  const { dbcs, activeDbcName, transmitFrame, isConnected, protocol } = useStore();

  const [mode, setMode] = useState<'raw' | 'dbc'>('raw');
  
  // Raw mode state
  const [rawIdHex, setRawIdHex] = useState('18F00401');
  const [rawDlc, setRawDlc] = useState(8);
  const [rawPayloadHex, setRawPayloadHex] = useState('00 00 00 00 00 00 00 00');
  const [isRawPeriodic, setIsRawPeriodic] = useState(false);
  const [rawInterval, setRawInterval] = useState(100);
  const [rawTimerId, setRawTimerId] = useState<ReturnType<typeof setInterval> | null>(null);

  // J1939 specific builder states
  const [j1939Priority, setJ1939Priority] = useState(6);
  const [j1939PgnHex, setJ1939PgnHex] = useState('F004');
  const [j1939Sa, setJ1939Sa] = useState(1);
  const [j1939Da, setJ1939Da] = useState(255);

  const syncJ1939ToRaw = (pri: number, pgnStr: string, sa: number, da: number) => {
    const cleanPgn = pgnStr.replace(/[^0-9A-Fa-f]/g, '');
    const pgn = (pgnStr.toLowerCase().startsWith('0x') || isNaN(Number(pgnStr)))
      ? (parseInt(cleanPgn, 16) || 0)
      : (parseInt(cleanPgn, 10) || 0);

    const compiled = buildJ1939Id(pri, pgn, sa, da);
    setRawIdHex(compiled.toString(16).toUpperCase());
  };

  const handleRawIdChange = (val: string) => {
    setRawIdHex(val);
    const parsed = parseInt(val, 16);
    if (!isNaN(parsed) && protocol === 'j1939') {
      try {
        const details = parseJ1939Id(parsed);
        setJ1939Priority(details.priority);
        setJ1939PgnHex(details.pgn.toString(16).toUpperCase());
        setJ1939Sa(details.sa);
        setJ1939Da(details.da ?? 255);
      } catch (e) {
        console.error(e);
      }
    }
  };

  // DBC mode state
  const [selectedMsgId, setSelectedMsgId] = useState<number>(0);
  const [signalValues, setSignalValues] = useState<Record<string, number>>({});
  const [isDbcPeriodic, setIsDbcPeriodic] = useState(false);
  const [dbcInterval, setDbcInterval] = useState(100);
  const [dbcTimerId, setDbcTimerId] = useState<ReturnType<typeof setInterval> | null>(null);

  const activeDbc = dbcs[activeDbcName];
  const dbcMessages = React.useMemo(() => {
    return activeDbc ? Object.values(activeDbc.messages) : [];
  }, [activeDbc]);

  // Reset active timers on unmount
  useEffect(() => {
    return () => {
      if (rawTimerId) clearInterval(rawTimerId);
      if (dbcTimerId) clearInterval(dbcTimerId);
    };
  }, [rawTimerId, dbcTimerId]);

  // Set default DBC message when DBC list changes
  useEffect(() => {
    if (dbcMessages.length > 0 && selectedMsgId === 0) {
      const firstMsg = dbcMessages[0];
      
      // Initialize signal values to min or default
      const initVals: Record<string, number> = {};
      firstMsg.signals.forEach(sig => {
        initVals[sig.name] = sig.min || 0;
      });

      setTimeout(() => {
        setSelectedMsgId(firstMsg.id);
        setSignalValues(initVals);
      }, 0);
    }
  }, [activeDbcName, dbcMessages, selectedMsgId]);

  // Handle changing DBC message select
  const handleMessageChange = (id: number) => {
    setSelectedMsgId(id);
    const msg = dbcMessages.find(m => m.id === id);
    if (msg) {
      const initVals: Record<string, number> = {};
      msg.signals.forEach(sig => {
        initVals[sig.name] = sig.min || 0;
      });
      setSignalValues(initVals);
    }

    // Stop active periodic sends if target message changes
    if (dbcTimerId) {
      clearInterval(dbcTimerId);
      setDbcTimerId(null);
      setIsDbcPeriodic(false);
    }
  };

  const handleSignalSliderChange = (sigName: string, val: number) => {
    setSignalValues(prev => ({
      ...prev,
      [sigName]: val
    }));
  };

  // Compile raw hex string to buffer
  const parseRawPayload = (hexStr: string, dlc: number): Uint8Array => {
    const clean = hexStr.replace(/[^0-9A-Fa-f]/g, '');
    const dataBytes = new Uint8Array(
      (clean.match(/.{1,2}/g) || []).map(b => parseInt(b, 16) || 0)
    );
    const result = new Uint8Array(dlc);
    result.set(dataBytes.slice(0, dlc));
    return result;
  };

  // 1. Raw mode send trigger
  const handleSendRaw = () => {
    const id = parseInt(rawIdHex, 16);
    if (isNaN(id)) return;
    const payload = parseRawPayload(rawPayloadHex, rawDlc);
    transmitFrame(id, payload);
  };

  // Toggle raw mode periodic timer
  const handleToggleRawPeriodic = () => {
    if (rawTimerId) {
      clearInterval(rawTimerId);
      setRawTimerId(null);
      setIsRawPeriodic(false);
    } else {
      const id = parseInt(rawIdHex, 16);
      if (isNaN(id)) return;
      const interval = Math.max(10, rawInterval);
      
      const timer = setInterval(() => {
        const payload = parseRawPayload(rawPayloadHex, rawDlc);
        transmitFrame(id, payload);
      }, interval);

      setRawTimerId(timer);
      setIsRawPeriodic(true);
    }
  };

  // 2. DBC mode send trigger
  const getDbcEncodedPayload = (): Uint8Array | null => {
    if (!activeDbc || !selectedMsgId) return null;
    return encodeFrame(selectedMsgId, signalValues, activeDbc);
  };

  const handleSendDbc = () => {
    const payload = getDbcEncodedPayload();
    if (payload) {
      transmitFrame(selectedMsgId, payload);
    }
  };

  // Toggle DBC mode periodic timer
  const handleToggleDbcPeriodic = () => {
    if (dbcTimerId) {
      clearInterval(dbcTimerId);
      setDbcTimerId(null);
      setIsDbcPeriodic(false);
    } else {
      const interval = Math.max(10, dbcInterval);
      
      const timer = setInterval(() => {
        const payload = getDbcEncodedPayload();
        if (payload) {
          transmitFrame(selectedMsgId, payload);
        }
      }, interval);

      setDbcTimerId(timer);
      setIsDbcPeriodic(true);
    }
  };

  const currentDbcMsg = dbcMessages.find(m => m.id === selectedMsgId);
  const dbcPreviewPayload = getDbcEncodedPayload();
  const dbcPreviewHex = dbcPreviewPayload 
    ? Array.from(dbcPreviewPayload).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
    : '';

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Panel header tabs */}
      <div className="flex bg-[var(--bg-input)] rounded p-1 mb-4 border border-[var(--border-color)]">
        <button
          onClick={() => setMode('raw')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
            mode === 'raw'
              ? 'bg-[var(--bg-card)] text-[var(--text-color)] shadow border border-[var(--border-color)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'
          }`}
        >
          Raw CAN Builder
        </button>
        <button
          onClick={() => setMode('dbc')}
          disabled={dbcMessages.length === 0}
          className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors disabled:opacity-30 disabled:pointer-events-none ${
            mode === 'dbc'
              ? 'bg-[var(--bg-card)] text-[var(--text-color)] shadow border border-[var(--border-color)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'
          }`}
        >
          DBC Signal Encoder
        </button>
      </div>

      {!isConnected && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded text-[11px] mb-3 leading-snug">
          Bus is Disconnected. Sent messages will be logged, but receivers won't acknowledge. Connect the bus to initiate traffic loops.
        </div>
      )}

      {/* Raw Transmission Section */}
      {mode === 'raw' ? (
        <div className="flex-1 flex flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Frame ID (Hex)</label>
                <input
                  type="text"
                  value={rawIdHex}
                  onChange={e => handleRawIdChange(e.target.value)}
                  className="glass-input w-full text-xs font-mono"
                  placeholder={protocol === 'j1939' ? 'e.g. 18F00401' : 'e.g. 181'}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DLC (1-8)</label>
                <input
                  type="number"
                  value={rawDlc}
                  onChange={e => setRawDlc(Math.max(1, Math.min(8, Number(e.target.value))))}
                  min={1}
                  max={8}
                  className="glass-input w-full text-xs"
                />
              </div>
            </div>

            {protocol === 'j1939' && (
              <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-2.5 space-y-2">
                <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">J1939 Identifier Builder</span>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[8px] font-semibold text-[var(--text-muted)] mb-0.5">Priority</label>
                    <select
                      value={j1939Priority}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setJ1939Priority(val);
                        syncJ1939ToRaw(val, j1939PgnHex, j1939Sa, j1939Da);
                      }}
                      className="glass-input text-[10px] px-1 py-0.5 w-full font-semibold"
                    >
                      {Array.from({ length: 8 }, (_, i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-semibold text-[var(--text-muted)] mb-0.5">PGN</label>
                    <input
                      type="text"
                      value={j1939PgnHex}
                      onChange={(e) => {
                        const val = e.target.value;
                        setJ1939PgnHex(val);
                        syncJ1939ToRaw(j1939Priority, val, j1939Sa, j1939Da);
                      }}
                      placeholder="e.g. F004"
                      className="glass-input text-[10px] px-1 py-0.5 w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] font-semibold text-[var(--text-muted)] mb-0.5">SA (Src)</label>
                    <input
                      type="number"
                      value={j1939Sa}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(253, Number(e.target.value)));
                        setJ1939Sa(val);
                        syncJ1939ToRaw(j1939Priority, j1939PgnHex, val, j1939Da);
                      }}
                      min={0}
                      max={253}
                      className="glass-input text-[10px] px-1 py-0.5 w-full font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] font-semibold text-[var(--text-muted)] mb-0.5">DA (Dest)</label>
                    <input
                      type="number"
                      value={j1939Da}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(255, Number(e.target.value)));
                        setJ1939Da(val);
                        syncJ1939ToRaw(j1939Priority, j1939PgnHex, j1939Sa, val);
                      }}
                      min={0}
                      max={255}
                      className="glass-input text-[10px] px-1 py-0.5 w-full font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Hex Payload Data</label>
              <input
                type="text"
                value={rawPayloadHex}
                onChange={e => setRawPayloadHex(e.target.value)}
                placeholder="00 11 22 33 44 55 66 77"
                className="glass-input w-full text-xs font-mono"
              />
            </div>

            {/* Periodic timer settings */}
            <div className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isRawPeriodic}
                  onChange={handleToggleRawPeriodic}
                  className="rounded bg-black/10 border-[var(--border-color)] text-cyber-accent"
                />
                <span className="text-xs text-[var(--text-color)] font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Cyclical Transmit Loop
                </span>
              </label>

              {isRawPeriodic && (
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-[11px] text-[var(--text-muted)]">Interval:</span>
                  <input
                    type="number"
                    value={rawInterval}
                    onChange={e => setRawInterval(Number(e.target.value))}
                    min={10}
                    className="glass-input text-xs w-20"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">ms</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSendRaw}
            disabled={isRawPeriodic}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold py-2 rounded shadow transition-all duration-150 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            {isRawPeriodic ? 'Cycle Running...' : 'Transmit Single Shot'}
          </button>
        </div>
      ) : (
        /* DBC-Driven Transmission Section */
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden gap-3.5">
            {/* DBC Message Selector */}
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Select Message template</label>
              <select
                value={selectedMsgId}
                onChange={e => handleMessageChange(Number(e.target.value))}
                className="glass-input w-full pr-4 text-xs font-semibold"
              >
                {dbcMessages.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} (0x{m.id.toString(16).toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Render sliders for each signal inside the selected message */}
            <div className="flex-1 overflow-y-auto space-y-3.5 border border-[var(--border-sub)] bg-[var(--bg-card-sub)] rounded p-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Signal Controllers</span>
              
              {!currentDbcMsg || currentDbcMsg.signals.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] italic text-center py-6">No signals in message.</div>
              ) : (
                currentDbcMsg.signals.map(sig => {
                  const val = signalValues[sig.name] ?? sig.min ?? 0;
                  return (
                    <div key={sig.name} className="space-y-1 bg-[var(--bg-input)] p-2.5 rounded border border-[var(--border-sub)]">
                      <div className="flex justify-between text-xs font-semibold text-[var(--text-color)]">
                        <span className="truncate max-w-[140px]" title={sig.name}>{sig.name}</span>
                        <span className="text-[var(--text-color)] font-mono">
                          {val.toFixed(2).replace(/\.?0+$/, '')}
                          <span className="text-[9px] text-[var(--text-muted)] ml-0.5 font-medium">{sig.unit}</span>
                        </span>
                      </div>
                      
                      {/* Range slider */}
                      <input
                        type="range"
                        min={sig.min}
                        max={sig.max}
                        step={sig.factor}
                        value={val}
                        onChange={e => handleSignalSliderChange(sig.name, parseFloat(e.target.value))}
                        className="w-full h-1 bg-[var(--bg-card-sub)] rounded-lg appearance-none cursor-pointer accent-cyber-accent"
                      />
                      <div className="flex justify-between text-[9px] text-[var(--text-muted)] font-mono">
                        <span>Min: {sig.min}</span>
                        <span>Max: {sig.max}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Realtime encoded HEX preview */}
            <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-2.5">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Encoded Frame Payload Preview</span>
              <div className="text-xs font-mono text-cyber-accent tracking-widest font-bold">
                {dbcPreviewHex || '00 00 00 00 00 00 00 00'}
              </div>
            </div>

            {/* Periodic timer settings */}
            <div className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDbcPeriodic}
                  onChange={handleToggleDbcPeriodic}
                  className="rounded bg-black/10 border-[var(--border-color)] text-cyber-accent"
                />
                <span className="text-xs text-[var(--text-color)] font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  Cyclical Transmit Loop
                </span>
              </label>

              {isDbcPeriodic && (
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-[11px] text-[var(--text-muted)]">Interval:</span>
                  <input
                    type="number"
                    value={dbcInterval}
                    onChange={e => setDbcInterval(Number(e.target.value))}
                    min={10}
                    className="glass-input text-xs w-20"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">ms</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSendDbc}
            disabled={isDbcPeriodic}
            className={`w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none text-black text-xs font-bold py-2 rounded shadow transition-all duration-150 active:scale-95 ${
              protocol === 'j1939' ? 'bg-cyber-j1939 hover:bg-cyan-400' : 'bg-cyber-canopen hover:bg-amber-400'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            {isDbcPeriodic ? 'Cycle Running...' : 'Transmit Encoded Frame'}
          </button>
        </div>
      )}
    </div>
  );
};
