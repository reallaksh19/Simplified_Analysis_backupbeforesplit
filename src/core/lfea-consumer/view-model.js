import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { LFEA_CONSUMER_VIEW_MODEL_SCHEMA, LFEA_CONSUMER_STATUSES } from './constants.js';
import { createTablePage } from './pagination.js';
import { compareLfeaIdentity, lfeaSelectionIdentity } from './selection.js';
import { LFEA_TABLE_IDS } from './session.js';

const VIEW_MODEL_KEYS = Object.freeze([
  'schema','status','sourceIdentity','sourceSemanticHash','authoritySummary','analysisSummary',
  'qualificationSummary','solverSummary','geometry','loads','constraints','displacements','reactions',
  'rawStress','projectedStress','convergence','diagnostics','limitations','suppliedFiles','selection',
  'display','semanticHash',
]);

export function createLfeaConsumerViewModel(bundle, session, profile) {
  if (!bundle?.review) throw new TypeError('Qualified LFEA source bundle is required.');
  const review = bundle.review;
  const tableRows = rowsFor(review, bundle.suppliedFiles || []);
  const tables = Object.fromEntries(LFEA_TABLE_IDS.map((id) => [
    id,
    createTablePage(tableRows[id] || [], session.tablePages[id], profile.tablePageSize),
  ]));
  const base = {
    schema: LFEA_CONSUMER_VIEW_MODEL_SCHEMA,
    status: LFEA_CONSUMER_STATUSES.QUALIFIED,
    sourceIdentity: bundle.export?.exportIdentity || review.reviewIdentity,
    sourceSemanticHash: bundle.export?.semanticHash || review.semanticHash,
    authoritySummary: {
      reviewIdentity: review.reviewIdentity,
      reviewSemanticHash: review.semanticHash,
      rawStressAuthority: review.rawStressReview.authority,
      projectedStressAuthority: review.projectedStressReview.authority,
      geometryAuthority: review.geometryReview.authority,
      engineeringClaimPolicy: 'QUALIFIED_LFEA_REVIEW_EVIDENCE_ONLY',
      modelSummary: review.modelSummary,
    },
    analysisSummary: review.analysisSummary,
    qualificationSummary: review.qualificationSummary,
    solverSummary: review.solverSummary,
    geometry: review.geometryReview,
    loads: review.loadReview,
    constraints: review.constraintReview,
    displacements: review.displacementReview,
    reactions: review.reactionReview,
    rawStress: review.rawStressReview,
    projectedStress: review.projectedStressReview,
    convergence: review.convergenceReview,
    diagnostics: sortDiagnostics(review.diagnostics),
    limitations: [...review.limitations],
    suppliedFiles: (bundle.suppliedFiles || []).map(fileSummary),
    selection: session.selectedRecord,
    display: {
      activeSection: session.activeSection,
      resultMode: session.resultMode,
      stressComponent: session.stressComponent,
      layerVisibility: session.layerVisibility,
      deformationScale: review.geometryReview?.deformationScale
        ?? review.geometryReview?.extents?.deformationScale
        ?? null,
      tables,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function refreshLfeaConsumerViewModel(bundle, session, profile) {
  return createLfeaConsumerViewModel(bundle, session, profile);
}

export function validateLfeaConsumerViewModel(value) {
  const errors = [];
  try {
    assertRecord(value, 'LFEA consumer view model');
    exactKeys(value, VIEW_MODEL_KEYS, 'LFEA consumer view model');
    if (value.schema !== LFEA_CONSUMER_VIEW_MODEL_SCHEMA) throw new TypeError('Invalid lfea-consumer-view-model/v1 schema.');
    if (value.status !== LFEA_CONSUMER_STATUSES.QUALIFIED) throw new TypeError('LFEA view model must be qualified.');
    text(value.sourceIdentity, 'sourceIdentity');
    text(value.sourceSemanticHash, 'sourceSemanticHash');
    if (!Array.isArray(value.diagnostics) || !Array.isArray(value.limitations) || !Array.isArray(value.suppliedFiles)) throw new TypeError('LFEA view-model collections are invalid.');
    assertRecord(value.display, 'LFEA view-model display');
    assertRecord(value.display.tables, 'LFEA view-model tables');
    exactKeys(value.display.tables, LFEA_TABLE_IDS, 'LFEA view-model tables');
    if (value.semanticHash !== semanticHash(withoutHash(value))) throw new TypeError('LFEA consumer view-model semantic hash mismatch.');
  } catch (error) {
    errors.push(error.message);
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function resolveLfeaSelection(viewModel, selection) {
  if (selection === null) return null;
  if (!viewModel || !selection || typeof selection !== 'object') return null;
  const rows = allRows(viewModel);
  return rows.find((row) => row.type === selection.type && row.identity === selection.identity)?.value || null;
}

function allRows(model) {
  const rows = [];
  for (const row of model.geometry.nodes || []) rows.push(selected('NODE', row));
  for (const row of model.geometry.elements || []) rows.push(selected('ELEMENT', row));
  for (const row of [...(model.loads.nodalForces || []), ...(model.loads.edgeTractions || []), ...(model.loads.edgePressures || [])]) rows.push(selected('LOAD', row));
  for (const row of model.constraints.rows || []) rows.push(selected('CONSTRAINT', row));
  for (const row of model.reactions.rows || []) rows.push(selected('REACTION', row));
  for (const row of model.rawStress.rows || []) rows.push(selected('RAW_STRESS_LOCATION', row));
  for (const row of [...(model.projectedStress.elementCornerValues || []), ...(model.projectedStress.nodalValues || [])]) rows.push(selected('PROJECTED_STRESS_LOCATION', row));
  for (const row of [...(model.convergence.levels || []), ...(model.convergence.quantities || [])]) rows.push(selected('CONVERGENCE_QUANTITY', row));
  for (const row of model.suppliedFiles || []) rows.push(selected('SUPPLIED_FILE', row));
  return rows;
}

function rowsFor(review, files) {
  return {
    nodes: review.geometryReview.nodes,
    elements: review.geometryReview.elements,
    loads: [...review.loadReview.nodalForces, ...review.loadReview.edgeTractions, ...review.loadReview.edgePressures],
    constraints: review.constraintReview.rows,
    displacements: review.displacementReview.rows,
    reactions: review.reactionReview.rows,
    rawStress: review.rawStressReview.rows,
    qualification: review.qualificationSummary.rows,
    diagnostics: sortDiagnostics(review.diagnostics),
    projectedStress: [...review.projectedStressReview.elementCornerValues, ...review.projectedStressReview.nodalValues],
    convergence: [...review.convergenceReview.levels, ...review.convergenceReview.quantities],
    suppliedFiles: [...files].sort((a, b) => compareLfeaIdentity(a.path, b.path)).map(fileSummary),
  };
}

function fileSummary(file) {
  return deepFreeze({
    path: file.path,
    mediaType: file.mediaType,
    encoding: file.encoding,
    contentHash: file.contentHash,
    byteLength: file.byteLength,
    authority: file.authority,
    sourceArtifactIdentities: file.sourceArtifactIdentities,
    rowCount: file.rowCount ?? null,
  });
}
function sortDiagnostics(rows) { const order=new Map([['ERROR',0],['WARNING',1],['INFORMATION',2]]);return [...rows].sort((a,b)=>(order.get(a.severity)??99)-(order.get(b.severity)??99)||compareLfeaIdentity(canonicalStringify(a),canonicalStringify(b))); }
function selected(type, value) { return { type, identity:lfeaSelectionIdentity(type, value), value }; }
function withoutHash(value) { const { semanticHash: _hash, ...base } = value || {}; return base; }
function assertRecord(value,name){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(`${name} must be a record.`);}
function exactKeys(value,keys,name){const actual=Object.keys(value).sort(),expected=[...keys].sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw new TypeError(`${name} keys are not closed.`);}
function text(value,name){if(typeof value!=='string'||!value.trim())throw new TypeError(`${name} must be non-empty text.`);}
