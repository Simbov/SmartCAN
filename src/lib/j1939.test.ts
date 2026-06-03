import { describe, it, expect } from 'vitest';
import { parseJ1939Id, buildJ1939Id, segmentBamMessage, J1939TpReassembler, arbitrateAddressClaim } from './j1939';
import type { J1939Node } from './j1939';

describe('J1939 Protocol Engine', () => {
  it('should parse 29-bit CAN IDs and extract PGN details', () => {
    // ID 0x18FEEED0: Priority 6, PGN 65262 (ET1 = 0xFEEE), SA 208 (0xD0)
    // Wait, let's calculate: 0x18FEEED0
    // Binary: 000 110 00 1111 1110 1110 1110 1101 0000
    // Priority: 6
    // PF: 0xFE, PS: 0xEE (PDU2 format since 0xFE >= 240)
    // PGN: 0xFEEE = 65262
    // SA: 0xD0 = 208
    const id = 0x18FEEED0;
    const details = parseJ1939Id(id);
    
    expect(details.priority).toBe(6);
    expect(details.pgn).toBe(65262);
    expect(details.sa).toBe(208);
    expect(details.isP2P).toBe(false);
    expect(details.da).toBeNull();
  });

  it('should pack PGN components back to 29-bit CAN IDs', () => {
    const pgn = 61444; // EEC1 = 0xF004
    const sa = 15;
    const priority = 3;
    
    const packedId = buildJ1939Id(priority, pgn, sa, 255);
    // 0xF004 is PDU2 format (0xF0 >= 240), PS is Group Extension = 0x04
    // Expected ID: 0x0C + F0 + 04 + 0F = 0x0CF0040F
    expect(packedId).toBe(0x0CF0040F);
  });

  it('should segment large payloads into TP.CM BAM and TP.DT data frames', () => {
    const pgn = 0xFEF6; // PGN 65270 (Radial Fluid Temperature)
    const sa = 10;
    
    // 15 bytes payload (requires 3 packets: 15 / 7 = 3)
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    
    const frames = segmentBamMessage(pgn, sa, payload, 7);
    
    // Should return 4 frames total: 1 CM frame, 3 DT frames
    expect(frames.length).toBe(4);
    
    // Verify CM frame (BAM init)
    const cm = frames[0];
    expect(parseJ1939Id(cm.id).pgn).toBe(0xEC00); // TP.CM
    expect(cm.data[0]).toBe(0x10); // BAM CS
    expect(cm.data[1]).toBe(15); // Total bytes LSB
    expect(cm.data[2]).toBe(0); // Total bytes MSB
    expect(cm.data[3]).toBe(3); // Total packets
    expect(cm.data[5]).toBe(0xF6); // Target PGN LSB
    expect(cm.data[6]).toBe(0xFE); // Target PGN MSB

    // Verify DT frame 1
    const dt1 = frames[1];
    expect(parseJ1939Id(dt1.id).pgn).toBe(0xEB00); // TP.DT
    expect(dt1.data[0]).toBe(1); // Seq 1
    expect(dt1.data[1]).toBe(1); // Payload start
    expect(dt1.data[7]).toBe(7);

    // Verify DT frame 3 (last frame, padding check)
    const dt3 = frames[3];
    expect(dt3.data[0]).toBe(3); // Seq 3
    expect(dt3.data[1]).toBe(15); // Val 15
    expect(dt3.data[2]).toBe(0xFF); // Padding
    expect(dt3.data[7]).toBe(0xFF);
  });

  it('should reassemble segmented J1939 transport packets', () => {
    const pgn = 0xFEF6;
    const sa = 10;
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const frames = segmentBamMessage(pgn, sa, payload, 7);

    const reassembler = new J1939TpReassembler();
    
    // Feed packets sequentially
    let result = null;
    for (const frame of frames) {
      result = reassembler.processFrame(frame.id, frame.data, Date.now());
    }

    expect(result).not.toBeNull();
    expect(result?.pgn).toBe(pgn);
    expect(result?.sa).toBe(sa);
    expect(result?.payload.length).toBe(15);
    expect(Array.from(result?.payload || [])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('should arbitrate address claims based on numerical NAME priority', () => {
    // Simulated ECU node at address 128
    const node: J1939Node = {
      address: 128,
      name: 0x00000000000000FFn, // Node Name
      isClaimed: true
    };

    // Case 1: Contending node has a HIGHER numerical NAME value. We win!
    // We should defend by sending our claim frame back.
    const senderNameHigher = 0x00000000000001FFn;
    const claimRes1 = arbitrateAddressClaim(node, 128, senderNameHigher);
    
    expect(claimRes1.updatedNode.isClaimed).toBe(true);
    expect(claimRes1.updatedNode.address).toBe(128);
    expect(claimRes1.claimFrame).not.toBeNull();
    expect(claimRes1.claimFrame?.id).toBe(buildJ1939Id(6, 60928, 128, 255)); // Sent from SA 128

    // Case 2: Contending node has a LOWER numerical NAME value. We lose!
    // We should yield by sending Cannot Claim (address 254).
    const senderNameLower = 0x000000000000007Fn;
    const claimRes2 = arbitrateAddressClaim(node, 128, senderNameLower);
    
    expect(claimRes2.updatedNode.isClaimed).toBe(false);
    expect(claimRes2.updatedNode.address).toBe(254); // yielded address
    expect(claimRes2.claimFrame).not.toBeNull();
    // Cannot Claim is sent from SA 254 (NULL)
    expect(parseJ1939Id(claimRes2.claimFrame!.id).sa).toBe(254);
  });
});
