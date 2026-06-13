import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Zap, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';

export const FalseCanSender: React.FC = () => {
  const { protocol, isSimulating, startSimulation, stopSimulation } = useStore();
  const [selectedSignal, setSelectedSignal] = useState<string>(
    protocol === 'j1939' ? 'EngineSpeed' : 'AnalogInput1'
  );
  
  // Waveform attributes
  const [waveType, setWaveType] = useState<'sine' | 'square' | 'ramp' | 'noise'>('sine');
  const [amplitude, setAmplitude] = useState(800);
  const [frequency, setFrequency] = useState(0.5); // Hz
  const [offset, setOffset] = useState(2000);

  const [animationTime, setAnimationTime] = useState(0);

  const isSimulatorWindow = typeof window !== 'undefined' && window.location.search.includes('window=simulator');

  React.useEffect(() => {
    if (!isSimulating) return;
    let animId: number;
    const tick = () => {
      setAnimationTime(t => t + 0.05);
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isSimulating]);

  const signalOptions = protocol === 'j1939'
    ? ['EngineSpeed', 'EngineTorque', 'AcceleratorPosition', 'EngineCoolantTemp', 'EngineOilTemp', 'TransmissionActualGear']
    : ['DigitalInputs', 'AnalogInput1', 'AnalogInput2', 'DigitalOutputs', 'AnalogOutput1'];

  const handleToggleSimulation = () => {
    if (isSimulating) {
      stopSimulation();
    } else {
      startSimulation();
    }
  };

  const handlePopOut = async () => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const webview = new WebviewWindow('simulator', {
        url: 'index.html?window=simulator',
        title: 'SmartCAN - false oscillo-simulator',
        width: 1000,
        height: 700,
      });
      webview.once('tauri://created', function () {
        console.log('Simulator window created');
      });
      webview.once('tauri://error', function (e) {
        console.error('Failed to create simulator window:', e);
      });
    } catch (err) {
      console.error('Failed to load Tauri WebviewWindow:', err);
    }
  };

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
          <span className="font-semibold text-[var(--text-color)] text-sm">False CAN Traffic Simulator</span>
        </div>

        <div className="flex items-center gap-3">
          {!isSimulatorWindow && (
            <button
              onClick={handlePopOut}
              className="p-1 text-[var(--text-muted)] hover:text-cyber-accent transition-colors"
              title="Open Simulator in Separate Window"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleToggleSimulation}
            className="text-[var(--text-muted)] hover:text-[var(--text-color)]"
            title={isSimulating ? 'Stop Simulator' : 'Start Simulator'}
          >
            {isSimulating ? (
              <ToggleRight className="w-7.5 h-7.5 text-cyber-accent" />
            ) : (
              <ToggleLeft className="w-7.5 h-7.5" />
            )}
          </button>
        </div>
      </div>

      {/* Connection warning */}
      {!isSimulating && (
        <div className="bg-[var(--bg-input)] border border-[var(--border-sub)] rounded p-2.5 text-[11px] text-[var(--text-muted)] mb-3 leading-relaxed">
          Toggle the switch above to spin up the virtual ECU nodes and inject synthetic sensor telemetry onto the bus.
        </div>
      )}

      {/* Simulator grid */}
      <div className="flex-1 flex flex-col justify-between overflow-y-auto space-y-3.5">
        <div className="space-y-3">
          {/* Signal selector */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">Select Simulated Sensor</label>
            <select
              value={selectedSignal}
              onChange={e => {
                setSelectedSignal(e.target.value);
                // Adjust defaults based on signal type
                if (e.target.value === 'EngineCoolantTemp') {
                  setAmplitude(20);
                  setOffset(80);
                  setFrequency(0.05);
                } else if (e.target.value === 'EngineSpeed') {
                  setAmplitude(800);
                  setOffset(2000);
                  setFrequency(0.5);
                } else if (e.target.value.includes('Analog')) {
                  setAmplitude(4);
                  setOffset(5);
                  setFrequency(0.2);
                }
              }}
              className="glass-input w-full pr-4 text-xs font-semibold"
            >
              {signalOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Waveform configuration */}
          <div className="bg-[var(--bg-card-sub)] border border-[var(--border-color)] rounded p-3 space-y-3">
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">Signal Waveform Editor</span>
            
            {/* Wave Selector */}
            <div className="grid grid-cols-4 gap-1.5 bg-[var(--bg-input)] rounded p-0.5 border border-[var(--border-sub)] text-[10px] font-semibold">
              {(['sine', 'square', 'ramp', 'noise'] as const).map(w => (
                <button
                  key={w}
                  onClick={() => setWaveType(w)}
                  className={`py-1 rounded capitalize transition-all duration-150 ${
                    waveType === w 
                      ? 'bg-[var(--bg-card)] text-[var(--text-color)] shadow border border-[var(--border-color)]' 
                      : 'text-[var(--text-muted)] hover:text-[var(--text-color)]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            {/* Slider Controls */}
            <div className="space-y-2 text-xs">
              {/* Frequency */}
              <div className="space-y-1">
                <div className="flex justify-between text-[var(--text-color)]">
                  <span>Frequency:</span>
                  <span className="font-mono font-bold text-[var(--text-color)]">{frequency} Hz</span>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={2.0}
                  step={0.01}
                  value={frequency}
                  onChange={e => setFrequency(parseFloat(e.target.value))}
                  className="w-full h-1 bg-[var(--bg-input)] rounded-lg appearance-none cursor-pointer accent-cyber-accent"
                />
              </div>

              {/* Amplitude */}
              <div className="space-y-1">
                <div className="flex justify-between text-[var(--text-color)]">
                  <span>Amplitude:</span>
                  <span className="font-mono font-bold text-[var(--text-color)]">{amplitude}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={selectedSignal === 'EngineSpeed' ? 3000 : 50}
                  step={1}
                  value={amplitude}
                  onChange={e => setAmplitude(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-[var(--bg-input)] rounded-lg appearance-none cursor-pointer accent-cyber-accent"
                />
              </div>

              {/* Offset */}
              <div className="space-y-1">
                <div className="flex justify-between text-[var(--text-color)]">
                  <span>Offset / Bias:</span>
                  <span className="font-mono font-bold text-[var(--text-color)]">{offset}</span>
                </div>
                <input
                  type="range"
                  min={selectedSignal === 'EngineSpeed' ? 500 : 0}
                  max={selectedSignal === 'EngineSpeed' ? 5000 : 100}
                  step={1}
                  value={offset}
                  onChange={e => setOffset(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-[var(--bg-input)] rounded-lg appearance-none cursor-pointer accent-cyber-accent"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic simulator oscilloscope animation */}
        <div className="bg-[var(--bg-input)] border border-[var(--border-sub)] rounded p-3 h-20 flex items-center justify-center relative overflow-hidden">
          <span className="absolute top-1.5 left-2 text-[8px] font-mono uppercase tracking-wider text-[var(--text-muted)]">Virtual Oscilloscope</span>
          <svg className="w-full h-full text-cyber-accent overflow-visible opacity-50" viewBox="0 0 100 40">
            <path
              d={Array.from({ length: 40 })
                .map((_, idx) => {
                  const x = (idx / 39) * 100;
                  let y: number;
                  const t = idx * 0.2 + (isSimulating ? animationTime : 0);
                  if (waveType === 'sine') {
                    y = 20 + 15 * Math.sin(t * frequency * 2);
                  } else if (waveType === 'square') {
                    y = 20 + 15 * (Math.sin(t * frequency * 2) >= 0 ? 1 : -1);
                  } else if (waveType === 'ramp') {
                    y = 20 + 15 * (((t * frequency) % 2) - 1);
                  } else {
                    // Deterministic pseudo-random sequence to preserve hook purity
                    y = 20 + 15 * (Math.sin(idx * 73.13 + t) * 0.5);
                  }
                  return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
