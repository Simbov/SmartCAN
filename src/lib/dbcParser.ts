export interface DbcSignal {
  name: string;
  startBit: number;
  length: number;
  isLittleEndian: boolean;
  isSigned: boolean;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receivers: string[];
  valueDescriptions: Record<number, string>;
}

export interface DbcMessage {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  signals: DbcSignal[];
}

export interface DbcDatabase {
  nodes: string[];
  messages: Record<number, DbcMessage>;
}

/**
 * Parses standard .dbc file content into a DbcDatabase structure.
 */
export function parseDbc(content: string): DbcDatabase {
  const database: DbcDatabase = {
    nodes: [],
    messages: {}
  };

  const lines = content.split(/\r?\n/);
  let currentMessage: DbcMessage | null = null;

  // Regex definitions
  const nodeRegex = /^BU_:\s*(.*)$/;
  const messageRegex = /^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/;
  const signalRegex = /^\s*SG_\s+(\w+)\s*(?:\w+\s*)?:\s*(\d+)\|(\d+)@(\d+)([-+])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"\s*(.*)$/;
  const valRegex = /^VAL_\s+(\d+)\s+(\w+)\s+(.*);/;

  for (let line of lines) {
    line = line.trim();

    // 1. Parse Nodes
    if (line.startsWith('BU_:')) {
      const match = line.match(nodeRegex);
      if (match && match[1]) {
        database.nodes = match[1].split(/\s+/).filter(Boolean);
      }
      continue;
    }

    // 2. Parse Messages
    if (line.startsWith('BO_')) {
      const match = line.match(messageRegex);
      if (match) {
        const id = parseInt(match[1], 10);
        const name = match[2];
        const dlc = parseInt(match[3], 10);
        const sender = match[4];
        
        currentMessage = {
          id,
          name,
          dlc,
          sender,
          signals: []
        };
        database.messages[id] = currentMessage;
      }
      continue;
    }

    // 3. Parse Signals
    if (line.startsWith('SG_') && currentMessage) {
      const match = line.match(signalRegex);
      if (match) {
        const name = match[1];
        const startBit = parseInt(match[2], 10);
        const length = parseInt(match[3], 10);
        const isLittleEndian = match[4] === '1';
        const isSigned = match[5] === '-';
        const factor = parseFloat(match[6]);
        const offset = parseFloat(match[7]);
        const min = parseFloat(match[8]);
        const max = parseFloat(match[9]);
        const unit = match[10];
        
        // Parse receivers
        const receiversPart = match[11] ? match[11].trim() : '';
        const receivers = receiversPart.split(/\s*,\s*|\s+/).filter(Boolean);

        currentMessage.signals.push({
          name,
          startBit,
          length,
          isLittleEndian,
          isSigned,
          factor,
          offset,
          min,
          max,
          unit,
          receivers,
          valueDescriptions: {}
        });
      }
      continue;
    }

    // 4. Parse Value Descriptions (VAL_)
    if (line.startsWith('VAL_')) {
      const match = line.match(valRegex);
      if (match) {
        const messageId = parseInt(match[1], 10);
        const signalName = match[2];
        const valuesRaw = match[3].trim();
        
        // Parse "0 "Val0" 1 "Val1"" pattern
        const valPairsRegex = /(\d+)\s+"([^"]+)"/g;
        const valMap: Record<number, string> = {};
        let pairMatch;
        while ((pairMatch = valPairsRegex.exec(valuesRaw)) !== null) {
          valMap[parseInt(pairMatch[1], 10)] = pairMatch[2];
        }

        // Assign to database
        const msg = database.messages[messageId];
        if (msg) {
          const sig = msg.signals.find(s => s.name === signalName);
          if (sig) {
            sig.valueDescriptions = valMap;
          }
        }
      }
      continue;
    }
  }

  return database;
}

// Helpers for bit-level manipulation

function getBit(buffer: Uint8Array, bitIndex: number): number {
  const byteIdx = Math.floor(bitIndex / 8);
  const bitInByte = bitIndex % 8;
  if (byteIdx >= buffer.length) return 0;
  return (buffer[byteIdx] >> bitInByte) & 1;
}

function setBit(buffer: Uint8Array, bitIndex: number, value: number) {
  const byteIdx = Math.floor(bitIndex / 8);
  const bitInByte = bitIndex % 8;
  if (byteIdx >= buffer.length) return;
  if (value === 1) {
    buffer[byteIdx] |= (1 << bitInByte);
  } else {
    buffer[byteIdx] &= ~(1 << bitInByte);
  }
}

/**
 * Calculates Motorola bit indices from startBit (MSB) going down to LSB.
 */
export function getMotorolaBitIndices(startBit: number, length: number): number[] {
  const indices: number[] = [];
  let currBit = startBit;
  for (let i = 0; i < length; i++) {
    indices.push(currBit);
    const bitInByte = currBit % 8;
    const byteIdx = Math.floor(currBit / 8);
    if (bitInByte > 0) {
      currBit = currBit - 1;
    } else {
      currBit = (byteIdx + 1) * 8 + 7;
    }
  }
  return indices;
}

/**
 * Decodes signal values from a raw CAN frame's data bytes.
 */
export function decodeFrame(
  messageId: number,
  dataBytes: Uint8Array,
  database: DbcDatabase
): Record<string, number> | null {
  const message = database.messages[messageId];
  if (!message) return null;

  const result: Record<string, number> = {};

  for (const signal of message.signals) {
    let val = 0n;

    if (signal.isLittleEndian) {
      // Little Endian (Intel): startBit is LSB
      for (let i = 0; i < signal.length; i++) {
        const bit = getBit(dataBytes, signal.startBit + i);
        val |= BigInt(bit) << BigInt(i);
      }
    } else {
      // Big Endian (Motorola): startBit is MSB
      const bitIndices = getMotorolaBitIndices(signal.startBit, signal.length);
      for (let i = 0; i < signal.length; i++) {
        const bit = getBit(dataBytes, bitIndices[i]);
        const power = signal.length - 1 - i;
        val |= BigInt(bit) << BigInt(power);
      }
    }

    // Sign extension for signed signals
    if (signal.isSigned) {
      const msbMask = 1n << BigInt(signal.length - 1);
      if ((val & msbMask) !== 0n) {
        val = val - (1n << BigInt(signal.length));
      }
    }

    // Apply factor and offset
    const physicalVal = Number(val) * signal.factor + signal.offset;
    result[signal.name] = physicalVal;
  }

  return result;
}

/**
 * Encodes signal values back into a raw 8-byte CAN frame.
 */
export function encodeFrame(
  messageId: number,
  signalValues: Record<string, number>,
  database: DbcDatabase
): Uint8Array | null {
  const message = database.messages[messageId];
  if (!message) return null;

  const buffer = new Uint8Array(message.dlc || 8);

  for (const signal of message.signals) {
    const rawVal = signalValues[signal.name] !== undefined 
      ? signalValues[signal.name] 
      : 0;

    // Remove offset and factor, clamp and round
    let integerVal = BigInt(Math.round((rawVal - signal.offset) / signal.factor));
    
    // Clamp to range representation
    const maxUnsigned = (1n << BigInt(signal.length)) - 1n;
    if (signal.isSigned) {
      const minVal = -(1n << BigInt(signal.length - 1));
      const maxVal = (1n << BigInt(signal.length - 1)) - 1n;
      if (integerVal < minVal) integerVal = minVal;
      if (integerVal > maxVal) integerVal = maxVal;
      if (integerVal < 0n) {
        integerVal = (1n << BigInt(signal.length)) + integerVal;
      }
    } else {
      if (integerVal < 0n) integerVal = 0n;
      if (integerVal > maxUnsigned) integerVal = maxUnsigned;
    }

    // Pack into buffer
    if (signal.isLittleEndian) {
      for (let i = 0; i < signal.length; i++) {
        const bit = Number((integerVal >> BigInt(i)) & 1n);
        setBit(buffer, signal.startBit + i, bit);
      }
    } else {
      const bitIndices = getMotorolaBitIndices(signal.startBit, signal.length);
      for (let i = 0; i < signal.length; i++) {
        const power = signal.length - 1 - i;
        const bit = Number((integerVal >> BigInt(power)) & 1n);
        setBit(buffer, bitIndices[i], bit);
      }
    }
  }

  return buffer;
}
