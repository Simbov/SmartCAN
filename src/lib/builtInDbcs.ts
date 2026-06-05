// Built-in DBC Databases

export const DEFAULT_J1939_DBC = `
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

export const DEFAULT_CANOPEN_DBC = `
BU_: Master Node1 Node2
BO_ 385 TxPDO1_Node1: 8 Node1
 SG_ DigitalInputs : 0|8@1+ (1,0) [0|255] "" Master
 SG_ AnalogInput1 : 8|16@1+ (0.001,0) [0|10] "V" Master
 SG_ AnalogInput2 : 24|16@1+ (0.001,0) [0|10] "V" Master

BO_ 513 RxPDO1_Node1: 8 Master
 SG_ DigitalOutputs : 0|8@1+ (1,0) [0|255] "" Node1
 SG_ AnalogOutput1 : 8|16@1+ (0.001,0) [0|10] "V" Node1
`;

export const ORION_BMS_DBC = `
BU_: BMS InstrumentPanel
BO_ 2364543232 BMS_Status: 8 BMS
 SG_ PackSOC : 0|8@1+ (0.5,0) [0|100] "%" InstrumentPanel
 SG_ PackCurrent : 8|16@1- (0.1,0) [-1000|1000] "A" InstrumentPanel
 SG_ PackVoltage : 24|16@1+ (0.1,0) [0|1000] "V" InstrumentPanel
 SG_ AvgCellTemp : 40|8@1+ (1,-40) [-40|215] "C" InstrumentPanel

BO_ 2364543233 BMS_Limits: 8 BMS
 SG_ MaxDischargeCurrent : 0|16@1+ (1,0) [0|1000] "A" InstrumentPanel
 SG_ MaxChargeCurrent : 16|16@1+ (1,0) [0|1000] "A" InstrumentPanel
`;

export const CURTIS_CONTROLLER_DBC = `
BU_: MotorController InstrumentPanel
BO_ 2364540416 MC_Status: 8 MotorController
 SG_ MotorRPM : 0|16@1+ (1,0) [0|10000] "rpm" InstrumentPanel
 SG_ MotorTemp : 16|8@1+ (1,-40) [-40|215] "C" InstrumentPanel
 SG_ ControllerTemp : 24|8@1+ (1,-40) [-40|215] "C" InstrumentPanel
 SG_ ThrottleInput : 32|8@1+ (0.4,0) [0|100] "%" InstrumentPanel
 SG_ MotorTorque : 40|16@1- (0.25,0) [-250|250] "Nm" InstrumentPanel
`;

export const VICTRON_SHUNT_DBC = `
BU_: SmartShunt InstrumentPanel
BO_ 2364543744 SHUNT_Status: 8 SmartShunt
 SG_ ShuntSOC : 0|16@1+ (0.01,0) [0|100] "%" InstrumentPanel
 SG_ ShuntCurrent : 16|32@1- (0.001,0) [-500|500] "A" InstrumentPanel
 SG_ ShuntVoltage : 48|16@1+ (0.01,0) [0|100] "V" InstrumentPanel
`;

export interface BuiltInDbcInfo {
  name: string;
  category: 'generic' | 'device';
  protocol: 'j1939' | 'canopen';
  content: string;
}

export const BUILT_IN_DBCS: BuiltInDbcInfo[] = [
  {
    name: 'Default J1939 Database',
    category: 'generic',
    protocol: 'j1939',
    content: DEFAULT_J1939_DBC,
  },
  {
    name: 'Default CANopen Database',
    category: 'generic',
    protocol: 'canopen',
    content: DEFAULT_CANOPEN_DBC,
  },
  {
    name: 'Orion BMS Controller',
    category: 'device',
    protocol: 'j1939',
    content: ORION_BMS_DBC,
  },
  {
    name: 'Curtis 1239 Motor Controller',
    category: 'device',
    protocol: 'j1939',
    content: CURTIS_CONTROLLER_DBC,
  },
  {
    name: 'Victron SmartShunt Monitor',
    category: 'device',
    protocol: 'j1939',
    content: VICTRON_SHUNT_DBC,
  },
];
