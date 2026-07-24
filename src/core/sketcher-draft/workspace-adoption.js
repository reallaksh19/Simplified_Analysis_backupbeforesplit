import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { SKETCHER_LENGTH_TOLERANCE_MM, SKETCHER_WORKSPACE_ADOPTION_SCHEMA, SKETCHER_WORKSPACE_PACKAGE_SCHEMA } from './constants.js';
import { createSketcherTopologyAudit } from './topology.js';
import { validateSketcherDraftDocument } from './validation.js';

export function createSketcherWorkspacePackage(document) {
  const validation = validateSketcherDraftDocument(document);
  if (!validation.ok) throw adoptionError('SKETCHER_DRAFT_INVALID', validation.errors.join(' '));
  const topology = createSketcherTopologyAudit(document);
  if (!topology.adoptionAllowed) throw adoptionError('SKETCHER_TOPOLOGY_BLOCKED', 'Sketcher topology contains blocking diagnostics.');
  if (document.source.fidelity !== 'FULL_FIDELITY') throw adoptionError('SKETCHER_IMPORT_LOSS_BLOCKED', 'Workspace adoption requires FULL_FIDELITY source evidence.');
  const objects = document.segments.map((segment, index) => segmentObject(document, segment, index));
  const identity = { draftSemanticHash: document.semanticHash, objects };
  return deepFreeze({
    schema: SKETCHER_WORKSPACE_PACKAGE_SCHEMA,
    unit: 'mm',
    source: deepFreeze({ kind: 'SKETCHER_DRAFT', draftId: document.draftId, draftRevision: document.revision, draftSemanticHash: document.semanticHash, adoptionSemanticHash: semanticHash(identity) }),
    objects: deepFreeze(objects),
  });
}

export function createSketcherWorkspaceAdoption({ document, packageJson, proof }) {
  const expectedPackage = createSketcherWorkspacePackage(document);
  if (canonicalStringify(packageJson) !== canonicalStringify(expectedPackage)) throw adoptionError('SKETCHER_PACKAGE_MISMATCH', 'Workspace package does not match the active draft.');
  validateProof(proof, document);
  const base = {
    schema: SKETCHER_WORKSPACE_ADOPTION_SCHEMA,
    draftId: document.draftId,
    draftRevision: document.revision,
    draftSemanticHash: document.semanticHash,
    workspacePackageSemanticHash: semanticHash(packageJson),
    normalizedDatasetId: proof.normalizedDatasetId,
    normalizedSharedModelSemanticHash: proof.normalizedSharedModelSemanticHash,
    normalizedTopologySemanticHash: proof.normalizedTopologySemanticHash,
    draftSegmentCount: document.segments.length,
    normalizedPipeCount: proof.normalizedPipeCount,
    coordinateToleranceMm: SKETCHER_LENGTH_TOLERANCE_MM,
    qualification: 'QUALIFIED',
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSketcherWorkspaceAdoption(value) {
  const errors = [];
  if (value?.schema !== SKETCHER_WORKSPACE_ADOPTION_SCHEMA) errors.push('Invalid Sketcher Workspace adoption schema.');
  if (value?.qualification !== 'QUALIFIED') errors.push('Sketcher Workspace adoption is not qualified.');
  if (!Number.isInteger(value?.draftSegmentCount) || value.draftSegmentCount < 1 || value.normalizedPipeCount !== value.draftSegmentCount) errors.push('Sketcher Workspace adoption pipe parity is invalid.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Sketcher Workspace adoption semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function segmentObject(document, segment, index) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const start = nodes.get(segment.startNodeId), end = nodes.get(segment.endNodeId);
  return deepFreeze({
    sourceId: segment.segmentId, id: segment.segmentId, name: `Sketch Pipe ${index + 1}`, type: 'PIPE',
    sourcePath: `/sketcher/segments/${index}`,
    points: [{ x: start.xMm, y: start.yMm, z: start.zMm }, { x: end.xMm, y: end.yMm, z: end.zMm }],
    sourceAttributes: { SKETCHER_DRAFT_ID: document.draftId, SKETCHER_DRAFT_REVISION: String(document.revision), SKETCHER_SEGMENT_ID: segment.segmentId },
    attributes: {}, nativeParams: { role: 'PIPE', draftId: document.draftId, segmentId: segment.segmentId }, diagnostics: [],
  });
}

function validateProof(proof, document) {
  if (!proof || typeof proof !== 'object') throw adoptionError('SKETCHER_ADOPTION_PROOF_MISSING', 'Workspace adoption proof is required.');
  if (!proof.normalizedDatasetId || !proof.normalizedSharedModelSemanticHash || !proof.normalizedTopologySemanticHash) throw adoptionError('SKETCHER_ADOPTION_PROOF_INVALID', 'Workspace adoption proof identities are incomplete.');
  if (proof.normalizedPipeCount !== document.segments.length) throw adoptionError('SKETCHER_ADOPTION_PARITY_FAILED', 'Normalized pipe count does not match the draft segment count.');
  if (proof.coordinatesPreserved !== true || proof.geometryFinite !== true) throw adoptionError('SKETCHER_ADOPTION_GEOMETRY_FAILED', 'Normalized Workspace geometry did not preserve finite draft coordinates.');
}
function adoptionError(code, message) { const error = new TypeError(message); error.code = code; return error; }
function withoutHash(value) { const { semanticHash: _hash, ...rest } = value || {}; return rest; }
