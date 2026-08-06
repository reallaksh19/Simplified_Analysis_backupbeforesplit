import { canonicalStringify, deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  AUTHORITY_LEVEL, BLOCKED_FIELD_STATUSES, FIELD_RESOLUTION_SCHEMA, FIELD_RESOLUTION_STATUS,
  RESOLVED_FIELD_STATUSES, SCHEDULE_FIELD, TARGET_KIND,
} from './constants.js';

const STATUS_BY_AUTHORITY = Object.freeze({
  [AUTHORITY_LEVEL.SOURCE_EXPLICIT]: FIELD_RESOLUTION_STATUS.RESOLVED_SOURCE,
  [AUTHORITY_LEVEL.SOURCE_INHERITED]: FIELD_RESOLUTION_STATUS.RESOLVED_INHERITED,
  [AUTHORITY_LEVEL.EXACT_APPROVED_MASTER]: FIELD_RESOLUTION_STATUS.RESOLVED_EXACT_MASTER,
  [AUTHORITY_LEVEL.ACCEPTED_OVERRIDE]: FIELD_RESOLUTION_STATUS.RESOLVED_OVERRIDE,
  [AUTHORITY_LEVEL.CONFIGURED_DERIVATION]: FIELD_RESOLUTION_STATUS.RESOLVED_CONFIGURED_DERIVATION,
  [AUTHORITY_LEVEL.PROJECT_CONFIGURED_DEFAULT]: FIELD_RESOLUTION_STATUS.RESOLVED_CONFIGURED_DEFAULT,
});

export function resolveGovernedField(input = {}) {
  const identity = normalizeIdentity(input);
  if (input.applicable === false) {
    return createFieldResolutionRecord({ ...identity, status: FIELD_RESOLUTION_STATUS.NOT_APPLICABLE, authorityLevel: AUTHORITY_LEVEL.BLOCK, value: null, unit: input.unit, provenance: input.provenance, diagnostics: [] });
  }

  const candidates = [
    [AUTHORITY_LEVEL.SOURCE_EXPLICIT, normalizeCandidate(input.sourceExplicit)],
    [AUTHORITY_LEVEL.SOURCE_INHERITED, normalizeCandidate(input.sourceInherited)],
  ];
  for (const [authorityLevel, candidate] of candidates) {
    const terminal = candidateDecision(identity, authorityLevel, candidate, input.unit);
    if (terminal) return terminal;
  }

  const masterRows = Array.isArray(input.exactMasterRows) ? input.exactMasterRows.filter((row) => row?.present !== false) : [];
  if (masterRows.length > 1) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_AMBIGUOUS, 'DUPLICATE_EXACT_MASTER_ROWS', 'More than one exact approved master row matched the governed field.', input.unit, masterRows.map((row) => row?.provenance).filter(Boolean));
  if (masterRows.length === 1) {
    const master = normalizeCandidate(masterRows[0]);
    if (master.approved !== true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_UNAPPROVED, 'MASTER_ROW_NOT_APPROVED', 'The exact master row lacks approved evidence.', input.unit, master.provenance);
    const terminal = candidateDecision(identity, AUTHORITY_LEVEL.EXACT_APPROVED_MASTER, master, input.unit);
    if (terminal) return terminal;
  }

  const override = normalizeCandidate(input.acceptedOverride);
  if (override.present) {
    if (override.approved !== true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_UNAPPROVED, 'OVERRIDE_NOT_ACCEPTED', 'The override lacks accepted approval evidence.', input.unit, override.provenance);
    return candidateDecision(identity, AUTHORITY_LEVEL.ACCEPTED_OVERRIDE, override, input.unit);
  }

  const derivation = normalizeCandidate(input.configuredDerivation);
  if (derivation.present) {
    if (derivation.approved !== true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_UNAPPROVED, 'DERIVATION_NOT_APPROVED', 'The configured derivation is not approved for governed use.', input.unit, derivation.provenance);
    return candidateDecision(identity, AUTHORITY_LEVEL.CONFIGURED_DERIVATION, derivation, input.unit);
  }

  const configuredDefault = normalizeCandidate(input.configuredDefault);
  if (configuredDefault.present) {
    if (identity.field === SCHEDULE_FIELD) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_OUTSIDE_SCOPE, 'SCHEDULE_DEFAULT_PROHIBITED', 'Pipe schedule may not be supplied by a configured default.', input.unit, configuredDefault.provenance);
    if (configuredDefault.approved !== true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_UNAPPROVED, 'DEFAULT_NOT_APPROVED', 'The configured default is not approved.', input.unit, configuredDefault.provenance);
    if (configuredDefault.scopeQualified !== true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_OUTSIDE_SCOPE, 'DEFAULT_OUTSIDE_SCOPE', 'The configured default is outside its approved scope.', input.unit, configuredDefault.provenance);
    return candidateDecision(identity, AUTHORITY_LEVEL.PROJECT_CONFIGURED_DEFAULT, configuredDefault, input.unit);
  }

  return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_MISSING, 'FIELD_MISSING', 'No authoritative value is available for the governed field.', input.unit, input.provenance);
}

export function createFieldResolutionRecord(input = {}) {
  const identity = normalizeIdentity(input);
  const status = requiredEnum(input.status, Object.values(FIELD_RESOLUTION_STATUS), 'status');
  const authorityLevel = requiredEnum(input.authorityLevel, Object.values(AUTHORITY_LEVEL), 'authorityLevel');
  const resolved = RESOLVED_FIELD_STATUSES.includes(status);
  const blockedStatus = BLOCKED_FIELD_STATUSES.includes(status);
  if (resolved && authorityLevel === AUTHORITY_LEVEL.BLOCK) throw new TypeError('Resolved fields cannot use BLOCK authority.');
  if (!resolved && authorityLevel !== AUTHORITY_LEVEL.BLOCK) throw new TypeError('Blocked or not-applicable fields must use BLOCK authority.');
  if (resolved && (input.value === undefined || input.value === null)) throw new TypeError('Resolved field values may be zero but may not be null or undefined.');
  if (!resolved && input.value !== null && input.value !== undefined) throw new TypeError('Blocked and not-applicable field records may not carry a numerical substitute.');
  const diagnostics = normalizeDiagnostics(input.diagnostics || []);
  if (blockedStatus && !diagnostics.length) throw new TypeError('Blocked field records require at least one diagnostic.');
  const base = {
    schema: FIELD_RESOLUTION_SCHEMA,
    ...identity,
    status,
    authorityLevel,
    value: resolved ? cloneCanonical(input.value) : null,
    unit: stringValue(input.unit) || null,
    provenance: normalizeProvenance(input.provenance),
    diagnostics,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateFieldResolutionRecord(value) {
  const errors = [];
  if (!value || value.schema !== FIELD_RESOLUTION_SCHEMA) errors.push('Invalid field-resolution schema.');
  if (!Object.values(TARGET_KIND).includes(value?.targetKind)) errors.push('Invalid field-resolution targetKind.');
  if (!stringValue(value?.targetId) || !stringValue(value?.field)) errors.push('Field-resolution targetId and field are required.');
  if (!Object.values(FIELD_RESOLUTION_STATUS).includes(value?.status)) errors.push('Invalid field-resolution status.');
  if (!Object.values(AUTHORITY_LEVEL).includes(value?.authorityLevel)) errors.push('Invalid field-resolution authorityLevel.');
  if (!Array.isArray(value?.diagnostics)) errors.push('Field-resolution diagnostics must be an array.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Field-resolution semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function fieldResolutionKey(value) {
  return `${value.targetKind}:${value.targetId}:${value.field}`;
}

function candidateDecision(identity, authorityLevel, candidate, unit) {
  if (!candidate.present) return null;
  if (candidate.stale === true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_STALE_SOURCE, 'STALE_SOURCE_EVIDENCE', 'The candidate value is tied to stale source evidence.', unit, candidate.provenance);
  if (candidate.conflict === true) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_CONFLICT, 'AUTHORITATIVE_VALUE_CONFLICT', 'Conflicting authoritative values exist for the governed field.', unit, candidate.provenance);
  if (candidate.approved === false) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_UNAPPROVED, 'UNAPPROVED_VALUE', 'The candidate value is not approved for governed use.', unit, candidate.provenance);
  if (candidate.value === undefined || candidate.value === null) return blocked(identity, FIELD_RESOLUTION_STATUS.BLOCKED_MISSING, 'PRESENT_VALUE_EMPTY', 'The selected authoritative candidate does not contain a value.', unit, candidate.provenance);
  return createFieldResolutionRecord({
    ...identity,
    status: STATUS_BY_AUTHORITY[authorityLevel],
    authorityLevel,
    value: candidate.value,
    unit,
    provenance: candidate.provenance,
    diagnostics: [],
  });
}

function blocked(identity, status, code, message, unit, provenance) {
  return createFieldResolutionRecord({
    ...identity,
    status,
    authorityLevel: AUTHORITY_LEVEL.BLOCK,
    value: null,
    unit,
    provenance,
    diagnostics: [{ code, severity: 'ERROR', message, scope: `${identity.targetKind}:${identity.targetId}:${identity.field}` }],
  });
}

function normalizeIdentity(input) {
  return {
    targetKind: requiredEnum(input.targetKind, Object.values(TARGET_KIND), 'targetKind'),
    targetId: requiredString(input.targetId, 'targetId'),
    field: requiredString(input.field, 'field'),
  };
}
function normalizeCandidate(value) {
  if (!value || value.present === false) return { present: false };
  return {
    present: true,
    value: value.value,
    approved: value.approved,
    stale: value.stale === true,
    conflict: value.conflict === true,
    scopeQualified: value.scopeQualified === true,
    provenance: value.provenance,
  };
}
function normalizeProvenance(value) {
  if (value === null || value === undefined) return deepFreeze([]);
  const rows = Array.isArray(value) ? value : [value];
  return deepFreeze(rows.map((row) => {
    if (typeof row === 'string') return deepFreeze({ source: row });
    if (!isPlainRecord(row)) throw new TypeError('Field provenance entries must be records or strings.');
    return deepFreeze(cloneCanonical(row));
  }).sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b))));
}
function normalizeDiagnostics(rows) {
  return deepFreeze(rows.map((row, index) => {
    if (!isPlainRecord(row) || !stringValue(row.code) || !stringValue(row.message)) throw new TypeError(`Invalid field diagnostic at index ${index}.`);
    return deepFreeze({
      code: stringValue(row.code),
      severity: stringValue(row.severity || 'ERROR').toUpperCase(),
      message: stringValue(row.message),
      scope: stringValue(row.scope) || null,
    });
  }).sort((a, b) => `${a.code}|${a.scope || ''}|${a.message}`.localeCompare(`${b.code}|${b.scope || ''}|${b.message}`)));
}
function cloneCanonical(value) { return JSON.parse(canonicalStringify(value)); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
function requiredEnum(value, allowed, field) { if (!allowed.includes(value)) throw new TypeError(`${field} has unsupported value ${value}.`); return value; }
