import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { FileUp, Database, ShieldAlert, Search, Download } from 'lucide-react';
import { saveTextFile } from '../lib/tauriAdapter';

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
          msg.id.toString(16).toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.sender.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleExportSpecification = () => {
    if (!activeDbc) return;

    let csv = 'Message Name,Message ID (Hex),DLC,Sender,Signal Name,Start Bit,Length,Factor,Offset,Unit,Min,Max,Byte Order,Type\n';

    Object.values(activeDbc.messages).forEach(msg => {
      if (msg.signals.length === 0) {
        csv += `"${msg.name}",0x${msg.id.toString(16).toUpperCase()},${msg.dlc},"${msg.sender}",,,,,,,,,,\n`;
      } else {
        msg.signals.forEach(sig => {
          csv += `"${msg.name}",0x${msg.id.toString(16).toUpperCase()},${msg.dlc},"${msg.sender}","${sig.name}",${sig.startBit},${sig.length},${sig.factor},${sig.offset},"${sig.unit}",${sig.min},${sig.max},${sig.isLittleEndian ? 'Intel' : 'Motorola'},${sig.isSigned ? 'Signed' : 'Unsigned'}\n`;
        });
      }
    });

    const filename = `can_specification_${activeDbcName.replace(/\s+/g, '_')}.csv`;
    saveTextFile(filename, csv, [{ name: 'CSV CAN Specification', extensions: ['csv'] }]);
  };

  const selectedMsg = activeDbc && selectedMsgId ? activeDbc.messages[selectedMsgId] : null;

  return (
    <div className="glass-panel p-5 flex flex-col md:flex-row gap-5 h-full overflow-hidden">
      
      {/* Left Column: Message Database Tree (Width: 380px) */}
      <div className="w-full md:w-[380px] flex flex-col h-full gap-3.5 overflow-hidden md:border-r border-[var(--border-sub)] md:pr-5">
        
        {/* Header Title */}
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database className={`w-4 h-4 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
            <span className="font-semibold text-[var(--text-color)] text-sm">DBC Database Registry</span>
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

        {/* Database Stats Card */}
        <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-3 text-xs flex-shrink-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[var(--text-muted)]">Active Database:</span>
            <span className="text-[var(--text-color)] font-bold truncate max-w-[200px]" title={activeDbcName}>
              {activeDbcName || 'None Loaded'}
            </span>
          </div>
          {activeDbc ? (
            <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-[var(--border-color)] text-[var(--text-muted)]">
              <div>Nodes: <strong className="text-[var(--text-color)]">{activeDbc.nodes.length}</strong></div>
              <div>Messages: <strong className="text-[var(--text-color)]">{Object.keys(activeDbc.messages).length}</strong></div>
              
              <button
                onClick={handleExportSpecification}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-cyber-accent/25 hover:border-cyber-accent bg-cyber-accent/5 hover:bg-cyber-accent/15 text-[var(--text-color)] font-semibold transition-colors"
                title="Export entire database as CSV CAN specification"
              >
                <Download className="w-3 h-3" />
                Export Specification
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-[var(--text-muted)] italic mt-1">No metadata loaded. Use simulator fallback templates.</div>
          )}
        </div>

        {/* File Upload Selector */}
        <div className="flex-shrink-0">
          <input
            type="file"
            accept=".dbc"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[var(--border-color)] hover:border-[var(--text-muted)] rounded bg-[var(--bg-input)] hover:bg-[var(--bg-card-sub)] text-xs font-semibold text-[var(--text-color)] transition-all duration-150"
          >
            <FileUp className="w-4 h-4 text-[var(--text-muted)]" />
            Load External DBC File
          </button>
        </div>

        {/* Database Search Input */}
        {activeDbc && (
          <div className="relative flex-shrink-0">
            <input
              type="text"
              placeholder="Search ID, name, sender..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-8 py-1.5 text-xs"
            />
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>
        )}

        {/* Messages List Container */}
        {activeDbc ? (
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filteredMessages.length === 0 ? (
              <div className="text-center text-xs text-[var(--text-muted)] py-6 italic">No matching messages found</div>
            ) : (
              filteredMessages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedMsgId(selectedMsgId === msg.id ? null : msg.id)}
                  className={`p-2.5 rounded border cursor-pointer text-left transition-all duration-150 ${
                    selectedMsgId === msg.id
                      ? 'bg-[var(--bg-input)] border-[var(--text-muted)] shadow-inner'
                      : 'bg-[var(--bg-card-sub)] border-[var(--border-sub)] hover:bg-[var(--bg-input)]'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs text-[var(--text-color)] truncate max-w-[200px]" title={msg.name}>
                      {msg.name}
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] font-bold">
                      0x{msg.id.toString(16).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-1.5">
                    <span>Sender: <strong className="text-[var(--text-color)] font-medium">{msg.sender}</strong></span>
                    <span>DLC: {msg.dlc} Bytes</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
            <ShieldAlert className="w-8 h-8 text-[var(--text-muted)] mb-2 animate-pulse" />
            <span className="text-xs text-[var(--text-muted)]">Upload a Vector .dbc file to populate message registers.</span>
          </div>
        )}
      </div>

      {/* Right Column: Signal parameter inspector (Width: remaining space) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-card-sub)] rounded-lg border border-[var(--border-sub)] p-5">
        {selectedMsg ? (
          <div className="flex flex-col h-full overflow-hidden gap-4 text-left">
            
            {/* Selected Message Header Details */}
            <div className="border-b border-[var(--border-color)] pb-3 flex-shrink-0">
              <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Inspected Object Register</span>
              <h2 className="text-lg font-bold text-[var(--text-color)] flex items-baseline gap-2">
                {selectedMsg.name}
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  (COB-ID: 0x{selectedMsg.id.toString(16).toUpperCase()} | Decimal: {selectedMsg.id})
                </span>
              </h2>
              <div className="flex gap-4 mt-2 text-xs text-[var(--text-muted)]">
                <div>Payload Size: <strong className="text-[var(--text-color)]">{selectedMsg.dlc} Bytes</strong></div>
                <div>Source node: <strong className="text-[var(--text-color)]">{selectedMsg.sender}</strong></div>
                <div>Signal parameters: <strong className="text-[var(--text-color)]">{selectedMsg.signals.length} defined</strong></div>
              </div>
            </div>

            {/* Scrollable list of signals inside selected message */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {selectedMsg.signals.length === 0 ? (
                <div className="text-center text-xs text-[var(--text-muted)] py-12 italic bg-[var(--bg-input)] rounded border border-[var(--border-sub)]">
                  No decoding signals exist for this message entry in the database.
                </div>
              ) : (
                selectedMsg.signals.map((sig) => (
                  <div key={sig.name} className="bg-[var(--bg-card)] rounded-lg p-3.5 border border-[var(--border-sub)] hover:border-[var(--text-muted)] transition-colors">
                    <div className="flex justify-between items-baseline mb-2 pb-1 border-b border-[var(--border-sub)]">
                      <span className="font-bold text-sm text-[var(--text-color)] truncate max-w-[320px]" title={sig.name}>
                        {sig.name}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-mono font-semibold">
                        Bit Offset: {sig.startBit} | Length: {sig.length} bits
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Resolution (Scale)</span>
                        <strong className="text-[var(--text-color)]">{sig.factor}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Offset</span>
                        <strong className="text-[var(--text-color)]">{sig.offset}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Physical Limits</span>
                        <strong className="text-[var(--text-color)] font-mono">[{sig.min} | {sig.max}]</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Unit</span>
                        <strong className="text-[var(--text-color)]">{sig.unit || '—'}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Byte Order</span>
                        <strong className="text-[var(--text-color)]">{sig.isLittleEndian ? 'Intel (Little-Endian)' : 'Motorola (Big-Endian)'}</strong>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Encoding Type</span>
                        <strong className="text-[var(--text-color)]">{sig.isSigned ? 'Signed Integer' : 'Unsigned Integer'}</strong>
                      </div>
                      {sig.receivers.length > 0 && (
                        <div className="col-span-2">
                          <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Receiver Nodes</span>
                          <strong className="text-[var(--text-color)] truncate block" title={sig.receivers.join(', ')}>{sig.receivers.join(', ')}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--text-muted)]">
            <Database className="w-12 h-12 mb-3 opacity-25 animate-pulse text-[var(--text-color)]" />
            <h3 className="font-bold text-sm text-[var(--text-color)] mb-1">Signal Parameter Inspector</h3>
            <span className="text-xs max-w-sm">Select any message ID from the registry database tree on the left to inspect its detailed decode parameters and physical matrices.</span>
          </div>
        )}
      </div>

    </div>
  );
};
