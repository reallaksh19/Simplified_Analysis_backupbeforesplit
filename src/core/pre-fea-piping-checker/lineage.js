import { canonicalStringify, deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { LINEAGE_GRAPH_SCHEMA } from './constants.js';

export function createCommonPipingLineageGraph(input = {}) {
  const artifacts = normalizeArtifacts(input.artifacts || []);
  const artifactIds = new Set(artifacts.map((row) => row.artifactId));
  const relations = normalizeRelations(input.relations || [], artifactIds);
  const requiredKinds = ['SOURCE_BYTES', 'SHARED_MODEL', 'TOPOLOGY_POS', 'METHOD_REQUIREMENTS', 'QUALIFICATION_PROFILE', 'PREFLIGHT_RECEIPT'];
  const kinds = new Set(artifacts.map((row) => row.kind));
  const missingKinds = requiredKinds.filter((kind) => !kinds.has(kind));
  if (missingKinds.length) throw new TypeError(`Lineage graph is missing required artifact kinds: ${missingKinds.join(', ')}.`);
  const base = {
    schema: LINEAGE_GRAPH_SCHEMA,
    artifacts,
    relations,
    summary: deepFreeze({ artifactCount: artifacts.length, relationCount: relations.length, artifactKinds: deepFreeze([...kinds].sort()) }),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function createCalculationReceipt(input = {}) {
  const base = {
    schema: 'non-fea-calculation-receipt/v1',
    calculationId: requiredString(input.calculationId, 'calculationId'),
    commonInputSemanticHash: requiredString(input.commonInputSemanticHash, 'commonInputSemanticHash'),
    methodId: requiredString(input.methodId, 'methodId'),
    methodVersion: requiredString(input.methodVersion, 'methodVersion'),
    loadCaseId: requiredString(input.loadCaseId, 'loadCaseId'),
    numericalPolicySemanticHash: requiredString(input.numericalPolicySemanticHash, 'numericalPolicySemanticHash'),
    qualificationProfileSemanticHash: requiredString(input.qualificationProfileSemanticHash, 'qualificationProfileSemanticHash'),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function evaluateReceiptStaleness(receipt, current = {}) {
  const reasons = [];
  if (!receipt || receipt.schema !== 'non-fea-calculation-receipt/v1') reasons.push('INVALID_RECEIPT');
  if (receipt?.commonInputSemanticHash !== current.commonInputSemanticHash) reasons.push('COMMON_INPUT_CHANGED');
  if (receipt?.methodVersion !== current.methodVersion) reasons.push('METHOD_VERSION_CHANGED');
  if (receipt?.numericalPolicySemanticHash !== current.numericalPolicySemanticHash) reasons.push('NUMERICAL_POLICY_CHANGED');
  if (receipt?.qualificationProfileSemanticHash !== current.qualificationProfileSemanticHash) reasons.push('QUALIFICATION_PROFILE_CHANGED');
  const base = { schema: 'non-fea-calculation-staleness/v1', receiptSemanticHash: receipt?.semanticHash || null, stale: reasons.length > 0, reasons: deepFreeze(reasons.sort()) };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateCommonPipingLineageGraph(value) {
  const errors = [];
  if (!value || value.schema !== LINEAGE_GRAPH_SCHEMA) errors.push('Invalid common piping lineage graph schema.');
  if (!Array.isArray(value?.artifacts) || !Array.isArray(value?.relations)) errors.push('Lineage artifacts and relations are required.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Lineage graph semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeArtifacts(rows) {
  const artifacts = rows.map((row, index) => {
    if (!isPlainRecord(row)) throw new TypeError(`Lineage artifact ${index} must be a record.`);
    return deepFreeze({
      artifactId: requiredString(row.artifactId, 'artifactId'),
      kind: requiredString(row.kind, 'kind'),
      schema: stringValue(row.schema) || null,
      semanticHash: requiredString(row.semanticHash, 'semanticHash'),
      byteHash: stringValue(row.byteHash) || null,
      revision: stringValue(row.revision) || null,
      approvalState: stringValue(row.approvalState) || null,
      metadata: isPlainRecord(row.metadata) ? deepFreeze(JSON.parse(canonicalStringify(row.metadata))) : null,
    });
  }).sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  const ids = artifacts.map((row) => row.artifactId);
  if (new Set(ids).size !== ids.length) throw new TypeError('Lineage artifactId values must be unique.');
  return deepFreeze(artifacts);
}
function normalizeRelations(rows, artifactIds) {
  return deepFreeze(rows.map((row, index) => {
    if (!isPlainRecord(row)) throw new TypeError(`Lineage relation ${index} must be a record.`);
    const fromArtifactId = requiredString(row.fromArtifactId, 'fromArtifactId');
    const toArtifactId = requiredString(row.toArtifactId, 'toArtifactId');
    if (!artifactIds.has(fromArtifactId) || !artifactIds.has(toArtifactId)) throw new TypeError(`Lineage relation ${index} references an unknown artifact.`);
    return deepFreeze({ fromArtifactId, toArtifactId, relation: requiredString(row.relation, 'relation') });
  }).sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b))));
}
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
