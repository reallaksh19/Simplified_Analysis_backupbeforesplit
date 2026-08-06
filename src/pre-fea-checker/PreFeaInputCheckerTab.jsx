import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store/appStore.js';
import {
  NON_FEA_METHOD,
  createEnrichedStagedJsonExport,
  createPreFeaWorkspacePreview,
} from '../core/pre-fea-piping-checker/index.js';
import './PreFeaInputCheckerTab.css';

const METHOD_LABELS = Object.freeze({
  [NON_FEA_METHOD.WEIGHT_AND_GRAVITY]: 'Weight & gravity',
  [NON_FEA_METHOD.SUSTAINED_REACTIONS]: 'Sustained reactions',
  [NON_FEA_METHOD.SUSTAINED_MEMBER_ACTIONS]: 'Sustained member actions',
  [NON_FEA_METHOD.SUSTAINED_STRESS]: 'Sustained stress',
  [NON_FEA_METHOD.THERMAL_FREE_DISPLACEMENT]: 'Thermal free displacement',
  [NON_FEA_METHOD.RESTRAINT_REACTIONS]: 'Restraint reactions',
  [NON_FEA_METHOD.VERTICAL_CONTACT]: 'Vertical contact',
  [NON_FEA_METHOD.COMBINED_OPERATING_REACTION]: 'Combined operating reaction',
  [NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT]: 'Enriched staged JSON',
});

const DEFAULT_METHODS = Object.freeze(Object.values(NON_FEA_METHOD));

export function PreFeaInputCheckerTab() {
  const canonicalGeometry = useAppStore((state) => state.activeCanonicalGeometry);
  const components = useAppStore((state) => state.components);
  const pcfText = useAppStore((state) => state.pcfText);
  const engineeringDefaults = useAppStore((state) => state.engineeringDefaults);
  const [selectedMethods, setSelectedMethods] = useState(DEFAULT_METHODS);
  const [refreshSequence, setRefreshSequence] = useState(0);

  const preview = useMemo(() => {
    try {
      return createPreFeaWorkspacePreview({
        canonicalGeometry,
        components,
        sourceText: pcfText,
        engineeringDefaults,
        requestedMethods: selectedMethods,
      });
    } catch (error) {
      return {
        schema: 'pre-fea-workspace-preview/error',
        status: 'BLOCKED_RUNTIME',
        summary: {},
        diagnostics: [{
          code: 'PRE_FEA_PREVIEW_FAILED',
          severity: 'ERROR',
          message: error instanceof Error ? error.message : String(error),
        }],
        report: null,
        commonInput: null,
        fieldResolutions: [],
      };
    }
  }, [canonicalGeometry, components, pcfText, engineeringDefaults, selectedMethods, refreshSequence]);

  const readinessRows = preview.report?.methodReadiness || [];
  const gateRows = preview.report?.gates || [];
  const blockedRows = (preview.fieldResolutions || []).filter((row) => row.authorityLevel === 'BLOCK');
  const hasGeometry = Number(preview.summary?.positionCount || 0) > 0;

  function toggleMethod(methodId) {
    setSelectedMethods((current) => {
      const next = current.includes(methodId)
        ? current.filter((row) => row !== methodId)
        : [...current, methodId];
      return next.length ? next.sort() : [NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT];
    });
  }

  function exportEvidence() {
    if (!preview.report) return;
    downloadJson('non-fea-preflight-evidence.json', {
      schema: preview.schema,
      status: preview.status,
      summary: preview.summary,
      diagnostics: preview.diagnostics,
      report: preview.report,
      sourceGeometryHash: preview.sourceGeometryHash,
    });
  }

  function exportStagedInput() {
    if (!preview.commonInput || !preview.report) return;
    const staged = createEnrichedStagedJsonExport({ commonInput: preview.commonInput, report: preview.report });
    downloadText('non-fea-enriched-staged-input.json', staged.content, 'application/json');
  }

  return (
    <div className="pfc-root" data-testid="pre-fea-input-checker">
      <header className="pfc-header">
        <div>
          <div className="pfc-title-row">
            <ShieldCheck size={22} />
            <h1>Governed Piping Input Checker</h1>
            <span className="pfc-scope-badge" data-testid="pre-fea-scope-badge">NON-FEA ONLY</span>
          </div>
          <p>Checks source topology, engineering authority, method readiness, qualification and seal evidence without creating an FEA model.</p>
        </div>
        <div className="pfc-actions">
          <button type="button" onClick={() => setRefreshSequence((value) => value + 1)}><RefreshCw size={14} /> Refresh</button>
          <button type="button" onClick={exportEvidence} disabled={!preview.report}><Download size={14} /> Evidence JSON</button>
          <button type="button" onClick={exportStagedInput} disabled={!preview.commonInput}><Download size={14} /> Staged Input</button>
        </div>
      </header>

      <section className="pfc-scope-note">
        <strong>Scope boundary:</strong> no mesh, stiffness matrix, shell/continuum model, FEA solver or FEA result processing is invoked by this view.
      </section>

      <section className="pfc-status-strip">
        <div className={`pfc-status pfc-status-${statusClass(preview.status)}`} data-testid="pre-fea-status">
          <span>Preflight state</span>
          <strong>{preview.status}</strong>
        </div>
        {metric('POS', preview.summary?.positionCount, 'pre-fea-position-count')}
        {metric('Branches', preview.summary?.branchCount)}
        {metric('Exact supports', preview.summary?.supportCount)}
        {metric('Blocked fields', preview.summary?.blockedFieldCount)}
        {metric('Ready methods', preview.summary?.readyMethodCount)}
      </section>

      <main className="pfc-grid">
        <section className="pfc-panel pfc-method-panel" data-testid="pre-fea-methods">
          <div className="pfc-panel-heading">
            <div>
              <h2>Requested Non-FEA methods</h2>
              <p>Readiness is independent by method and bound to qualification evidence.</p>
            </div>
          </div>
          <div className="pfc-method-selector">
            {DEFAULT_METHODS.map((methodId) => (
              <label key={methodId}>
                <input
                  type="checkbox"
                  checked={selectedMethods.includes(methodId)}
                  onChange={() => toggleMethod(methodId)}
                />
                <span>{METHOD_LABELS[methodId]}</span>
              </label>
            ))}
          </div>
          <div className="pfc-table-wrap">
            <table>
              <thead><tr><th>Method</th><th>Readiness</th><th>Qualification basis</th><th>Blocking evidence</th></tr></thead>
              <tbody>
                {readinessRows.filter((row) => selectedMethods.includes(row.methodId)).map((row) => (
                  <tr key={row.methodId}>
                    <td>{METHOD_LABELS[row.methodId] || row.methodId}</td>
                    <td><span className={`pfc-chip pfc-chip-${statusClass(row.readinessState)}`}>{row.readinessState}</span></td>
                    <td>{row.qualificationBasis}</td>
                    <td>{row.blockingFieldKeys.length ? row.blockingFieldKeys.join(', ') : row.blockers.map((item) => item.code).join(', ') || '—'}</td>
                  </tr>
                ))}
                {!readinessRows.length && <tr><td colSpan="4">Load structural geometry to evaluate method readiness.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pfc-panel" data-testid="pre-fea-gates">
          <div className="pfc-panel-heading">
            <div><h2>Eight-gate preflight</h2><p>All gates are immutable evidence records.</p></div>
          </div>
          <div className="pfc-gates">
            {gateRows.map((gate) => (
              <article key={gate.gateId} className={`pfc-gate pfc-gate-${statusClass(gate.state)}`}>
                <div><strong>{gate.gateId}</strong><span>{gate.state}</span></div>
                <p>{gate.message}</p>
              </article>
            ))}
            {!gateRows.length && <div className="pfc-empty" data-testid="pre-fea-empty">No seal transaction exists because no valid structural package is loaded.</div>}
          </div>
        </section>

        <section className="pfc-panel">
          <div className="pfc-panel-heading">
            <div><h2>Blocked or unresolved fields</h2><p>Missing values remain missing; zero remains a valid explicit value.</p></div>
            <strong>{blockedRows.length}</strong>
          </div>
          <div className="pfc-table-wrap pfc-blocked-table">
            <table>
              <thead><tr><th>Target</th><th>Field</th><th>Status</th><th>Diagnostic</th></tr></thead>
              <tbody>
                {blockedRows.slice(0, 250).map((row) => (
                  <tr key={`${row.targetKind}:${row.targetId}:${row.field}`}>
                    <td>{row.targetKind}:{row.targetId}</td>
                    <td>{row.field}</td>
                    <td>{row.status}</td>
                    <td>{row.diagnostics.map((item) => item.code).join(', ')}</td>
                  </tr>
                ))}
                {!blockedRows.length && <tr><td colSpan="4">{hasGeometry ? 'No blocked field records.' : 'No geometry loaded.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pfc-panel">
          <div className="pfc-panel-heading"><div><h2>Topology and attachment diagnostics</h2><p>No proximity repair or support snapping is performed.</p></div></div>
          <div className="pfc-diagnostics">
            {(preview.diagnostics || []).map((row, index) => (
              <article key={`${row.code}-${row.supportId || index}`}>
                <span className={`pfc-chip pfc-chip-${statusClass(row.severity)}`}>{row.severity}</span>
                <div><strong>{row.code}</strong><p>{row.message}</p></div>
              </article>
            ))}
            {!(preview.diagnostics || []).length && <div className="pfc-empty">No topology or attachment diagnostics.</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

function metric(label, value, testId) {
  return (
    <div className="pfc-metric" data-testid={testId}>
      <span>{label}</span>
      <strong>{Number(value || 0)}</strong>
    </div>
  );
}

function statusClass(value) {
  const token = String(value || '').toUpperCase();
  if (['READY', 'PASSED', 'VALID', 'INFO'].includes(token)) return 'ready';
  if (token.includes('PARTIAL') || token.includes('WARNING')) return 'warning';
  if (token.includes('NOT_REQUESTED') || token.includes('EMPTY')) return 'neutral';
  return 'blocked';
}

function downloadJson(fileName, value) {
  downloadText(fileName, `${JSON.stringify(value, null, 2)}\n`, 'application/json');
}

function downloadText(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
