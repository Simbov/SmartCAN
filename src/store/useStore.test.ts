import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    expect(state.theme).toBe('light');
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

  it('should update panel widths and heights within valid boundaries', () => {
    const store = useStore.getState();

    // Width should be clamped between 1 and 12
    store.setPanelWidth('liveViewer', 5);
    expect(useStore.getState().panelWidths.liveViewer).toBe(5);

    store.setPanelWidth('liveViewer', 15);
    expect(useStore.getState().panelWidths.liveViewer).toBe(12);

    store.setPanelWidth('liveViewer', 0);
    expect(useStore.getState().panelWidths.liveViewer).toBe(1);

    // Height should be clamped to a minimum of 120
    store.setPanelHeight('liveViewer', 200);
    expect(useStore.getState().panelHeights.liveViewer).toBe(200);

    store.setPanelHeight('liveViewer', 50);
    expect(useStore.getState().panelHeights.liveViewer).toBe(120);
  });

  it('should update dragOverZone and clear keys correctly', () => {
    const store = useStore.getState();

    expect(store.dragOverZone).toBeNull();

    store.setDragOverZone('main-top');
    expect(useStore.getState().dragOverZone).toBe('main-top');

    store.setActiveDragKey('liveViewer');
    store.setDragOverTargetKey('livePlotter');
    expect(useStore.getState().activeDragKey).toBe('liveViewer');
    expect(useStore.getState().dragOverTargetKey).toBe('livePlotter');

    store.setDragOverZone(null);
    store.setActiveDragKey(null);
    store.setDragOverTargetKey(null);
    expect(useStore.getState().dragOverZone).toBeNull();
    expect(useStore.getState().activeDragKey).toBeNull();
    expect(useStore.getState().dragOverTargetKey).toBeNull();
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

  it('should support adding, switching, and deleting projects', () => {
    const store = useStore.getState();
    const initialProjectCount = store.projects.length;

    // Add a new project
    store.addProject('Test New Project');
    let state = useStore.getState();
    expect(state.projects.length).toBe(initialProjectCount + 1);
    expect(state.projectSettings.name).toBe('Test New Project');
    const newProjectId = state.activeProjectId;
    expect(newProjectId).not.toBe('proj-default');

    // Switch back to default project
    store.setActiveProject('proj-default');
    state = useStore.getState();
    expect(state.activeProjectId).toBe('proj-default');
    expect(state.projectSettings.name).toBe('Default Project');

    // Delete the new project
    store.deleteProject(newProjectId);
    state = useStore.getState();
    expect(state.projects.length).toBe(initialProjectCount);
    expect(state.projects.some(p => p.id === newProjectId)).toBe(false);
  });

  it('should support enabling and disabling DBCs in the active project', () => {
    const store = useStore.getState();
    
    // Default J1939 should be enabled, Orion BMS should be disabled by default
    let state = useStore.getState();
    const orionEntry = state.dbcRegistry.find(entry => entry.name === 'Orion BMS Controller');
    expect(orionEntry).toBeDefined();
    expect(orionEntry?.enabled).toBe(false);
    expect(state.dbcs['Orion BMS Controller']).toBeUndefined();

    // Enable Orion BMS
    store.toggleDbcInProject('Orion BMS Controller');
    state = useStore.getState();
    const orionEntryUpdated = state.dbcRegistry.find(entry => entry.name === 'Orion BMS Controller');
    expect(orionEntryUpdated?.enabled).toBe(true);
    expect(state.dbcs['Orion BMS Controller']).toBeDefined();

    // Disable Default J1939 Database
    store.toggleDbcInProject('Default J1939 Database');
    state = useStore.getState();
    expect(state.dbcs['Default J1939 Database']).toBeUndefined();
  });

  it('should decode messages concurrently across multiple enabled DBCs', () => {
    const store = useStore.getState();
    
    // Enable Default J1939 (in case it was disabled) and Orion BMS
    if (!store.dbcRegistry.find(e => e.name === 'Default J1939 Database')?.enabled) {
      store.toggleDbcInProject('Default J1939 Database');
    }
    if (!store.dbcRegistry.find(e => e.name === 'Orion BMS Controller')?.enabled) {
      store.toggleDbcInProject('Orion BMS Controller');
    }

    // 1. Send J1939 Speed frame (PGN 61444 -> 0xCF00401)
    store.addLog({
      timestamp: 100,
      direction: 'RX',
      id: 0x0CF00401,
      dlc: 8,
      data: new Uint8Array([0, 0, 0, 0x00, 0x32, 0, 0, 0]) // Speed rpm 1600
    });

    // 2. Send Orion BMS status frame (BMS_Status ID: 2364543232 -> 0x8CF03100)
    store.addLog({
      timestamp: 150,
      direction: 'RX',
      id: 2364543232,
      dlc: 8,
      data: new Uint8Array([100, 0, 0, 0, 0, 0, 0, 0]) // SOC 100 -> 50%
    });

    const state = useStore.getState();
    expect(state.logs.length).toBe(2);
    // Verified decoded signals from standard J1939 database
    expect(state.logs[0].decodedSignals?.EngineSpeed).toBe(1600);
    // Verified decoded signals from Orion BMS database
    expect(state.logs[1].name).toBe('BMS_Status');
    expect(state.logs[1].decodedSignals?.PackSOC).toBe(50);
  });

  it('should save and load configurations via JSON', () => {
    const actions = useStore.getState();

    // Modify active project
    actions.addProject('Export Import Project');
    actions.toggleDbcInProject('Orion BMS Controller');

    // Add a custom message to dev-1
    actions.addCustomMessage('dev-1', {
      id: 0x555,
      name: 'Custom Test Msg',
      dlc: 8,
      data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      interval: 100,
      enabled: true
    });

    const activeProjId = useStore.getState().activeProjectId;
    const currentProjects = useStore.getState().projects;
    const currentRegistry = useStore.getState().dbcRegistry;

    // Mock saveSmartCanFile logic to extract JSON string
    const customDbcs = currentRegistry
      .filter(entry => entry.type === 'custom')
      .map(entry => ({ name: entry.name, content: entry.content }));

    const payload = {
      version: 1,
      activeProjectId: activeProjId,
      projects: currentProjects,
      customDbcs
    };
    const serialized = JSON.stringify(payload);

    // Reset store by switching and deleting
    actions.setActiveProject('proj-default');
    actions.deleteProject(activeProjId);

    // Now restore from the serialized string
    actions.loadSmartCanFile(serialized);

    const state = useStore.getState();
    expect(state.projects.length).toBe(2);
    expect(state.projectSettings.name).toBe('Export Import Project');
    
    // Orion BMS should be active in the loaded project
    expect(state.dbcs['Orion BMS Controller']).toBeDefined();

    // Verify custom message exists on dev-1
    const dev1 = state.devices.find(d => d.id === 'dev-1');
    expect(dev1?.customMessages.length).toBe(1);
    expect(dev1?.customMessages[0].id).toBe(0x555);
  });

  it('should support deleting built-in/custom DBC registry databases and restoring defaults', () => {
    const store = useStore.getState();
    
    // 1. Initial count of registry entries
    const initialCount = store.dbcRegistry.length;
    expect(initialCount).toBeGreaterThan(0);
    
    // 2. Remove a built-in DBC registry database (e.g. Orion BMS Controller)
    store.removeDbcFromProject('Orion BMS Controller');
    let state = useStore.getState();
    expect(state.dbcRegistry.length).toBe(initialCount - 1);
    expect(state.dbcRegistry.some(e => e.name === 'Orion BMS Controller')).toBe(false);

    // 3. Restore default DBCs
    store.restoreDefaultDbcs();
    state = useStore.getState();
    expect(state.dbcRegistry.length).toBe(initialCount);
    expect(state.dbcRegistry.some(e => e.name === 'Orion BMS Controller')).toBe(true);
  });

  it('should correctly group logs by unique CAN ID (Fixed ID Grid view logic)', () => {
    const store = useStore.getState();
    store.clearLogs();
    
    // Simulate receiving multiple frames with duplicate IDs (like the simulator does)
    store.addLog({ timestamp: 100, direction: 'RX', id: 0x100, dlc: 8, data: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]) });
    store.addLog({ timestamp: 150, direction: 'RX', id: 0x200, dlc: 8, data: new Uint8Array([2, 2, 2, 2, 2, 2, 2, 2]) });
    store.addLog({ timestamp: 200, direction: 'RX', id: 0x100, dlc: 8, data: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]) }); // Update to 0x100
    
    const state = useStore.getState();
    expect(state.logs.length).toBe(3);
    
    // Retrieve latest logs from the store's fixedLogs state
    const latestLogs = Object.values(state.fixedLogs);
    
    // Verify grouping:
    // - Should only have 2 unique IDs (0x100 and 0x200)
    // - 0x100 should have the latest timestamp (200) and the updated payload
    expect(latestLogs.length).toBe(2);
    
    const log100 = latestLogs.find(l => l.id === 0x100);
    expect(log100).toBeDefined();
    expect(log100?.timestamp).toBe(200);
    expect(log100?.data[0]).toBe(9);
    
    const log200 = latestLogs.find(l => l.id === 0x200);
    expect(log200).toBeDefined();
    expect(log200?.timestamp).toBe(150);
  });

  it('should preserve unique CAN IDs in fixedLogs even when the chronological logs limit (1000 items) is reached', () => {
    const store = useStore.getState();
    store.clearLogs();
    
    // Log a unique message that occurs early (e.g. 0x200)
    store.addLog({ timestamp: 10, direction: 'RX', id: 0x200, dlc: 8, data: new Uint8Array([2, 2, 2, 2, 2, 2, 2, 2]) });
    
    // Log 1005 messages of ID 0x100 (which will cause chronological logs cap to shift out 0x200)
    for (let i = 0; i < 1005; i++) {
      store.addLog({
        timestamp: 100 + i * 10,
        direction: 'RX',
        id: 0x100,
        dlc: 8,
        data: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1])
      });
    }
    
    const state = useStore.getState();
    
    // Chronological logs has shifted out the 0x200 log, so it's capped at 1000 items
    expect(state.logs.length).toBe(1000);
    expect(state.logs.find(l => l.id === 0x200)).toBeUndefined();
    
    // But fixedLogs MUST still contain both unique CAN IDs (0x100 and 0x200)
    const latestLogs = Object.values(state.fixedLogs);
    expect(latestLogs.length).toBe(2);
    
    const log200 = state.fixedLogs[0x200];
    expect(log200).toBeDefined();
    expect(log200.timestamp).toBe(10);
    
    const log100 = state.fixedLogs[0x100];
    expect(log100).toBeDefined();
    expect(log100.timestamp).toBe(100 + 1004 * 10);
  });

  it('should support updating and renaming a DBC database in the registry', () => {
    const store = useStore.getState();
    
    // Ensure Orion BMS is in registry and enabled
    const entry = store.dbcRegistry.find(e => e.name === 'Orion BMS Controller');
    expect(entry).toBeDefined();
    if (!entry?.enabled) {
      store.toggleDbcInProject('Orion BMS Controller');
    }
    
    // Define an updated DBC schema content
    const updatedContent = `
BO_ 2364543232 BMS_Status_Custom: 8 BMS
 SG_ CustomPackSOC : 0|8@1+ (0.5,0) [0|100] "%" InstrumentPanel
`;
    
    // Perform update and rename
    store.updateDbc('Orion BMS Controller', 'My Custom Orion BMS', updatedContent);
    
    const state = useStore.getState();
    
    // Registry should be updated with new name and new content
    const updatedEntry = state.dbcRegistry.find(e => e.name === 'My Custom Orion BMS');
    expect(updatedEntry).toBeDefined();
    expect(updatedEntry?.content).toBe(updatedContent);
    
    // Old registry name should be gone
    expect(state.dbcRegistry.some(e => e.name === 'Orion BMS Controller')).toBe(false);
    
    // Active project enabled DBCs should point to the new name
    const activeProj = state.projects.find(p => p.id === state.activeProjectId);
    expect(activeProj?.enabledDbcNames).toContain('My Custom Orion BMS');
    expect(activeProj?.enabledDbcNames).not.toContain('Orion BMS Controller');
    
    // Parsed dbcs in the store should have My Custom Orion BMS and it should contain the custom message
    expect(state.dbcs['My Custom Orion BMS']).toBeDefined();
    expect(state.dbcs['My Custom Orion BMS'].messages[2364543232].name).toBe('BMS_Status_Custom');
    expect(state.dbcs['Orion BMS Controller']).toBeUndefined();
  });

  it('should reject updating a DBC database if the raw schema content has invalid Vector DBC syntax', () => {
    const store = useStore.getState();
    const originalContent = store.dbcRegistry.find(e => e.name === 'Default J1939 Database')?.content;
    
    // Mock globalThis.alert
    const alertMock = vi.fn();
    const originalAlert = globalThis.alert;
    globalThis.alert = alertMock as unknown as typeof globalThis.alert;
    
    // Try to update with invalid content
    store.updateDbc('Default J1939 Database', 'Default J1939 Database', 'INVALID DBC SYNTAX CONTENT');
    
    const state = useStore.getState();
    const currentContent = state.dbcRegistry.find(e => e.name === 'Default J1939 Database')?.content;
    
    // Content should NOT have changed because validation failed
    expect(currentContent).toBe(originalContent);
    expect(alertMock).toHaveBeenCalled();
    
    // Restore alert
    globalThis.alert = originalAlert;
  });

  it('should support creating a new empty DBC database', () => {
    const store = useStore.getState();
    const initialCount = store.dbcRegistry.length;

    // Create a new empty DBC
    store.createEmptyDbc('My Graphical DBC');

    const state = useStore.getState();
    expect(state.dbcRegistry.length).toBe(initialCount + 1);
    const newEntry = state.dbcRegistry.find(e => e.name === 'My Graphical DBC');
    expect(newEntry).toBeDefined();
    expect(newEntry?.type).toBe('custom');
    expect(newEntry?.content).toContain('BU_: Master_Node');
    expect(state.activeDbcName).toBe('My Graphical DBC');
    expect(state.dbcs['My Graphical DBC']).toBeDefined();
  });

  it('should track byte changes, min/max values, and update timestamps in addLog', () => {
    const store = useStore.getState();
    store.clearLogs();

    // 1. First log frame for ID 0x150
    store.addLog({
      timestamp: 100,
      direction: 'RX',
      id: 0x150,
      dlc: 8,
      data: new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80])
    });

    let state = useStore.getState();
    let log = state.fixedLogs[0x150];
    expect(log).toBeDefined();
    expect(log.byteChanges).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(log.minValues).toEqual([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);
    expect(log.maxValues).toEqual([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);
    expect(log.lastChangedTimes?.length).toBe(8);

    const initialTimes = [...(log.lastChangedTimes || [])];

    // Transmit a second frame with changed byte 0 and byte 4
    store.addLog({
      timestamp: 200,
      direction: 'RX',
      id: 0x150,
      dlc: 8,
      data: new Uint8Array([0x15, 0x20, 0x30, 0x40, 0x45, 0x60, 0x70, 0x80])
    });

    state = useStore.getState();
    log = state.fixedLogs[0x150];
    expect(log.byteChanges).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    expect(log.minValues).toEqual([0x10, 0x20, 0x30, 0x40, 0x45, 0x60, 0x70, 0x80]);
    expect(log.maxValues).toEqual([0x15, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);
    
    expect(log.lastChangedTimes?.[0]).toBeGreaterThanOrEqual(initialTimes[0]);
    expect(log.lastChangedTimes?.[1]).toBe(initialTimes[1]);
    expect(log.lastChangedTimes?.[4]).toBeGreaterThanOrEqual(initialTimes[4]);
  });
});

