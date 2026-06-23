import { create } from 'zustand';
import { parseDbc, decodeFrame, encodeFrame } from '../lib/dbcParser';
import type { DbcDatabase } from '../lib/dbcParser';
import { createCanopenNode, handleNmtCommand, handleSdoRequest, generateHeartbeatFrame } from '../lib/canopen';
import type { CanopenNode } from '../lib/canopen';
import { parseJ1939Id, buildJ1939Id, J1939TpReassembler } from '../lib/j1939';
import { isTauriEnv, saveTextFile } from '../lib/tauriAdapter';
import { BUILT_IN_DBCS } from '../lib/builtInDbcs';

// Default Mock DBC for J1939
const DEFAULT_J1939_DBC = `
BU_: Engine Transmission InstrumentPanel DiagnosticTool
BO_ 2364539904 EEC1: 8 Engine
 SG_ EngineSpeed : 24|16@1+ (0.125,0) [0|8000] "rpm" InstrumentPanel
 SG_ EngineTorque : 16|8@1- (1,0) [-125|125] "%" InstrumentPanel
 SG_ AcceleratorPosition : 8|8@1+ (0.4,0) [0|100] "%" InstrumentPanel

BO_ 2364543488 ET1: 8 Engine
 SG_ EngineCoolantTemp : 0|8@1+ (1,-40) [-40|215] "C" InstrumentPanel
 SG_ EngineOilTemp : 16|16@1+ (0.03125,-273) [-273|1735] "C" InstrumentPanel

BO_ 2364539905 TC1: 8 Transmission
 SG_ TransmissionSelectedGear : 0|4@1+ (1,-125) [-125|125] "" InstrumentPanel
 SG_ TransmissionActualGear : 4|4@1+ (1,-125) [-125|125] "" InstrumentPanel
`;



export interface CanDevice {
  id: string;
  name: string;
  nodeId: number;
  enabled: boolean;
  isSimulated: boolean;
  mimicDbcNode?: string; // DBC Node Name to mimic
  associatedDbcName?: string; // Associated DBC format
  customMessages: Array<{
    id: number;
    name: string;
    dlc: number;
    data: Uint8Array;
    interval: number; // ms, 0 = single shot
    enabled: boolean;
    signals?: Record<string, number>;
    templateKey?: string;
  }>;
}

export interface CanLog {
  timestamp: number; // ms since simulation started
  direction: 'RX' | 'TX';
  id: number;
  name: string;
  dlc: number;
  data: Uint8Array;
  delta: number; // ms since previous frame of same ID
  decodedSignals: Record<string, number> | null;
  byteChanges?: number[];
  lastChangedTimes?: number[];
  minValues?: number[];
  maxValues?: number[];
}

export interface PlotPoint {
  timestamp: number;
  values: Record<string, number>;
}

export interface ProjectSettings {
  name: string;
  disabledMessageIds: Record<number, boolean>;
  messageNameOverrides: Record<number, string>;
}

export interface DbcRegistryEntry {
  name: string;
  content: string;
  type: 'generic' | 'device' | 'custom';
  enabled: boolean;
}

export interface SmartCanProject {
  id: string;
  name: string;
  protocol: 'canopen' | 'j1939';
  baudRate: number;
  enabled: boolean;
  enabledDbcNames: string[];
  devices: CanDevice[];
  disabledMessageIds: Record<number, boolean>;
  messageNameOverrides: Record<number, string>;
}

interface CanStore {
  // Protocol & Baud
  protocol: 'canopen' | 'j1939';
  baudRate: number;
  isConnected: boolean;
  kvaserStatus: 'offline' | 'physical' | 'simulated';
  kvaserDeviceName: string | null;
  connectionError: string | null;
  
  // Layout Options
  theme: 'light' | 'dark';
  visiblePanels: Record<string, boolean>;
  panelPositions: Record<string, 'sidebar' | 'main-top' | 'main-bottom'>;
  isEditingLayout: boolean;
  panelWidths: Record<string, number>;
  panelHeights: Record<string, number>;
  panelOrder: string[];
  liveViewerMode: 'scroll' | 'fixed';
  activeDragKey: string | null;
  dragOverTargetKey: string | null;
  dragOverZone: 'sidebar' | 'main-top' | 'main-bottom' | null;
  
  // DBC Databases
  dbcs: Record<string, DbcDatabase>;
  activeDbcName: string;
  
  // Network Topologies & Project Configuration
  devices: CanDevice[];
  projectSettings: ProjectSettings;
  projects: SmartCanProject[];
  activeProjectId: string;
  dbcRegistry: DbcRegistryEntry[];
  
  // Traffic Log
  logs: CanLog[];
  fixedLogs: Record<number, CanLog>;
  pausedLogs: boolean;
  totalFramesReceived: number;
  
  // Realtime Plotting
  plotSignals: string[];
  plotPoints: PlotPoint[];
  plotXWindow: number | 'all';
  plotYMode: 'dbc' | 'auto' | 'manual';
  plotManualMinY: string;
  plotManualMaxY: string;
  
  // Simulator internals
  isSimulating: boolean;
  simTime: number; // in ms
  simulationTimer: ReturnType<typeof setInterval> | null;
  canopenNodes: Record<number, CanopenNode>;
  tpReassembler: J1939TpReassembler;

  // Multi-window and tracking
  timestampOffset: number | null;
  lastPhysicalTimestamp: number | null;
  trackedBits: Array<{ msgId: number; byteIdx: number; bitIdx: number }>;

  // Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;

  // Actions
  setProtocol: (proto: 'canopen' | 'j1939') => void;
  setBaudRate: (baud: number) => void;
  setConnected: (connected: boolean) => Promise<void>;
  startSimulationMode: () => void;
  dismissConnectionError: () => void;
  toggleTheme: () => void;
  togglePanelVisibility: (panelName: string) => void;
  setPanelPosition: (panelName: string, position: 'sidebar' | 'main-top' | 'main-bottom') => void;
  setEditingLayout: (isEditing: boolean) => void;
  setPanelWidth: (panelName: string, width: number) => void;
  setPanelHeight: (panelName: string, height: number) => void;
  setPanelOrder: (order: string[]) => void;
  setLiveViewerMode: (mode: 'scroll' | 'fixed') => void;
  setActiveDragKey: (key: string | null) => void;
  setDragOverTargetKey: (key: string | null) => void;
  setDragOverZone: (zone: 'sidebar' | 'main-top' | 'main-bottom' | null) => void;
  loadDbcFile: (name: string, content: string) => void;
  unloadDbc: () => void;
  
  // Project Management Actions
  addProject: (name: string) => void;
  setActiveProject: (id: string) => void;
  deleteProject: (id: string) => void;
  toggleDbcInProject: (dbcName: string) => void;
  importDbcToProject: (name: string, content: string, type?: 'custom' | 'device' | 'generic') => void;
  removeDbcFromProject: (name: string) => void;
  updateDbc: (oldName: string, newName: string, content: string) => void;
  createEmptyDbc: (name: string, type?: 'custom' | 'device' | 'generic') => void;
  restoreDefaultDbcs: () => void;
  saveSmartCanFile: () => void;
  loadSmartCanFile: (jsonContent: string) => void;
  
  // Device actions
  addDevice: (device: Omit<CanDevice, 'customMessages'>) => void;
  updateDevice: (deviceId: string, updates: Partial<CanDevice>) => void;
  removeDevice: (deviceId: string) => void;
  addCustomMessage: (deviceId: string, message: CanDevice['customMessages'][0]) => void;
  updateCustomMessage: (deviceId: string, messageId: number, updates: Partial<CanDevice['customMessages'][0]>) => void;
  removeCustomMessage: (deviceId: string, messageId: number) => void;

  // Project overrides
  toggleMessageDisabledInProject: (id: number) => void;
  setMessageNameOverride: (id: number, name: string) => void;
  
  // Log Actions
  addLog: (frame: Omit<CanLog, 'delta' | 'decodedSignals' | 'name'>) => void;
  addLogsBatch: (frames: Array<Omit<CanLog, 'delta' | 'decodedSignals' | 'name'>>) => void;
  clearLogs: () => void;
  setPausedLogs: (paused: boolean) => void;
  importLogsCsv: (csvContent: string) => void;
  saveMessageToActiveDbc: (id: number, name: string, dlc: number, sender: string) => void;
  
  // Plot actions
  togglePlotSignal: (sigName: string) => void;
  clearPlotHistory: () => void;
  setPlotXWindow: (xWindow: number | 'all') => void;
  setPlotYMode: (yMode: 'dbc' | 'auto' | 'manual') => void;
  setPlotManualMinY: (minY: string) => void;
  setPlotManualMaxY: (maxY: string) => void;

  // Simulation controls
  startSimulation: () => void;
  stopSimulation: () => void;
  transmitFrame: (id: number, data: Uint8Array) => void;

  // Diagnostics actions
  sendNmtCommand: (cs: number, targetNodeId: number) => void;
  sendSdoRequest: (targetNodeId: number, index: number, subIndex: number, data: Uint8Array, cs: number) => void;
  sendJ1939AddressClaim: (nodeAddress: number, name: bigint) => void;
  sendJ1939Request: (pgn: number, destination: number) => void;

  // New actions
  setActiveDbcName: (name: string) => void;
  setPanelVisibility: (panelName: string, visible: boolean) => void;
  toggleTrackBit: (msgId: number, byteIdx: number, bitIdx: number) => void;
  syncFromStorage: (parsed: any) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  clearToast: () => void;
}

const defaultDbcJ1939 = parseDbc(DEFAULT_J1939_DBC);

// Keep a local reference for the tauri listener unlisten promise
let kvaserUnlisten: (() => void) | null = null;
let toastTimeoutId: ReturnType<typeof setTimeout> | null = null;

function reconstructDevices(devices: any[]): CanDevice[] {
  if (!Array.isArray(devices)) return [];
  return devices.map((d: any) => ({
    id: d.id || `dev-${Date.now()}-${Math.random()}`,
    name: d.name || 'Unnamed ECU',
    nodeId: typeof d.nodeId === 'number' ? d.nodeId : 1,
    enabled: d.enabled !== false,
    isSimulated: d.isSimulated !== false,
    mimicDbcNode: d.mimicDbcNode,
    associatedDbcName: d.associatedDbcName,
    customMessages: Array.isArray(d.customMessages)
      ? d.customMessages.map((msg: any) => {
          const dlc = Number(msg.dlc) || 8;
          const dataBytes = new Uint8Array(dlc);
          if (msg.data) {
            if (Array.isArray(msg.data)) {
              dataBytes.set(msg.data.slice(0, dlc));
            } else if (typeof msg.data === 'object') {
              const rawData = msg.data.data || msg.data;
              if (Array.isArray(rawData)) {
                dataBytes.set(rawData.slice(0, dlc));
              } else {
                for (let i = 0; i < dlc; i++) {
                  if (rawData[i] !== undefined) {
                    dataBytes[i] = Number(rawData[i]) || 0;
                  }
                }
              }
            }
          }
          return {
            id: Number(msg.id) || 0,
            name: msg.name || `Msg_0x${msg.id?.toString(16)}`,
            dlc,
            data: dataBytes,
            interval: typeof msg.interval === 'number' ? msg.interval : 500,
            enabled: msg.enabled !== false,
            signals: msg.signals || {},
            templateKey: msg.templateKey || undefined
          };
        })
      : []
  }));
}

const getInitialState = () => {
  const defaultState = {
    protocol: 'j1939' as const,
    baudRate: 250000,
    isConnected: false,
    kvaserStatus: 'offline' as const,
    kvaserDeviceName: null,
    connectionError: null,
    theme: 'light' as const,
    visiblePanels: {
      deviceManager: true, // Logical ECU Tree visible by default
      dbcManager: false,
      liveViewer: true,
      livePlotter: false,
      transmitter: false,
      diagnostics: false,
      falseSender: false
    },
    panelPositions: {
      deviceManager: 'sidebar' as const,
      dbcManager: 'sidebar' as const,
      liveViewer: 'main-top' as const,
      livePlotter: 'main-top' as const,
      transmitter: 'main-bottom' as const,
      diagnostics: 'main-bottom' as const,
      falseSender: 'main-bottom' as const
    },
    isEditingLayout: false,
    panelWidths: {
      deviceManager: 3,
      dbcManager: 3,
      liveViewer: 6,
      livePlotter: 6,
      transmitter: 6,
      diagnostics: 6,
      falseSender: 6
    },
    panelHeights: {
      deviceManager: 400,
      dbcManager: 400,
      liveViewer: 400,
      livePlotter: 400,
      transmitter: 250,
      diagnostics: 250,
      falseSender: 250
    },
    panelOrder: [
      'deviceManager',
      'dbcManager',
      'liveViewer',
      'livePlotter',
      'transmitter',
      'diagnostics',
      'falseSender'
    ],
    liveViewerMode: 'scroll' as const,
    dragOverZone: null as 'sidebar' | 'main-top' | 'main-bottom' | null,
    activeDragKey: null as string | null,
    dragOverTargetKey: null as string | null,
    
    // DBC Database
    dbcs: {
      'Default J1939 Database': defaultDbcJ1939
    } as Record<string, DbcDatabase>,
    activeDbcName: 'Default J1939 Database',
    
    // Devices and Registry
    devices: [] as CanDevice[],
    projectSettings: {
      name: 'Default Project',
      disabledMessageIds: {} as Record<number, boolean>,
      messageNameOverrides: {} as Record<number, string>
    },
    projects: [
      {
        id: 'proj-default',
        name: 'Default Project',
        protocol: 'j1939' as const,
        baudRate: 250000,
        enabled: true,
        enabledDbcNames: ['Default J1939 Database'],
        devices: [],
        disabledMessageIds: {},
        messageNameOverrides: {}
      }
    ] as SmartCanProject[],
    activeProjectId: 'proj-default',
    dbcRegistry: [
      {
        name: 'Default J1939 Database',
        content: DEFAULT_J1939_DBC,
        type: 'generic' as const,
        enabled: true
      },
      ...BUILT_IN_DBCS.filter(d => d.name !== 'Default J1939 Database').map(d => ({
        name: d.name,
        content: d.content,
        type: d.category === 'generic' ? 'generic' as const : 'device' as const,
        enabled: false
      }))
    ] as DbcRegistryEntry[],
    
    // Logs
    logs: [] as CanLog[],
    fixedLogs: {} as Record<number, CanLog>,
    pausedLogs: false,
    totalFramesReceived: 0,
    // Plot
    plotSignals: [] as string[],
    plotPoints: [] as PlotPoint[],
    plotXWindow: 'all' as number | 'all',
    plotYMode: 'auto' as 'dbc' | 'auto' | 'manual',
    plotManualMinY: '0',
    plotManualMaxY: '100',
    toast: null as { message: string; type: 'success' | 'error' | 'info' } | null,
    
    // Simulation
    isSimulating: false,
    simTime: 0,
    simulationTimer: null as ReturnType<typeof setInterval> | null,
    canopenNodes: {
      1: createCanopenNode(1),
      2: createCanopenNode(2)
    } as Record<number, CanopenNode>,
    tpReassembler: new J1939TpReassembler(),
    timestampOffset: null as number | null,
    lastPhysicalTimestamp: null as number | null,
    trackedBits: [] as Array<{ msgId: number; byteIdx: number; bitIdx: number }>
  };

  if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
    try {
      const raw = localStorage.getItem('smartcan_state_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const activeProjId = parsed.activeProjectId || defaultState.activeProjectId;
          const restoredProjects = Array.isArray(parsed.projects)
            ? parsed.projects.map((proj: any) => ({
                ...proj,
                devices: reconstructDevices(proj.devices)
              }))
            : defaultState.projects;
          const activeProj = restoredProjects.find((p: any) => p.id === activeProjId) || restoredProjects[0] || defaultState.projects[0];
          
          const restoredRegistry = Array.isArray(parsed.dbcRegistry) 
            ? parsed.dbcRegistry.map((entry: any) => ({
                name: entry.name,
                content: entry.content,
                type: entry.type || 'custom',
                enabled: entry.enabled
              }))
            : defaultState.dbcRegistry;

          // Parse active DBC databases
          const parsedDbcs: Record<string, DbcDatabase> = {};
          restoredRegistry.forEach((entry: any) => {
            if (entry.enabled) {
              try {
                parsedDbcs[entry.name] = parseDbc(entry.content);
              } catch (e) {
                console.error('Failed to parse enabled DBC on load:', entry.name, e);
              }
            }
          });

          return {
            ...defaultState,
            ...parsed,
            projects: restoredProjects,
            activeProjectId: activeProjId,
            dbcRegistry: restoredRegistry,
            dbcs: parsedDbcs,
            protocol: activeProj.protocol,
            baudRate: activeProj.baudRate,
            devices: activeProj.devices || [],
            projectSettings: {
              name: activeProj.name || 'Default Project',
              disabledMessageIds: activeProj.disabledMessageIds || {},
              messageNameOverrides: activeProj.messageNameOverrides || {}
            },
            isConnected: false,
            kvaserStatus: 'offline' as const,
            kvaserDeviceName: null,
            connectionError: null,
            isSimulating: false,
            simTime: 0,
            simulationTimer: null,
            logs: [],
            fixedLogs: {},
            totalFramesReceived: 0,
            timestampOffset: null,
            lastPhysicalTimestamp: null,
            trackedBits: parsed.trackedBits || [],
            plotPoints: [],
            plotXWindow: parsed.plotXWindow !== undefined ? parsed.plotXWindow : defaultState.plotXWindow,
            plotYMode: parsed.plotYMode !== undefined ? parsed.plotYMode : defaultState.plotYMode,
            plotManualMinY: parsed.plotManualMinY !== undefined ? parsed.plotManualMinY : defaultState.plotManualMinY,
            plotManualMaxY: parsed.plotManualMaxY !== undefined ? parsed.plotManualMaxY : defaultState.plotManualMaxY,
            toast: null,
            canopenNodes: activeProj.protocol === 'canopen' ? (() => {
              const nodes: Record<number, CanopenNode> = {};
              (activeProj.devices || []).forEach((d: any) => {
                nodes[d.nodeId] = createCanopenNode(d.nodeId);
              });
              return nodes;
            })() : {}
          };
        }
      }
    } catch (e) {
      console.error('Failed to restore state from localStorage:', e);
    }
  }
  return defaultState;
};

export const useStore = create<CanStore>((set, get) => {
  // Keep track of last timestamps per ID for delta calculations
  const lastTimestampsById: Record<number, number> = {};

  const redecodeLogs = (
    logs: CanLog[],
    dbcs: Record<string, DbcDatabase>,
    protocol: 'canopen' | 'j1939',
    devices: CanDevice[],
    dbcRegistry: DbcRegistryEntry[],
    projectSettings: ProjectSettings,
    trackedBits: Array<{ msgId: number; byteIdx: number; bitIdx: number }>
  ): CanLog[] => {
    return logs.map(log => {
      let decodedSignals: Record<string, number> | null = null;
      let msgName = projectSettings.messageNameOverrides[log.id] || '';

      for (const [dbcName, parsedDbc] of Object.entries(dbcs)) {
        if (protocol === 'j1939') {
          const frameDetails = parseJ1939Id(log.id);
          const matchingDev = devices.find(dev => dev.nodeId === frameDetails.sa && dev.enabled);
          if (!matchingDev) continue;

          const registryEntry = dbcRegistry.find(r => r.name === dbcName);
          const isGeneric = registryEntry?.type === 'generic';
          const isAssociated = matchingDev.associatedDbcName === dbcName;

          if (!isGeneric && !isAssociated) continue;

          const matchedMessage = Object.values(parsedDbc.messages).find(msg => {
            const dbMsgDetails = parseJ1939Id(msg.id);
            return dbMsgDetails.pgn === frameDetails.pgn;
          });
          
          if (matchedMessage) {
            if (!msgName) msgName = matchedMessage.name;
            const signals = decodeFrame(matchedMessage.id, log.data, parsedDbc);
            if (signals) {
              decodedSignals = { ...(decodedSignals || {}), ...signals };
            }
          }
        } else {
          const frameNodeId = log.id & 0x7F;
          const matchingDev = devices.find(dev => dev.nodeId === frameNodeId && dev.enabled);
          if (!matchingDev) continue;

          const registryEntry = dbcRegistry.find(r => r.name === dbcName);
          const isGeneric = registryEntry?.type === 'generic';
          const isAssociated = matchingDev.associatedDbcName === dbcName;

          if (!isGeneric && !isAssociated) continue;

          const matchedMessage = parsedDbc.messages[log.id];
          if (matchedMessage) {
            if (!msgName) msgName = matchedMessage.name;
            const signals = decodeFrame(log.id, log.data, parsedDbc);
            if (signals) {
              decodedSignals = { ...(decodedSignals || {}), ...signals };
            }
          }
        }
      }

      if (!msgName) {
        if (protocol === 'j1939') {
          const frameDetails = parseJ1939Id(log.id);
          msgName = `PGN ${frameDetails.pgn.toString(16).toUpperCase()} (SA:${frameDetails.sa})`;
        } else {
          const type = log.id & 0x780;
          const nid = log.id & 0x07F;
          if (type === 0x700) msgName = `Heartbeat Node ${nid}`;
          else if (type === 0x600) msgName = `SDO Rx Node ${nid}`;
          else if (type === 0x580) msgName = `SDO Tx Node ${nid}`;
          else if (log.id === 0x000) msgName = 'NMT Master Command';
          else msgName = `COB-ID 0x${log.id.toString(16).toUpperCase()}`;
        }
      }

      const matchingTracked = trackedBits.filter(tb => tb.msgId === log.id);
      if (matchingTracked.length > 0) {
        if (!decodedSignals) decodedSignals = {};
        matchingTracked.forEach(tb => {
          const byteVal = log.data[tb.byteIdx] ?? 0;
          const bitVal = (byteVal >> tb.bitIdx) & 1;
          const name = `0x${log.id.toString(16).toUpperCase()}_B${tb.byteIdx}_b${tb.bitIdx}`;
          decodedSignals![name] = bitVal;
        });
      }

      if (projectSettings.messageNameOverrides[log.id]) {
        msgName = projectSettings.messageNameOverrides[log.id];
      }

      return {
        ...log,
        name: msgName,
        decodedSignals
      };
    });
  };

  const syncStoreState = (state: CanStore) => {
    const activeProj = state.projects.find((p) => p.id === state.activeProjectId);
    if (!activeProj) return {};

    activeProj.protocol = state.protocol;
    activeProj.baudRate = state.baudRate;
    activeProj.devices = state.devices;
    activeProj.disabledMessageIds = state.projectSettings.disabledMessageIds;
    activeProj.messageNameOverrides = state.projectSettings.messageNameOverrides;

    const updatedRegistry = state.dbcRegistry.map((entry) => ({
      ...entry,
      enabled: activeProj.enabledDbcNames.includes(entry.name)
    }));

    const parsedDbcs: Record<string, DbcDatabase> = {};
    updatedRegistry.forEach((entry) => {
      if (entry.enabled) {
        try {
          parsedDbcs[entry.name] = parseDbc(entry.content);
        } catch (e) {
          console.error('Failed to parse enabled DBC:', entry.name, e);
        }
      }
    });

    const redecodedLogs = redecodeLogs(
      state.logs,
      parsedDbcs,
      state.protocol,
      state.devices,
      updatedRegistry,
      state.projectSettings,
      state.trackedBits
    );

    const redecodedFixedLogs: Record<number, CanLog> = {};
    Object.entries(state.fixedLogs).forEach(([idStr, log]) => {
      const id = Number(idStr);
      redecodedFixedLogs[id] = redecodeLogs(
        [log],
        parsedDbcs,
        state.protocol,
        state.devices,
        updatedRegistry,
        state.projectSettings,
        state.trackedBits
      )[0];
    });

    return {
      projects: [...state.projects],
      dbcRegistry: updatedRegistry,
      dbcs: parsedDbcs,
      logs: redecodedLogs,
      fixedLogs: redecodedFixedLogs
    };
  };

  return {
    ...getInitialState(),

    // Actions
    setProtocol: (proto) => {
      const activeDbc = proto === 'j1939' ? 'Default J1939 Database' : 'Default CANopen Database';
      
      // Default devices for the protocol
      const defaultDevices: CanDevice[] = [];

      // Reset logs and plotting history
      Object.keys(lastTimestampsById).forEach(key => delete lastTimestampsById[Number(key)]);

      // Stop simulator if running to reset states
      const state = get();
      if (state.isSimulating) {
        state.stopSimulation();
      }

      set(state => {
        const nextState = {
          ...state,
          protocol: proto,
          activeDbcName: activeDbc,
          devices: defaultDevices,
          logs: [],
          fixedLogs: {},
          plotPoints: [],
          plotSignals: [],
          simTime: 0,
          canopenNodes: proto === 'canopen' ? {
            1: createCanopenNode(1),
            2: createCanopenNode(2)
          } : ({} as Record<number, CanopenNode>)
        };

        const activeProj = nextState.projects.find(p => p.id === nextState.activeProjectId);
        if (activeProj) {
          activeProj.protocol = proto;
          activeProj.devices = defaultDevices;
          activeProj.enabledDbcNames = [activeDbc];
        }

        return {
          ...nextState,
          ...syncStoreState(nextState)
        };
      });
    },

    setBaudRate: (baudRate) => set(state => {
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.baudRate = baudRate;
      }
      return { baudRate, projects: [...state.projects] };
    }),

    toggleTheme: () => set(state => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        if (nextTheme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          document.documentElement.classList.add('dark');
        }
      }
      return { theme: nextTheme };
    }),

    togglePanelVisibility: (panelName) => set(state => ({
      visiblePanels: {
        ...state.visiblePanels,
        [panelName]: !state.visiblePanels[panelName]
      }
    })),

    setPanelPosition: (panelName, position) => set(state => ({
      panelPositions: {
        ...state.panelPositions,
        [panelName]: position
      }
    })),

    setEditingLayout: (isEditingLayout) => set({ isEditingLayout }),

    setPanelWidth: (panelName, width) => set(state => ({
      panelWidths: {
        ...state.panelWidths,
        [panelName]: Math.max(1, Math.min(12, width))
      }
    })),

    setPanelHeight: (panelName, height) => set(state => ({
      panelHeights: {
        ...state.panelHeights,
        [panelName]: Math.max(120, height)
      }
    })),

    setPanelOrder: (panelOrder) => set({ panelOrder }),
    setLiveViewerMode: (liveViewerMode) => set({ liveViewerMode }),
    setActiveDragKey: (activeDragKey) => set({ activeDragKey }),
    setDragOverTargetKey: (dragOverTargetKey) => set({ dragOverTargetKey }),
    setDragOverZone: (dragOverZone) => set({ dragOverZone }),

    setConnected: async (isConnected) => {
      const state = get();
      
      if (isConnected) {
        if (isTauriEnv()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');
            
            set({ connectionError: null });
            
            // Start Kvaser Leaf listener in the backend
            const result = await invoke('start_kvaser', { baudRate: state.baudRate }) as {
              device_name: string;
              channel: number;
              is_virtual: boolean;
            };
            
            set({ 
              kvaserStatus: 'physical',
              kvaserDeviceName: `${result.device_name} (Ch ${result.channel})`,
              connectionError: null,
              isConnected: true
            });
            
            // Listen for frames emitted from Rust
            const unlisten = await listen('kvaser-frame', (event: { payload: unknown }) => {
              const frame = event.payload as { timestamp: number; id: number; dlc: number; data: number[] };
              
              // Direct state feed
              useStore.getState().addLog({
                timestamp: frame.timestamp,
                direction: 'RX',
                id: frame.id,
                dlc: frame.dlc,
                data: new Uint8Array(frame.data)
              });
            });
            
            kvaserUnlisten = unlisten;
          } catch (err) {
            console.error('Tauri Kvaser connection failed:', err);
            set({ 
              kvaserStatus: 'offline',
              kvaserDeviceName: null,
              connectionError: String(err),
              isConnected: false
            });
          }
        } else {
          // Web Browser Fallback: open virtual channel silently
          set({ 
            kvaserStatus: 'simulated',
            kvaserDeviceName: 'Web Simulator (Virtual)',
            connectionError: null,
            isConnected: true
          });
        }
      } else {
        if (state.kvaserStatus === 'simulated') {
          state.stopSimulation();
        }
        if (isTauriEnv()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('stop_kvaser');
            if (kvaserUnlisten) {
              kvaserUnlisten();
              kvaserUnlisten = null;
            }
          } catch (err) {
            console.error('Tauri stop_kvaser failed:', err);
          }
        } else {
          state.stopSimulation();
        }
        set({ 
          kvaserStatus: 'offline', 
          kvaserDeviceName: null, 
          connectionError: null,
          isConnected: false
        });
      }
    },

    startSimulationMode: () => {
      set({
        kvaserStatus: 'simulated',
        kvaserDeviceName: 'Simulated CAN Bus',
        connectionError: null,
        isConnected: true
      });
    },

    dismissConnectionError: () => {
      set({ connectionError: null });
    },

    loadDbcFile: (name, content) => {
      get().importDbcToProject(name, content);
    },

    unloadDbc: () => {
      get().removeDbcFromProject(get().activeDbcName);
    },

    addProject: (name) => set(state => {
      const id = 'proj-' + Math.random().toString(36).substr(2, 9);
      const newProj: SmartCanProject = {
        id,
        name,
        protocol: state.protocol,
        baudRate: state.baudRate,
        enabled: true,
        enabledDbcNames: state.protocol === 'j1939' ? ['Default J1939 Database'] : ['Default CANopen Database'],
        devices: state.devices.map(d => ({ ...d })),
        disabledMessageIds: { ...state.projectSettings.disabledMessageIds },
        messageNameOverrides: { ...state.projectSettings.messageNameOverrides }
      };

      const nextState = {
        ...state,
        projects: [...state.projects, newProj],
        activeProjectId: id,
        projectSettings: {
          name: newProj.name,
          disabledMessageIds: newProj.disabledMessageIds,
          messageNameOverrides: newProj.messageNameOverrides
        }
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    setActiveProject: (id) => set(state => {
      const targetProj = state.projects.find(p => p.id === id);
      if (!targetProj) return {};

      const nextState = {
        ...state,
        activeProjectId: id,
        protocol: targetProj.protocol,
        baudRate: targetProj.baudRate,
        devices: targetProj.devices,
        projectSettings: {
          name: targetProj.name,
          disabledMessageIds: targetProj.disabledMessageIds,
          messageNameOverrides: targetProj.messageNameOverrides
        }
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    deleteProject: (id) => set(state => {
      if (state.projects.length <= 1) {
        alert("Cannot delete the last remaining project.");
        return {};
      }
      const nextProjects = state.projects.filter(p => p.id !== id);
      let nextState = { ...state, projects: nextProjects };

      if (state.activeProjectId === id) {
        const nextActiveId = nextProjects[0].id;
        const targetProj = nextProjects[0];
        nextState = {
          ...nextState,
          activeProjectId: nextActiveId,
          protocol: targetProj.protocol,
          baudRate: targetProj.baudRate,
          devices: targetProj.devices,
          projectSettings: {
            name: targetProj.name,
            disabledMessageIds: targetProj.disabledMessageIds,
            messageNameOverrides: targetProj.messageNameOverrides
          }
        };
      }

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    toggleDbcInProject: (dbcName) => set(state => {
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (!activeProj) return {};

      const isEnabled = activeProj.enabledDbcNames.includes(dbcName);
      const nextEnabledDbcNames = isEnabled
        ? activeProj.enabledDbcNames.filter(name => name !== dbcName)
        : [...activeProj.enabledDbcNames, dbcName];

      activeProj.enabledDbcNames = nextEnabledDbcNames;

      const nextState = { ...state };
      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    importDbcToProject: (name, content, type = 'custom') => set(state => {
      try {
        parseDbc(content);
      } catch (err) {
        console.error('Error loading DBC file:', err);
        alert('Could not parse DBC file. Please ensure it follows Vector DBC formats.');
        return {};
      }

      const exists = state.dbcRegistry.some(entry => entry.name === name);
      const updatedRegistry = exists
        ? state.dbcRegistry.map(entry => entry.name === name ? { ...entry, content, type } : entry)
        : [...state.dbcRegistry, { name, content, type, enabled: true }];

      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj && !activeProj.enabledDbcNames.includes(name)) {
        activeProj.enabledDbcNames = [...activeProj.enabledDbcNames, name];
      }

      const nextState = {
        ...state,
        dbcRegistry: updatedRegistry,
        activeDbcName: name
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    removeDbcFromProject: (name) => set(state => {
      const updatedRegistry = state.dbcRegistry.filter(entry => entry.name !== name);
      state.projects.forEach(proj => {
        proj.enabledDbcNames = proj.enabledDbcNames.filter(n => n !== name);
      });

      const nextActiveDbcName = state.activeDbcName === name
        ? (Object.keys(state.dbcs).filter(n => n !== name)[0] || '')
        : state.activeDbcName;

      const nextState = {
        ...state,
        dbcRegistry: updatedRegistry,
        activeDbcName: nextActiveDbcName
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    updateDbc: (oldName, newName, content) => set(state => {
      try {
        parseDbc(content);
      } catch (err) {
        console.error('Failed to parse DBC:', err);
        alert(`Failed to parse DBC syntax: ${(err as Error).message}`);
        return {};
      }

      const trimmedNewName = newName.trim();
      if (!trimmedNewName) {
        alert('DBC database name cannot be empty.');
        return {};
      }
      if (trimmedNewName !== oldName && state.dbcRegistry.some(entry => entry.name === trimmedNewName)) {
        alert(`A DBC database named "${trimmedNewName}" already exists.`);
        return {};
      }

      const updatedRegistry = state.dbcRegistry.map(entry => {
        if (entry.name === oldName) {
          return {
            ...entry,
            name: trimmedNewName,
            content
          };
        }
        return entry;
      });

      state.projects.forEach(proj => {
        proj.enabledDbcNames = proj.enabledDbcNames.map(n => n === oldName ? trimmedNewName : n);
      });

      let nextActiveDbcName = state.activeDbcName;
      if (state.activeDbcName === oldName) {
        nextActiveDbcName = trimmedNewName;
      }

      const nextState = {
        ...state,
        dbcRegistry: updatedRegistry,
        activeDbcName: nextActiveDbcName
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    createEmptyDbc: (name, type = 'custom') => set(state => {
      const trimmed = name.trim();
      if (!trimmed) {
        alert('DBC database name cannot be empty.');
        return {};
      }
      if (state.dbcRegistry.some(entry => entry.name === trimmed)) {
        alert(`A DBC database named "${trimmed}" already exists.`);
        return {};
      }

      let nodeName = trimmed.replace(/\.dbc$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
      if (!/^[a-zA-Z_]/.test(nodeName)) {
        nodeName = '_' + nodeName;
      }
      const initialContent = type === 'device'
        ? `BU_: Master_Node ${nodeName}\n`
        : `BU_: Master_Node\n`;

      const newEntry = {
        name: trimmed,
        content: initialContent,
        type,
        enabled: true
      };

      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.enabledDbcNames = [...activeProj.enabledDbcNames, trimmed];
      }

      const nextState = {
        ...state,
        dbcRegistry: [...state.dbcRegistry, newEntry],
        activeDbcName: trimmed
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    restoreDefaultDbcs: () => set(state => {
      const baseRegistry = BUILT_IN_DBCS.map(db => ({
        name: db.name,
        content: db.content,
        type: db.category === 'generic' ? 'generic' as const : 'device' as const,
        enabled: false
      }));

      // Retain custom DBCs
      const customDbcs = state.dbcRegistry.filter(entry => entry.type === 'custom');
      const nextRegistry = [...baseRegistry, ...customDbcs];

      // Re-enable J1939 or CANopen defaults if they were removed
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        const defaultDbc = state.protocol === 'j1939' ? 'Default J1939 Database' : 'Default CANopen Database';
        if (!activeProj.enabledDbcNames.includes(defaultDbc)) {
          activeProj.enabledDbcNames.push(defaultDbc);
        }
      }

      const nextState = {
        ...state,
        dbcRegistry: nextRegistry
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    saveSmartCanFile: () => {
      const state = get();
      const customDbcs = state.dbcRegistry
        .filter(entry => entry.type === 'custom')
        .map(entry => ({ name: entry.name, content: entry.content }));

      const payload = {
        version: 1,
        activeProjectId: state.activeProjectId,
        projects: state.projects.map(proj => {
          if (proj.id === state.activeProjectId) {
            return {
              ...proj,
              protocol: state.protocol,
              baudRate: state.baudRate,
              devices: state.devices,
              disabledMessageIds: state.projectSettings.disabledMessageIds,
              messageNameOverrides: state.projectSettings.messageNameOverrides
            };
          }
          return proj;
        }),
        customDbcs,
        dbcRegistry: state.dbcRegistry.map(entry => ({
          name: entry.name,
          content: entry.content,
          type: entry.type,
          enabled: entry.enabled
        }))
      };

      const json = JSON.stringify(payload, null, 2);
      const filename = `${state.projectSettings.name.replace(/\s+/g, '_')}.smartcan`;
      saveTextFile(filename, json, [{ name: 'SmartCAN Project', extensions: ['smartcan'] }]).then(success => {
        if (success) {
          state.showToast(`Successfully saved project: ${filename}`, 'success');
        }
      });
    },

    loadSmartCanFile: (jsonContent) => {
      try {
        const parsed = JSON.parse(jsonContent);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format');
        }
        if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) {
          throw new Error('No projects found in file');
        }

        let restoredRegistry: DbcRegistryEntry[] = [];
        if (Array.isArray(parsed.dbcRegistry)) {
          restoredRegistry = parsed.dbcRegistry.map((db: any) => ({
            name: db.name || '',
            content: db.content || '',
            type: db.type || 'custom',
            enabled: db.enabled === true
          }));
        } else {
          // Fallback for older projects
          const baseRegistry = BUILT_IN_DBCS.map(db => ({
            name: db.name,
            content: db.content,
            type: db.category === 'generic' ? 'generic' as const : 'device' as const,
            enabled: false
          }));

          const fileCustomDbcs = Array.isArray(parsed.customDbcs) ? parsed.customDbcs : [];
          restoredRegistry = [
            ...baseRegistry,
            ...fileCustomDbcs.map((db: any) => ({
              name: db.name,
              content: db.content,
              type: 'custom' as const,
              enabled: false
            }))
          ];
        }

        const restoredProjects: SmartCanProject[] = parsed.projects.map((proj: any) => ({
          id: proj.id || 'proj-' + Math.random().toString(36).substr(2, 9),
          name: proj.name || 'Unnamed Project',
          protocol: proj.protocol === 'canopen' ? 'canopen' : 'j1939',
          baudRate: Number(proj.baudRate) || 250000,
          enabled: proj.enabled !== false,
          enabledDbcNames: Array.isArray(proj.enabledDbcNames) ? proj.enabledDbcNames : [],
          devices: reconstructDevices(proj.devices),
          disabledMessageIds: proj.disabledMessageIds || {},
          messageNameOverrides: proj.messageNameOverrides || {}
        }));

        const nextActiveId = parsed.activeProjectId && restoredProjects.some(p => p.id === parsed.activeProjectId)
          ? parsed.activeProjectId
          : restoredProjects[0].id;

        const activeProj = restoredProjects.find(p => p.id === nextActiveId)!;
        const state = get();
        if (state.isSimulating) {
          state.stopSimulation();
        }

        const nextState = {
          ...state,
          projects: restoredProjects,
          activeProjectId: nextActiveId,
          dbcRegistry: restoredRegistry,
          protocol: activeProj.protocol,
          baudRate: activeProj.baudRate,
          devices: activeProj.devices,
          projectSettings: {
            name: activeProj.name,
            disabledMessageIds: activeProj.disabledMessageIds,
            messageNameOverrides: activeProj.messageNameOverrides
          },
          logs: [],
          fixedLogs: {},
          plotPoints: [],
          plotSignals: []
        };

        set({
          ...nextState,
          ...syncStoreState(nextState)
        });
      } catch (err) {
        console.error('Failed to load .smartcan file:', err);
        alert(`Failed to load .smartcan file: ${(err as Error).message}`);
      }
    },

    // Devices Actions
    addDevice: (device) => set(state => {
      const nextDevices = [...state.devices, { ...device, customMessages: [] }];
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.devices = nextDevices;
      }

      const nextCanopenNodes = { ...state.canopenNodes };
      if (state.protocol === 'canopen' && !nextCanopenNodes[device.nodeId]) {
        nextCanopenNodes[device.nodeId] = createCanopenNode(device.nodeId);
      }

      const nextState = {
        ...state,
        devices: nextDevices,
        projects: [...state.projects],
        canopenNodes: nextCanopenNodes
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    updateDevice: (deviceId, updates) => set(state => {
      const oldDevice = state.devices.find(d => d.id === deviceId);
      const nextDevices = state.devices.map(d => d.id === deviceId ? { ...d, ...updates } : d);
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.devices = nextDevices;
      }

      const nextCanopenNodes = { ...state.canopenNodes };
      if (state.protocol === 'canopen' && oldDevice) {
        const newId = updates.nodeId !== undefined ? updates.nodeId : oldDevice.nodeId;
        if (newId !== oldDevice.nodeId) {
          delete nextCanopenNodes[oldDevice.nodeId];
          nextCanopenNodes[newId] = createCanopenNode(newId);
        }
      }

      const nextState = {
        ...state,
        devices: nextDevices,
        projects: [...state.projects],
        canopenNodes: nextCanopenNodes
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    removeDevice: (deviceId) => set(state => {
      const oldDevice = state.devices.find(d => d.id === deviceId);
      const nextDevices = state.devices.filter(d => d.id !== deviceId);
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.devices = nextDevices;
      }

      const nextCanopenNodes = { ...state.canopenNodes };
      if (state.protocol === 'canopen' && oldDevice) {
        delete nextCanopenNodes[oldDevice.nodeId];
      }

      const nextState = {
        ...state,
        devices: nextDevices,
        projects: [...state.projects],
        canopenNodes: nextCanopenNodes
      };

      return {
        ...nextState,
        ...syncStoreState(nextState)
      };
    }),

    addCustomMessage: (deviceId, message) => set(state => {
      const nextDevices = state.devices.map(d => d.id === deviceId 
        ? { ...d, customMessages: [...d.customMessages, message] } 
        : d);
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.devices = nextDevices;
      }
      return { devices: nextDevices, projects: [...state.projects] };
    }),

    updateCustomMessage: (deviceId, messageId, updates) => set(state => {
      const nextDevices = state.devices.map(d => d.id === deviceId 
        ? { 
            ...d, 
            customMessages: d.customMessages.map(m => m.id === messageId ? { ...m, ...updates } : m) 
          } 
        : d);
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.devices = nextDevices;
      }
      return { devices: nextDevices, projects: [...state.projects] };
    }),

    removeCustomMessage: (deviceId, messageId) => set(state => {
      const nextDevices = state.devices.map(d => d.id === deviceId 
        ? { ...d, customMessages: d.customMessages.filter(m => m.id !== messageId) } 
        : d);
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.devices = nextDevices;
      }
      return { devices: nextDevices, projects: [...state.projects] };
    }),

    // Project Settings
    toggleMessageDisabledInProject: (id) => set(state => {
      const disabled = { ...state.projectSettings.disabledMessageIds };
      disabled[id] = !disabled[id];
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.disabledMessageIds = disabled;
      }
      return {
        projectSettings: {
          ...state.projectSettings,
          disabledMessageIds: disabled
        },
        projects: [...state.projects]
      };
    }),

    setMessageNameOverride: (id, name) => set(state => {
      const overrides = { ...state.projectSettings.messageNameOverrides };
      overrides[id] = name;
      const activeProj = state.projects.find(p => p.id === state.activeProjectId);
      if (activeProj) {
        activeProj.messageNameOverrides = overrides;
      }
      return {
        projectSettings: {
          ...state.projectSettings,
          messageNameOverrides: overrides
        },
        projects: [...state.projects]
      };
    }),

    // Live Logs
    addLog: (frame) => {
      const state = get();
      
      // If the log is paused, layout is editing, or message is disabled globally, do not register
      if (state.pausedLogs || state.isEditingLayout || state.projectSettings.disabledMessageIds[frame.id]) {
        return;
      }

      // Apply Kvaser physical timestamp offset correction
      let timestamp = frame.timestamp;
      if (state.kvaserStatus === 'physical' && frame.direction === 'RX') {
        let offset = state.timestampOffset;
        if (offset === null) {
          offset = state.simTime - frame.timestamp;
          set({ timestampOffset: offset });
        }
        timestamp = frame.timestamp + offset;
        set({ lastPhysicalTimestamp: frame.timestamp });
      }

      // Delta timing computation
      const lastT = lastTimestampsById[frame.id] ?? timestamp;
      const delta = timestamp - lastT;
      lastTimestampsById[frame.id] = timestamp;

      // Extract message name and decode signals using DBC if available
      let decodedSignals: Record<string, number> | null = null;
      let msgName = state.projectSettings.messageNameOverrides[frame.id] || '';

      // Try decoding across ALL enabled DBCs
      for (const [dbcName, parsedDbc] of Object.entries(state.dbcs)) {
        if (state.protocol === 'j1939') {
          const frameDetails = parseJ1939Id(frame.id);
          
          // Only want DBC's to apply after node at that SA is defined and enabled in logical devices.
          const matchingDev = state.devices.find(dev => dev.nodeId === frameDetails.sa && dev.enabled);
          if (!matchingDev) {
            continue;
          }

          // Check if this DBC is allowed:
          // 1. Is it the device's associated DBC?
          // 2. Is it a generic DBC?
          const registryEntry = state.dbcRegistry.find(r => r.name === dbcName);
          const isGeneric = registryEntry?.type === 'generic';
          const isAssociated = matchingDev.associatedDbcName === dbcName;

          if (!isGeneric && !isAssociated) {
            continue;
          }

          // Find matching BO_ message by matching PGN
          const matchedMessage = Object.values(parsedDbc.messages).find(msg => {
            const dbMsgDetails = parseJ1939Id(msg.id);
            return dbMsgDetails.pgn === frameDetails.pgn;
          });
          
          if (matchedMessage) {
            if (!msgName) {
              msgName = matchedMessage.name;
            }
            const signals = decodeFrame(matchedMessage.id, frame.data, parsedDbc);
            if (signals) {
              decodedSignals = { ...(decodedSignals || {}), ...signals };
            }
          }
        } else {
          // CANopen ID direct matching
          const frameNodeId = frame.id & 0x7F;
          
          // Only want DBC's to apply after node at that NodeID is defined and enabled in logical devices.
          const matchingDev = state.devices.find(dev => dev.nodeId === frameNodeId && dev.enabled);
          if (!matchingDev) {
            continue;
          }

          // Check if this DBC is allowed:
          const registryEntry = state.dbcRegistry.find(r => r.name === dbcName);
          const isGeneric = registryEntry?.type === 'generic';
          const isAssociated = matchingDev.associatedDbcName === dbcName;

          if (!isGeneric && !isAssociated) {
            continue;
          }

          const matchedMessage = parsedDbc.messages[frame.id];
          if (matchedMessage) {
            if (!msgName) {
              msgName = matchedMessage.name;
            }
            const signals = decodeFrame(frame.id, frame.data, parsedDbc);
            if (signals) {
              decodedSignals = { ...(decodedSignals || {}), ...signals };
            }
          }
        }
      }

      // Fallback naming if no DBC matched
      if (!msgName) {
        if (state.protocol === 'j1939') {
          const frameDetails = parseJ1939Id(frame.id);
          msgName = `PGN ${frameDetails.pgn.toString(16).toUpperCase()} (SA:${frameDetails.sa})`;
        } else {
          // Decode protocol names (e.g. heartbeat, sdo)
          const type = frame.id & 0x780;
          const nid = frame.id & 0x07F;
          if (type === 0x700) msgName = `Heartbeat Node ${nid}`;
          else if (type === 0x600) msgName = `SDO Rx Node ${nid}`;
          else if (type === 0x580) msgName = `SDO Tx Node ${nid}`;
          else if (frame.id === 0x000) msgName = 'NMT Master Command';
          else msgName = `COB-ID 0x${frame.id.toString(16).toUpperCase()}`;
        }
      }

      // Tracked bits decoding
      const matchingTracked = state.trackedBits.filter(tb => tb.msgId === frame.id);
      if (matchingTracked.length > 0) {
        if (!decodedSignals) decodedSignals = {};
        matchingTracked.forEach(tb => {
          const byteVal = frame.data[tb.byteIdx] ?? 0;
          const bitVal = (byteVal >> tb.bitIdx) & 1;
          const name = `0x${frame.id.toString(16).toUpperCase()}_B${tb.byteIdx}_b${tb.bitIdx}`;
          decodedSignals![name] = bitVal;
        });
      }

      // Handle transport protocol reassembly in reassembler (J1939 only)
      if (state.protocol === 'j1939') {
        const assembled = state.tpReassembler.processFrame(frame.id, frame.data, timestamp);
        if (assembled) {
          const longId = buildJ1939Id(7, assembled.pgn, assembled.sa, 255);
          
          setTimeout(() => {
            state.addLog({
              timestamp: timestamp,
              direction: 'RX',
              id: longId,
              dlc: assembled.payload.length,
              data: assembled.payload
            });
          }, 0);
        }
      }

      // Apply project name overrides as top priority
      if (state.projectSettings.messageNameOverrides[frame.id]) {
        msgName = state.projectSettings.messageNameOverrides[frame.id];
      }

      // Add to Plot History if signals match
      if (decodedSignals) {
        const plotValues: Record<string, number> = {};
        let addedAny = false;
        
        state.plotSignals.forEach(sigName => {
          if (decodedSignals && decodedSignals[sigName] !== undefined) {
            plotValues[sigName] = decodedSignals[sigName];
            addedAny = true;
          }
        });

        if (addedAny) {
          set(state => {
            const nextPlot = [...state.plotPoints, { timestamp, values: plotValues }];
            // Limit plotter history to 1000 entries for safety/performance
            if (nextPlot.length > 1000) nextPlot.shift();
            return { plotPoints: nextPlot };
          });
        }
      }

      // Calculate byte-level changes and tracking (for heatmap/decoding)
      const prevLog = state.fixedLogs[frame.id];
      const len = Math.max(8, frame.data.length);
      
      const byteChanges = prevLog?.byteChanges 
        ? [...prevLog.byteChanges] 
        : Array(len).fill(0);
      const lastChangedTimes = prevLog?.lastChangedTimes 
        ? [...prevLog.lastChangedTimes] 
        : Array(len).fill(0);
      const minValues = prevLog?.minValues 
        ? [...prevLog.minValues] 
        : Array(len).fill(255);
      const maxValues = prevLog?.maxValues 
        ? [...prevLog.maxValues] 
        : Array(len).fill(0);

      // Ensure arrays are long enough if current frame data is larger
      while (byteChanges.length < len) byteChanges.push(0);
      while (lastChangedTimes.length < len) lastChangedTimes.push(0);
      while (minValues.length < len) minValues.push(255);
      while (maxValues.length < len) maxValues.push(0);

      const now = Date.now();
      for (let i = 0; i < len; i++) {
        const val = i < frame.data.length ? frame.data[i] : 0;
        if (!prevLog) {
          minValues[i] = val;
          maxValues[i] = val;
          lastChangedTimes[i] = now;
        } else {
          const prevVal = i < prevLog.data.length ? prevLog.data[i] : 0;
          if (val !== prevVal) {
            byteChanges[i] = (byteChanges[i] || 0) + 1;
            lastChangedTimes[i] = now;
          }
          if (val < minValues[i]) minValues[i] = val;
          if (val > maxValues[i]) maxValues[i] = val;
        }
      }

      // Append CAN log
      const newLog: CanLog = {
        ...frame,
        timestamp,
        name: msgName,
        delta,
        decodedSignals,
        byteChanges,
        lastChangedTimes,
        minValues,
        maxValues
      };

      set(state => {
        const nextLogs = [...state.logs, newLog];
        // Limit total log records to 1000 items
        if (nextLogs.length > 1000) nextLogs.shift();
        
        const nextFixedLogs = {
          ...state.fixedLogs,
          [newLog.id]: newLog
        };
        
        return { 
          logs: nextLogs, 
          fixedLogs: nextFixedLogs,
          totalFramesReceived: state.totalFramesReceived + 1
        };
      });
    },

    addLogsBatch: (frames) => {
      const state = get();
      if (state.pausedLogs || state.isEditingLayout) return;

      const activeFrames = frames.filter(f => !state.projectSettings.disabledMessageIds[f.id]);
      if (activeFrames.length === 0) return;

      const localLastTimestamps = { ...lastTimestampsById };
      const localFixedLogs = { ...state.fixedLogs };
      const newLogs: CanLog[] = [];

      activeFrames.forEach(frame => {
        let timestamp = frame.timestamp;
        if (state.kvaserStatus === 'physical' && frame.direction === 'RX') {
          let offset = state.timestampOffset;
          if (offset === null) {
            offset = state.simTime - frame.timestamp;
            set({ timestampOffset: offset });
          }
          timestamp = frame.timestamp + offset;
          set({ lastPhysicalTimestamp: frame.timestamp });
        }

        const lastT = localLastTimestamps[frame.id] ?? timestamp;
        const delta = timestamp - lastT;
        localLastTimestamps[frame.id] = timestamp;

        let decodedSignals: Record<string, number> | null = null;
        let msgName = state.projectSettings.messageNameOverrides[frame.id] || '';

        for (const [dbcName, parsedDbc] of Object.entries(state.dbcs)) {
          if (state.protocol === 'j1939') {
            const frameDetails = parseJ1939Id(frame.id);
            const matchingDev = state.devices.find(dev => dev.nodeId === frameDetails.sa && dev.enabled);
            if (!matchingDev) continue;

            const registryEntry = state.dbcRegistry.find(r => r.name === dbcName);
            const isGeneric = registryEntry?.type === 'generic';
            const isAssociated = matchingDev.associatedDbcName === dbcName;
            if (!isGeneric && !isAssociated) continue;

            const matchedMessage = Object.values(parsedDbc.messages).find(msg => {
              const dbMsgDetails = parseJ1939Id(msg.id);
              return dbMsgDetails.pgn === frameDetails.pgn;
            });
            if (matchedMessage) {
              if (!msgName) msgName = matchedMessage.name;
              const signals = decodeFrame(matchedMessage.id, frame.data, parsedDbc);
              if (signals) decodedSignals = { ...(decodedSignals || {}), ...signals };
            }
          } else {
            const frameNodeId = frame.id & 0x7F;
            const matchingDev = state.devices.find(dev => dev.nodeId === frameNodeId && dev.enabled);
            if (!matchingDev) continue;

            const registryEntry = state.dbcRegistry.find(r => r.name === dbcName);
            const isGeneric = registryEntry?.type === 'generic';
            const isAssociated = matchingDev.associatedDbcName === dbcName;
            if (!isGeneric && !isAssociated) continue;

            const matchedMessage = parsedDbc.messages[frame.id];
            if (matchedMessage) {
              if (!msgName) msgName = matchedMessage.name;
              const signals = decodeFrame(frame.id, frame.data, parsedDbc);
              if (signals) decodedSignals = { ...(decodedSignals || {}), ...signals };
            }
          }
        }

        if (!msgName) {
          if (state.protocol === 'j1939') {
            const frameDetails = parseJ1939Id(frame.id);
            msgName = `PGN ${frameDetails.pgn.toString(16).toUpperCase()} (SA:${frameDetails.sa})`;
          } else {
            const type = frame.id & 0x780;
            const nid = frame.id & 0x07F;
            if (type === 0x700) msgName = `Heartbeat Node ${nid}`;
            else if (type === 0x600) msgName = `SDO Rx Node ${nid}`;
            else if (type === 0x580) msgName = `SDO Tx Node ${nid}`;
            else if (frame.id === 0x000) msgName = 'NMT Master Command';
            else msgName = `COB-ID 0x${frame.id.toString(16).toUpperCase()}`;
          }
        }

        const matchingTracked = state.trackedBits.filter(tb => tb.msgId === frame.id);
        if (matchingTracked.length > 0) {
          if (!decodedSignals) decodedSignals = {};
          matchingTracked.forEach(tb => {
            const byteVal = frame.data[tb.byteIdx] ?? 0;
            const bitVal = (byteVal >> tb.bitIdx) & 1;
            const name = `0x${frame.id.toString(16).toUpperCase()}_B${tb.byteIdx}_b${tb.bitIdx}`;
            decodedSignals![name] = bitVal;
          });
        }

        if (state.protocol === 'j1939') {
          const assembled = state.tpReassembler.processFrame(frame.id, frame.data, timestamp);
          if (assembled) {
            const longId = buildJ1939Id(7, assembled.pgn, assembled.sa, 255);
            setTimeout(() => {
              state.addLog({
                timestamp,
                direction: 'RX',
                id: longId,
                dlc: assembled.payload.length,
                data: assembled.payload
              });
            }, 0);
          }
        }

        if (state.projectSettings.messageNameOverrides[frame.id]) {
          msgName = state.projectSettings.messageNameOverrides[frame.id];
        }

        const prevLog = localFixedLogs[frame.id];
        const len = Math.max(8, frame.data.length);
        const byteChanges = prevLog?.byteChanges ? [...prevLog.byteChanges] : Array(len).fill(0);
        const lastChangedTimes = prevLog?.lastChangedTimes ? [...prevLog.lastChangedTimes] : Array(len).fill(0);
        const minValues = prevLog?.minValues ? [...prevLog.minValues] : Array(len).fill(255);
        const maxValues = prevLog?.maxValues ? [...prevLog.maxValues] : Array(len).fill(0);

        while (byteChanges.length < len) byteChanges.push(0);
        while (lastChangedTimes.length < len) lastChangedTimes.push(0);
        while (minValues.length < len) minValues.push(255);
        while (maxValues.length < len) maxValues.push(0);

        const now = Date.now();
        for (let i = 0; i < len; i++) {
          const val = i < frame.data.length ? frame.data[i] : 0;
          if (!prevLog) {
            minValues[i] = val;
            maxValues[i] = val;
            lastChangedTimes[i] = now;
          } else {
            const prevVal = i < prevLog.data.length ? prevLog.data[i] : 0;
            if (val !== prevVal) {
              byteChanges[i] = (byteChanges[i] || 0) + 1;
              lastChangedTimes[i] = now;
            }
            if (val < minValues[i]) minValues[i] = val;
            if (val > maxValues[i]) maxValues[i] = val;
          }
        }

        const newLog: CanLog = {
          ...frame,
          timestamp,
          name: msgName,
          delta,
          decodedSignals,
          byteChanges,
          lastChangedTimes,
          minValues,
          maxValues
        };

        newLogs.push(newLog);
        localFixedLogs[frame.id] = newLog;
      });

      set(state => {
        const nextLogs = [...state.logs, ...newLogs];
        const slicedLogs = nextLogs.slice(-1000);
        
        Object.assign(lastTimestampsById, localLastTimestamps);

        let nextPlotPoints = [...state.plotPoints];
        if (state.plotSignals.length > 0) {
          const rebuiltPoints: PlotPoint[] = [];
          slicedLogs.forEach(log => {
            if (log.decodedSignals) {
              const plotValues: Record<string, number> = {};
              let hasAny = false;
              state.plotSignals.forEach(sName => {
                if (log.decodedSignals && log.decodedSignals[sName] !== undefined) {
                  plotValues[sName] = log.decodedSignals[sName];
                  hasAny = true;
                }
              });
              if (hasAny) {
                rebuiltPoints.push({
                  timestamp: log.timestamp,
                  values: plotValues
                });
              }
            }
          });
          nextPlotPoints = rebuiltPoints.slice(-1000);
        }

        return {
          logs: slicedLogs,
          fixedLogs: localFixedLogs,
          totalFramesReceived: state.totalFramesReceived + activeFrames.length,
          plotPoints: nextPlotPoints
        };
      });
    },

    clearLogs: () => {
      Object.keys(lastTimestampsById).forEach(key => delete lastTimestampsById[Number(key)]);
      set({
        logs: [],
        fixedLogs: {},
        plotPoints: [],
        totalFramesReceived: 0,
        simTime: 0,
        timestampOffset: null,
        lastPhysicalTimestamp: null
      });
    },
    
    setPausedLogs: (pausedLogs) => set({ pausedLogs }),

    importLogsCsv: (csvContent) => {
      const state = get();
      state.clearLogs();
      
      const lines = csvContent.split(/\r?\n/);
      if (lines.length < 2) return;

      let delimiter = ',';
      if (lines[0].includes(';')) delimiter = ';';
      else if (lines[0].includes('\t')) delimiter = '\t';
      else if (lines[0].includes('|')) delimiter = '|';
      
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

      const timeIdx = headers.findIndex(h => h.includes('time'));
      const dirIdx = headers.findIndex(h => h.includes('dir') || h.includes('flag') || h.includes('flags'));
      const idIdx = headers.findIndex(h => h.includes('id') || h.includes('ident'));
      const dlcIdx = headers.findIndex(h => h.includes('dlc'));

      const data0Idx = headers.findIndex(h => 
        h.startsWith('data(0)') || 
        h === 'data(0)' || 
        h === 'data0' || 
        h.startsWith('data0') || 
        h.startsWith('data 0') || 
        h === 'data 0'
      );
      const dataHexIdx = headers.findIndex(h => h.includes('data(hex)') || h === 'data');

      const actualTimeIdx = timeIdx !== -1 ? timeIdx : 0;
      const actualDirIdx = dirIdx !== -1 ? dirIdx : 3;
      const actualIdIdx = idIdx !== -1 ? idIdx : 2;
      const actualDlcIdx = dlcIdx !== -1 ? dlcIdx : 4;
      
      let dataStartIdx = data0Idx;
      if (dataStartIdx === -1) {
        if (dataHexIdx !== -1) {
          // Will use dataHexIdx
        } else {
          dataStartIdx = 5;
        }
      }

      let isSeconds = false;
      const timeHeader = timeIdx !== -1 ? headers[timeIdx] : '';
      if (timeHeader === 'time' || timeHeader.includes('(s)') || timeHeader.includes('sec')) {
        isSeconds = true;
      }

      const tempFrames: Array<Omit<CanLog, 'delta' | 'decodedSignals' | 'name'>> = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(delimiter);
        if (cols.length <= Math.max(actualTimeIdx, actualIdIdx)) continue;

        let timestamp = 0;
        const timeStr = cols[actualTimeIdx];
        if (timeStr) {
          const clean = timeStr.trim();
          if (clean.includes(':')) {
            const parts = clean.split(':');
            let hrs = 0;
            let mins = 0;
            let secs = 0;
            if (parts.length === 3) {
              hrs = parseFloat(parts[0]) || 0;
              mins = parseFloat(parts[1]) || 0;
              secs = parseFloat(parts[2]) || 0;
            } else if (parts.length === 2) {
              mins = parseFloat(parts[0]) || 0;
              secs = parseFloat(parts[1]) || 0;
            }
            timestamp = Math.round((hrs * 3600 + mins * 60 + secs) * 1000);
          } else {
            const parsedFloat = parseFloat(clean) || 0;
            timestamp = isSeconds ? Math.round(parsedFloat * 1000) : parsedFloat;
          }
        }

        let direction: 'RX' | 'TX' = 'RX';
        if (cols[actualDirIdx]) {
          const rawDir = cols[actualDirIdx].trim().toUpperCase();
          if (rawDir.includes('TX') || rawDir.startsWith('T') || rawDir === '1' || rawDir === '0X01') {
            direction = 'TX';
          }
        }

        const rawId = cols[actualIdIdx] ? cols[actualIdIdx].trim() : '';
        const id = rawId.toLowerCase().startsWith('0x')
          ? (parseInt(rawId.slice(2), 16) || 0)
          : (headers[actualIdIdx] && (headers[actualIdIdx].includes('ident') || headers[actualIdIdx] === 'id(hex)'))
          ? (parseInt(rawId, 16) || 0)
          : (/[a-fA-F]/.test(rawId))
          ? (parseInt(rawId, 16) || 0)
          : (parseInt(rawId, 10) || parseInt(rawId, 16) || 0);

        const dlc = cols[actualDlcIdx] ? (parseInt(cols[actualDlcIdx].trim(), 10) || 0) : 0;

        const bytes: number[] = [];
        if (dataStartIdx !== -1 && dataHexIdx === -1) {
          for (let j = 0; j < 8; j++) {
            const colVal = cols[dataStartIdx + j];
            if (colVal !== undefined && colVal.trim() !== '') {
              const trimmed = colVal.trim().replace(/^0x/i, '');
              const val = parseInt(trimmed, 16);
              bytes.push(isNaN(val) ? 0 : val);
            }
          }
        } else if (dataHexIdx !== -1 && cols[dataHexIdx]) {
          const dataHex = cols[dataHexIdx].trim().replace(/\s+/g, '');
          const matchHex = dataHex.match(/.{1,2}/g);
          if (matchHex) {
            matchHex.forEach(byte => bytes.push(parseInt(byte, 16)));
          }
        } else {
          for (let j = actualDlcIdx + 1; j < cols.length; j++) {
            const colVal = cols[j];
            if (colVal !== undefined && colVal.trim() !== '') {
              const trimmed = colVal.trim().replace(/^0x/i, '');
              const val = parseInt(trimmed, 16);
              bytes.push(isNaN(val) ? 0 : val);
            }
          }
        }
        
        const dataBytes = new Uint8Array(bytes);
        const actualDlc = Math.max(dlc, dataBytes.length);

        tempFrames.push({
          timestamp,
          direction,
          id,
          dlc: actualDlc,
          data: dataBytes
        });
      }

      state.addLogsBatch(tempFrames);
    },

    saveMessageToActiveDbc: (id, name, dlc, sender) => {
      const state = get();
      const activeDbc = state.dbcs[state.activeDbcName];
      if (!activeDbc) return;

      const updatedMessages = {
        ...activeDbc.messages,
        [id]: {
          id,
          name,
          dlc,
          sender,
          signals: []
        }
      };

      set({
        dbcs: {
          ...state.dbcs,
          [state.activeDbcName]: {
            ...activeDbc,
            messages: updatedMessages
          }
        }
      });
    },

    togglePlotSignal: (sigName) => set(state => {
      const isAdding = !state.plotSignals.includes(sigName);
      const nextSignals = isAdding
        ? [...state.plotSignals, sigName]
        : state.plotSignals.filter(s => s !== sigName);

      // Rebuild plotPoints from the current logs history
      const rebuiltPoints: Array<{ timestamp: number; values: Record<string, number> }> = [];
      state.logs.forEach(log => {
        if (log.decodedSignals) {
          const plotValues: Record<string, number> = {};
          let hasAny = false;
          nextSignals.forEach(sName => {
            if (log.decodedSignals && log.decodedSignals[sName] !== undefined) {
              plotValues[sName] = log.decodedSignals[sName];
              hasAny = true;
            }
          });
          if (hasAny) {
            rebuiltPoints.push({
              timestamp: log.timestamp,
              values: plotValues
            });
          }
        }
      });

      // Limit rebuilt points to 1000 items
      const finalPlotPoints = rebuiltPoints.slice(-1000);

      return {
        plotSignals: nextSignals,
        plotPoints: finalPlotPoints,
        visiblePanels: {
          ...state.visiblePanels,
          livePlotter: isAdding ? true : state.visiblePanels.livePlotter
        }
      };
    }),

    clearPlotHistory: () => set({ plotPoints: [] }),
    setPlotXWindow: (plotXWindow) => set({ plotXWindow }),
    setPlotYMode: (plotYMode) => set({ plotYMode }),
    setPlotManualMinY: (plotManualMinY) => set({ plotManualMinY }),
    setPlotManualMaxY: (plotManualMaxY) => set({ plotManualMaxY }),

    // Transmit Frame Action
    transmitFrame: (id, data) => {
      const state = get();
      
      let txTimestamp = state.simTime;
      if (state.kvaserStatus === 'physical') {
        if (state.lastPhysicalTimestamp !== null && state.timestampOffset !== null) {
          txTimestamp = state.lastPhysicalTimestamp + state.timestampOffset;
        } else {
          txTimestamp = Date.now();
        }
      }

      // Write to Kvaser native bus if in Tauri
      if (isTauriEnv()) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('send_kvaser', { id, data: Array.from(data) }).catch(err => {
            console.error('Failed to send Kvaser frame:', err);
          });
        });
      }

      // Broadcast the TX frame so all windows (including this one) log it
      if (isTauriEnv()) {
        import('@tauri-apps/api/event').then(({ emit }) => {
          emit('simulated-frame', {
            timestamp: txTimestamp,
            direction: 'TX',
            id,
            dlc: data.length,
            data: Array.from(data)
          });
        });
      } else {
        // Direct state feed for browser fallback
        state.addLog({
          timestamp: txTimestamp,
          direction: 'TX',
          id,
          dlc: data.length,
          data
        });
      }

      // Node simulation side-effect responders (falls back in browser)
      if (!isTauriEnv() && state.protocol === 'canopen') {
        const type = id & 0x780;
        const targetNodeId = id & 0x07F;

        // 1. SDO request to simulated node
        if (type === 0x600) {
          const node = state.canopenNodes[targetNodeId];
          if (node && node.nmtState !== 'STOPPED') {
            const { response, updatedNode } = handleSdoRequest(node, data);
            
            // Send response back from server
            const txCobId = 0x580 + targetNodeId;
            setTimeout(() => {
              state.addLog({
                timestamp: state.simTime + 2, // simulated delay
                direction: 'RX',
                id: txCobId,
                dlc: response.length,
                data: response
              });
              
              set(state => ({
                canopenNodes: {
                  ...state.canopenNodes,
                  [targetNodeId]: updatedNode
                }
              }));
            }, 5);
          }
        }

        // 2. Master NMT Command
        if (id === 0x000 && data.length >= 2) {
          const cs = data[0];
          const nodeTarget = data[1];

          set(state => {
            const nextNodes = { ...state.canopenNodes };
            Object.keys(nextNodes).forEach(key => {
              const nid = Number(key);
              nextNodes[nid] = handleNmtCommand(nextNodes[nid], cs, nodeTarget);
            });
            return { canopenNodes: nextNodes };
          });
        }
      }
    },

    // Diagnostics / Master Console actions
    sendNmtCommand: (cs, targetNodeId) => {
      const state = get();
      const nmtData = new Uint8Array([cs, targetNodeId]);
      state.transmitFrame(0x000, nmtData);
    },

    sendSdoRequest: (targetNodeId, index, subIndex, data, cs) => {
      const state = get();
      const sdoPayload = new Uint8Array(8);
      sdoPayload[0] = cs; // SDO command (e.g. 0x40 read, 0x23/0x2b/0x2f write)
      sdoPayload[1] = index & 0xFF;
      sdoPayload[2] = (index >> 8) & 0xFF;
      sdoPayload[3] = subIndex;
      sdoPayload.set(data, 4);

      const rxCobId = 0x600 + targetNodeId;
      state.transmitFrame(rxCobId, sdoPayload);
    },

    sendJ1939AddressClaim: (nodeAddress, name) => {
      const state = get();
      const claimId = buildJ1939Id(6, 60928, nodeAddress, 255);
      const claimData = new Uint8Array(8);
      for (let i = 0; i < 8; i++) {
        claimData[i] = Number((name >> BigInt(i * 8)) & 0xFFn);
      }
      state.transmitFrame(claimId, claimData);
    },

    sendJ1939Request: (requestedPgn, destination) => {
      const state = get();
      const reqId = buildJ1939Id(6, 0xEA00, 254, destination);
      const reqData = new Uint8Array(3);
      reqData[0] = requestedPgn & 0xFF;
      reqData[1] = (requestedPgn >> 8) & 0xFF;
      reqData[2] = (requestedPgn >> 16) & 0xFF;

      state.transmitFrame(reqId, reqData);
    },

    // Simulation Timer
    startSimulation: () => {
      const state = get();
      if (state.isSimulating) return;

      let t = 0;

      const intervalId = setInterval(() => {
        const currentState = useStore.getState();
        const nextTime = currentState.simTime + 50; // increment 50ms
        t += 0.05;

        const encodeFromActiveDbcs = (msgId: number, signals: Record<string, number>) => {
          for (const db of Object.values(currentState.dbcs)) {
            if (db.messages[msgId]) {
              const encoded = encodeFrame(msgId, signals, db);
              if (encoded) return encoded;
            }
          }
          return null;
        };

        // 1. Generate Simulated Traffic for enabled simulated devices
        currentState.devices.forEach(device => {
          if (!device.enabled || !device.isSimulated) return;

          if (device.mimicDbcNode) {
            // Mimic DBC Node Mode
            // Find all messages sent by this node in any active DBC
            Object.values(currentState.dbcs).forEach(db => {
              Object.values(db.messages).forEach(msg => {
                if (msg.sender === device.mimicDbcNode) {
                  // Determine transmission interval
                  let interval: number;
                  const lowerName = msg.name.toLowerCase();
                  if (lowerName.includes('eec1') || lowerName.includes('speed') || lowerName.includes('rapid')) {
                    interval = 100;
                  } else if (lowerName.includes('temp') || lowerName.includes('slow') || lowerName.includes('oil')) {
                    interval = 500;
                  } else if (lowerName.includes('tc1') || lowerName.includes('gear')) {
                    interval = 200;
                  } else {
                    interval = ((msg.id % 5) + 1) * 100; // 100ms - 500ms
                  }

                  const ticks = Math.floor(nextTime / 50);
                  const msgTicks = Math.floor(interval / 50);
                  if (msgTicks > 0 && ticks % msgTicks === 0) {
                    // Generate dynamic values for signals
                    const signalValues: Record<string, number> = {};
                    msg.signals.forEach(sig => {
                      const min = sig.min !== undefined ? sig.min : 0;
                      const max = sig.max !== undefined && sig.max > min ? sig.max : 255;
                      const amplitude = (max - min) / 2;
                      const mid = min + amplitude;
                      const freqSeed = sig.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                      const speed = 0.1 + (freqSeed % 5) * 0.05;
                      let val = mid + amplitude * Math.sin(t * speed);
                      if (val < min) val = min;
                      if (val > max) val = max;
                      signalValues[sig.name] = val;
                    });

                    const encoded = encodeFrame(msg.id, signalValues, db);
                    if (encoded) {
                      let txId = msg.id;
                      if (currentState.protocol === 'j1939') {
                        const parsedId = parseJ1939Id(msg.id);
                        txId = buildJ1939Id(parsedId.priority, parsedId.pgn, device.nodeId, 255);
                      } else if (currentState.protocol === 'canopen') {
                        const base = msg.id & 0x780;
                        if (base === 0x180 || base === 0x280 || base === 0x380 || base === 0x480) {
                          txId = base + device.nodeId;
                        }
                      }

                      // Broadcast
                      if (isTauriEnv()) {
                        import('@tauri-apps/api/event').then(({ emit }) => {
                          emit('simulated-frame', {
                            timestamp: nextTime,
                            direction: 'RX',
                            id: txId,
                            dlc: encoded.length,
                            data: Array.from(encoded)
                          });
                        });
                      } else {
                        currentState.addLog({
                          timestamp: nextTime,
                          direction: 'RX',
                          id: txId,
                          dlc: encoded.length,
                          data: encoded
                        });
                      }
                    }
                  }
                }
              });
            });
          } else {
            // Fallback to existing hardcoded simulation logic
            if (currentState.protocol === 'j1939') {
              if (device.name.includes('Engine') && Math.floor(nextTime / 50) % 2 === 0) {
                const rpm = 2000 + 800 * Math.sin(t * 0.5) + Math.random() * 50;
                const torque = 45 + 10 * Math.cos(t * 0.7);
                const accel = 60 + 5 * Math.sin(t * 0.2);
                const signals = { EngineSpeed: rpm, EngineTorque: torque, AcceleratorPosition: accel };
                const encoded = encodeFromActiveDbcs(2364539904, signals);
                if (encoded) {
                  const txId = buildJ1939Id(3, 0xF004, device.nodeId, 255);
                  if (isTauriEnv()) {
                    import('@tauri-apps/api/event').then(({ emit }) => {
                      emit('simulated-frame', { timestamp: nextTime, direction: 'RX', id: txId, dlc: encoded.length, data: Array.from(encoded) });
                    });
                  } else {
                    currentState.addLog({ timestamp: nextTime, direction: 'RX', id: txId, dlc: encoded.length, data: encoded });
                  }
                }
              }
              if (device.name.includes('Engine') && Math.floor(nextTime / 50) % 10 === 0) {
                const coolantTemp = 82 + 2 * Math.sin(t * 0.05);
                const oilTemp = 95 + 4 * Math.sin(t * 0.06);
                const signals = { EngineCoolantTemp: coolantTemp, EngineOilTemp: oilTemp };
                const encoded = encodeFromActiveDbcs(2364543488, signals);
                if (encoded) {
                  const txId = buildJ1939Id(6, 0xFEEE, device.nodeId, 255);
                  if (isTauriEnv()) {
                    import('@tauri-apps/api/event').then(({ emit }) => {
                      emit('simulated-frame', { timestamp: nextTime, direction: 'RX', id: txId, dlc: encoded.length, data: Array.from(encoded) });
                    });
                  } else {
                    currentState.addLog({ timestamp: nextTime, direction: 'RX', id: txId, dlc: encoded.length, data: encoded });
                  }
                }
              }
              if (device.name.includes('Transmission') && Math.floor(nextTime / 50) % 4 === 0) {
                const gear = Math.floor(3 + Math.sin(t * 0.1) * 2);
                const signals = { TransmissionSelectedGear: gear, TransmissionActualGear: gear };
                const encoded = encodeFromActiveDbcs(2364539905, signals);
                if (encoded) {
                  const txId = buildJ1939Id(3, 0xF005, device.nodeId, 255);
                  if (isTauriEnv()) {
                    import('@tauri-apps/api/event').then(({ emit }) => {
                      emit('simulated-frame', { timestamp: nextTime, direction: 'RX', id: txId, dlc: encoded.length, data: Array.from(encoded) });
                    });
                  } else {
                    currentState.addLog({ timestamp: nextTime, direction: 'RX', id: txId, dlc: encoded.length, data: encoded });
                  }
                }
              }
            } else {
              // CANopen Simulated Node Traffic
              const openNode = currentState.canopenNodes[device.nodeId];
              if (openNode && device.enabled && openNode.nmtState !== 'STOPPED') {
                const ticks = Math.floor(nextTime / 50);
                const hbTicks = Math.floor(openNode.heartbeatInterval / 50);
                
                if (hbTicks > 0 && ticks % hbTicks === 0) {
                  const frame = generateHeartbeatFrame(openNode);
                  if (isTauriEnv()) {
                    import('@tauri-apps/api/event').then(({ emit }) => {
                      emit('simulated-frame', { timestamp: nextTime, direction: 'RX', id: frame.id, dlc: frame.data.length, data: Array.from(frame.data) });
                    });
                  } else {
                    currentState.addLog({ timestamp: nextTime, direction: 'RX', id: frame.id, dlc: frame.data.length, data: frame.data });
                  }
                }

                if (openNode.nmtState === 'OPERATIONAL' && device.nodeId === 1 && ticks % 4 === 0) {
                  const digital = Math.random() > 0.95 ? 1 : 0;
                  const analog1 = 2.4 + 1.2 * Math.sin(t * 2);
                  const analog2 = 5.0 + 0.5 * Math.cos(t);
                  const encoded = encodeFromActiveDbcs(385, { DigitalInputs: digital, AnalogInput1: analog1, AnalogInput2: analog2 });
                  if (encoded) {
                    if (isTauriEnv()) {
                      import('@tauri-apps/api/event').then(({ emit }) => {
                        emit('simulated-frame', { timestamp: nextTime, direction: 'RX', id: 0x180 + device.nodeId, dlc: encoded.length, data: Array.from(encoded) });
                      });
                    } else {
                      currentState.addLog({ timestamp: nextTime, direction: 'RX', id: 0x180 + device.nodeId, dlc: encoded.length, data: encoded });
                    }
                  }
                }
              }
            }
          }
        });

        // 2. Generate Custom periodic messages configured on devices
        currentState.devices.forEach(device => {
          if (!device.enabled) return;
          device.customMessages.forEach(msg => {
            if (!msg.enabled || msg.interval === 0) return;
            const ticks = Math.floor(nextTime / 50);
            const msgTicks = Math.floor(msg.interval / 50);
            if (msgTicks > 0 && ticks % msgTicks === 0) {
              if (isTauriEnv()) {
                import('@tauri-apps/api/event').then(({ emit }) => {
                  emit('simulated-frame', {
                    timestamp: nextTime,
                    direction: 'RX',
                    id: msg.id,
                    dlc: msg.dlc,
                    data: Array.from(msg.data)
                  });
                });
              } else {
                currentState.addLog({
                  timestamp: nextTime,
                  direction: 'RX',
                  id: msg.id,
                  dlc: msg.dlc,
                  data: msg.data
                });
              }
            }
          });
        });

        set({ simTime: nextTime });
      }, 50);

      set({ isSimulating: true, simulationTimer: intervalId });
    },

    stopSimulation: () => {
      const state = get();
      if (state.simulationTimer) {
        clearInterval(state.simulationTimer);
      }
      set({ isSimulating: false, simulationTimer: null });
    },

    setActiveDbcName: (name) => set({ activeDbcName: name }),

    setPanelVisibility: (panelName, visible) => set(state => ({
      visiblePanels: {
        ...state.visiblePanels,
        [panelName]: visible
      }
    })),

    toggleTrackBit: (msgId, byteIdx, bitIdx) => {
      set(state => {
        const exists = state.trackedBits.some(
          tb => tb.msgId === msgId && tb.byteIdx === byteIdx && tb.bitIdx === bitIdx
        );
        const name = `0x${msgId.toString(16).toUpperCase()}_B${byteIdx}_b${bitIdx}`;
        
        let nextTracked;
        if (exists) {
          nextTracked = state.trackedBits.filter(
            tb => !(tb.msgId === msgId && tb.byteIdx === byteIdx && tb.bitIdx === bitIdx)
          );
        } else {
          nextTracked = [...state.trackedBits, { msgId, byteIdx, bitIdx }];
        }

        let nextPlotSignals = [...state.plotSignals];
        if (exists) {
          nextPlotSignals = nextPlotSignals.filter(s => s !== name);
        } else {
          if (!nextPlotSignals.includes(name)) {
            nextPlotSignals.push(name);
          }
        }

        const nextState = {
          ...state,
          trackedBits: nextTracked,
          plotSignals: nextPlotSignals,
          visiblePanels: {
            ...state.visiblePanels,
            livePlotter: true
          }
        };

        return {
          ...nextState,
          ...syncStoreState(nextState)
        };
      });
    },

    syncFromStorage: (parsed) => set(state => {
      const activeProjId = parsed.activeProjectId || state.activeProjectId;
      const restoredProjects = Array.isArray(parsed.projects)
        ? parsed.projects.map((proj: any) => ({
            ...proj,
            devices: reconstructDevices(proj.devices)
          }))
        : state.projects;
      const activeProj = restoredProjects.find((p: any) => p.id === activeProjId) || state.projects.find((p: any) => p.id === state.activeProjectId);

      const parsedDbcs: Record<string, DbcDatabase> = {};
      if (parsed.dbcRegistry) {
        parsed.dbcRegistry.forEach((entry: any) => {
          if (entry.enabled) {
            try {
              parsedDbcs[entry.name] = parseDbc(entry.content);
            } catch (e) {
              console.error('Failed to parse DBC in storage sync:', entry.name, e);
            }
          }
        });
      }

      return {
        ...state,
        ...parsed,
        projects: restoredProjects,
        activeProjectId: activeProjId,
        dbcs: parsedDbcs,
        devices: activeProj ? activeProj.devices : state.devices,
        projectSettings: activeProj ? {
          name: activeProj.name || 'Default Project',
          disabledMessageIds: activeProj.disabledMessageIds || {},
          messageNameOverrides: activeProj.messageNameOverrides || {}
        } : state.projectSettings,
        plotXWindow: parsed.plotXWindow !== undefined ? parsed.plotXWindow : state.plotXWindow,
        plotYMode: parsed.plotYMode !== undefined ? parsed.plotYMode : state.plotYMode,
        plotManualMinY: parsed.plotManualMinY !== undefined ? parsed.plotManualMinY : state.plotManualMinY,
        plotManualMaxY: parsed.plotManualMaxY !== undefined ? parsed.plotManualMaxY : state.plotManualMaxY
      };
    }),

    showToast: (message, type = 'success', duration = 3000) => {
      if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
      }
      set({ toast: { message, type } });
      toastTimeoutId = setTimeout(() => {
        set({ toast: null });
        toastTimeoutId = null;
      }, duration);
    },

    clearToast: () => {
      if (toastTimeoutId) {
        clearTimeout(toastTimeoutId);
        toastTimeoutId = null;
      }
      set({ toast: null });
    }
  };
});

// Register global listeners for Tauri events & storage events
if (typeof window !== 'undefined') {
  if (isTauriEnv()) {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('simulated-frame', (event: { payload: any }) => {
        const frame = event.payload as { timestamp: number; direction: 'RX' | 'TX'; id: number; dlc: number; data: number[] };
        useStore.getState().addLog({
          timestamp: frame.timestamp,
          direction: frame.direction,
          id: frame.id,
          dlc: frame.dlc,
          data: new Uint8Array(frame.data)
        });
      }).catch(err => {
        console.error('Failed to subscribe to simulated-frame:', err);
      });
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === 'smartcan_state_v1' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        useStore.getState().syncFromStorage(parsed);
      } catch (e) {
        console.error('Failed to parse storage event value:', e);
      }
    }
  });
}

declare global {
  interface Window {
    __store?: typeof useStore;
  }
}

if (typeof window !== 'undefined') {
  window.__store = useStore;
}

let lastSavedJson = '';
// Subscribe to store changes to persist to localStorage
useStore.subscribe((state) => {
  if (typeof window !== 'undefined' && window.location.search.includes('window=simulator')) {
    return;
  }
  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
    try {
      const persistedState = {
        activeProjectId: state.activeProjectId,
        projects: state.projects.map(proj => {
          if (proj.id === state.activeProjectId) {
            return {
              ...proj,
              protocol: state.protocol,
              baudRate: state.baudRate,
              devices: state.devices,
              disabledMessageIds: state.projectSettings.disabledMessageIds,
              messageNameOverrides: state.projectSettings.messageNameOverrides
            };
          }
          return proj;
        }),
        dbcRegistry: state.dbcRegistry.map(entry => ({
          name: entry.name,
          content: entry.content,
          type: entry.type,
          enabled: entry.enabled
        })),
        protocol: state.protocol,
        baudRate: state.baudRate,
        theme: state.theme,
        visiblePanels: state.visiblePanels,
        panelPositions: state.panelPositions,
        panelWidths: state.panelWidths,
        panelHeights: state.panelHeights,
        panelOrder: state.panelOrder,
        liveViewerMode: state.liveViewerMode,
        trackedBits: state.trackedBits,
        plotXWindow: state.plotXWindow,
        plotYMode: state.plotYMode,
        plotManualMinY: state.plotManualMinY,
        plotManualMaxY: state.plotManualMaxY
      };
      const json = JSON.stringify(persistedState);
      if (json === lastSavedJson) return;
      lastSavedJson = json;
      localStorage.setItem('smartcan_state_v1', json);
    } catch (e) {
      console.error('Failed to save state to localStorage:', e);
    }
  }
});
