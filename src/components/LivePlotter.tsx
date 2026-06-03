import React, { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { LineChart, Trash2 } from 'lucide-react';

const COLORS = ['#10b981', '#06b6d4', '#f59e0b', '#a855f7', '#ec4899', '#3b82f6'];

export const LivePlotter: React.FC = () => {
  const { plotPoints, plotSignals, clearPlotHistory, protocol } = useStore();

  // Width and height of the SVG viewport
  const width = 600;
  const height = 240;
  
  // Padding around the chart for axis labels
  const paddingLeft = 45;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Process data points and map bounds
  const chartDetails = useMemo(() => {
    if (plotPoints.length < 2 || plotSignals.length === 0) {
      return null;
    }

    // Min / Max X (Time)
    const times = plotPoints.map(p => p.timestamp);
    const minX = times[0];
    const maxX = times[times.length - 1];
    const dx = maxX - minX || 1;

    // Min / Max Y across all selected signals
    let minY = Infinity;
    let maxY = -Infinity;

    plotPoints.forEach(pt => {
      plotSignals.forEach(sig => {
        const val = pt.values[sig];
        if (val !== undefined) {
          if (val < minY) minY = val;
          if (val > maxY) maxY = val;
        }
      });
    });

    if (minY === Infinity) {
      minY = 0;
      maxY = 100;
    }

    // Pad Y axis slightly
    const dy = maxY - minY || 1;
    minY -= dy * 0.05;
    maxY += dy * 0.05;
    const finalDy = maxY - minY;

    // Build SVG paths for each signal
    const paths = plotSignals.map((sigName, sigIdx) => {
      const color = COLORS[sigIdx % COLORS.length];
      
      const coords = plotPoints
        .map(pt => {
          const val = pt.values[sigName];
          if (val === undefined) return null;
          
          const x = paddingLeft + ((pt.timestamp - minX) / dx) * chartWidth;
          const y = paddingTop + (1 - (val - minY) / finalDy) * chartHeight;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .filter(Boolean);

      const d = coords.length > 0 ? `M ${coords.join(' L ')}` : '';

      return {
        name: sigName,
        d,
        color
      };
    });

    return {
      minX,
      maxX,
      minY,
      maxY,
      paths
    };
  }, [plotPoints, plotSignals, chartWidth, chartHeight]);

  // Generate grid tick values
  const yTicks = useMemo(() => {
    if (!chartDetails) return [];
    const { minY, maxY } = chartDetails;
    const ticks = [];
    const step = (maxY - minY) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(minY + step * i);
    }
    return ticks;
  }, [chartDetails]);

  const xTicks = useMemo(() => {
    if (!chartDetails) return [];
    const { minX, maxX } = chartDetails;
    const ticks = [];
    const step = (maxX - minX) / 3;
    for (let i = 0; i <= 3; i++) {
      ticks.push(minX + step * i);
    }
    return ticks;
  }, [chartDetails]);

  return (
    <div className="glass-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <LineChart className={`w-4 h-4 ${protocol === 'j1939' ? 'text-cyber-j1939' : 'text-cyber-canopen'}`} />
          <span className="font-semibold text-[var(--text-color)] text-sm">Real-Time Signal Plotter</span>
        </div>
        {plotPoints.length > 0 && (
          <button
            onClick={clearPlotHistory}
            className="text-[10px] text-[var(--text-muted)] hover:text-red-500 font-semibold flex items-center gap-1 transition-all active:scale-95"
            title="Reset Chart Data"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Reset Data
          </button>
        )}
      </div>

      {plotSignals.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[var(--border-color)] rounded-lg bg-[var(--bg-card-sub)]">
          <LineChart className="w-8 h-8 text-[var(--text-muted)] mb-2 animate-bounce" />
          <span className="text-xs text-[var(--text-muted)] max-w-[200px]">
            No signals selected for plotting. Go to the expanded rows in the Live Traffic Viewer and click the **Plot** button next to any decoded signal.
          </span>
        </div>
      ) : plotPoints.length < 2 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[var(--border-color)] rounded-lg bg-[var(--bg-card-sub)]">
          <div className="animate-pulse flex flex-col items-center">
            <span className="text-xs text-[var(--text-muted)] font-semibold mb-1">Awaiting signal transmission...</span>
            <span className="text-[10px] text-[var(--text-muted)]">Ensure the simulation or periodic transmitter is writing frames.</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Plotter Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3.5 bg-[var(--bg-card-sub)] p-2 rounded border border-[var(--border-sub)]">
            {plotSignals.map((sigName, idx) => {
              const color = COLORS[idx % COLORS.length];
              const lastVal = plotPoints[plotPoints.length - 1]?.values[sigName];
              
              return (
                <div key={sigName} className="flex items-center gap-2 text-xs font-semibold">
                  <span
                    className="w-3 h-1.5 rounded"
                    style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                  />
                  <span className="text-[var(--text-muted)]">{sigName}:</span>
                  <span className="text-[var(--text-color)] font-mono">
                    {lastVal !== undefined ? lastVal.toFixed(2).replace(/\.?0+$/, '') : 'n/a'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Responsive SVG Chart */}
          <div className="flex-1 min-h-[160px] relative w-full bg-[var(--bg-input)] rounded border border-[var(--border-sub)]">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-[10px] font-mono text-[var(--text-muted)] overflow-visible">
              
              {/* Y Axis Gridlines and Ticks */}
              {chartDetails && yTicks.map((val, idx) => {
                const y = paddingTop + (1 - (val - chartDetails.minY) / (chartDetails.maxY - chartDetails.minY || 1)) * chartHeight;
                return (
                  <g key={`y-${idx}`} className="opacity-60">
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="var(--border-color)"
                      strokeWidth={1}
                      strokeDasharray="2,2"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="currentColor"
                      className="font-semibold"
                    >
                      {val.toFixed(1).replace(/\.?0+$/, '')}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Gridlines and Ticks */}
              {chartDetails && xTicks.map((val, idx) => {
                const x = paddingLeft + ((val - chartDetails.minX) / (chartDetails.maxX - chartDetails.minX || 1)) * chartWidth;
                return (
                  <g key={`x-${idx}`} className="opacity-40">
                    <line
                      x1={x}
                      y1={paddingTop}
                      x2={x}
                      y2={height - paddingBottom}
                      stroke="var(--border-color)"
                      strokeWidth={1}
                      strokeDasharray="2,2"
                    />
                    <text
                      x={x}
                      y={height - paddingBottom + 14}
                      textAnchor="middle"
                      fill="currentColor"
                      className="font-semibold"
                    >
                      {(val / 1000).toFixed(1)}s
                    </text>
                  </g>
                );
              })}

              {/* Base Axis lines */}
              <line
                x1={paddingLeft}
                y1={paddingTop}
                x2={paddingLeft}
                y2={height - paddingBottom}
                stroke="var(--border-color)"
                strokeWidth={1.5}
              />
              <line
                x1={paddingLeft}
                y1={height - paddingBottom}
                x2={width - paddingRight}
                y2={height - paddingBottom}
                stroke="var(--border-color)"
                strokeWidth={1.5}
              />

              {/* Plotted Line Paths */}
              {chartDetails && chartDetails.paths.map(p => (
                <g key={p.name}>
                  {/* Glow shadow line */}
                  <path
                    d={p.d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={4}
                    className="opacity-20 blur-[3px]"
                  />
                  {/* Main crisp line */}
                  <path
                    d={p.d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};
