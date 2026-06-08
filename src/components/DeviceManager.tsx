import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Cpu, Plus, ToggleLeft, ToggleRight, Trash2, Sliders, EyeOff, Edit } from 'lucide-react';
import { encodeFrame, decodeFrame } from '../lib/dbcParser';

export const DeviceManager: React.FC = () => {
  const {
    devices,
    addDevice,
    updateDevice,
    removeDevice,
    addCustomMessage,
    updateCustomMessage,
    removeCustomMessage,
    dbcs,
    activeDbcName,
    protocol,
    projectSettings,
    toggleMessageDisabledInProject
  } = useStore();

  const [activeTab, setActiveTab] = useState<'devices' | 'project-ids'>('devices');
  const [newDevName, setNewDevName] = useState('');
  const [newDevNodeId, setNewDevNodeId] = useState<number>(10);
  
  // Custom message creation form state
  const [targetDevId, setTargetDevId] = useState<string | null>(null);
  const [editingMsg, setEditingMsg] = useState<any | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('');
  const [signalValues, setSignalValues] = useState<Record<string, number>>({});

  const [msgHexId, setMsgHexId] = useState('180');
  const [msgName, setMsgName] = useState('CustomPDO');
  const [msgDlc, setMsgDlc] = useState(8);
  const [msgDataHex, setMsgDataHex] = useState('0000000000000000');
  const [msgInterval, setMsgInterval] = useState(500);

  const activeDbc = dbcs[activeDbcName];

  const handleCreateDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDevName.trim()) return;

    addDevice({
      id: `dev-${Date.now()}`,
      name: newDevName,
      nodeId: newDevNodeId,
      enabled: true,
      isSimulated: true
    });

    setNewDevName('');
    // increment for convenience
    setNewDevNodeId(prev => prev + 1);
  };

  const handleTemplateChange = (key: string) => {
    setSelectedTemplateKey(key);
    if (!key) {
      setSignalValues({});
      return;
    }

    const [dbcName, msgIdStr] = key.split('|');
    const msgId = parseInt(msgIdStr, 10);
    const templateDbc = dbcs[dbcName];
    const templateMsg = templateDbc?.messages[msgId];

    if (templateMsg) {
      setMsgName(templateMsg.name);
      setMsgHexId(templateMsg.id.toString(16).toUpperCase());
      setMsgDlc(templateMsg.dlc || 8);

      // Initialize signal values
      const initVals: Record<string, number> = {};
      templateMsg.signals.forEach(sig => {
        initVals[sig.name] = Math.max(sig.min, Math.min(sig.max, 0));
      });
      setSignalValues(initVals);

      // Encode payload
      const encoded = encodeFrame(msgId, initVals, templateDbc);
      if (encoded) {
        const hex = Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join('');
        setMsgDataHex(hex);
      }
    }
  };

  const handleSignalValueChange = (sigName: string, valueStr: string) => {
    const num = parseFloat(valueStr);
    const val = isNaN(num) ? 0 : num;
    const nextVals = {
      ...signalValues,
      [sigName]: val
    };
    setSignalValues(nextVals);

    // Re-encode
    if (selectedTemplateKey) {
      const [dbcName, msgIdStr] = selectedTemplateKey.split('|');
      const msgId = parseInt(msgIdStr, 10);
      const templateDbc = dbcs[dbcName];
      if (templateDbc) {
        const encoded = encodeFrame(msgId, nextVals, templateDbc);
        if (encoded) {
          const hex = Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join('');
          setMsgDataHex(hex);
        }
      }
    }
  };

  const handleHexPayloadChange = (hexStr: string) => {
    setMsgDataHex(hexStr);
    
    // If template is active, try to decode the entered hex back into signals
    if (selectedTemplateKey) {
      const [dbcName, msgIdStr] = selectedTemplateKey.split('|');
      const msgId = parseInt(msgIdStr, 10);
      const templateDbc = dbcs[dbcName];
      if (templateDbc) {
        const cleanHex = hexStr.replace(/\s+/g, '');
        const dataBytes = new Uint8Array(
          (cleanHex.match(/.{1,2}/g) || []).map(b => parseInt(b, 16) || 0)
        );
        const paddedBytes = new Uint8Array(msgDlc);
        paddedBytes.set(dataBytes.slice(0, msgDlc));

        const decoded = decodeFrame(msgId, paddedBytes, templateDbc);
        if (decoded) {
          setSignalValues(decoded);
        }
      }
    }
  };

  const handleOpenEditModal = (devId: string, msg: any) => {
    setTargetDevId(devId);
    setEditingMsg(msg);
    setMsgHexId(msg.id.toString(16).toUpperCase());
    setMsgName(msg.name);
    setMsgDlc(msg.dlc);
    setMsgInterval(msg.interval);

    const hex = Array.from(msg.data as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
    setMsgDataHex(hex);

    if (msg.templateKey) {
      setSelectedTemplateKey(msg.templateKey);
      const [dbcName, msgIdStr] = msg.templateKey.split('|');
      const msgId = parseInt(msgIdStr, 10);
      const templateDbc = dbcs[dbcName];
      const templateMsg = templateDbc?.messages[msgId];
      const initVals: Record<string, number> = {};
      if (templateMsg) {
        templateMsg.signals.forEach(sig => {
          initVals[sig.name] = msg.signals && msg.signals[sig.name] !== undefined 
            ? msg.signals[sig.name] 
            : Math.max(sig.min, Math.min(sig.max, 0));
        });
      }
      setSignalValues(initVals);
    } else {
      setSelectedTemplateKey('');
      setSignalValues({});
    }
  };

  const handleCancelModal = () => {
    setTargetDevId(null);
    setEditingMsg(null);
    setSelectedTemplateKey('');
    setSignalValues({});
    setMsgHexId('180');
    setMsgName('CustomPDO');
    setMsgDlc(8);
    setMsgDataHex('0000000000000000');
    setMsgInterval(500);
  };

  const handleCreateCustomMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDevId) return;

    let id = parseInt(msgHexId, 16);
    if (isNaN(id)) {
      id = parseInt(msgHexId, 10);
    }
    if (isNaN(id)) {
      alert('Invalid CAN Identifier.');
      return;
    }

    // Convert hex payload string into Uint8Array
    const cleanHex = msgDataHex.replace(/\s+/g, '');
    const dataBytes = new Uint8Array(
      (cleanHex.match(/.{1,2}/g) || []).map(b => parseInt(b, 16) || 0)
    );

    // Make sure payload is padded to DLC length
    const finalData = new Uint8Array(msgDlc);
    finalData.set(dataBytes.slice(0, msgDlc));

    const dev = devices.find(d => d.id === targetDevId);
    if (!dev) return;

    if (editingMsg) {
      if (id !== editingMsg.id && dev.customMessages.some(m => m.id === id)) {
        alert(`A custom message with ID 0x${id.toString(16).toUpperCase()} already exists.`);
        return;
      }
      updateCustomMessage(targetDevId, editingMsg.id, {
        id,
        name: msgName || `Msg_0x${msgHexId}`,
        dlc: msgDlc,
        data: finalData,
        interval: msgInterval,
        signals: selectedTemplateKey ? signalValues : undefined,
        templateKey: selectedTemplateKey || undefined
      });
    } else {
      if (dev.customMessages.some(m => m.id === id)) {
        alert(`A custom message with ID 0x${id.toString(16).toUpperCase()} already exists.`);
        return;
      }
      addCustomMessage(targetDevId, {
        id,
        name: msgName || `Msg_0x${msgHexId}`,
        dlc: msgDlc,
        data: finalData,
        interval: msgInterval,
        enabled: true,
        signals: selectedTemplateKey ? signalValues : undefined,
        templateKey: selectedTemplateKey || undefined
      });
    }

    handleCancelModal();
  };

  // Collect all known message IDs across loaded DBC and devices
  const allKnownMessages: Array<{ id: number; name: string; source: string }> = [];

  if (activeDbc) {
    Object.values(activeDbc.messages).forEach(msg => {
      allKnownMessages.push({
        id: msg.id,
        name: msg.name,
        source: 'DBC'
      });
    });
  }

  devices.forEach(dev => {
    dev.customMessages.forEach(msg => {
      if (!allKnownMessages.some(m => m.id === msg.id)) {
        allKnownMessages.push({
          id: msg.id,
          name: msg.name,
          source: `${dev.name}`
        });
      }
    });
  });

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Selector Tabs */}
      <div className="flex bg-[var(--bg-input)] rounded p-1 mb-4 border border-[var(--border-color)]">
        <button
          onClick={() => setActiveTab('devices')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all duration-150 ${
            activeTab === 'devices'
              ? 'bg-[var(--bg-card)] text-[var(--text-color)] shadow border border-[var(--border-color)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'
          }`}
        >
          Logical Devices
        </button>
        <button
          onClick={() => setActiveTab('project-ids')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded transition-all duration-150 ${
            activeTab === 'project-ids'
              ? 'bg-[var(--bg-card)] text-[var(--text-color)] shadow border border-[var(--border-color)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'
          }`}
        >
          Project IDs Checklist
        </button>
      </div>

      {activeTab === 'devices' ? (
        <div className="flex-1 flex flex-col overflow-hidden gap-4">
          {/* Add Device Form */}
          <form onSubmit={handleCreateDevice} className="bg-[var(--bg-card-sub)] rounded border border-[var(--border-color)] p-2.5">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-2">Create Device (ECU)</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder="ECU Name (e.g. Pump)"
                value={newDevName}
                onChange={e => setNewDevName(e.target.value)}
                className="glass-input text-xs w-full"
              />
              <input
                type="number"
                placeholder={protocol === 'j1939' ? 'SA (0-253)' : 'NodeID (1-127)'}
                value={newDevNodeId}
                onChange={e => setNewDevNodeId(Number(e.target.value))}
                min={protocol === 'j1939' ? 0 : 1}
                max={protocol === 'j1939' ? 253 : 127}
                className="glass-input text-xs w-full"
              />
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1 bg-[var(--bg-input)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] rounded py-1.5 text-xs text-[var(--text-color)] transition-all font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Create Node
            </button>
          </form>

          {/* Device list */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {devices.map(dev => (
              <div key={dev.id} className="bg-[var(--bg-card-sub)] border border-[var(--border-sub)] rounded-lg p-3">
                {/* Header */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className={`w-4 h-4 ${dev.enabled ? 'text-cyber-accent' : 'text-[var(--text-muted)]'}`} />
                    <div>
                      <div className="text-xs font-bold text-[var(--text-color)] leading-none">{dev.name}</div>
                      <span className="text-[9px] text-[var(--text-muted)]">
                        {protocol === 'j1939' ? `Source Address: ${dev.nodeId}` : `Node ID: ${dev.nodeId}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Enable toggle */}
                    <button
                      onClick={() => updateDevice(dev.id, { enabled: !dev.enabled })}
                      className="text-[var(--text-muted)] hover:text-[var(--text-color)]"
                      title={dev.enabled ? 'Disable Node' : 'Enable Node'}
                    >
                      {dev.enabled ? (
                        <ToggleRight className="w-6 h-6 text-cyber-accent" />
                      ) : (
                        <ToggleLeft className="w-6 h-6" />
                      )}
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => removeDevice(dev.id)}
                      className="text-[var(--text-muted)] hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub configuration options */}
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] p-1.5 rounded border border-[var(--border-sub)] mb-2.5">
                  <span>Simulation logic:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dev.isSimulated}
                      onChange={e => updateDevice(dev.id, { isSimulated: e.target.checked })}
                      className="rounded bg-black/10 border-[var(--border-color)]"
                    />
                    <span>Active (False CAN)</span>
                  </label>
                </div>

                {/* Custom messages on device */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Device Custom TX</span>
                    <button
                      onClick={() => setTargetDevId(dev.id)}
                      className="text-[9px] text-cyber-j1939 flex items-center gap-0.5 hover:underline font-semibold"
                    >
                      <Plus className="w-3 h-3" /> Add Message
                    </button>
                  </div>

                  {dev.customMessages.length === 0 ? (
                    <div className="text-[10px] text-[var(--text-muted)] italic">No custom messages configured</div>
                  ) : (
                    dev.customMessages.map(msg => (
                      <div key={msg.id} className="flex justify-between items-center text-[10px] bg-[var(--bg-input)] border border-[var(--border-sub)] px-2 py-1 rounded">
                        <div className="flex items-center gap-1.5 truncate max-w-[120px]">
                          <span className="font-mono text-[var(--text-muted)] font-semibold">0x{msg.id.toString(16).toUpperCase()}</span>
                          <span className="text-[var(--text-color)] truncate" title={msg.name}>{msg.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text-muted)] font-mono">{msg.interval}ms</span>
                          <button
                            onClick={() => handleOpenEditModal(dev.id, msg)}
                            className="text-[var(--text-muted)] hover:text-cyber-accent"
                            title="Edit Custom Message"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeCustomMessage(dev.id, msg.id)}
                            className="text-[var(--text-muted)] hover:text-red-500 font-bold text-xs"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Modal Custom Message Creator Form */}
          {targetDevId && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="glass-panel p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-[var(--text-color)] mb-4">
                  {editingMsg ? 'Edit Custom Message' : 'Add Custom Message to Device'}
                </h3>
                <form onSubmit={handleCreateCustomMessage} className="space-y-3.5">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DBC Message Template</label>
                    <select
                      value={selectedTemplateKey}
                      onChange={e => handleTemplateChange(e.target.value)}
                      className="glass-input w-full text-xs"
                    >
                      <option value="">-- Custom Message (No Template) --</option>
                      {Object.entries(dbcs).map(([dbcName, db]) => (
                        <optgroup key={dbcName} label={dbcName}>
                          {Object.values(db.messages).map(msg => (
                            <option key={`${dbcName}|${msg.id}`} value={`${dbcName}|${msg.id}`}>
                              {msg.name} (0x{msg.id.toString(16).toUpperCase()})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">CAN Identifier (Hex)</label>
                    <input
                      type="text"
                      value={msgHexId}
                      onChange={e => setMsgHexId(e.target.value)}
                      className="glass-input w-full text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Message Name</label>
                    <input
                      type="text"
                      value={msgName}
                      onChange={e => setMsgName(e.target.value)}
                      className="glass-input w-full text-xs"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">DLC (1-8)</label>
                      <input
                        type="number"
                        value={msgDlc}
                        onChange={e => setMsgDlc(Number(e.target.value))}
                        min={1}
                        max={8}
                        className="glass-input w-full text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Interval (ms, 0=once)</label>
                      <input
                        type="number"
                        value={msgInterval}
                        onChange={e => setMsgInterval(Number(e.target.value))}
                        min={0}
                        className="glass-input w-full text-xs"
                        required
                      />
                    </div>
                  </div>

                  {(() => {
                    if (!selectedTemplateKey) return null;
                    const [dbcName, msgIdStr] = selectedTemplateKey.split('|');
                    const msgId = parseInt(msgIdStr, 10);
                    const templateMsg = dbcs[dbcName]?.messages[msgId];
                    if (!templateMsg || !templateMsg.signals || templateMsg.signals.length === 0) return null;
                    
                    return (
                      <div className="space-y-2 max-h-40 overflow-y-auto p-2 bg-[var(--bg-input)] rounded border border-[var(--border-sub)]">
                        <div className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Signals (Physical values)</div>
                        {templateMsg.signals.map(sig => {
                          const val = signalValues[sig.name] !== undefined ? signalValues[sig.name] : Math.max(sig.min, Math.min(sig.max, 0));
                          return (
                            <div key={sig.name} className="flex flex-col gap-0.5">
                              <div className="flex justify-between text-[9px]">
                                <span className="font-semibold text-[var(--text-color)]">{sig.name}</span>
                                <span className="text-[var(--text-muted)]">
                                  [{sig.min}, {sig.max}] {sig.unit}
                                </span>
                              </div>
                              <input
                                type="number"
                                step="any"
                                value={val}
                                onChange={e => handleSignalValueChange(sig.name, e.target.value)}
                                className="glass-input py-0.5 px-2 text-[11px] w-full"
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Hex Payload Data</label>
                    <input
                      type="text"
                      value={msgDataHex}
                      onChange={e => handleHexPayloadChange(e.target.value)}
                      placeholder="0011223344556677"
                      className="glass-input w-full text-xs font-mono"
                      required
                    />
                  </div>
                  
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelModal}
                      className="flex-1 glass-button"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-cyber-accent border border-cyber-accent/40 text-black hover:bg-emerald-400 text-xs font-bold rounded py-1.5 active:scale-95"
                    >
                      {editingMsg ? 'Save Changes' : 'Save Message'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Project message list */}
          <div className="text-xs text-[var(--text-muted)] mb-3 bg-[var(--bg-input)] p-2 rounded border border-[var(--border-sub)]">
            Check or uncheck identifiers to selectively enable/disable specific message types from transmitting in this project simulation.
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {allKnownMessages.length === 0 ? (
              <div className="text-center text-xs text-[var(--text-muted)] py-6">No message templates defined yet</div>
            ) : (
              allKnownMessages.map(msg => {
                const isDisabled = !!projectSettings.disabledMessageIds[msg.id];
                return (
                  <div
                    key={msg.id}
                    onClick={() => toggleMessageDisabledInProject(msg.id)}
                    className={`flex items-center justify-between p-2 rounded border cursor-pointer select-none transition-all duration-150 ${
                      isDisabled 
                        ? 'bg-red-500/5 border-red-500/20 text-[var(--text-muted)] hover:bg-red-500/10' 
                        : 'bg-[var(--bg-card-sub)] border-[var(--border-sub)] text-[var(--text-color)] hover:bg-[var(--bg-input)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate max-w-[220px]">
                      {isDisabled ? (
                        <EyeOff className="w-4 h-4 text-red-400 shrink-0" />
                      ) : (
                        <Sliders className="w-4 h-4 text-cyber-accent shrink-0" />
                      )}
                      <div>
                        <div className={`text-xs font-semibold leading-none ${isDisabled ? 'line-through text-red-400' : 'text-[var(--text-color)]'}`}>
                          {msg.name}
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)] font-mono">
                          ID: 0x{msg.id.toString(16).toUpperCase()} ({msg.source})
                        </span>
                      </div>
                    </div>
                    <div>
                      {isDisabled ? (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                          Disabled
                        </span>
                      ) : (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-cyber-accent/20 text-cyber-accent font-semibold">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
