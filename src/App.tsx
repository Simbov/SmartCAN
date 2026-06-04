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

import { Activity, Database } from 'lucide-react';

const App: React.FC = () => {
  const { visiblePanels, panelPositions, theme } = useStore();
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

  const sidebarKeys = Object.keys(PANEL_COMPONENTS).filter(
    key => visiblePanels[key] && panelPositions[key] === 'sidebar'
  );
  const mainTopKeys = Object.keys(PANEL_COMPONENTS).filter(
    key => visiblePanels[key] && panelPositions[key] === 'main-top'
  );
  const mainBottomKeys = Object.keys(PANEL_COMPONENTS).filter(
    key => visiblePanels[key] && panelPositions[key] === 'main-bottom'
  );

  const hasSidebar = sidebarKeys.length > 0;
  const hasTop = mainTopKeys.length > 0;
  const hasBottom = mainBottomKeys.length > 0;

  // grid-cols layout based on whether we have a sidebar or not
  const mainGridCols = hasSidebar ? 'grid-cols-[330px_1fr]' : 'grid-cols-1';

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
      <main className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {activeWorkspaceTab === 'dbc' ? (
          <div className="flex-1 p-4 overflow-hidden min-h-0">
            <DbcManager />
          </div>
        ) : (
          <div className={`flex-1 overflow-hidden grid ${mainGridCols} gap-4 p-4 min-h-0`}>
            {hasSidebar && (
              <section className="flex flex-col gap-4 overflow-hidden min-h-0">
                {sidebarKeys.map(key => (
                  <div key={key} className="flex-1 min-h-[150px] overflow-hidden">
                    {PANEL_COMPONENTS[key]}
                  </div>
                ))}
              </section>
            )}

            {(hasTop || hasBottom) ? (
              <section className="flex flex-col gap-4 overflow-hidden min-h-0">
                {hasTop && (
                  <div 
                    className="grid gap-4 overflow-hidden min-h-0"
                    style={{
                      gridTemplateColumns: `repeat(${mainTopKeys.length}, minmax(0, 1fr))`,
                      flex: hasBottom ? '1.2' : '1',
                      height: hasBottom ? 'auto' : '100%'
                    }}
                  >
                    {mainTopKeys.map(key => (
                      <div key={key} className="overflow-hidden h-full">
                        {PANEL_COMPONENTS[key]}
                      </div>
                    ))}
                  </div>
                )}

                {hasBottom && (
                  <div 
                    className="grid gap-4 overflow-hidden min-h-0"
                    style={{
                      gridTemplateColumns: `repeat(${mainBottomKeys.length}, minmax(0, 1fr))`,
                      flex: '1',
                      height: hasTop ? 'auto' : '100%'
                    }}
                  >
                    {mainBottomKeys.map(key => (
                      <div key={key} className="overflow-hidden h-full">
                        {PANEL_COMPONENTS[key]}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-8 glass-panel h-full w-full">
                <span className="text-sm text-[var(--text-muted)] font-medium">
                  No panels are currently visible. Click "Customize Layout" in the header to show panels.
                </span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
