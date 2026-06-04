import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore';

describe('Zustand store (CanStore)', () => {
  beforeEach(() => {
    // Reset state before each test
    useStore.getState().setProtocol('j1939');
    useStore.getState().clearLogs();
    useStore.getState().setPausedLogs(false);
  });

  it('should initialize with default states', () => {
    const state = useStore.getState();
    expect(state.protocol).toBe('j1939');
    expect(state.baudRate).toBe(250000);
    expect(state.theme).toBe('dark');
    expect(state.isConnected).toBe(false);
    expect(state.kvaserStatus).toBe('offline');
    expect(state.logs.length).toBe(0);
    expect(state.devices.length).toBeGreaterThan(0);
  });

  it('should change protocol, loading correct defaults', () => {
    useStore.getState().setProtocol('canopen');
    
    let state = useStore.getState();
    expect(state.protocol).toBe('canopen');
    expect(state.activeDbcName).toBe('Default CANopen Database');
    expect(state.devices[0].name).toContain('PDO');

    useStore.getState().setProtocol('j1939');
    
    state = useStore.getState();
    expect(state.protocol).toBe('j1939');
    expect(state.activeDbcName).toBe('Default J1939 Database');
  });

  it('should toggle panel visibility', () => {
    const initVisibility = useStore.getState().visiblePanels.deviceManager;
    useStore.getState().togglePanelVisibility('deviceManager');
    
    const state = useStore.getState();
    expect(state.visiblePanels.deviceManager).toBe(!initVisibility);
  });

  it('should update panel positions', () => {
    useStore.getState().setPanelPosition('deviceManager', 'main-top');
    
    const state = useStore.getState();
    expect(state.panelPositions.deviceManager).toBe('main-top');
  });

  it('should add logs and calculate delta times', () => {
    // Send 1st message
    useStore.getState().addLog({
      timestamp: 100,
      direction: 'RX',
      id: 0x0CF00401,
      dlc: 8,
      data: new Uint8Array([0, 0, 0, 0x00, 0x32, 0, 0, 0]) // RPM raw 12800 -> 1600
    });

    let state = useStore.getState();
    expect(state.logs.length).toBe(1);
    expect(state.logs[0].delta).toBe(0); // first message delta is 0
    expect(state.logs[0].name).toContain('EEC1'); // J1939 EEC1 matching
    expect(state.logs[0].decodedSignals?.EngineSpeed).toBe(1600);

    // Send 2nd message (same ID) 50ms later
    useStore.getState().addLog({
      timestamp: 150,
      direction: 'RX',
      id: 0x0CF00401,
      dlc: 8,
      data: new Uint8Array([0, 0, 0, 0x00, 0x32, 0, 0, 0])
    });

    state = useStore.getState();
    expect(state.logs.length).toBe(2);
    expect(state.logs[1].delta).toBe(50); // delta is 50ms
  });

  it('should respect project settings overrides and disabled message IDs', () => {
    // Disable message 0x123
    useStore.getState().toggleMessageDisabledInProject(0x123);
    
    let state = useStore.getState();
    expect(state.projectSettings.disabledMessageIds[0x123]).toBe(true);

    // Try adding log for 0x123 -> should be ignored!
    useStore.getState().addLog({
      timestamp: 100,
      direction: 'RX',
      id: 0x123,
      dlc: 8,
      data: new Uint8Array(8)
    });
    
    state = useStore.getState();
    expect(state.logs.length).toBe(0);

    // Add log with override name
    useStore.getState().setMessageNameOverride(0x456, 'My Custom Engine Msg');
    useStore.getState().addLog({
      timestamp: 200,
      direction: 'RX',
      id: 0x456,
      dlc: 8,
      data: new Uint8Array(8)
    });
    
    state = useStore.getState();
    expect(state.logs.length).toBe(1);
    expect(state.logs[0].name).toBe('My Custom Engine Msg');
  });

  it('should import logs from CSV correctly', () => {
    const csv = `Time(ms),Dir,ID(Hex),DLC,Data(Hex)
10.5,RX,CF00401,8,0000000032000000
60.5,RX,CF00401,8,0000000032000000`;

    useStore.getState().importLogsCsv(csv);
    
    const state = useStore.getState();
    expect(state.logs.length).toBe(2);
    expect(state.logs[0].timestamp).toBe(10.5);
    expect(state.logs[0].id).toBe(0x0CF00401);
    expect(state.logs[1].delta).toBe(50);
  });

  it('should toggle connection status and set kvaserStatus', async () => {
    await useStore.getState().setConnected(true);
    let state = useStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.kvaserStatus).toBe('simulated'); // web fallback

    await useStore.getState().setConnected(false);
    state = useStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.kvaserStatus).toBe('offline');
  });

  it('should transition to simulated mode via startSimulationMode', () => {
    useStore.getState().startSimulationMode();
    const state = useStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.kvaserStatus).toBe('simulated');
    expect(state.kvaserDeviceName).toBe('Simulated CAN Bus');
    expect(state.connectionError).toBe(null);
  });

  it('should allow dismissing connection errors', () => {
    useStore.setState({ connectionError: 'Some DLL is missing error' });
    expect(useStore.getState().connectionError).toBe('Some DLL is missing error');
    
    useStore.getState().dismissConnectionError();
    expect(useStore.getState().connectionError).toBe(null);
  });
});
