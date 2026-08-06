import React from 'react';
import { useAppStore } from './store/appStore';
import { TopNav } from './components/TopNav';
import { DataTableTab } from './components/DataTableTab';
import { CalculationWorkspaceTab } from './calc-workspace/CalculationWorkspaceTab';
import WorkspaceHandoffBridge from './calc-workspace/WorkspaceHandoffBridge';
import { CalcExtendedTab } from './calc-extended/components/CalcExtendedTab';
import { Viewer3DTab } from './components/Viewer3DTab';
import SketcherTab from './sketcher/SketcherTab';
import { AnalysisTab } from './3d-analysis';
import { PreFeaInputCheckerTab } from './pre-fea-checker/PreFeaInputCheckerTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

import { ReportsTab } from './reporting/ReportsTab';
import { SettingsTab } from './settings/SettingsTab';
import { ConfigTab } from './config/ConfigTab';
import { BenchmarksValidationTab } from './components/BenchmarksValidationTab';

function App() {
  const activeTab = useAppStore(state => state.activeTab);

  // Expose store for e2e testing
  if (typeof window !== 'undefined') {
    window.useAppStore = useAppStore;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif', background: '#0f172a' }}>
      <TopNav />
      <WorkspaceHandoffBridge />

      {activeTab === 'home' && <ErrorBoundary><Viewer3DTab /></ErrorBoundary>}
      {(activeTab === 'workspace' || activeTab === 'load-calc') && <ErrorBoundary><CalculationWorkspaceTab /></ErrorBoundary>}
      {activeTab === 'pcf' && <DataTableTab />}
      {activeTab === 'pre-fea-check' && <ErrorBoundary><PreFeaInputCheckerTab /></ErrorBoundary>}
      {activeTab === 'sketcher' && <ErrorBoundary><SketcherTab /></ErrorBoundary>}
      {activeTab === 'simpAnalysis' && <ErrorBoundary><CalcExtendedTab /></ErrorBoundary>}
      {activeTab === '3d-analysis' && <ErrorBoundary><AnalysisTab /></ErrorBoundary>}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'benchmarks' && <BenchmarksValidationTab />}
      {activeTab === 'settings' && <SettingsTab />}
      {activeTab === 'diagnostics' && <ConfigTab />}
    </div>
  );
}

export default App;
