import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { parseDbc } from '../lib/dbcParser';
import type { DbcSignal } from '../lib/dbcParser';
import { serializeDbc } from '../lib/dbcSerializer';
import {
  Database,
  ShieldAlert,
  Search,
  Download,
  FolderKanban,
  Plus,
  Trash2,
  Save,
  Upload,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Edit,
  Sliders
} from 'lucide-react';
import { saveTextFile } from '../lib/tauriAdapter';

export const DbcManager: React.FC = () => {
  const {
    projects,
    activeProjectId,
    dbcRegistry,
    dbcs,
    addProject,
    setActiveProject,
    deleteProject,
    toggleDbcInProject,
    importDbcToProject,
    removeDbcFromProject,
    updateDbc,
    saveSmartCanFile,
    loadSmartCanFile,
    createEmptyDbc
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMsgId, setSelectedMsgId] = useState<number | null>(null);
  const [inspectedDbcName, setInspectedDbcName] = useState<string>('Default J1939 Database');

  const [isAddingProj, setIsAddingProj] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [customOpen, setCustomOpen] = useState(true);
  const [genericOpen, setGenericOpen] = useState(true);
  const [deviceOpen, setDeviceOpen] = useState(true);

  const dbcFileInputRef = useRef<HTMLInputElement>(null);
  const smartcanFileInputRef = useRef<HTMLInputElement>(null);

  const handleDbcUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      importDbcToProject(file.name, content);
      setInspectedDbcName(file.name);
      setSelectedMsgId(null);
      setActiveTab('inspect');
      setEditingDbcName(file.name);
      setEditingDbcContent(content);
      try {
        setDraftDb(parseDbc(content));
      } catch {
        setDraftDb({ nodes: [], messages: {} });
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  };

  const handleSmartCanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      loadSmartCanFile(content);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  };

  const handleCreateProject = () => {
    const trimmed = newProjName.trim();
    if (trimmed) {
      addProject(trimmed);
      setIsAddingProj(false);
      setNewProjName('');
    }
  };

  // Derive which registry entry is inspected, defaulting to first enabled or first in registry
  let inspectedEntry = dbcRegistry.find(e => e.name === inspectedDbcName);
  if (!inspectedEntry && dbcRegistry.length > 0) {
    const firstEnabled = dbcRegistry.find(e => e.enabled);
    inspectedEntry = firstEnabled || dbcRegistry[0];
  }
  let inspectedDbc: ReturnType<typeof parseDbc> | null = null;
  if (inspectedEntry) {
    if (inspectedEntry.enabled && dbcs[inspectedEntry.name]) {
      inspectedDbc = dbcs[inspectedEntry.name];
    } else {
      try {
        inspectedDbc = parseDbc(inspectedEntry.content);
      } catch (err) {
        console.error('Failed to parse inspected DBC', err);
      }
    }
  }

  // Filter messages based on search query inside the inspected DBC
  const filteredMessages = inspectedDbc
    ? Object.values(inspectedDbc.messages).filter(
        (msg) =>
          msg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.id.toString(16).toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.sender.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleExportSpecification = () => {
    if (!inspectedDbc) return;

    let csv = 'Message Name,Message ID (Hex),DLC,Sender,Signal Name,Start Bit,Length,Factor,Offset,Unit,Min,Max,Byte Order,Type\n';

    Object.values(inspectedDbc.messages).forEach(msg => {
      if (msg.signals.length === 0) {
        csv += `"${msg.name}",0x${msg.id.toString(16).toUpperCase()},${msg.dlc},"${msg.sender}",,,,,,,,,,\n`;
      } else {
        msg.signals.forEach(sig => {
          csv += `"${msg.name}",0x${msg.id.toString(16).toUpperCase()},${msg.dlc},"${msg.sender}","${sig.name}",${sig.startBit},${sig.length},${sig.factor},${sig.offset},"${sig.unit}",${sig.min},${sig.max},${sig.isLittleEndian ? 'Intel' : 'Motorola'},${sig.isSigned ? 'Signed' : 'Unsigned'}\n`;
        });
      }
    });

    const filename = `can_specification_${inspectedDbcName.replace(/\s+/g, '_')}.csv`;
    saveTextFile(filename, csv, [{ name: 'CSV CAN Specification', extensions: ['csv'] }]);
  };

  const selectedMsg = inspectedDbc && selectedMsgId ? inspectedDbc.messages[selectedMsgId] : null;

  // Tabs and Editing State for Inspected DBC
  const [activeTab, setActiveTab] = useState<'inspect' | 'graphical' | 'raw'>('inspect');
  
  // Find initial inspected entry to populate name and content editing state
  const initialEntry = dbcRegistry.find(e => e.name === inspectedDbcName) || dbcRegistry[0];

  const [editingDbcName, setEditingDbcName] = useState(initialEntry?.name || 'Default J1939 Database');
  const [editingDbcContent, setEditingDbcContent] = useState(initialEntry?.content || '');

  // Graphical Editor state
  const [draftDb, setDraftDb] = useState<ReturnType<typeof parseDbc> | null>(() => {
    if (initialEntry) {
      try {
        return parseDbc(initialEntry.content);
      } catch {
        return { nodes: [], messages: {} };
      }
    }
    return null;
  });

  const [editorSubTab, setEditorSubTab] = useState<'nodes' | 'messages'>('messages');
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);

  const [newNodeName, setNewNodeName] = useState('');
  const [newMsgName, setNewMsgName] = useState('');
  const [newMsgId, setNewMsgId] = useState('');
  const [newMsgDlc, setNewMsgDlc] = useState(8);
  const [newMsgSender, setNewMsgSender] = useState('Vector__XXX');

  const handleAddNode = () => {
    const trimmed = newNodeName.trim().replace(/\s+/g, '_');
    if (!trimmed) return;
    if (!draftDb) return;
    if (draftDb.nodes.includes(trimmed)) {
      alert(`Node "${trimmed}" already exists.`);
      return;
    }
    setDraftDb({
      ...draftDb,
      nodes: [...draftDb.nodes, trimmed]
    });
    setNewNodeName('');
  };

  const handleRemoveNode = (nodeName: string) => {
    if (!draftDb) return;
    setDraftDb({
      ...draftDb,
      nodes: draftDb.nodes.filter(n => n !== nodeName)
    });
  };

  const handleAddMessage = () => {
    if (!draftDb) return;
    const trimmedName = newMsgName.trim().replace(/\s+/g, '_');
    if (!trimmedName) {
      alert('Message name cannot be empty.');
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)) {
      alert('Message name must start with a letter or underscore, and contain only letters, numbers, or underscores.');
      return;
    }
    
    let parsedId = parseInt(newMsgId.trim(), 10);
    if (newMsgId.trim().toLowerCase().startsWith('0x')) {
      parsedId = parseInt(newMsgId.trim(), 16);
    }
    if (isNaN(parsedId) || parsedId < 0) {
      alert('Message ID must be a valid number (e.g., 256 or 0x100).');
      return;
    }
    if (draftDb.messages[parsedId]) {
      alert(`A message with ID ${newMsgId} already exists.`);
      return;
    }
    
    setDraftDb({
      ...draftDb,
      messages: {
        ...draftDb.messages,
        [parsedId]: {
          id: parsedId,
          name: trimmedName,
          dlc: newMsgDlc,
          sender: newMsgSender,
          signals: []
        }
      }
    });
    
    setNewMsgName('');
    setNewMsgId('');
    setNewMsgDlc(8);
    setNewMsgSender('Vector__XXX');
  };

  const handleUpdateMessageHeader = (oldId: number, newId: number, name: string, dlc: number, sender: string) => {
    if (!draftDb) return;
    const trimmedName = name.trim().replace(/\s+/g, '_');
    if (!trimmedName) {
      alert('Message name cannot be empty.');
      return;
    }
    if (newId !== oldId && draftDb.messages[newId]) {
      alert(`A message with ID ${newId} already exists.`);
      return;
    }
    const updatedMessages = { ...draftDb.messages };
    const originalMsg = updatedMessages[oldId];
    delete updatedMessages[oldId];
    updatedMessages[newId] = {
      ...originalMsg,
      id: newId,
      name: trimmedName,
      dlc,
      sender
    };
    setDraftDb({
      ...draftDb,
      messages: updatedMessages
    });
    setEditingMsgId(newId);
  };

  const handleAddSignal = (msgId: number) => {
    if (!draftDb) return;
    const msg = draftDb.messages[msgId];
    if (!msg) return;
    
    let sigName = 'NewSignal';
    let idx = 1;
    while (msg.signals.some(s => s.name === sigName)) {
      sigName = `NewSignal_${idx++}`;
    }
    
    const newSignal: DbcSignal = {
      name: sigName,
      startBit: 0,
      length: 8,
      isLittleEndian: true,
      isSigned: false,
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: [],
      valueDescriptions: {}
    };
    
    setDraftDb({
      ...draftDb,
      messages: {
        ...draftDb.messages,
        [msgId]: {
          ...msg,
          signals: [...msg.signals, newSignal]
        }
      }
    });
  };

  const handleUpdateSignal = (msgId: number, sigIndex: number, updates: Partial<DbcSignal>) => {
    if (!draftDb) return;
    const msg = draftDb.messages[msgId];
    if (!msg) return;
    
    const newSignals = [...msg.signals];
    newSignals[sigIndex] = {
      ...newSignals[sigIndex],
      ...updates
    };
    
    setDraftDb({
      ...draftDb,
      messages: {
        ...draftDb.messages,
        [msgId]: {
          ...msg,
          signals: newSignals
        }
      }
    });
  };

  const handleRemoveSignal = (msgId: number, sigIndex: number) => {
    if (!draftDb) return;
    const msg = draftDb.messages[msgId];
    if (!msg) return;
    
    const newSignals = msg.signals.filter((_, i) => i !== sigIndex);
    setDraftDb({
      ...draftDb,
      messages: {
        ...draftDb.messages,
        [msgId]: {
          ...msg,
          signals: newSignals
        }
      }
    });
  };

  const handleSaveDbcEdits = () => {
    if (!inspectedEntry) return;
    const oldName = inspectedEntry.name;
    const newName = editingDbcName.trim();
    if (!newName) {
      alert('Database name cannot be empty.');
      return;
    }
    
    // Call store action to save changes
    updateDbc(oldName, newName, editingDbcContent);
    
    // Switch state pointers to match
    setInspectedDbcName(newName);
    setActiveTab('inspect');
    try {
      setDraftDb(parseDbc(editingDbcContent));
    } catch {
      setDraftDb({ nodes: [], messages: {} });
    }
  };

  // Filter registry entries by category
  const customDBCs = dbcRegistry.filter(db => db.type === 'custom');
  const genericDBCs = dbcRegistry.filter(db => db.type === 'generic');
  const deviceDBCs = dbcRegistry.filter(db => db.type === 'device');

  const renderDbcRow = (entry: typeof dbcRegistry[0]) => {
    const isInspected = inspectedDbcName === entry.name;
    return (
      <div
        key={entry.name}
        className={`group flex items-center justify-between p-2 rounded border transition-all duration-150 ${
          isInspected
            ? 'bg-[var(--bg-input)] border-[var(--text-muted)]/50 shadow-inner'
            : 'bg-[var(--bg-card)]/40 border-[var(--border-sub)] hover:bg-[var(--bg-input)] hover:border-[var(--border-color)]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={() => toggleDbcInProject(entry.name)}
            className="rounded border-[var(--border-color)] bg-[var(--bg-input)] text-sky-500 focus:ring-0 cursor-pointer w-3.5 h-3.5"
            title="Enable/Disable in Active Project"
          />
          <span
            onClick={() => {
              setInspectedDbcName(entry.name);
              setSelectedMsgId(null);
              setActiveTab('inspect');
              setEditingDbcName(entry.name);
              setEditingDbcContent(entry.content);
              try {
                setDraftDb(parseDbc(entry.content));
              } catch {
                setDraftDb({ nodes: [], messages: {} });
              }
            }}
            className={`text-xs cursor-pointer truncate flex-1 text-left ${
              isInspected ? 'text-sky-600 dark:text-sky-400 font-bold' : 'text-[var(--text-color)] group-hover:text-[var(--text-color)]'
            }`}
            title={entry.name}
          >
            {entry.name}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 pl-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeDbcFromProject(entry.name);
            }}
            className="p-1 text-[var(--text-muted)] hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            title={`Remove ${entry.type === 'custom' ? 'Custom DBC' : entry.type === 'device' ? 'Device Template' : 'Generic Protocol'}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-panel p-5 flex flex-col lg:flex-row gap-5 h-full overflow-hidden">
      
      {/* Column 1: Projects & DBC Registry list (Width: 320px) */}
      <div className="w-full lg:w-[320px] flex flex-col h-full gap-4 overflow-hidden lg:border-r border-[var(--border-color)] lg:pr-5 flex-shrink-0">
        
        {/* Project Selector & Actions Card */}
        <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded-lg p-3.5 flex flex-col gap-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-sky-500" />
              Project Workspace
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={saveSmartCanFile}
                className="p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-sub)] text-[var(--text-color)] transition-all"
                title="Save SmartCAN Project File (.smartcan)"
              >
                <Save className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => smartcanFileInputRef.current?.click()}
                className="p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-sub)] text-[var(--text-color)] transition-all"
                title="Load SmartCAN Project File (.smartcan)"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input
                type="file"
                accept=".smartcan"
                ref={smartcanFileInputRef}
                onChange={handleSmartCanUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Project Switcher Selector */}
          <div className="flex items-center gap-2">
            <select
              value={activeProjectId}
              onChange={(e) => setActiveProject(e.target.value)}
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500/40"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id} className="bg-[var(--bg-color)] text-[var(--text-color)]">
                  {proj.name}
                </option>
              ))}
            </select>

            {projects.length > 1 && (
              <button
                onClick={() => deleteProject(activeProjectId)}
                className="p-1.5 rounded border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-all"
                title="Delete Current Project"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add New Project Inline Form */}
          {isAddingProj ? (
            <div className="flex items-center gap-1.5 border border-[var(--border-color)] rounded bg-[var(--bg-input)] p-1">
              <input
                type="text"
                placeholder="New project name..."
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                className="flex-1 bg-transparent text-[var(--text-color)] placeholder-[var(--text-muted)] border-none px-2 py-1 text-xs focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
                  if (e.key === 'Escape') setIsAddingProj(false);
                }}
              />
              <button
                onClick={handleCreateProject}
                className="p-1 text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsAddingProj(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNewProjName('');
                setIsAddingProj(true);
              }}
              className="w-full py-1.5 flex items-center justify-center gap-1.5 border border-[var(--border-color)] bg-[var(--bg-input)] hover:bg-[var(--bg-card-sub)] rounded text-[var(--text-color)] text-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Project
            </button>
          )}
        </div>

        {/* DBC Registry Section */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2">
            <div className="flex items-center gap-2 text-left">
              <Database className="w-4 h-4 text-sky-500" />
              <span className="font-semibold text-[var(--text-color)] text-xs">DBC Registry Databases</span>
            </div>
          </div>

          {/* Custom DBCs */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => setCustomOpen(!customOpen)}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--text-color)] hover:opacity-80"
              >
                {customOpen ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />}
                Custom ({customDBCs.length})
              </button>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    const name = prompt('Enter name for the new custom DBC:');
                    if (name) {
                      createEmptyDbc(name);
                      const trimmed = name.trim();
                      setInspectedDbcName(trimmed);
                      setSelectedMsgId(null);
                      setActiveTab('graphical');
                      setEditingDbcName(trimmed);
                      setEditingDbcContent(`BU_: Master_Node\n`);
                      setDraftDb({ nodes: ['Master_Node'], messages: {} });
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] hover:border-[var(--text-muted)] bg-[var(--bg-input)] text-[var(--text-color)] transition-colors"
                >
                  <Plus className="w-2.5 h-2.5" /> Create
                </button>
                <button
                  onClick={() => dbcFileInputRef.current?.click()}
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] hover:border-[var(--text-muted)] bg-[var(--bg-input)] text-[var(--text-color)] transition-colors"
                >
                  <Upload className="w-2.5 h-2.5" /> Load File
                </button>
              </div>
              <input
                type="file"
                accept=".dbc"
                ref={dbcFileInputRef}
                onChange={handleDbcUpload}
                className="hidden"
              />
            </div>
            {customOpen && (
              <div className="pl-2 flex flex-col gap-1">
                {customDBCs.length === 0 ? (
                  <div className="text-[10px] text-[var(--text-muted)] italic py-2 text-left">No custom DBC databases loaded.</div>
                ) : (
                  customDBCs.map(renderDbcRow)
                )}
              </div>
            )}
          </div>

          {/* Generic DBCs */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setGenericOpen(!genericOpen)}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-color)] hover:opacity-80 px-1 text-left"
            >
              {genericOpen ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />}
              Generic Protocols ({genericDBCs.length})
            </button>
            {genericOpen && (
              <div className="pl-2 flex flex-col gap-1">
                {genericDBCs.map(renderDbcRow)}
              </div>
            )}
          </div>

          {/* Device-Specific DBCs */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setDeviceOpen(!deviceOpen)}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-color)] hover:opacity-80 px-1 text-left"
            >
              {deviceOpen ? <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" /> : <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />}
              Device Templates ({deviceDBCs.length})
            </button>
            {deviceOpen && (
              <div className="pl-2 flex flex-col gap-1">
                {deviceDBCs.map(renderDbcRow)}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Column 2: Dual-pane inspected DBC layout (Width: remaining space) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
        
        {/* Left Side: Inspected DBC Messages List */}
        <div className="w-full lg:w-[280px] flex flex-col h-full gap-3 overflow-hidden lg:border-r border-[var(--border-color)] lg:pr-5 flex-shrink-0">
          <div className="flex-shrink-0 text-left">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider block">Inspecting Database</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                inspectedEntry?.enabled ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-color)]'
              }`}>
                {inspectedEntry?.enabled ? 'Active' : 'Inactive'}
              </span>
            </div>
            <h3 className="text-sm font-bold text-[var(--text-color)] truncate" title={inspectedDbcName}>
              {inspectedDbcName}
            </h3>
          </div>

          {/* Database stats */}
          {inspectedDbc && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-sub)] rounded p-2.5 text-[11px] text-[var(--text-muted)] flex flex-col gap-1.5 flex-shrink-0">
              <div className="flex justify-between">
                <span>Nodes: <strong className="text-[var(--text-color)]">{inspectedDbc.nodes.length}</strong></span>
                <span>Messages: <strong className="text-[var(--text-color)]">{Object.keys(inspectedDbc.messages).length}</strong></span>
              </div>
              <button
                onClick={handleExportSpecification}
                className="w-full flex items-center justify-center gap-1.5 py-1 rounded border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/15 text-sky-600 dark:text-sky-400 transition-colors font-medium text-[10px]"
              >
                <Download className="w-3 h-3" /> Export CSV Specification
              </button>
            </div>
          )}

          {/* Search bar inside inspected DBC */}
          {inspectedDbc && (
            <div className="relative flex-shrink-0">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="glass-input w-full py-1.5 text-xs text-[var(--text-color)]"
                style={{ paddingLeft: '2rem' }}
              />
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          )}

          {/* Messages list */}
          {inspectedDbc ? (
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-left">
              {filteredMessages.length === 0 ? (
                <div className="text-center text-xs text-[var(--text-muted)] py-6 italic">No messages found</div>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    onClick={() => setSelectedMsgId(selectedMsgId === msg.id ? null : msg.id)}
                    className={`p-2.5 rounded border cursor-pointer transition-all duration-150 ${
                      selectedMsgId === msg.id
                        ? 'bg-[var(--bg-input)] border-[var(--text-muted)]/50 shadow-inner'
                        : 'bg-[var(--bg-card)]/30 border-[var(--border-sub)] hover:bg-[var(--bg-input)] hover:border-[var(--border-color)]'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-[var(--text-color)] truncate max-w-[150px]" title={msg.name}>
                        {msg.name}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)]">
                        0x{msg.id.toString(16).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-1.5">
                      <span>Sender: <strong className="text-[var(--text-color)] font-semibold">{msg.sender}</strong></span>
                      <span>DLC: {msg.dlc}B</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <ShieldAlert className="w-8 h-8 text-[var(--text-muted)] mb-2" />
              <span className="text-xs text-[var(--text-muted)]">Failed to load inspected database content.</span>
            </div>
          )}
        </div>

        {/* Right Side: Message & Signal Inspector Details */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg-card-sub)] rounded-lg border border-[var(--border-color)] p-4 min-w-[320px]">
          {inspectedEntry ? (
            <div className="flex flex-col h-full overflow-hidden gap-4">
              {/* Tab Bar */}
              <div className="flex border-b border-[var(--border-color)] pb-2 flex-shrink-0 gap-1">
                <button
                  onClick={() => setActiveTab('inspect')}
                  className={`px-4 py-1.5 text-xs font-bold transition-all duration-150 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'inspect'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  Inspect Signals
                </button>
                <button
                  onClick={() => {
                    setActiveTab('graphical');
                    setEditingMsgId(null);
                    if (inspectedEntry) {
                      try {
                        setDraftDb(parseDbc(inspectedEntry.content));
                      } catch {
                        setDraftDb({ nodes: [], messages: {} });
                      }
                    }
                  }}
                  className={`px-4 py-1.5 text-xs font-bold transition-all duration-150 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'graphical'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Edit Graphically
                </button>
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-4 py-1.5 text-xs font-bold transition-all duration-150 border-b-2 flex items-center gap-1.5 ${
                    activeTab === 'raw'
                      ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <Edit className="w-3.5 h-3.5" />
                  Edit Raw Schema
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'inspect' ? (
                selectedMsg ? (
                  <div className="flex flex-col h-full overflow-hidden gap-4 text-left">
                    {/* Selected Message Header Details */}
                    <div className="border-b border-[var(--border-color)] pb-3 flex-shrink-0">
                      <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1">Inspected Object Register</span>
                      <h2 className="text-base font-bold text-[var(--text-color)] flex items-baseline gap-2 flex-wrap">
                        {selectedMsg.name}
                        <span className="text-xs font-mono text-[var(--text-muted)]">
                          (COB-ID: 0x{selectedMsg.id.toString(16).toUpperCase()} | Dec: {selectedMsg.id})
                        </span>
                      </h2>
                      <div className="flex gap-4 mt-2 text-xs text-[var(--text-muted)] flex-wrap">
                        <div>Payload Size: <strong className="text-[var(--text-color)]">{selectedMsg.dlc} Bytes</strong></div>
                        <div>Source Node: <strong className="text-[var(--text-color)]">{selectedMsg.sender}</strong></div>
                        <div>Signals: <strong className="text-[var(--text-color)]">{selectedMsg.signals.length} defined</strong></div>
                      </div>
                    </div>

                    {/* Scrollable list of signals inside selected message */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {selectedMsg.signals.length === 0 ? (
                        <div className="text-center text-xs text-[var(--text-muted)] py-12 italic bg-[var(--bg-input)] rounded border border-[var(--border-color)]">
                          No decoding signals exist for this message entry.
                        </div>
                      ) : (
                        selectedMsg.signals.map((sig) => (
                          <div key={sig.name} className="bg-[var(--bg-card)] rounded-lg p-3 border border-[var(--border-sub)] hover:border-[var(--border-color)] transition-colors">
                            <div className="flex justify-between items-baseline mb-2 pb-1 border-b border-[var(--border-sub)] flex-wrap gap-2">
                              <span className="font-bold text-sm text-[var(--text-color)] truncate max-w-[280px]" title={sig.name}>
                                {sig.name}
                              </span>
                              <span className="text-xs text-[var(--text-muted)] font-mono font-medium">
                                Offset: {sig.startBit} | Length: {sig.length} bits
                              </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Scale (Factor)</span>
                                <strong className="text-[var(--text-color)]">{sig.factor}</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Offset</span>
                                <strong className="text-[var(--text-color)]">{sig.offset}</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Unit</span>
                                <strong className="text-[var(--text-color)]">{sig.unit || '—'}</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Physical Limits</span>
                                <strong className="text-[var(--text-color)] font-mono">[{sig.min} | {sig.max}]</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Byte Order</span>
                                <strong className="text-[var(--text-color)]">{sig.isLittleEndian ? 'Intel (LE)' : 'Motorola (BE)'}</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--text-muted)] mb-0.5">Encoding Type</span>
                                <strong className="text-[var(--text-color)]">{sig.isSigned ? 'Signed' : 'Unsigned'}</strong>
                              </div>
                              {sig.receivers.length > 0 && (
                                <div className="col-span-2 md:col-span-3">
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
                    <Database className="w-12 h-12 mb-3 opacity-25 text-[var(--text-color)]" />
                    <h3 className="font-bold text-sm text-[var(--text-color)] mb-1">Signal Parameter Inspector</h3>
                    <span className="text-xs max-w-sm">Select any message ID from the list on the left to inspect its detailed decode parameters and physical matrices.</span>
                  </div>
                )
              ) : activeTab === 'raw' ? (
                <div className="flex-1 flex flex-col gap-4 text-left overflow-hidden">
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Database Name</label>
                    <input
                      type="text"
                      value={editingDbcName}
                      onChange={(e) => setEditingDbcName(e.target.value)}
                      className="glass-input w-full text-xs font-semibold py-1.5"
                    />
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1 overflow-hidden min-h-[200px]">
                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Raw DBC Schema Content</label>
                    <textarea
                      value={editingDbcContent}
                      onChange={(e) => setEditingDbcContent(e.target.value)}
                      className="flex-1 w-full bg-[var(--bg-input)] border border-[var(--border-sub)] text-[var(--text-color)] font-mono text-xs p-3 rounded focus:outline-none focus:ring-1 focus:ring-sky-500/40 resize-none h-full"
                      placeholder="Vector DBC content..."
                    />
                  </div>
                  
                  <div className="flex gap-2.5 flex-shrink-0">
                    <button
                      onClick={handleSaveDbcEdits}
                      className="flex-1 bg-cyber-accent border border-cyber-accent/40 text-black hover:bg-emerald-400 text-xs font-bold rounded py-2 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" /> Save DBC Configuration
                    </button>
                  </div>
                </div>
              ) : (
                /* activeTab === 'graphical' */
                draftDb && (
                  <div className="flex-1 flex flex-col overflow-hidden text-left gap-4">
                    {/* Sub-tab selection */}
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditorSubTab('nodes');
                          setEditingMsgId(null);
                        }}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                          editorSubTab === 'nodes'
                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-sub)] hover:text-[var(--text-color)]'
                        }`}
                      >
                        Nodes (ECUs)
                      </button>
                      <button
                        onClick={() => setEditorSubTab('messages')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                          editorSubTab === 'messages'
                            ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                            : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-sub)] hover:text-[var(--text-color)]'
                        }`}
                      >
                        Messages & Signals
                      </button>
                    </div>

                    {/* Nodes Sub-Tab */}
                    {editorSubTab === 'nodes' && (
                      <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
                        <div className="bg-[var(--bg-card)] border border-[var(--border-sub)] rounded-lg p-4">
                          <h4 className="text-xs font-bold text-[var(--text-color)] mb-2 uppercase tracking-wide">Network Nodes (BU_:)</h4>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {draftDb.nodes.map(node => (
                              <span key={node} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-semibold border border-sky-500/20">
                                {node}
                                <button
                                  onClick={() => handleRemoveNode(node)}
                                  className="hover:text-red-500"
                                  title="Remove Node"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                            {draftDb.nodes.length === 0 && (
                              <span className="text-xs text-[var(--text-muted)] italic">No nodes defined.</span>
                            )}
                          </div>

                          <div className="flex gap-2 max-w-sm">
                            <input
                              type="text"
                              placeholder="Add node name (e.g., Engine_ECU)..."
                              value={newNodeName}
                              onChange={(e) => setNewNodeName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddNode();
                                }
                              }}
                              className="glass-input flex-1 py-1.5 px-2.5 text-xs text-[var(--text-color)]"
                            />
                            <button
                              onClick={handleAddNode}
                              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded text-xs font-semibold flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add Node
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Messages & Signals Sub-Tab */}
                    {editorSubTab === 'messages' && (
                      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        {editingMsgId === null ? (
                          /* List of messages + Add Message form */
                          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                            {/* Add Message Form */}
                            <div className="bg-[var(--bg-card)] border border-[var(--border-sub)] rounded-lg p-3.5 flex-shrink-0 flex flex-col gap-3">
                              <h4 className="text-xs font-bold text-[var(--text-color)] uppercase tracking-wide">Add New Message Frame</h4>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-[var(--text-muted)] font-bold">Message Name</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Engine_Status"
                                    value={newMsgName}
                                    onChange={(e) => setNewMsgName(e.target.value)}
                                    className="glass-input py-1 px-2 text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-[var(--text-muted)] font-bold">Message ID (Hex or Dec)</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. 0x1F0 or 496"
                                    value={newMsgId}
                                    onChange={(e) => setNewMsgId(e.target.value)}
                                    className="glass-input py-1 px-2 text-xs"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-[var(--text-muted)] font-bold">DLC (Bytes)</label>
                                  <select
                                    value={newMsgDlc}
                                    onChange={(e) => setNewMsgDlc(parseInt(e.target.value, 10))}
                                    className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                                  >
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(d => (
                                      <option key={d} value={d} className="bg-[var(--bg-color)]">{d}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] text-[var(--text-muted)] font-bold">Sender Node</label>
                                  <select
                                    value={newMsgSender}
                                    onChange={(e) => setNewMsgSender(e.target.value)}
                                    className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500/40"
                                  >
                                    <option value="Vector__XXX" className="bg-[var(--bg-color)]">Vector__XXX (None)</option>
                                    {draftDb.nodes.map(n => (
                                      <option key={n} value={n} className="bg-[var(--bg-color)]">{n}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={handleAddMessage}
                                className="w-full py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add Message Frame
                              </button>
                            </div>

                            {/* Messages List Table */}
                            <div className="flex-1 overflow-y-auto border border-[var(--border-sub)] rounded-lg bg-[var(--bg-card)]/40">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-[var(--bg-card-sub)] border-b border-[var(--border-sub)] text-[var(--text-muted)] font-semibold">
                                    <th className="p-2.5 font-bold">ID (Hex)</th>
                                    <th className="p-2.5 font-bold">Name</th>
                                    <th className="p-2.5 font-bold">DLC</th>
                                    <th className="p-2.5 font-bold">Sender</th>
                                    <th className="p-2.5 font-bold">Signals</th>
                                    <th className="p-2.5 font-bold text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.values(draftDb.messages).map(msg => (
                                    <tr
                                      key={msg.id}
                                      className="border-b border-[var(--border-sub)] hover:bg-[var(--bg-input)]/50 transition-colors"
                                    >
                                      <td className="p-2.5 font-mono text-[var(--text-muted)]">0x{msg.id.toString(16).toUpperCase()}</td>
                                      <td className="p-2.5 font-bold text-[var(--text-color)]">{msg.name}</td>
                                      <td className="p-2.5">{msg.dlc} B</td>
                                      <td className="p-2.5 font-semibold">{msg.sender}</td>
                                      <td className="p-2.5">
                                        <span className="bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          {msg.signals.length} sigs
                                        </span>
                                      </td>
                                      <td className="p-2.5 text-right flex justify-end gap-1.5">
                                        <button
                                          onClick={() => setEditingMsgId(msg.id)}
                                          className="px-2 py-1 rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 text-[10px] font-bold"
                                        >
                                          Edit Signals
                                        </button>
                                        <button
                                          onClick={() => {
                                            const updatedMessages = { ...draftDb.messages };
                                            delete updatedMessages[msg.id];
                                            setDraftDb({ ...draftDb, messages: updatedMessages });
                                          }}
                                          className="p-1 rounded text-red-500 hover:bg-red-500/10 transition-colors"
                                          title="Delete Message"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                  {Object.keys(draftDb.messages).length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="p-8 text-center text-[var(--text-muted)] italic">
                                        No messages defined. Add one above to start defining signals.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          /* Message Detail Editor (Form + Signals Table) */
                          (() => {
                            const currentMsg = draftDb.messages[editingMsgId];
                            if (!currentMsg) {
                              setEditingMsgId(null);
                              return null;
                            }
                            return (
                              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                {/* Header with back button */}
                                <div className="flex items-center justify-between border-b border-[var(--border-sub)] pb-2 flex-shrink-0">
                                  <button
                                    onClick={() => setEditingMsgId(null)}
                                    className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                                  >
                                    &larr; Back to Message List
                                  </button>
                                  <h4 className="text-xs font-bold text-[var(--text-color)]">
                                    Editing: {currentMsg.name} (0x{currentMsg.id.toString(16).toUpperCase()})
                                  </h4>
                                </div>

                                {/* Edit Message Form header */}
                                <div className="bg-[var(--bg-card)] border border-[var(--border-sub)] rounded-lg p-3 grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold">Message Name</label>
                                    <input
                                      type="text"
                                      value={currentMsg.name}
                                      onChange={(e) => handleUpdateMessageHeader(currentMsg.id, currentMsg.id, e.target.value, currentMsg.dlc, currentMsg.sender)}
                                      className="glass-input py-1 px-2 text-xs"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold">Message ID (Hex or Dec)</label>
                                    <input
                                      type="text"
                                      value={`0x${currentMsg.id.toString(16).toUpperCase()}`}
                                      onChange={(e) => {
                                        let val = parseInt(e.target.value.trim(), 10);
                                        if (e.target.value.trim().toLowerCase().startsWith('0x')) {
                                          val = parseInt(e.target.value.trim(), 16);
                                        }
                                        if (!isNaN(val) && val >= 0) {
                                          handleUpdateMessageHeader(currentMsg.id, val, currentMsg.name, currentMsg.dlc, currentMsg.sender);
                                        }
                                      }}
                                      className="glass-input py-1 px-2 text-xs font-mono"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold">DLC (Bytes)</label>
                                    <select
                                      value={currentMsg.dlc}
                                      onChange={(e) => handleUpdateMessageHeader(currentMsg.id, currentMsg.id, currentMsg.name, parseInt(e.target.value, 10), currentMsg.sender)}
                                      className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2 py-1 text-xs focus:outline-none"
                                    >
                                      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(d => (
                                        <option key={d} value={d} className="bg-[var(--bg-color)]">{d}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] text-[var(--text-muted)] font-bold">Sender Node</label>
                                    <select
                                      value={currentMsg.sender}
                                      onChange={(e) => handleUpdateMessageHeader(currentMsg.id, currentMsg.id, currentMsg.name, currentMsg.dlc, e.target.value)}
                                      className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2 py-1 text-xs focus:outline-none"
                                    >
                                      <option value="Vector__XXX" className="bg-[var(--bg-color)]">Vector__XXX (None)</option>
                                      {draftDb.nodes.map(n => (
                                        <option key={n} value={n} className="bg-[var(--bg-color)]">{n}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {/* Signals Header / Action */}
                                <div className="flex justify-between items-center flex-shrink-0">
                                  <span className="text-xs font-bold text-[var(--text-color)] uppercase tracking-wide">Signals Definition</span>
                                  <button
                                    onClick={() => handleAddSignal(currentMsg.id)}
                                    className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded text-xs font-bold flex items-center gap-1"
                                  >
                                    <Plus className="w-3.5 h-3.5" /> Add Signal
                                  </button>
                                </div>

                                {/* Signals list (Scrollable grid/list of signals) */}
                                <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
                                  {currentMsg.signals.map((sig, sigIdx) => (
                                    <div
                                      key={sigIdx}
                                      className="bg-[var(--bg-card)] border border-[var(--border-sub)] rounded-lg p-3.5 flex flex-col gap-3 hover:border-[var(--border-color)] transition-colors relative"
                                    >
                                      {/* Delete signal button */}
                                      <button
                                        onClick={() => handleRemoveSignal(currentMsg.id, sigIdx)}
                                        className="absolute right-3.5 top-3.5 text-red-500 hover:bg-red-500/10 p-1 rounded transition-colors"
                                        title="Delete Signal"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>

                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {/* Name */}
                                        <div className="flex flex-col gap-1 col-span-2">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Signal Name</label>
                                          <input
                                            type="text"
                                            value={sig.name}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { name: e.target.value.trim().replace(/\s+/g, '_') })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>

                                        {/* Start Bit */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Start Bit (0-63)</label>
                                          <input
                                            type="number"
                                            min={0}
                                            max={63}
                                            value={sig.startBit}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { startBit: Math.max(0, Math.min(63, parseInt(e.target.value, 10) || 0)) })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>

                                        {/* Length */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Length (1-64 bits)</label>
                                          <input
                                            type="number"
                                            min={1}
                                            max={64}
                                            value={sig.length}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { length: Math.max(1, Math.min(64, parseInt(e.target.value, 10) || 1)) })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {/* Factor */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Factor (Scaling)</label>
                                          <input
                                            type="number"
                                            step="any"
                                            value={sig.factor}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { factor: parseFloat(e.target.value) || 1 })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>

                                        {/* Offset */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Offset (Bias)</label>
                                          <input
                                            type="number"
                                            step="any"
                                            value={sig.offset}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { offset: parseFloat(e.target.value) || 0 })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>

                                        {/* Min */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Min Value</label>
                                          <input
                                            type="number"
                                            step="any"
                                            value={sig.min}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { min: parseFloat(e.target.value) || 0 })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>

                                        {/* Max */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Max Value</label>
                                          <input
                                            type="number"
                                            step="any"
                                            value={sig.max}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { max: parseFloat(e.target.value) || 0 })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {/* Unit */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Unit</label>
                                          <input
                                            type="text"
                                            placeholder="e.g. rpm, C, V"
                                            value={sig.unit}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { unit: e.target.value })}
                                            className="glass-input py-1 px-2 text-xs"
                                          />
                                        </div>

                                        {/* Endianness */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Byte Order</label>
                                          <select
                                            value={sig.isLittleEndian ? 'intel' : 'motorola'}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { isLittleEndian: e.target.value === 'intel' })}
                                            className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2 py-1 text-xs focus:outline-none"
                                          >
                                            <option value="intel" className="bg-[var(--bg-color)]">Intel (LE)</option>
                                            <option value="motorola" className="bg-[var(--bg-color)]">Motorola (BE)</option>
                                          </select>
                                        </div>

                                        {/* Sign */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Encoding Sign</label>
                                          <select
                                            value={sig.isSigned ? 'signed' : 'unsigned'}
                                            onChange={(e) => handleUpdateSignal(currentMsg.id, sigIdx, { isSigned: e.target.value === 'signed' })}
                                            className="bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-color)] rounded px-2 py-1 text-xs focus:outline-none"
                                          >
                                            <option value="unsigned" className="bg-[var(--bg-color)]">Unsigned</option>
                                            <option value="signed" className="bg-[var(--bg-color)]">Signed</option>
                                          </select>
                                        </div>

                                        {/* Receivers (Dropdown/Checkbox node names) */}
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] text-[var(--text-muted)] font-bold">Receiver Nodes</label>
                                          <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto border border-[var(--border-color)] p-1 rounded bg-[var(--bg-input)]">
                                            {draftDb.nodes.map(node => {
                                              const isChecked = sig.receivers.includes(node);
                                              return (
                                                <label key={node} className="flex items-center gap-1 text-[10px] cursor-pointer hover:bg-[var(--border-sub)] px-1 rounded select-none">
                                                  <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => {
                                                      const newReceivers = isChecked
                                                        ? sig.receivers.filter(r => r !== node)
                                                        : [...sig.receivers, node];
                                                      handleUpdateSignal(currentMsg.id, sigIdx, { receivers: newReceivers });
                                                    }}
                                                    className="w-2.5 h-2.5 rounded text-sky-500 bg-transparent border-[var(--border-color)] cursor-pointer focus:ring-0"
                                                  />
                                                  <span>{node}</span>
                                                </label>
                                              );
                                            })}
                                            {draftDb.nodes.length === 0 && (
                                              <span className="text-[9px] text-[var(--text-muted)] italic">No nodes.</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {currentMsg.signals.length === 0 && (
                                    <div className="text-center text-xs text-[var(--text-muted)] py-8 italic bg-[var(--bg-input)]/35 rounded border border-[var(--border-sub)]">
                                      No signals defined. Add a signal above to specify decoding parameters.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    )}

                    {/* Graphical Editor Save/Cancel buttons */}
                    <div className="flex gap-2.5 border-t border-[var(--border-color)] pt-3.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          const serialized = serializeDbc(draftDb);
                          const oldName = inspectedEntry?.name || inspectedDbcName;
                          const newName = editingDbcName.trim();
                          if (!newName) {
                            alert('Database name cannot be empty.');
                            return;
                          }
                          updateDbc(oldName, newName, serialized);
                          setInspectedDbcName(newName);
                          setActiveTab('inspect');
                        }}
                        className="flex-1 bg-cyber-accent border border-cyber-accent/40 text-black hover:bg-emerald-400 text-xs font-bold rounded py-2 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> Save DBC Configuration
                      </button>
                      <button
                        onClick={() => {
                          if (inspectedEntry) {
                            try {
                              setDraftDb(parseDbc(inspectedEntry.content));
                            } catch {
                              setDraftDb({ nodes: [], messages: {} });
                            }
                          }
                          setActiveTab('inspect');
                        }}
                        className="px-4 py-2 border border-[var(--border-color)] hover:bg-[var(--bg-input)] text-[var(--text-color)] text-xs font-bold rounded transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[var(--text-muted)]">
              <Database className="w-12 h-12 mb-3 opacity-25 text-[var(--text-color)]" />
              <h3 className="font-bold text-sm text-[var(--text-color)] mb-1">Signal Parameter Inspector</h3>
              <span className="text-xs max-w-sm">Select a DBC file from the left sidebar to start.</span>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
