import { canonicalStringify, deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { QUALIFICATION_PROFILE_SCHEMA } from './constants.js';

export function createPreFeaQualificationProfile(input = {}) {
  const fixtureHashes = normalizeHashMap(input.fixtureHashes, 'fixtureHashes');
  const guardMutations = normalizeHashMap(input.guardMutations, 'guardMutations');
  if (!Object.keys(fixtureHashes).length) throw new TypeError('At least one qualification fixture hash is required.');
  if (!Object.keys(guardMutations).length) throw new TypeError('At least one mutation-guard evidence hash is required.');
  const base = {
    schema: QUALIFICATION_PROFILE_SCHEMA,
    profileId: requiredString(input.profileId, 'profileId'),
    codeCommitSha: requiredString(input.codeCommitSha, 'codeCommitSha'),
    fixtureHashes,
    guardMutations,
    tolerancePolicy: normalizeTolerancePolicy(input.tolerancePolicy || {}),
    independentReferenceComparisons: deepFreeze(normalizeReferences(input.independentReferenceComparisons || [])),
    qualifiedMethodIds: deepFreeze([...new Set((input.qualifiedMethodIds || []).map(stringValue).filter(Boolean))].sort()),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validatePreFeaQualificationProfile(value) {
  const errors = [];
  if (!value || value.schema !== QUALIFICATION_PROFILE_SCHEMA) errors.push('Invalid pre-FEA qualification profile schema.');
  if (!stringValue(value?.profileId) || !stringValue(value?.codeCommitSha)) errors.push('Qualification profile identity and commit SHA are required.');
  if (!isPlainRecord(value?.fixtureHashes) || !Object.keys(value.fixtureHashes).length) errors.push('Qualification fixture hashes are required.');
  if (!isPlainRecord(value?.guardMutations) || !Object.keys(value.guardMutations).length) errors.push('Qualification mutation guards are required.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Qualification profile semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeTolerancePolicy(value) {
  const defaults = {
    geometryAbsolute_m: 1e-8,
    geometryRelative: 1e-10,
    sectionAbsolute_m: 1e-9,
    sectionRelative: 1e-9,
    propertyRelative: 1e-9,
    massAbsolute_kg: 1e-9,
    massRelative: 1e-8,
    equilibriumAbsolute_N: 1e-5,
    equilibriumRelative: 1e-8,
    thermalMovementAbsolute_m: 1e-8,
    thermalMovementRelative: 1e-7,
    sameAlgorithmReactionAbsolute_N: 1e-4,
    sameAlgorithmReactionRelative: 1e-6,
    independentToolRelative: 1e-3,
    semanticHashExact: true,
  };
  const result = { ...defaults };
  Object.keys(defaults).forEach((key) => {
    if (value[key] === undefined) return;
    if (typeof defaults[key] === 'boolean') {
      if (value[key] !== true) throw new TypeError(`${key} must remain true.`);
      result[key] = true;
      return;
    }
    const parsed = Number(value[key]);
    if (!Number.isFinite(parsed) || parsed < 0) throw new TypeError(`${key} must be a non-negative finite number.`);
    result[key] = parsed;
  });
  return deepFreeze(result);
}
function normalizeHashMap(value, field) {
  if (!isPlainRecord(value)) throw new TypeError(`${field} must be a record.`);
  return deepFreeze(Object.fromEntries(Object.entries(value).map(([key, hash]) => [requiredString(key, `${field} key`), requiredString(hash, `${field}.${key}`)]).sort(([a], [b]) => a.localeCompare(b))));
}
function normalizeReferences(rows) {
  return rows.map((row, index) => {
    if (!isPlainRecord(row)) throw new TypeError(`Independent comparison ${index} must be a record.`);
    return deepFreeze({ methodId: requiredString(row.methodId, 'methodId'), tool: requiredString(row.tool, 'tool'), evidenceHash: requiredString(row.evidenceHash, 'evidenceHash') });
  }).sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b)));
}
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
