export type NmtState = 'INITIALISING' | 'PRE_OPERATIONAL' | 'OPERATIONAL' | 'STOPPED';

export interface CanopenNode {
  nodeId: number;
  nmtState: NmtState;
  heartbeatInterval: number; // in ms
  objectDictionary: Record<string, Uint8Array>; // key: "index-subindex" e.g. "1000-00"
}

// Map NMT States to protocol codes
export const NMT_STATE_CODES: Record<NmtState, number> = {
  INITIALISING: 0x00,
  STOPPED: 0x04,
  OPERATIONAL: 0x05,
  PRE_OPERATIONAL: 0x7F
};

// SDO abort codes
export const SDO_ABORT = {
  OBJECT_NOT_EXIST: 0x06020000,
  SUBINDEX_NOT_EXIST: 0x06090011,
  READ_ONLY: 0x06010002,
  WRITE_ONLY: 0x06010001,
  GENERAL_ERROR: 0x08000000
};

/**
 * Creates a default Object Dictionary for a simulated CANopen node.
 */
export function createDefaultObjectDictionary(): Record<string, Uint8Array> {
  const dict: Record<string, Uint8Array> = {};

  const setEntry = (index: number, sub: number, bytes: number[] | string) => {
    const key = `${index.toString(16).padStart(4, '0')}-${sub.toString(16).padStart(2, '0')}`;
    if (typeof bytes === 'string') {
      const encoder = new TextEncoder();
      dict[key] = encoder.encode(bytes);
    } else {
      dict[key] = new Uint8Array(bytes);
    }
  };

  // 0x1000: Device Type (32-bit: DS401 Generic I/O = 0x00020194)
  setEntry(0x1000, 0, [0x94, 0x01, 0x02, 0x00]);
  // 0x1008: Manufacturer Device Name
  setEntry(0x1008, 0, "SmartCAN-Node");
  // 0x1009: Manufacturer Hardware Version
  setEntry(0x1009, 0, "v1.0.0");
  // 0x100A: Manufacturer Software Version
  setEntry(0x100A, 0, "v2.5.1");
  // 0x1017: Producer Heartbeat Time (16-bit, e.g. 1000ms = 0x03E8)
  setEntry(0x1017, 0, [0xE8, 0x03]);
  
  // 0x1018: Identity Object
  setEntry(0x1018, 0, [0x04]); // Number of entries
  setEntry(0x1018, 1, [0x4D, 0x49, 0x4E, 0x44]); // Vendor ID "MIND"
  setEntry(0x1018, 2, [0x01, 0x02, 0x03, 0x04]); // Product Code
  setEntry(0x1018, 3, [0x01, 0x00, 0x00, 0x00]); // Revision Number
  setEntry(0x1018, 4, [0x99, 0x88, 0x77, 0x66]); // Serial Number

  // Manufacturer Specific / Application profile (0x2000 - 0x2100)
  setEntry(0x2000, 0, [0x02]); // 2 subindices
  setEntry(0x2000, 1, [0x00]); // Digital Inputs (8-bit)
  setEntry(0x2000, 2, [0x00, 0x00]); // Analog Inputs (16-bit)
  
  return dict;
}

/**
 * Initializes a CANopen node structure.
 */
export function createCanopenNode(nodeId: number, heartbeatInterval = 1000): CanopenNode {
  return {
    nodeId,
    nmtState: 'PRE_OPERATIONAL',
    heartbeatInterval,
    objectDictionary: createDefaultObjectDictionary()
  };
}

/**
 * Handles incoming NMT Command Specifiers from a master (COB-ID 0x000).
 */
export function handleNmtCommand(node: CanopenNode, cs: number, targetNodeId: number): CanopenNode {
  // If targetNodeId is 0, it applies to all nodes. Otherwise, must match nodeId
  if (targetNodeId !== 0 && targetNodeId !== node.nodeId) {
    return node;
  }

  let nextState: NmtState = node.nmtState;

  switch (cs) {
    case 0x01: // Start Remote Node
      nextState = 'OPERATIONAL';
      break;
    case 0x02: // Stop Remote Node
      nextState = 'STOPPED';
      break;
    case 0x80: // Enter Pre-Operational
      nextState = 'PRE_OPERATIONAL';
      break;
    case 0x81: // Reset Node
    case 0x82: // Reset Communication
      nextState = 'INITIALISING';
      break;
  }

  return {
    ...node,
    nmtState: nextState
  };
}

/**
 * Generates a cyclical Heartbeat message for the node.
 */
export function generateHeartbeatFrame(node: CanopenNode): { id: number; data: Uint8Array } {
  const cobId = 0x700 + node.nodeId;
  const stateCode = NMT_STATE_CODES[node.nmtState];
  return {
    id: cobId,
    data: new Uint8Array([stateCode])
  };
}

/**
 * Helper to write a 32-bit abort code into 4 SDO response bytes.
 */
function makeAbortPayload(index: number, subIndex: number, abortCode: number): Uint8Array {
  const payload = new Uint8Array(8);
  payload[0] = 0x80; // SDO Abort cs
  payload[1] = index & 0xFF;
  payload[2] = (index >> 8) & 0xFF;
  payload[3] = subIndex;
  
  payload[4] = abortCode & 0xFF;
  payload[5] = (abortCode >> 8) & 0xFF;
  payload[6] = (abortCode >> 16) & 0xFF;
  payload[7] = (abortCode >> 24) & 0xFF;

  return payload;
}

/**
 * Handles SDO expedited reads and writes from the master (SDO Client -> SDO Server: 0x600 + NodeID).
 * Returns the SDO response payload (SDO Server -> SDO Client: 0x580 + NodeID) and updated node.
 */
export function handleSdoRequest(
  node: CanopenNode,
  requestData: Uint8Array
): { response: Uint8Array; updatedNode: CanopenNode } {
  const responseData = new Uint8Array(8);
  let updatedNode = node;

  if (requestData.length < 4) {
    return {
      response: makeAbortPayload(0, 0, SDO_ABORT.GENERAL_ERROR),
      updatedNode
    };
  }

  const cs = requestData[0];
  const index = requestData[1] | (requestData[2] << 8);
  const subIndex = requestData[3];
  const dictKey = `${index.toString(16).padStart(4, '0')}-${subIndex.toString(16).padStart(2, '0')}`;

  // Populate basic echo fields in response
  responseData[1] = requestData[1];
  responseData[2] = requestData[2];
  responseData[3] = requestData[3];

  // 1. SDO UPLOAD (Read Request) - CS = 0x40
  if (cs === 0x40) {
    const value = node.objectDictionary[dictKey];
    if (!value) {
      // Check if base index exists (if subIndex > 0)
      const baseKey = `${index.toString(16).padStart(4, '0')}-00`;
      if (!node.objectDictionary[baseKey]) {
        return {
          response: makeAbortPayload(index, subIndex, SDO_ABORT.OBJECT_NOT_EXIST),
          updatedNode
        };
      }
      return {
        response: makeAbortPayload(index, subIndex, SDO_ABORT.SUBINDEX_NOT_EXIST),
        updatedNode
      };
    }

    const len = value.length;
    if (len > 4) {
      // Expedited transfer only supports up to 4 bytes. 
      // If data is longer (e.g. string), we truncate for mock purposes.
      responseData[0] = 0x41; // Upload response, size not indicated
      responseData.set(value.slice(0, 4), 4);
    } else {
      // CS for upload response: 
      // Bit 4-7 = 0100 (Upload Response)
      // Bit 2-3 = size code: 4 - len
      // Bit 1 = 1 (Expedited)
      // Bit 0 = 1 (Size indicated)
      const sizeBits = (4 - len) << 2;
      responseData[0] = 0x43 | sizeBits;
      responseData.set(value, 4);
    }

    return { response: responseData, updatedNode };
  }

  // 2. SDO DOWNLOAD (Write Request) - CS = 0x23, 0x2B, 0x2F, 0x21
  const isDownload = (cs & 0xE0) === 0x20;
  if (isDownload) {
    const isExpedited = (cs & 0x02) !== 0;
    const sizeIndicated = (cs & 0x01) !== 0;
    let dataLength = 4;
    
    if (isExpedited && sizeIndicated) {
      dataLength = 4 - ((cs >> 2) & 0x03);
    }

    const writeData = requestData.slice(4, 4 + dataLength);

    // Read only guard for product IDs (index 0x1000 - 0x101F usually read-only)
    if (index >= 0x1000 && index < 0x2000 && index !== 0x1017) {
      return {
        response: makeAbortPayload(index, subIndex, SDO_ABORT.READ_ONLY),
        updatedNode
      };
    }

    // Write to Object Dictionary
    const newDict = { ...node.objectDictionary };
    newDict[dictKey] = writeData;

    // Special side effects (e.g. heartbeat interval configuration)
    let newHeartbeat = node.heartbeatInterval;
    if (index === 0x1017 && subIndex === 0) {
      const ms = writeData[0] | (writeData[1] << 8);
      newHeartbeat = ms;
    }

    updatedNode = {
      ...node,
      heartbeatInterval: newHeartbeat,
      objectDictionary: newDict
    };

    // SDO Download success response cs: 0x60
    responseData[0] = 0x60;
    return { response: responseData, updatedNode };
  }

  // Unknown CS
  return {
    response: makeAbortPayload(index, subIndex, SDO_ABORT.GENERAL_ERROR),
    updatedNode
  };
}

/**
 * Parses a standard 11-bit CANopen COB-ID to extract Function Code and Node ID.
 */
export function parseCanopenId(id: number): {
  functionCode: number;
  nodeId: number;
  interpretation: string;
} {
  const functionCode = id >> 7;
  const nodeId = id & 0x7F;
  
  let interpretation = 'Unknown';
  switch (functionCode) {
    case 0x0: interpretation = 'NMT Master Command'; break;
    case 0x1: interpretation = id === 0x080 ? 'SYNC' : 'EMCY (Emergency)'; break;
    case 0x2: interpretation = 'TIME (Timestamp)'; break;
    case 0x3: interpretation = 'PDO1 Tx'; break;
    case 0x4: interpretation = 'PDO1 Rx'; break;
    case 0x5: interpretation = 'PDO2 Tx'; break;
    case 0x6: interpretation = 'PDO2 Rx'; break;
    case 0x7: interpretation = 'PDO3 Tx'; break;
    case 0x8: interpretation = 'PDO3 Rx'; break;
    case 0x9: interpretation = 'PDO4 Tx'; break;
    case 0xA: interpretation = 'PDO4 Rx'; break;
    case 0xB: interpretation = 'SDO Tx (Response)'; break;
    case 0xC: interpretation = 'SDO Rx (Request)'; break;
    case 0xE: interpretation = 'Heartbeat/Boot-up'; break;
  }
  
  return {
    functionCode,
    nodeId,
    interpretation
  };
}

/**
 * Extracts Object Dictionary index and sub-index from an SDO payload.
 */
export function parseCanopenSdo(data: Uint8Array): { index: number; subIndex: number } | null {
  if (data.length < 4) return null;
  const index = data[1] | (data[2] << 8);
  const subIndex = data[3];
  return { index, subIndex };
}
