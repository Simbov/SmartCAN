export interface J1939IdDetails {
  priority: number;
  edp: number;
  dp: number;
  pf: number;
  ps: number;
  sa: number;
  pgn: number;
  isP2P: boolean;
  da: number | null;
}

export interface J1939Node {
  address: number;
  name: bigint; // 64-bit NAME
  isClaimed: boolean;
}

/**
 * Parses a 29-bit CAN ID into J1939 details.
 */
export function parseJ1939Id(id: number): J1939IdDetails {
  const sa = id & 0xFF;
  const ps = (id >> 8) & 0xFF;
  const pf = (id >> 16) & 0xFF;
  const dp = (id >> 24) & 1;
  const edp = (id >> 25) & 1;
  const priority = (id >> 26) & 0x7;

  const isP2P = pf < 240;
  const pgn = isP2P
    ? (edp << 17) | (dp << 16) | (pf << 8)
    : (edp << 17) | (dp << 16) | (pf << 8) | ps;

  const da = isP2P ? ps : null;

  return { priority, edp, dp, pf, ps, sa, pgn, isP2P, da };
}

/**
 * Packs PGN, SA, Priority and Destination Address back into a 29-bit CAN ID.
 */
export function buildJ1939Id(priority: number, pgn: number, sa: number, da = 0): number {
  const edp = (pgn >> 17) & 1;
  const dp = (pgn >> 16) & 1;
  const pf = (pgn >> 8) & 0xFF;
  const ge = pgn & 0xFF;

  let ps = ge;
  if (pf < 240) {
    ps = da;
  }

  return (
    (sa & 0xFF) |
    (ps << 8) |
    (pf << 16) |
    (dp << 24) |
    (edp << 25) |
    ((priority & 0x7) << 26)
  );
}

/**
 * Splits a payload (>8 bytes) into J1939 Transport Protocol BAM packets.
 * Returns an array of frames: one TP.CM (BAM) frame followed by multiple TP.DT frames.
 */
export function segmentBamMessage(
  pgn: number,
  sa: number,
  payload: Uint8Array,
  priority = 7
): { id: number; data: Uint8Array }[] {
  const totalSize = payload.length;
  const totalPackets = Math.ceil(totalSize / 7);
  const frames: { id: number; data: Uint8Array }[] = [];

  // 1. Connection Management (TP.CM) BAM frame
  // COB-ID: PGN 60416 (0xEC00) broadcast (Destination Address = 255)
  const cmId = buildJ1939Id(priority, 0xEC00, sa, 255);
  const cmData = new Uint8Array(8);
  cmData[0] = 0x10; // BAM command specifier
  cmData[1] = totalSize & 0xFF;
  cmData[2] = (totalSize >> 8) & 0xFF;
  cmData[3] = totalPackets;
  cmData[4] = 0xFF; // Reserved
  cmData[5] = pgn & 0xFF;
  cmData[6] = (pgn >> 8) & 0xFF;
  cmData[7] = (pgn >> 16) & 0xFF;

  frames.push({ id: cmId, data: cmData });

  // 2. Data Transfer (TP.DT) frames
  // COB-ID: PGN 60160 (0xEB00) broadcast (Destination Address = 255)
  const dtId = buildJ1939Id(priority, 0xEB00, sa, 255);

  for (let p = 0; p < totalPackets; p++) {
    const dtData = new Uint8Array(8);
    dtData[0] = p + 1; // Sequence Number (1-indexed)
    
    // Copy up to 7 bytes of payload
    const startIdx = p * 7;
    for (let i = 0; i < 7; i++) {
      const srcIdx = startIdx + i;
      if (srcIdx < totalSize) {
        dtData[i + 1] = payload[srcIdx];
      } else {
        dtData[i + 1] = 0xFF; // Padding
      }
    }
    
    frames.push({ id: dtId, data: dtData });
  }

  return frames;
}

/**
 * A class helper to handle incoming Transport Protocol packets and reassemble them.
 */
export class J1939TpReassembler {
  // Keyed by SA
  private sessions: Record<number, {
    pgn: number;
    totalSize: number;
    totalPackets: number;
    packets: Record<number, Uint8Array>;
    lastActivity: number;
  }> = {};

  /**
   * Process a frame. If a complete multi-packet frame is assembled, returns it.
   */
  public processFrame(
    id: number,
    data: Uint8Array,
    timestamp: number
  ): { pgn: number; sa: number; payload: Uint8Array } | null {
    const details = parseJ1939Id(id);
    const sa = details.sa;

    // 1. Connection Management (TP.CM) PGN 60416 (0xEC00)
    if (details.pgn === 0xEC00) {
      if (data.length < 8) return null;
      const cs = data[0];
      
      if (cs === 0x10) {
        // BAM session init
        const totalSize = data[1] | (data[2] << 8);
        const totalPackets = data[3];
        const targetPgn = data[5] | (data[6] << 8) | (data[7] << 16);

        this.sessions[sa] = {
          pgn: targetPgn,
          totalSize,
          totalPackets,
          packets: {},
          lastActivity: timestamp
        };
      }
      return null;
    }

    // 2. Data Transfer (TP.DT) PGN 60160 (0xEB00)
    if (details.pgn === 0xEB00) {
      const session = this.sessions[sa];
      if (!session) return null;

      if (data.length < 8) return null;
      const seq = data[0];
      session.packets[seq] = data.slice(1, 8);
      session.lastActivity = timestamp;

      // Check if all packets received
      if (Object.keys(session.packets).length === session.totalPackets) {
        // Assemble payload
        const assembled = new Uint8Array(session.totalSize);
        let bytesCopied = 0;
        
        for (let seqIdx = 1; seqIdx <= session.totalPackets; seqIdx++) {
          const packetData = session.packets[seqIdx];
          if (!packetData) continue; // Safety check
          
          const remainingBytes = session.totalSize - bytesCopied;
          const copySize = Math.min(7, remainingBytes);
          assembled.set(packetData.slice(0, copySize), bytesCopied);
          bytesCopied += copySize;
        }

        // Clean up session
        delete this.sessions[sa];

        return {
          pgn: session.pgn,
          sa,
          payload: assembled
        };
      }
    }

    // Periodic cleanup of stale sessions (> 3000ms idle) could be added,
    // but in pure function contexts it is done dynamically.
    return null;
  }
}

/**
 * Handle Address Claim arbitration.
 * If another node claims the same address as us:
 * - If our NAME < senderName, we defend our address by re-sending our Address Claimed.
 * - If our NAME > senderName, we yield and send Cannot Claim (Null Address 254).
 */
export function arbitrateAddressClaim(
  node: J1939Node,
  senderAddress: number,
  senderName: bigint
): { updatedNode: J1939Node; claimFrame: { id: number; data: Uint8Array } | null } {
  if (senderAddress !== node.address) {
    return { updatedNode: node, claimFrame: null };
  }

  // Address conflict! Compare Names.
  if (node.name < senderName) {
    // We win, re-claim/defend
    const claimId = buildJ1939Id(6, 60928, node.address, 255);
    const claimData = new Uint8Array(8);
    // Write 64-bit NAME to data
    for (let i = 0; i < 8; i++) {
      claimData[i] = Number((node.name >> BigInt(i * 8)) & 0xFFn);
    }

    return {
      updatedNode: { ...node, isClaimed: true },
      claimFrame: { id: claimId, data: claimData }
    };
  } else {
    // We lose, send Cannot Claim Address (from Null Address 254)
    const yieldId = buildJ1939Id(6, 60928, 254, 255);
    const yieldData = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      yieldData[i] = Number((node.name >> BigInt(i * 8)) & 0xFFn);
    }

    return {
      updatedNode: { ...node, isClaimed: false, address: 254 },
      claimFrame: { id: yieldId, data: yieldData }
    };
  }
}
