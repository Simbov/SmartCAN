import { create } from 'zustand';
import { parseDbc, decodeFrame, encodeFrame } from '../lib/dbcParser';
import type { DbcDatabase } from '../lib/dbcParser';
import { createCanopenNode, handleNmtCommand, handleSdoRequest, generateHeartbeatFrame } from '../lib/canopen';
import type { CanopenNode } from '../lib/canopen';
import { parseJ1939Id, buildJ1939Id, J1939TpReassembler } from '../lib/j1939';
import { isTauriEnv } from '../lib/tauriAdapter';

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

// Default Mock DBC for CANopen
const DEFAULT_CANOPEN_DBC = `
BU_: Master Node1 Node2
BO_ 385 TxPDO1_Node1: 8 Node1
 SG_ DigitalInputs : 0|8@1+ (1,0) [0|255] "" Master
 SG_ AnalogInput1 : 8|16@1+ (0.001,0) [0|10] "V" Master
 SG_ AnalogInput2 : 24|16@1+ (0.001,0) [0|10] "V" Master

BO_ 513 RxPDO1_Node1: 8 Master
 SG_ DigitalOutputs : 0|8@1+ (1,0) [0|255] "" Node1
 SG_ AnalogOutput1 : 8|16@1+ (0.001,0) [0|10] "V" Node1
`;

export interface CanDevice {
  id: string;
  name: string;
  nodeId: number;
  enabled: boolean;
  isSimulated: boolean;
  customMessages: Array<{
    id: number;
    name: string;
    dlc: number;
    data: Uint8Array;
    interval: number; // ms, 0 = single shot
    enabled: boolean;
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
  
  // DBC Databases
  dbcs: Record<string, DbcDatabase>;
  activeDbcName: string;
  
  // Network Topologies & Project Configuration
  devices: CanDevice[];
  projectSettings: ProjectSettings;
  
  // Traffic Log
  logs: CanLog[];
  pausedLogs: boolean;
  
  // Realtime Plotting
  plotSignals: string[];
  plotPoints: PlotPoint[];
  
  // Simulator internals
  isSimulating: boolean;
  simTime: number; // in ms
  simulationTimer: ReturnType<typeof setInterval> | null;
  canopenNodes: Record<number, CanopenNode>;
  tpReassembler: J1939TpReassembler;

  // Actions
  setProtocol: (proto: 'canopen' | 'j1939') => void;
  setBaudRate: (baud: number) => void;
  setConnected: (connected: boolean) => Promise<void>;
  startSimulationMode: () => void;
  dismissConnectionError: () => void;
  toggleTheme: () => void;
  togglePanelVisibility: (panelName: string) => void;
  setPanelPosition: (panelName: string, position: 'sidebar' | 'main-top' | 'main-bottom') => void;
  loadDbcFile: (name: string, content: string) => void;
  unloadDbc: () => void;
  
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
  clearLogs: () => void;
  setPausedLogs: (paused: boolean) => void;
  importLogsCsv: (csvContent: string) => void;
  saveMessageToActiveDbc: (id: number, name: string, dlc: number, sender: string) => void;
  
  // Plot actions
  togglePlotSignal: (sigName: string) => void;
  clearPlotHistory: () => void;

  // Simulation controls
  startSimulation: () => void;
  stopSimulation: () => void;
  transmitFrame: (id: number, data: Uint8Array) => void;

  // Diagnostics actions
  sendNmtCommand: (cs: number, targetNodeId: number) => void;
  sendSdoRequest: (targetNodeId: number, index: number, subIndex: number, data: Uint8Array, cs: number) => void;
  sendJ1939AddressClaim: (nodeAddress: number, name: bigint) => void;
  sendJ1939Request: (pgn: number, destination: number) => void;
}

const defaultDbcJ1939 = parseDbc(DEFAULT_J1939_DBC);
const defaultDbcCanopen = parseDbc(DEFAULT_CANOPEN_DBC);

// Keep a local reference for the tauri listener unlisten promise
let kvaserUnlisten: (() => void) | null = null;

export const useStore = create<CanStore>((set, get) => {
  // Keep track of last timestamps per ID for delta calculations
  const lastTimestampsById: Record<number, number> = {};

  return {
    // Initial State
    protocol: 'j1939',
    baudRate: 250000,
    isConnected: false,
    kvaserStatus: 'offline',
    kvaserDeviceName: null,
    connectionError: null,
    theme: 'dark',
    visiblePanels: {
      deviceManager: true,
      dbcManager: true,
      liveViewer: true,
      livePlotter: true,
      transmitter: true,
      diagnostics: true,
      falseSender: true
    },
    panelPositions: {
      deviceManager: 'sidebar',
      dbcManager: 'sidebar',
      liveViewer: 'main-top',
      livePlotter: 'main-top',
      transmitter: 'main-bottom',
      diagnostics: 'main-bottom',
      falseSender: 'main-bottom'
    },
    dbcs: {
      'Default J1939 Database': defaultDbcJ1939,
      'Default CANopen Database': defaultDbcCanopen
    },
    activeDbcName: 'Default J1939 Database',
    devices: [
      {
        id: 'dev-1',
        name: 'Engine Controller',
        nodeId: 0x01,
        enabled: true,
        isSimulated: true,
        customMessages: []
      },
      {
        id: 'dev-2',
        name: 'Transmission Controller',
        nodeId: 0x03,
        enabled: true,
        isSimulated: true,
        customMessages: []
      }
    ],
    projectSettings: {
      name: 'SmartCAN Project',
      disabledMessageIds: {},
      messageNameOverrides: {}
    },
    logs: [],
    pausedLogs: false,
    plotSignals: [],
    plotPoints: [],
    isSimulating: false,
    simTime: 0,
    simulationTimer: null,
    canopenNodes: {
      1: createCanopenNode(1),
      2: createCanopenNode(2)
    },
    tpReassembler: new J1939TpReassembler(),

    // Actions
    setProtocol: (proto) => {
      const activeDbc = proto === 'j1939' ? 'Default J1939 Database' : 'Default CANopen Database';
      
      // Default devices for the protocol
      const defaultDevices: CanDevice[] = proto === 'j1939' 
        ? [
            { id: 'dev-1', name: 'Engine ECU', nodeId: 1, enabled: true, isSimulated: true, customMessages: [] },
            { id: 'dev-2', name: 'Transmission ECU', nodeId: 3, enabled: true, isSimulated: true, customMessages: [] }
          ]
        : [
            { id: 'dev-1', name: 'PDO Node 1', nodeId: 1, enabled: true, isSimulated: true, customMessages: [] },
            { id: 'dev-2', name: 'PDO Node 2', nodeId: 2, enabled: true, isSimulated: true, customMessages: [] }
          ];

      // Reset logs and plotting history
      Object.keys(lastTimestampsById).forEach(key => delete lastTimestampsById[Number(key)]);

      // Stop simulator if running to reset states
      const state = get();
      if (state.isSimulating) {
        state.stopSimulation();
      }

      set({
        protocol: proto,
        activeDbcName: activeDbc,
        devices: defaultDevices,
        logs: [],
        plotPoints: [],
        plotSignals: [],
        simTime: 0,
        canopenNodes: proto === 'canopen' ? {
          1: createCanopenNode(1),
          2: createCanopenNode(2)
        } : {}
      });
    },

    setBaudRate: (baudRate) => set({ baudRate }),

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
      try {
        const parsed = parseDbc(content);
        set(state => ({
          dbcs: {
            ...state.dbcs,
            [name]: parsed
          },
          activeDbcName: name
        }));
      } catch (err) {
        console.error('Error loading DBC file:', err);
        alert('Could not parse DBC file. Please ensure it follows Vector DBC formats.');
      }
    },

    unloadDbc: () => {
      set(state => {
        const nextDbcs = { ...state.dbcs };
        delete nextDbcs[state.activeDbcName];
        return {
          dbcs: nextDbcs,
          activeDbcName: Object.keys(nextDbcs)[0] || ''
        };
      });
    },

    // Devices Actions
    addDevice: (device) => set(state => ({
      devices: [...state.devices, { ...device, customMessages: [] }]
    })),

    updateDevice: (deviceId, updates) => set(state => ({
      devices: state.devices.map(d => d.id === deviceId ? { ...d, ...updates } : d)
    })),

    removeDevice: (deviceId) => set(state => ({
      devices: state.devices.filter(d => d.id !== deviceId)
    })),

    addCustomMessage: (deviceId, message) => set(state => ({
      devices: state.devices.map(d => d.id === deviceId 
        ? { ...d, customMessages: [...d.customMessages, message] } 
        : d)
    })),

    updateCustomMessage: (deviceId, messageId, updates) => set(state => ({
      devices: state.devices.map(d => d.id === deviceId 
        ? { 
            ...d, 
            customMessages: d.customMessages.map(m => m.id === messageId ? { ...m, ...updates } : m) 
          } 
        : d)
    })),

    removeCustomMessage: (deviceId, messageId) => set(state => ({
      devices: state.devices.map(d => d.id === deviceId 
        ? { ...d, customMessages: d.customMessages.filter(m => m.id !== messageId) } 
        : d)
    })),

    // Project Settings
    toggleMessageDisabledInProject: (id) => set(state => {
      const disabled = { ...state.projectSettings.disabledMessageIds };
      disabled[id] = !disabled[id];
      return {
        projectSettings: {
          ...state.projectSettings,
          disabledMessageIds: disabled
        }
      };
    }),

    setMessageNameOverride: (id, name) => set(state => {
      const overrides = { ...state.projectSettings.messageNameOverrides };
      overrides[id] = name;
      return {
        projectSettings: {
          ...state.projectSettings,
          messageNameOverrides: overrides
        }
      };
    }),

    // Live Logs
    addLog: (frame) => {
      const state = get();
      
      // If the log is paused or message is disabled globally, do not register
      if (state.pausedLogs || state.projectSettings.disabledMessageIds[frame.id]) {
        return;
      }

      // Delta timing computation
      const lastT = lastTimestampsById[frame.id] ?? frame.timestamp;
      const delta = frame.timestamp - lastT;
      lastTimestampsById[frame.id] = frame.timestamp;

      // Extract message name and decode signals using DBC if available
      let decodedSignals: Record<string, number> | null = null;
      let msgName = state.projectSettings.messageNameOverrides[frame.id] || '';

      const activeDbc = state.dbcs[state.activeDbcName];
      if (activeDbc) {
        // Try decoding
        // In J1939, DBC ID contains PGN details. Let's match J1939 messages.
        if (state.protocol === 'j1939') {
          const frameDetails = parseJ1939Id(frame.id);
          // Find matching BO_ message by matching PGN
          const matchedMessage = Object.values(activeDbc.messages).find(msg => {
            const dbMsgDetails = parseJ1939Id(msg.id);
            return dbMsgDetails.pgn === frameDetails.pgn;
          });
          
          if (matchedMessage) {
            msgName = matchedMessage.name;
            decodedSignals = decodeFrame(matchedMessage.id, frame.data, activeDbc);
          } else {
            // Default protocol identification
            msgName = `PGN ${frameDetails.pgn.toString(16).toUpperCase()} (SA:${frameDetails.sa})`;
          }

          // Handle transport protocol reassembly in reassembler
          const assembled = state.tpReassembler.processFrame(frame.id, frame.data, frame.timestamp);
          if (assembled) {
            const longId = buildJ1939Id(7, assembled.pgn, assembled.sa, 255);
            
            setTimeout(() => {
              state.addLog({
                timestamp: frame.timestamp,
                direction: 'RX',
                id: longId,
                dlc: assembled.payload.length,
                data: assembled.payload
              });
            }, 0);
          }

        } else {
          // CANopen ID direct matching
          const matchedMessage = activeDbc.messages[frame.id];
          if (matchedMessage) {
            msgName = matchedMessage.name;
            decodedSignals = decodeFrame(frame.id, frame.data, activeDbc);
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
            const nextPlot = [...state.plotPoints, { timestamp: frame.timestamp, values: plotValues }];
            // Limit plotter history to 100 entries for safety/performance
            if (nextPlot.length > 100) nextPlot.shift();
            return { plotPoints: nextPlot };
          });
        }
      }

      // Append CAN log
      const newLog: CanLog = {
        ...frame,
        name: msgName,
        delta,
        decodedSignals
      };

      set(state => {
        const nextLogs = [...state.logs, newLog];
        // Limit total log records to 1000 items
        if (nextLogs.length > 1000) nextLogs.shift();
        return { logs: nextLogs };
      });
    },

    clearLogs: () => {
      Object.keys(lastTimestampsById).forEach(key => delete lastTimestampsById[Number(key)]);
      set({ logs: [], plotPoints: [] });
    },
    
    setPausedLogs: (pausedLogs) => set({ pausedLogs }),

    importLogsCsv: (csvContent) => {
      const state = get();
      state.clearLogs();
      
      const lines = csvContent.split(/\r?\n/);
      if (lines.length < 2) return;

      // Detect delimiter based on the first line (header)
      const delimiter = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

      // Locate column indices dynamically
      const timeIdx = headers.findIndex(h => h.includes('time'));
      const dirIdx = headers.findIndex(h => h.includes('dir') || h.includes('flag'));
      const idIdx = headers.findIndex(h => h.includes('id') || h.includes('ident'));
      const dlcIdx = headers.findIndex(h => h.includes('dlc'));

      // Look for data columns: can be Data(0)... or a single Data column
      const data0Idx = headers.findIndex(h => h.startsWith('data(0)') || h === 'data(0)' || h === 'data0' || h.startsWith('data0'));
      const dataHexIdx = headers.findIndex(h => h.includes('data(hex)') || h === 'data');

      const actualTimeIdx = timeIdx !== -1 ? timeIdx : 0;
      const actualDirIdx = dirIdx !== -1 ? dirIdx : 1;
      const actualIdIdx = idIdx !== -1 ? idIdx : 2;
      const actualDlcIdx = dlcIdx !== -1 ? dlcIdx : 3;

      let isSeconds = false;
      const timeHeader = timeIdx !== -1 ? headers[timeIdx] : '';
      if (timeHeader === 'time' || timeHeader.includes('(s)') || timeHeader.includes('sec')) {
        isSeconds = true;
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(delimiter);
        if (cols.length <= Math.max(actualTimeIdx, actualDirIdx, actualIdIdx, actualDlcIdx)) continue;

        let timestamp = parseFloat(cols[actualTimeIdx]) || 0;
        if (isSeconds) {
          timestamp = Math.round(timestamp * 1000);
        }

        const rawDir = cols[actualDirIdx].trim().toUpperCase();
        let direction: 'RX' | 'TX' = 'RX';
        if (rawDir.includes('TX') || rawDir === 'T' || rawDir === '1' || rawDir === '0X01') {
          direction = 'TX';
        }

        const rawId = cols[actualIdIdx].trim();
        const id = rawId.toLowerCase().startsWith('0x')
          ? (parseInt(rawId.slice(2), 16) || 0)
          : (headers[actualIdIdx] && (headers[actualIdIdx].includes('ident') || headers[actualIdIdx] === 'id(hex)'))
          ? (parseInt(rawId, 16) || 0)
          : (/[a-fA-F]/.test(rawId))
          ? (parseInt(rawId, 16) || 0)
          : (parseInt(rawId, 10) || parseInt(rawId, 16) || 0);

        const dlc = parseInt(cols[actualDlcIdx].trim(), 10) || 0;

        let dataBytes: Uint8Array;
        if (data0Idx !== -1) {
          const bytes: number[] = [];
          for (let j = 0; j < dlc; j++) {
            const colVal = cols[data0Idx + j];
            if (colVal !== undefined && colVal.trim() !== '') {
              const trimmed = colVal.trim().replace(/^0x/i, '');
              const val = parseInt(trimmed, 16);
              bytes.push(isNaN(val) ? 0 : val);
            }
          }
          dataBytes = new Uint8Array(bytes);
        } else if (dataHexIdx !== -1) {
          const dataHex = cols[dataHexIdx].trim().replace(/\s+/g, '');
          dataBytes = new Uint8Array(
            dataHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
          );
        } else {
          // Fallback: collect all trailing columns after DLC
          const bytes: number[] = [];
          for (let j = actualDlcIdx + 1; j < cols.length; j++) {
            const colVal = cols[j];
            if (colVal !== undefined && colVal.trim() !== '') {
              const trimmed = colVal.trim().replace(/^0x/i, '');
              const val = parseInt(trimmed, 16);
              bytes.push(isNaN(val) ? 0 : val);
            }
          }
          dataBytes = new Uint8Array(bytes).slice(0, dlc);
        }

        state.addLog({
          timestamp,
          direction,
          id,
          dlc,
          data: dataBytes
        });
      }
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
      const nextSignals = state.plotSignals.includes(sigName)
        ? state.plotSignals.filter(s => s !== sigName)
        : [...state.plotSignals, sigName];
      return {
        plotSignals: nextSignals,
        plotPoints: [] // Reset plotter display to redraw correctly
      };
    }),

    clearPlotHistory: () => set({ plotPoints: [] }),

    // Transmit Frame Action
    transmitFrame: (id, data) => {
      const state = get();
      // Add log locally as a TX frame
      state.addLog({
        timestamp: state.simTime,
        direction: 'TX',
        id,
        dlc: data.length,
        data
      });

      // Write to Kvaser native bus if in Tauri
      if (isTauriEnv()) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('send_kvaser', { id, data: Array.from(data) }).catch(err => {
            console.error('Failed to send Kvaser frame:', err);
          });
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

      const activeDbc = state.dbcs[state.activeDbcName];
      let t = 0;

      const intervalId = setInterval(() => {
        const currentState = useStore.getState();
        const nextTime = currentState.simTime + 50; // increment 50ms
        t += 0.05;

        // 1. Generate Simulated Traffic for enabled simulated devices
        currentState.devices.forEach(device => {
          if (!device.enabled || !device.isSimulated) return;

          if (currentState.protocol === 'j1939') {
            // J1939 Simulated ECU Traffic
            if (device.name.includes('Engine') && Math.floor(nextTime / 50) % 2 === 0) {
              // Engine Speed (EEC1, PGN 61444): cycle every 100ms
              const rpm = 2000 + 800 * Math.sin(t * 0.5) + Math.random() * 50;
              const torque = 45 + 10 * Math.cos(t * 0.7);
              const accel = 60 + 5 * Math.sin(t * 0.2);

              const signals = {
                EngineSpeed: rpm,
                EngineTorque: torque,
                AcceleratorPosition: accel
              };

              // PGN 61444, BO_ ID is 2364539904 (EEC1)
              const eec1Msg = activeDbc.messages[2364539904];
              if (eec1Msg) {
                const encoded = encodeFrame(2364539904, signals, activeDbc);
                if (encoded) {
                  const txId = buildJ1939Id(3, 0xF004, device.nodeId, 255);
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

            if (device.name.includes('Engine') && Math.floor(nextTime / 50) % 10 === 0) {
              // Coolant Temperature (ET1, PGN 65262): cycle every 500ms
              const coolantTemp = 82 + 2 * Math.sin(t * 0.05);
              const oilTemp = 95 + 4 * Math.sin(t * 0.06);

              const signals = {
                EngineCoolantTemp: coolantTemp,
                EngineOilTemp: oilTemp
              };

              const et1Msg = activeDbc.messages[2364543488];
              if (et1Msg) {
                const encoded = encodeFrame(2364543488, signals, activeDbc);
                if (encoded) {
                  const txId = buildJ1939Id(6, 0xFEEE, device.nodeId, 255);
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

            if (device.name.includes('Transmission') && Math.floor(nextTime / 50) % 4 === 0) {
              // Transmission Control 1 (TC1): cycle every 200ms
              const gear = Math.floor(3 + Math.sin(t * 0.1) * 2);
              const signals = {
                TransmissionSelectedGear: gear,
                TransmissionActualGear: gear
              };

              const tc1Msg = activeDbc.messages[2364539905];
              if (tc1Msg) {
                const encoded = encodeFrame(2364539905, signals, activeDbc);
                if (encoded) {
                  const txId = buildJ1939Id(3, 0xF005, device.nodeId, 255);
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

          } else {
            // CANopen Simulated Node Traffic
            const openNode = currentState.canopenNodes[device.nodeId];
            if (openNode && openNode.nmtState !== 'STOPPED') {
              
              const ticks = Math.floor(nextTime / 50);
              const hbTicks = Math.floor(openNode.heartbeatInterval / 50);
              
              if (hbTicks > 0 && ticks % hbTicks === 0) {
                const frame = generateHeartbeatFrame(openNode);
                currentState.addLog({
                  timestamp: nextTime,
                  direction: 'RX',
                  id: frame.id,
                  dlc: frame.data.length,
                  data: frame.data
                });
              }

              // Cyclical PDOs: Transmit TxPDO1 from Node 1 if Operational
              if (openNode.nmtState === 'OPERATIONAL' && device.nodeId === 1 && ticks % 4 === 0) {
                const digital = Math.random() > 0.95 ? 1 : 0;
                const analog1 = 2.4 + 1.2 * Math.sin(t * 2);
                const analog2 = 5.0 + 0.5 * Math.cos(t);

                const pdoMsg = activeDbc.messages[385];
                if (pdoMsg) {
                  const encoded = encodeFrame(385, {
                    DigitalInputs: digital,
                    AnalogInput1: analog1,
                    AnalogInput2: analog2
                  }, activeDbc);

                  if (encoded) {
                    currentState.addLog({
                      timestamp: nextTime,
                      direction: 'RX',
                      id: 0x180 + device.nodeId,
                      dlc: encoded.length,
                      data: encoded
                    });
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
              currentState.addLog({
                timestamp: nextTime,
                direction: 'RX',
                id: msg.id,
                dlc: msg.dlc,
                data: msg.data
              });
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
    }
  };
});
