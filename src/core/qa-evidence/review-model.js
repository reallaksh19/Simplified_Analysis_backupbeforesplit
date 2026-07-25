import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { IMPLEMENTATION_STATUS, READINESS_STATES } from '../workspace-consumers/index.js';
import { QA_QUALITY_STATES, QA_REVIEW_MODEL_SCHEMA } from './constants.js';
import { implementedQaSummary } from './consumer-rows.js';
import { qaReviewHashPayload, validateQaEvidenceSource, validateQaReviewModel } from './validation.js';

export function createQaReviewModel(source) {
  const sourceValidation = validateQaEvidenceSource(source);
  if (!sourceValidation.ok) throw new TypeError(`QA source is invalid: ${sourceValidation.errors.join(' ')}`);
  const consumerSummary = implementedQaSummary(source.consumerRows);
  const qualityState = qualityStateFor(source, consumerSummary);
  const base = {
    schema: QA_REVIEW_MODEL_SCHEMA,
    qualityState,
    registrySummary: deepFreeze({ ...source.registryReference, implementedCount:source.consumerRows.filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED).length, unavailableCount:consumerSummary.unavailableCount }),
    contextSummary: source.contextReference,
    consumerRows: source.consumerRows,
    contractRows: source.contractRows,
    diagnostics: source.diagnostics,
    limitations: source.limitations,
  };
  const model = deepFreeze({ ...base, semanticHash: semanticHash(qaReviewHashPayload(base)) });
  const validation = validateQaReviewModel(model);
  if (!validation.ok) throw new TypeError(`QA review model is invalid: ${validation.errors.join(' ')}`);
  return model;
}
function qualityStateFor(source, summary) {
  if (!source.contextReference.datasetId) return QA_QUALITY_STATES.VALID_EMPTY;
  const blocked = source.consumerRows.some((row) => row.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED && row.readinessState !== READINESS_STATES.AVAILABLE);
  return blocked || summary.unavailableCount ? QA_QUALITY_STATES.VALID_PARTIAL : QA_QUALITY_STATES.VALID_READY;
}
