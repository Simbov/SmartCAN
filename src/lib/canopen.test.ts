import { describe, it, expect } from 'vitest';
import { createCanopenNode, handleNmtCommand, generateHeartbeatFrame, handleSdoRequest } from './canopen';

describe('CANopen Protocol Engine', () => {
  it('should transition NMT state on master commands', () => {
    let node = createCanopenNode(2); // starts in PRE_OPERATIONAL
    expect(node.nmtState).toBe('PRE_OPERATIONAL');

    // CS 0x01 = Start Node
    node = handleNmtCommand(node, 0x01, 2);
    expect(node.nmtState).toBe('OPERATIONAL');

    // CS 0x02 = Stop Node
    node = handleNmtCommand(node, 0x02, 2);
    expect(node.nmtState).toBe('STOPPED');

    // CS 0x80 = Enter Pre-operational
    node = handleNmtCommand(node, 0x80, 2);
    expect(node.nmtState).toBe('PRE_OPERATIONAL');

    // Broadcast reset CS 0x81 (applied to target 0)
    node = handleNmtCommand(node, 0x81, 0);
    expect(node.nmtState).toBe('INITIALISING');
  });

  it('should ignore NMT commands for other node IDs', () => {
    let node = createCanopenNode(3);
    node = handleNmtCommand(node, 0x01, 4); // target is node 4
    expect(node.nmtState).toBe('PRE_OPERATIONAL'); // unchanged
  });

  it('should generate cyclical Heartbeat frames with correct COB-ID and NMT status', () => {
    const node = createCanopenNode(5); // PRE_OPERATIONAL (0x7F)
    const frame = generateHeartbeatFrame(node);
    
    expect(frame.id).toBe(0x705); // 0x700 + NodeID
    expect(frame.data.length).toBe(1);
    expect(frame.data[0]).toBe(0x7F);
  });

  it('should process SDO Upload (Read) requests successfully', () => {
    const node = createCanopenNode(1);
    
    // Read manufacturer device name (Index 0x1008, subindex 0x00)
    const req = new Uint8Array([
      0x40,       // CS SDO Upload Request
      0x08, 0x10, // Index 0x1008 (Little Endian)
      0x00,       // Subindex 0
      0, 0, 0, 0  // Unused
    ]);

    const { response } = handleSdoRequest(node, req);
    expect(response[0] & 0xEC).toBe(0x40); // SDO Upload response signature
    
    // The value at 1008-00 is "SmartCAN-Node". Truncated to 4 bytes: "Smar"
    const dataBytes = response.slice(4, 8);
    const text = new TextDecoder().decode(dataBytes);
    expect(text).toBe('Smar');
  });

  it('should process SDO Download (Write) requests and update Object Dictionary', () => {
    const node = createCanopenNode(1);
    
    // Write Heartbeat interval (Index 0x1017, sub 0) to 500 ms (0x01F4)
    const req = new Uint8Array([
      0x2B,       // CS expedited write 2 bytes
      0x17, 0x10, // Index 0x1017
      0x00,       // Subindex 0
      0xF4, 0x01, // 500 (Little Endian)
      0, 0
    ]);

    const { response, updatedNode } = handleSdoRequest(node, req);
    
    // Response should be write ack: CS 0x60
    expect(response[0]).toBe(0x60);
    expect(updatedNode.heartbeatInterval).toBe(500);
    
    // Dictionary entry should be updated
    const entry = updatedNode.objectDictionary['1017-00'];
    expect(entry).toBeDefined();
    expect(entry[0]).toBe(0xF4);
    expect(entry[1]).toBe(0x01);
  });
});
