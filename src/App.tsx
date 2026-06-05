import React from 'react';
import { Header } from './components/Header';
import { DbcManager } from './components/DbcManager';
import { DeviceManager } from './components/DeviceManager';
import { LiveViewer } from './components/LiveViewer';
import { CanTransmitter } from './components/CanTransmitter';
import { LivePlotter } from './components/LivePlotter';
import { ProtocolDiagnostics } from './components/ProtocolDiagnostics';
import { FalseCanSender } from './components/FalseCanSender';
import { ConnectionErrorModal } from './components/ConnectionErrorModal';
import { checkForUpdates } from './lib/updater';
import { useStore } from './store/useStore';

import { Activity, Database, GripHorizontal, X, LayoutGrid } from 'lucide-react';

const PANEL_NAMES: Record<string, string> = {
  deviceManager: 'Logical ECUs Tree',
  liveViewer: 'Live CAN Log Grid',
  livePlotter: 'Real-Time SVG Plotter',
  transmitter: 'Message Transmitter Console',
  diagnostics: 'Protocol Diagnostics Console',
  falseSender: 'False CAN oscillo-simulator'
};

interface PanelContainerProps {
  panelKey: string;
  children: React.ReactNode;
}

const PanelContainer: React.FC<PanelContainerProps> = ({ panelKey, children }) => {
  const {
    isEditingLayout,
    panelWidths,
    setPanelWidth,
    setPanelHeight,
    setPanelPosition,
    panelPositions,
    togglePanelVisibility,
    panelOrder,
    setPanelOrder,
    activeDragKey,
    setActiveDragKey,
    dragOverTargetKey,
    setDragOverTargetKey,
    setDragOverZone
  } = useStore();

  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', panelKey);
    e.dataTransfer.effectAllowed = 'move';
    // Defer setting activeDragKey to avoid synchronous DOM re-render that cancels drag in some WebViews/browsers.
    setTimeout(() => {
      setActiveDragKey(panelKey);
    }, 0);
  };

  const handleDragEnd = () => {
    setActiveDragKey(null);
    setDragOverTargetKey(null);
    setDragOverZone(null);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (activeDragKey && activeDragKey !== panelKey) {
      setDragOverTargetKey(panelKey);
    }
  };

  const handleDragLeave = () => {
    if (dragOverTargetKey === panelKey) {
      setDragOverTargetKey(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceKey = activeDragKey || e.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === panelKey) return;

    // 1. Update position zone of the dragged panel to match target panel
    const targetZone = panelPositions[panelKey] || 'sidebar';
    setPanelPosition(sourceKey, targetZone);

    // 2. Reorder panelOrder list
    const newOrder = [...panelOrder];
    const sourceIdx = newOrder.indexOf(sourceKey);
    const targetIdx = newOrder.indexOf(panelKey);

    if (sourceIdx !== -1 && targetIdx !== -1) {
      newOrder.splice(sourceIdx, 1);
      const nextTargetIdx = newOrder.indexOf(panelKey);
      newOrder.splice(nextTargetIdx, 0, sourceKey);
      setPanelOrder(newOrder);
    }

    setActiveDragKey(null);
    setDragOverTargetKey(null);
    setDragOverZone(null);
  };

  const startResizeWidth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const container = containerRef.current;
    if (!container) return;

    const parent = container.parentElement?.parentElement;
    if (!parent) return;

    const parentWidth = parent.getBoundingClientRect().width;
    const colWidth = parentWidth / 12; // 12-column grid
    const startSpan = panelWidths[panelKey] || 6;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const spanDelta = Math.round(deltaX / colWidth);
      const newSpan = Math.max(2, Math.min(12, startSpan + spanDelta));
      setPanelWidth(panelKey, newSpan);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const startResizeHeight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const container = containerRef.current;
    if (!container) return;

    const startHeight = container.getBoundingClientRect().height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(120, startHeight + deltaY);
      setPanelHeight(panelKey, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const position = panelPositions[panelKey] || 'sidebar';
  const showWidthHandle = position !== 'sidebar';
  const isDraggingThis = activeDragKey === panelKey;
  const isDragOverThis = dragOverTargetKey === panelKey;

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-panel-key={panelKey}
      className={`relative h-full w-full transition-all duration-200 rounded-xl ${
        isEditingLayout
          ? `border-2 p-2 ${
              isDraggingThis
                ? 'opacity-40 border-dashed border-cyber-accent/40 bg-cyber-accent/5 z-0'
                : isDragOverThis
                  ? 'border-solid border-cyber-accent bg-cyber-accent/10 shadow-[0_0_15px_rgba(16,185,129,0.3)] z-50'
                  : 'border-dashed border-cyber-accent/30 bg-black/10 shadow-[0_0_10px_rgba(16,185,129,0.03)] hover:border-cyber-accent/80 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] z-10'
            }`
          : 'z-10'
      }`}
    >
      {/* Edit Header Bar */}
      {isEditingLayout && (
        <div
          data-drag-handle={panelKey}
          className={`flex items-center justify-between bg-[var(--bg-card-sub)] border border-[var(--border-color)] px-2.5 py-1.5 rounded-lg mb-2 text-[10px] font-bold select-none transition-colors ${
            isDraggingThis ? 'cursor-grabbing' : 'cursor-grab hover:bg-black/10'
          }`}
          draggable={true}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-center gap-1.5 min-w-0 pointer-events-none">
            <GripHorizontal className="w-3.5 h-3.5 text-cyber-accent shrink-0" />
            <span className="truncate text-[var(--text-color)]">{PANEL_NAMES[panelKey]}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => togglePanelVisibility(panelKey)}
              className="p-0.5 hover:bg-red-500/10 hover:text-red-400 rounded transition-colors"
              title="Close Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Panel Contents */}
      <div className={isEditingLayout ? 'h-[calc(100%-34px)] overflow-hidden pointer-events-none' : 'h-full'}>
        {children}
      </div>

      {/* Resize Handles */}
      {isEditingLayout && !isDraggingThis && (
        <>
          {/* Right drag handle */}
          {showWidthHandle && (
            <div
              onMouseDown={startResizeWidth}
              className="absolute -right-1.5 top-0 w-3 h-full cursor-col-resize z-50 hover:bg-cyber-accent/25 active:bg-cyber-accent/50 transition-colors"
              title="Drag right edge to adjust width (snaps to grid)"
            />
          )}
          {/* Bottom drag handle */}
          <div
            onMouseDown={startResizeHeight}
            className="absolute left-0 -bottom-1.5 w-full h-3 cursor-row-resize z-50 hover:bg-cyber-accent/25 active:bg-cyber-accent/50 transition-colors"
            title="Drag bottom edge to adjust height"
          />
        </>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const {
    visiblePanels,
    panelPositions,
    panelWidths,
    panelHeights,
    panelOrder,
    theme,
    isEditingLayout,
    activeDragKey,
    togglePanelVisibility,
    setPanelPosition,
    setActiveDragKey,
    setDragOverTargetKey,
    dragOverZone,
    setDragOverZone
  } = useStore();

  const [activeWorkspaceTab, setActiveWorkspaceTab] = React.useState<'monitor' | 'dbc'>('monitor');

  // Sync html element theme classes
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      }
    }
  }, [theme]);

  // Check for app updates once on startup (no-op outside Tauri)
  React.useEffect(() => {
    checkForUpdates({ silent: true });
  }, []);

  const PANEL_COMPONENTS: Record<string, React.ReactNode> = {
    deviceManager: <DeviceManager />,
    liveViewer: <LiveViewer />,
    livePlotter: <LivePlotter />,
    transmitter: <CanTransmitter />,
    diagnostics: <ProtocolDiagnostics />,
    falseSender: <FalseCanSender />
  };

  const sortedKeys = [...panelOrder].filter(key => visiblePanels[key] && PANEL_COMPONENTS[key]);

  const sidebarKeys = sortedKeys.filter(key => panelPositions[key] === 'sidebar');
  const mainTopKeys = sortedKeys.filter(key => panelPositions[key] === 'main-top');
  const mainBottomKeys = sortedKeys.filter(key => panelPositions[key] === 'main-bottom');

  const hasSidebar = sidebarKeys.length > 0;
  const hasTop = mainTopKeys.length > 0;
  const hasBottom = mainBottomKeys.length > 0;

  // grid-cols layout based on whether we have a sidebar or not
  const mainGridCols = (hasSidebar || isEditingLayout) ? 'grid-cols-[330px_1fr]' : 'grid-cols-1';

  const handleZoneDragOver = (e: React.DragEvent, zone: 'sidebar' | 'main-top' | 'main-bottom') => {
    e.preventDefault();
    if (dragOverZone !== zone) {
      setDragOverZone(zone);
    }
  };

  const handleZoneDragLeave = () => {
    setDragOverZone(null);
  };

  const handleZoneDrop = (e: React.DragEvent, zone: 'sidebar' | 'main-top' | 'main-bottom') => {
    e.preventDefault();
    setDragOverZone(null);
    const sourceKey = activeDragKey || e.dataTransfer.getData('text/plain');
    if (sourceKey) {
      setPanelPosition(sourceKey, zone);
    }
    setActiveDragKey(null);
    setDragOverTargetKey(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* 1. Header connection bar */}
      <Header />

      {/* Connection Error Modal Overlay */}
      <ConnectionErrorModal />

      {/* Workspace Tab Bar */}
      <div className="flex px-6 pt-2 gap-2 border-b border-[var(--border-color)] bg-black/5 backdrop-blur-md">
        <button
          onClick={() => setActiveWorkspaceTab('monitor')}
          className={`flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all duration-150 ${
            activeWorkspaceTab === 'monitor'
              ? 'bg-[var(--bg-card)] text-[var(--text-color)] border-[var(--border-color)] shadow-sm'
              : 'bg-transparent text-[var(--text-muted)] border-transparent hover:text-[var(--text-color)]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Live Monitor Workspace</span>
        </button>
        <button
          onClick={() => setActiveWorkspaceTab('dbc')}
          className={`flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all duration-150 ${
            activeWorkspaceTab === 'dbc'
              ? 'bg-[var(--bg-card)] text-[var(--text-color)] border-[var(--border-color)] shadow-sm'
              : 'bg-transparent text-[var(--text-muted)] border-transparent hover:text-[var(--text-color)]'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>DBC Database Manager</span>
        </button>
      </div>

      {/* 2. Workspace container */}
      <main className="flex-1 overflow-hidden min-h-0 flex flex-col relative">
        {activeWorkspaceTab === 'dbc' ? (
          <div className="flex-1 p-4 overflow-hidden min-h-0">
            <DbcManager />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className={`flex-1 overflow-auto grid ${mainGridCols} gap-4 p-4 min-h-0`}>
              {/* Sidebar zone */}
              {hasSidebar || isEditingLayout ? (
                <section
                  onDragOver={(e) => handleZoneDragOver(e, 'sidebar')}
                  onDragLeave={handleZoneDragLeave}
                  onDrop={(e) => handleZoneDrop(e, 'sidebar')}
                  className={`flex flex-col gap-4 overflow-y-auto overflow-x-hidden p-2 rounded-xl transition-all duration-200 border-2 ${
                    isEditingLayout
                      ? dragOverZone === 'sidebar'
                        ? 'border-cyber-accent border-solid bg-cyber-accent/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        : 'border-dashed border-[var(--border-color)] bg-black/5'
                      : 'border-transparent'
                  }`}
                  style={{ minWidth: isEditingLayout && !hasSidebar ? '300px' : 'auto' }}
                >
                  {sidebarKeys.map(key => (
                    <div
                      key={key}
                      className="overflow-hidden shrink-0"
                      style={{
                        height: panelHeights[key] ? `${panelHeights[key]}px` : 'auto',
                        minHeight: '120px'
                      }}
                    >
                      <PanelContainer panelKey={key}>
                        {PANEL_COMPONENTS[key]}
                      </PanelContainer>
                    </div>
                  ))}
                  {isEditingLayout && sidebarKeys.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-center p-4 border border-dashed border-[var(--border-color)] rounded-lg text-[10px] text-[var(--text-muted)] italic">
                      Drag panels here to place in Sidebar
                    </div>
                  )}
                </section>
              ) : null}

              {/* Main dashboard columns */}
              {(hasTop || hasBottom || isEditingLayout) ? (
                <section className={`flex flex-col gap-4 p-1 min-h-0 ${!isEditingLayout && sortedKeys.length === 1 ? 'h-full overflow-hidden' : 'overflow-y-auto'}`}>
                  {/* Top zone */}
                  {(hasTop || isEditingLayout) && (
                    <div
                      onDragOver={(e) => handleZoneDragOver(e, 'main-top')}
                      onDragLeave={handleZoneDragLeave}
                      onDrop={(e) => handleZoneDrop(e, 'main-top')}
                      className={!isEditingLayout && sortedKeys.length === 1
                        ? "h-full w-full flex flex-col border-transparent"
                        : `grid grid-cols-12 gap-4 p-2 rounded-xl transition-all duration-200 border-2 ${
                            isEditingLayout
                              ? dragOverZone === 'main-top'
                                ? 'border-cyber-accent border-solid bg-cyber-accent/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                                : 'border-dashed border-[var(--border-color)] bg-black/5'
                              : 'border-transparent'
                          }`
                      }
                      style={{
                        flex: hasBottom ? '1.2' : '1',
                        minHeight: isEditingLayout && mainTopKeys.length === 0 ? '120px' : 'auto'
                      }}
                    >
                      {mainTopKeys.map(key => {
                        const isSingleInZone = mainTopKeys.length === 1;
                        const isSingleOverall = sortedKeys.length === 1;
                        const span = isSingleInZone ? 12 : (panelWidths[key] || 6);
                        const height = panelHeights[key];
                        
                        const itemStyle = isSingleOverall
                          ? (isEditingLayout
                              ? { gridColumn: 'span 12 / span 12', height: '100%', width: '100%' }
                              : { width: '100%', height: '100%', flex: 1 })
                          : {
                              gridColumn: `span ${span} / span ${span}`,
                              height: height ? `${height}px` : 'auto',
                              minHeight: '120px'
                            };

                        return (
                          <div
                            key={key}
                            className="overflow-hidden"
                            style={itemStyle}
                          >
                            <PanelContainer panelKey={key}>
                              {PANEL_COMPONENTS[key]}
                            </PanelContainer>
                          </div>
                        );
                      })}
                      {isEditingLayout && mainTopKeys.length === 0 && (
                        <div className="col-span-12 flex items-center justify-center text-center p-6 border border-dashed border-[var(--border-color)] rounded-lg text-[10px] text-[var(--text-muted)] italic">
                          Drag panels here to place in Dashboard Top
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom zone */}
                  {(hasBottom || isEditingLayout) && (
                    <div
                      onDragOver={(e) => handleZoneDragOver(e, 'main-bottom')}
                      onDragLeave={handleZoneDragLeave}
                      onDrop={(e) => handleZoneDrop(e, 'main-bottom')}
                      className={`grid grid-cols-12 gap-4 p-2 rounded-xl transition-all duration-200 border-2 ${
                        isEditingLayout
                          ? dragOverZone === 'main-bottom'
                            ? 'border-cyber-accent border-solid bg-cyber-accent/10 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                            : 'border-dashed border-[var(--border-color)] bg-black/5'
                          : 'border-transparent'
                      }`}
                      style={{
                        flex: '1',
                        minHeight: isEditingLayout && mainBottomKeys.length === 0 ? '120px' : 'auto'
                      }}
                    >
                      {mainBottomKeys.map(key => {
                        const isSingleInZone = mainBottomKeys.length === 1;
                        const span = isSingleInZone ? 12 : (panelWidths[key] || 6);
                        const height = panelHeights[key];
                        return (
                          <div
                            key={key}
                            className="overflow-hidden"
                            style={{
                              gridColumn: `span ${span} / span ${span}`,
                              height: height ? `${height}px` : 'auto',
                              minHeight: '120px'
                            }}
                          >
                            <PanelContainer panelKey={key}>
                              {PANEL_COMPONENTS[key]}
                            </PanelContainer>
                          </div>
                        );
                      })}
                      {isEditingLayout && mainBottomKeys.length === 0 && (
                        <div className="col-span-12 flex items-center justify-center text-center p-6 border border-dashed border-[var(--border-color)] rounded-lg text-[10px] text-[var(--text-muted)] italic">
                          Drag panels here to place in Dashboard Bottom
                        </div>
                      )}
                    </div>
                  )}
                </section>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-8 glass-panel h-full w-full">
                  <span className="text-sm text-[var(--text-muted)] font-medium">
                    No panels are currently visible. Click "Edit Layout" in the header to customize panels.
                  </span>
                </div>
              )}
            </div>

            {/* Layout Toggle Dock */}
            {isEditingLayout && (
              <div className="mx-4 mb-4 p-3 glass-panel bg-[var(--bg-card)] border-dashed border-cyber-accent/30 flex items-center justify-between gap-4 animate-fade-in z-30 shrink-0">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-cyber-accent" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-color)]">
                    Add / Remove Panels
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(PANEL_NAMES).map(([key, label]) => {
                    const isVisible = visiblePanels[key];
                    return (
                      <button
                        key={key}
                        onClick={() => togglePanelVisibility(key)}
                        className={`px-3 py-1.5 rounded text-[11px] font-semibold border flex items-center gap-1.5 transition-all duration-150 active:scale-95 ${
                          isVisible
                            ? 'bg-cyber-accent/15 border-cyber-accent/30 text-cyber-accent'
                            : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <span className="text-xs font-bold">{isVisible ? '✓' : '+'}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
