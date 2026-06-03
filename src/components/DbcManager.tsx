import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { FileUp, Database, ShieldAlert, Search } from 'lucide-react';

export const DbcManager: React.FC = () => {
  const { dbcs, activeDbcName, loadDbcFile, unloadDbc, protocol } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMsgId, setSelectedMsgId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      loadDbcFile(file.name, content);
    };
    reader.readAsText(file);
  };

  const activeDbc = dbcs[activeDbcName];
  
  // Filter messages based on search query
  const filteredMessages = activeDbc
    ? Object.values(activeDbc.messages).filter(
        (msg) =>
          msg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.id.toString().includes(searchQuery) ||
          msg.sender.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Panel Title */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <Database className={`w-4 h-4 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
          <span className="font-semibold text-[var(--text-color)] text-sm">DBC Database Manager</span>
        </div>
        {activeDbcName && !activeDbcName.startsWith('Default') && (
          <button
            onClick={unloadDbc}
            className="text-[10px] text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            Unload DBC
          </button>
        )}
      </div>

      {/* Database Status */}
      <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-2.5 mb-4 text-xs">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[var(--text-muted)]">Active DBC:</span>
          <span className="text-[var(--text-color)] font-medium truncate max-w-[150px]" title={activeDbcName}>
            {activeDbcName || 'None Loaded'}
          </span>
        </div>
        {activeDbc && (
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[var(--border-color)] text-[var(--text-muted)]">
            <div>Nodes: <strong className="text-[var(--text-color)]">{activeDbc.nodes.length}</strong></div>
            <div>Messages: <strong className="text-[var(--text-color)]">{Object.keys(activeDbc.messages).length}</strong></div>
          </div>
        )}
      </div>

      {/* DBC Upload */}
      <div className="mb-4">
        <input
          type="file"
          accept=".dbc"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[var(--border-color)] hover:border-[var(--text-muted)] rounded bg-[var(--bg-input)] hover:bg-[var(--bg-card-sub)] text-xs font-semibold text-[var(--text-color)] transition-all duration-150"
        >
          <FileUp className="w-4 h-4 text-[var(--text-muted)]" />
          Load DBC Database (.dbc)
        </button>
      </div>

      {/* Database Search & List */}
      {activeDbc ? (
        <div className="flex-1 flex flex-col overflow-hidden gap-3">
          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search ID, name, sender..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-8 py-1.5 text-xs"
            />
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          {/* List of Messages */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredMessages.length === 0 ? (
              <div className="text-center text-xs text-[var(--text-muted)] py-4">No matching messages found</div>
            ) : (
              filteredMessages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedMsgId(selectedMsgId === msg.id ? null : msg.id)}
                  className={`p-2 rounded border cursor-pointer transition-all duration-150 text-left ${
                    selectedMsgId === msg.id
                      ? 'bg-[var(--bg-input)] border-[var(--text-muted)]'
                      : 'bg-[var(--bg-card-sub)] border-[var(--border-sub)] hover:bg-[var(--bg-input)]'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs text-[var(--text-color)] truncate max-w-[170px]" title={msg.name}>
                      {msg.name}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">
                      0x{msg.id.toString(16).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-1">
                    <span>Sender: <strong className="text-[var(--text-color)]">{msg.sender}</strong></span>
                    <span>DLC: {msg.dlc}</span>
                  </div>

                  {/* Signals list under selected message */}
                  {selectedMsgId === msg.id && (
                    <div className="mt-2.5 pt-2.5 border-t border-[var(--border-color)] space-y-2" onClick={(e) => e.stopPropagation()}>
                      <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Signals</div>
                      {msg.signals.length === 0 ? (
                        <div className="text-[10px] text-[var(--text-muted)] italic">No signals defined in database</div>
                      ) : (
                        msg.signals.map((sig) => (
                          <div key={sig.name} className="bg-[var(--bg-input)] rounded p-1.5 border border-[var(--border-sub)]">
                            <div className="flex justify-between text-xs font-semibold text-[var(--text-color)]">
                              <span className="truncate max-w-[180px]" title={sig.name}>{sig.name}</span>
                              <span className="text-[var(--text-muted)] text-[10px] font-mono">
                                {sig.startBit}|{sig.length}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-[var(--text-muted)] mt-1 border-t border-[var(--border-sub)] pt-1">
                              <div>Scale: <span className="text-[var(--text-color)]">{sig.factor}</span></div>
                              <div>Offset: <span className="text-[var(--text-color)]">{sig.offset}</span></div>
                              <div>Range: <span className="text-[var(--text-color)]">[{sig.min} | {sig.max}]</span></div>
                              <div>Unit: <span className="text-[var(--text-color)]">{sig.unit || 'n/a'}</span></div>
                              <div>Byte Order: <span className="text-[var(--text-color)]">{sig.isLittleEndian ? 'Intel' : 'Motorola'}</span></div>
                              <div>Type: <span className="text-[var(--text-color)]">{sig.isSigned ? 'Signed' : 'Unsigned'}</span></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <ShieldAlert className="w-8 h-8 text-[var(--text-muted)] mb-2 animate-pulse" />
          <span className="text-xs text-[var(--text-muted)]">No database loaded. Load a vector .dbc file to enable parameters decoding.</span>
        </div>
      )}
    </div>
  );
};
