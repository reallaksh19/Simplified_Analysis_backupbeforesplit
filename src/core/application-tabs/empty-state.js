import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { APPLICATION_EMPTY_STATE_SCHEMA, TAB_CONTENT_STATES } from './constants.js';

export function createApplicationEmptyState(runtimeRow) {
  if (!runtimeRow?.tabId) throw new TypeError('Application empty state requires a runtime row.');
  const visible = runtimeRow.contentState !== TAB_CONTENT_STATES.READY;
  const base = {
    schema: APPLICATION_EMPTY_STATE_SCHEMA,
    tabId: runtimeRow.tabId,
    state: runtimeRow.contentState,
    visible,
    title: `${runtimeRow.label}: ${runtimeRow.summary}`,
    message: messageFor(runtimeRow),
    actionState: runtimeRow.actionState,
    availableEvidence: [...runtimeRow.availableEvidence],
    missingEvidence: [...runtimeRow.missingEvidence],
    invalidEvidence: [...runtimeRow.invalidEvidence],
    diagnostics: runtimeRow.diagnostics.map((row) => deepFreeze({ ...row })),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateApplicationEmptyState(value, runtimeRow) {
  const errors = [];
  if (value?.schema !== APPLICATION_EMPTY_STATE_SCHEMA) errors.push('Invalid application empty-state schema.');
  try {
    const expected = createApplicationEmptyState(runtimeRow);
    if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Application empty state does not match the tab runtime row.');
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function messageFor(row) {
  if (row.contentState === TAB_CONTENT_STATES.EMPTY) return `${row.label} is available. Load or create the required evidence to enable its engineering actions.`;
  if (row.contentState === TAB_CONTENT_STATES.BLOCKED) return `${row.label} is available, but one or more required evidence contracts are missing.`;
  if (row.contentState === TAB_CONTENT_STATES.INVALID) return `${row.label} is available, but invalid or stale evidence must be replaced before engineering actions can run.`;
  if (row.contentState === TAB_CONTENT_STATES.UNAVAILABLE) return `${row.label} is not implemented in the current runtime.`;
  if (row.contentState === TAB_CONTENT_STATES.ERROR) return `${row.label} encountered a recoverable application error.`;
  return `${row.label} is ready with current evidence.`;
}
