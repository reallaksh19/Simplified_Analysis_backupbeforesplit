import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { IMPORT_FIDELITY, SKETCHER_REVIEW_MODEL_SCHEMA } from './constants.js';
import { createSketcherTopologyAudit } from './topology.js';
import { validateSketcherDraftAudit } from './audit.js';
import { validateSketcherDraftDocument } from './validation.js';

export function createSketcherReviewModel({ document, audit, importDiagnostics = [], adoption = null }) {
  const documentValidation = validateSketcherDraftDocument(document);
  if (!documentValidation.ok) throw new TypeError(`Invalid Sketcher review document: ${documentValidation.errors.join(' ')}`);
  const auditValidation = validateSketcherDraftAudit(audit, document);
  if (!auditValidation.ok) throw new TypeError(`Invalid Sketcher review audit: ${auditValidation.errors.join(' ')}`);
  const topology = createSketcherTopologyAudit(document);
  const blockers = adoptionBlockers(document, topology, importDiagnostics);
  const base = {
    schema: SKETCHER_REVIEW_MODEL_SCHEMA,
    draftId: document.draftId,
    revision: document.revision,
    documentSemanticHash: document.semanticHash,
    auditSemanticHash: audit.semanticHash,
    workingPlane: document.workingPlane,
    source: document.source,
    summary: topology.summary,
    diagnostics: mergeDiagnostics(topology.diagnostics, importDiagnostics),
    adoptionEligibility: { allowed: blockers.length === 0 && document.segments.length > 0, blockers },
    history: { canUndo: audit.undoDepth > 0, canRedo: audit.redoDepth > 0 },
    lastAcceptedCommandId: audit.lastAcceptedCommandId,
    lastRejectedCommand: audit.lastRejectedCommand,
    adoption,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSketcherReviewModel(value) {
  const errors = [];
  if (value?.schema !== SKETCHER_REVIEW_MODEL_SCHEMA) errors.push('Invalid Sketcher review model schema.');
  if (!value?.draftId || !Number.isInteger(value?.revision) || value.revision < 0) errors.push('Sketcher review identity is invalid.');
  if (!Array.isArray(value?.diagnostics) || !Array.isArray(value?.adoptionEligibility?.blockers)) errors.push('Sketcher review diagnostics are invalid.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Sketcher review semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function adoptionBlockers(document, topology, importDiagnostics) {
  const blockers = [];
  if (!document.segments.length) blockers.push('DRAFT_HAS_NO_PIPE_SEGMENTS');
  if (!topology.adoptionAllowed) blockers.push('DRAFT_TOPOLOGY_BLOCKED');
  if (document.source.fidelity !== IMPORT_FIDELITY.FULL_FIDELITY) blockers.push(`SOURCE_FIDELITY_${document.source.fidelity}`);
  if (importDiagnostics.some((row) => row.severity === 'ERROR')) blockers.push('WORKSPACE_IMPORT_ERROR');
  return [...new Set(blockers)].sort();
}

function mergeDiagnostics(topology, imported) {
  return deepFreeze([...topology, ...imported.map((row) => ({ ...row, entityId: row.sourceEntityId ?? null, data: {} }))]
    .sort((a, b) => `${a.severity}|${a.code}|${a.entityId || ''}|${a.message}`.localeCompare(`${b.severity}|${b.code}|${b.entityId || ''}|${b.message}`)));
}
function withoutHash(value) { const { semanticHash: _hash, ...rest } = value || {}; return rest; }
