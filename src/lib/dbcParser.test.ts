import { describe, it, expect } from 'vitest';
import { parseDbc, decodeFrame, encodeFrame } from './dbcParser';

const MOCK_DBC = `
BU_: Engine Dashboard
BO_ 2364539904 EEC1: 8 Engine
 SG_ EngineSpeed : 24|16@1+ (0.125,0) [0|8000] "rpm" Dashboard
 SG_ EngineTorque : 16|8@1- (1,0) [-125|125] "%" Dashboard

BO_ 500 MotorSpeed: 8 Motor
 SG_ MotorSpeedIntel : 0|16@1+ (0.5,-100) [-100|1000] "rpm" Dashboard
 SG_ MotorSpeedMotorola : 15|16@0+ (0.5,-100) [-100|1000] "rpm" Dashboard
`;

describe('DBC Parser and Decoder', () => {
  it('should parse BU_, BO_, and SG_ lines correctly', () => {
    const db = parseDbc(MOCK_DBC);
    
    expect(db.nodes).toContain('Engine');
    expect(db.nodes).toContain('Dashboard');
    
    expect(db.messages[2364539904]).toBeDefined();
    const msg = db.messages[2364539904];
    expect(msg.name).toBe('EEC1');
    expect(msg.dlc).toBe(8);
    expect(msg.sender).toBe('Engine');
    
    expect(msg.signals.length).toBe(2);
    const speedSig = msg.signals.find(s => s.name === 'EngineSpeed');
    expect(speedSig).toBeDefined();
    expect(speedSig?.startBit).toBe(24);
    expect(speedSig?.length).toBe(16);
    expect(speedSig?.isLittleEndian).toBe(true);
    expect(speedSig?.isSigned).toBe(false);
    expect(speedSig?.factor).toBe(0.125);
    expect(speedSig?.unit).toBe('rpm');
  });

  it('should decode Intel (little-endian) signals correctly', () => {
    const db = parseDbc(MOCK_DBC);
    
    // EEC1 payload: Speed of 1600 rpm (value 12800 raw, hex 0x3200) at bit 24
    // torque of -10% (raw -10, hex 0xF6) at bit 16
    // Payload byte layout: 
    // byte 0-1: 0x00 0x00
    // byte 2: 0xF6 (Torque)
    // byte 3: 0x00, byte 4: 0x32 (Speed: 0x3200 in little-endian is byte 3=0x00, byte 4=0x32 -> wait, startBit is 24 -> byte 3. So speed is byte 3 & 4)
    // Let's compute: 24 / 8 = byte 3. So speed is byte 3 (LSB) and byte 4 (MSB).
    // Raw speed = 12800 = 0x3200. So byte 3 = 0x00, byte 4 = 0x32.
    // Torque is at bit 16 -> byte 2. Raw torque = -10 = 0xF6.
    const data = new Uint8Array([0x00, 0x00, 0xF6, 0x00, 0x32, 0x00, 0x00, 0x00]);
    const decoded = decodeFrame(2364539904, data, db);
    
    expect(decoded).not.toBeNull();
    expect(decoded?.EngineSpeed).toBe(1600); // 12800 * 0.125
    expect(decoded?.EngineTorque).toBe(-10);
  });

  it('should encode Intel signals back to bytes correctly', () => {
    const db = parseDbc(MOCK_DBC);
    
    const signals = {
      EngineSpeed: 1600,
      EngineTorque: -10
    };
    
    const encoded = encodeFrame(2364539904, signals, db);
    expect(encoded).not.toBeNull();
    // Verify bytes:
    // byte 2: Torque = -10 -> 246 (0xF6)
    // byte 3: Speed LSB = 0x00
    // byte 4: Speed MSB = 0x32
    expect(encoded?.[2]).toBe(0xF6);
    expect(encoded?.[3]).toBe(0x00);
    expect(encoded?.[4]).toBe(0x32);
  });

  it('should decode and encode Motorola (big-endian) signals correctly', () => {
    const db = parseDbc(MOCK_DBC);

    // MotorSpeed: ID 500
    // MotorSpeedIntel: startBit 0, length 16. Intel.
    // MotorSpeedMotorola: startBit 15, length 16. Motorola.
    // Standard value: 400 rpm -> raw = (400 - (-100)) / 0.5 = 1000 = 0x03E8
    // For Intel (start 0): byte 0 = 0xE8, byte 1 = 0x03
    // For Motorola (start 15): MSB is bit 15 (byte 1, bit 7), LSB is bit 8 (byte 1, bit 0).
    // Wait! Let's check: Motorola startBit is 15.
    // In our decoder, bitIndices for startBit=15, length=16:
    // [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] -> wait!
    // Let's trace getMotorolaBitIndices(15, 16):
    // 15 % 8 = 7, next: 14... down to 8. 8 % 8 = 0. Next: (1+1)*8 + 7 = 23 (MSB of byte 2)??
    // Oh, wait! In our code:
    // `const bitInByte = currBit % 8;`
    // `if (bitInByte > 0) currBit = currBit - 1;`
    // `else currBit = (byteIdx + 1) * 8 + 7;`
    // So if currBit = 8 (which is byte 1, bit 0). `bitInByte` is 0.
    // Next: `byteIdx` is 1. `(1 + 1) * 8 + 7` = 23.
    // Yes! Byte 2, bit 7.
    // So the bits are:
    // Byte 1: 15, 14, 13, 12, 11, 10, 9, 8 (bits of byte 1 from MSB to LSB).
    // Byte 2: 23, 22, 21, 20, 19, 18, 17, 16 (bits of byte 2 from MSB to LSB).
    // This is exactly big-endian! (MSB is byte 1, LSB is byte 2).
    // So 0x03E8 is written as: byte 1 = 0x03, byte 2 = 0xE8.
    
    const data = new Uint8Array([0x00, 0x03, 0xE8, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const decoded = decodeFrame(500, data, db);
    
    expect(decoded?.MotorSpeedMotorola).toBe(400);

    // Test encoding back
    const encoded = encodeFrame(500, { MotorSpeedMotorola: 400 }, db);
    expect(encoded?.[1]).toBe(0x03);
    expect(encoded?.[2]).toBe(0xE8);
  });

  it('should decode and encode signed signals correctly', () => {
    const SIGNED_DBC = `
BO_ 600 SignedTest: 8 Motor
 SG_ SignedIntel : 0|8@1- (1,0) [-128|127] "C" Dashboard
 SG_ SignedMotorola : 15|8@0- (1,0) [-128|127] "C" Dashboard
`;
    const db = parseDbc(SIGNED_DBC);

    // Negative value: -50 (raw 206, hex 0xCE)
    // Positive value: 75 (raw 75, hex 0x4B)
    // Layout for SignedIntel (start 0, len 8): byte 0
    // Layout for SignedMotorola (start 15, len 8): byte 1
    const data = new Uint8Array([0xCE, 0x4B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const decoded = decodeFrame(600, data, db);

    expect(decoded?.SignedIntel).toBe(-50);
    expect(decoded?.SignedMotorola).toBe(75);

    // Test encoding back
    const encoded = encodeFrame(600, { SignedIntel: -50, SignedMotorola: 75 }, db);
    expect(encoded?.[0]).toBe(0xCE);
    expect(encoded?.[1]).toBe(0x4B);
  });
});
