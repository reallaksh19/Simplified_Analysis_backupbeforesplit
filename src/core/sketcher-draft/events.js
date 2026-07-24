import { isPlainRecord } from '../shared-piping-model/index.js';
import { SKETCHER_EVENTS } from './constants.js';
import { COMMAND_TYPES } from './constants.js';
import { validateSketcherDraftAudit } from './audit.js';
import { validateSketcherDraftDocument } from './validation.js';
import { validateSketcherReviewModel } from './review-model.js';
import { validateSketcherWorkspaceAdoption } from './workspace-adoption.js';

export function validateSketcherEventPayload(topic, payload) {
  const validator = VALIDATORS.get(topic);
  if (!validator) return;
  validator(payload);
}

const VALIDATORS = new Map([
  [SKETCHER_EVENTS.DRAFT_CREATE_REQUESTED, optionalRecord],
  [SKETCHER_EVENTS.DOCUMENT_IMPORT_REQUESTED, (p) => exactRecord(p, ['document'])],
  [SKETCHER_EVENTS.WORKSPACE_IMPORT_REQUESTED, optionalRecord],
  [SKETCHER_EVENTS.COMMAND_REQUESTED, validateCommandRequest],
  [SKETCHER_EVENTS.UNDO_REQUESTED, optionalRecord], [SKETCHER_EVENTS.REDO_REQUESTED, optionalRecord],
  [SKETCHER_EVENTS.VALIDATION_REQUESTED, optionalRecord],
  [SKETCHER_EVENTS.EXPORT_REQUESTED, (p) => exactRecord(p, ['format'])],
  [SKETCHER_EVENTS.ADOPTION_REQUESTED, optionalRecord],
  [SKETCHER_EVENTS.DRAFT_CHANGED, validateDraftChanged],
  [SKETCHER_EVENTS.COMMAND_FAILED, validateFailure],
  [SKETCHER_EVENTS.ADOPTION_COMPLETED, (p) => { exactRecord(p, ['adoption']); assertValid(validateSketcherWorkspaceAdoption(p.adoption), 'adoption'); }],
  [SKETCHER_EVENTS.ADOPTION_FAILED, validateFailure],
]);

function validateCommandRequest(payload) {
  exactRecord(payload, ['commandType','payload']);
  if (!COMMAND_TYPES.includes(payload.commandType) || !isPlainRecord(payload.payload)) throw new TypeError('Sketcher command request is invalid.');
}
function validateDraftChanged(payload) {
  exactRecord(payload, ['audit','document','reason','reviewModel']);
  assertValid(validateSketcherDraftDocument(payload.document), 'document');
  assertValid(validateSketcherDraftAudit(payload.audit, payload.document), 'audit');
  assertValid(validateSketcherReviewModel(payload.reviewModel), 'reviewModel');
  if (typeof payload.reason !== 'string' || !payload.reason) throw new TypeError('Sketcher draftChanged reason is required.');
}
function validateFailure(payload) { exactRecord(payload, ['code','message']); if (typeof payload.code !== 'string' || !payload.code || typeof payload.message !== 'string' || !payload.message) throw new TypeError('Sketcher failure payload is invalid.'); }
function optionalRecord(payload) { if (payload !== undefined && !isPlainRecord(payload)) throw new TypeError('Sketcher event payload must be omitted or a plain object.'); }
function exactRecord(value, keys) { if (!isPlainRecord(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError('Sketcher event payload fields are invalid.'); }
function assertValid(validation, label) { if (!validation.ok) throw new TypeError(`Sketcher event ${label} is invalid: ${validation.errors.join(' ')}`); }
