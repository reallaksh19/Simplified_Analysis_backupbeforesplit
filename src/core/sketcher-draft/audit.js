import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { SKETCHER_DRAFT_AUDIT_SCHEMA } from './constants.js';

export function createSketcherDraftAudit({ document, entries = [], lastRejectedCommand = null, undoDepth = 0, redoDepth = 0 }) {
  const normalizedEntries = entries.map(normalizeEntry);
  const base = {
    schema: SKETCHER_DRAFT_AUDIT_SCHEMA,
    draftId: document.draftId,
    revision: document.revision,
    documentSemanticHash: document.semanticHash,
    acceptedCommandCount: normalizedEntries.length,
    lastAcceptedCommandId: normalizedEntries.at(-1)?.commandId || null,
    lastRejectedCommand: normalizeRejection(lastRejectedCommand),
    undoDepth,
    redoDepth,
    entries: normalizedEntries,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSketcherDraftAudit(value, document) {
  const errors = [];
  if (value?.schema !== SKETCHER_DRAFT_AUDIT_SCHEMA) errors.push('Invalid Sketcher draft audit schema.');
  if (value?.draftId !== document?.draftId || value?.revision !== document?.revision || value?.documentSemanticHash !== document?.semanticHash) errors.push('Sketcher draft audit does not reference the active document.');
  if (!Array.isArray(value?.entries) || value.acceptedCommandCount !== value.entries.length) errors.push('Sketcher draft audit entries are invalid.');
  if (!Number.isInteger(value?.undoDepth) || value.undoDepth < 0 || !Number.isInteger(value?.redoDepth) || value.redoDepth < 0) errors.push('Sketcher draft audit history depths are invalid.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Sketcher draft audit semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function acceptedAuditEntry(command, previousDocument, nextDocument) {
  return deepFreeze({
    commandId: command.commandId,
    commandType: command.commandType,
    previousDocumentSemanticHash: previousDocument.semanticHash,
    nextDocumentSemanticHash: nextDocument.semanticHash,
    previousRevision: previousDocument.revision,
    nextRevision: nextDocument.revision,
  });
}

export function rejectedCommandEvidence(command, code, message) {
  return deepFreeze({ commandId: command?.commandId || null, commandType: command?.commandType || null, code, message });
}

function normalizeEntry(entry) {
  return {
    commandId: entry.commandId, commandType: entry.commandType,
    previousDocumentSemanticHash: entry.previousDocumentSemanticHash,
    nextDocumentSemanticHash: entry.nextDocumentSemanticHash,
    previousRevision: entry.previousRevision, nextRevision: entry.nextRevision,
  };
}
function normalizeRejection(value) { return value ? { commandId: value.commandId, commandType: value.commandType, code: value.code, message: value.message } : null; }
function withoutHash(value) { const { semanticHash: _hash, ...rest } = value || {}; return rest; }
