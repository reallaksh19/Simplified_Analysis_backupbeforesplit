import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { QA_EVIDENCE_EXPORT_SCHEMA } from './constants.js';
import { validateQaEvidenceExport, validateQaEvidenceSource, validateQaReviewModel } from './validation.js';

export function createQaEvidenceExport({ source, reviewModel, format } = {}) {
  assertEvidence(source, reviewModel);
  const normalized = String(format || '').toUpperCase();
  if (!['JSON','CSV'].includes(normalized)) throw new TypeError('QA export format must be JSON or CSV.');
  const content = normalized === 'JSON' ? jsonContent(source, reviewModel) : csvContent(reviewModel);
  const base = {
    schema: QA_EVIDENCE_EXPORT_SCHEMA,
    format: normalized,
    mediaType: normalized === 'JSON' ? 'application/json' : 'text/csv',
    fileName: normalized === 'JSON' ? 'qa-evidence.json' : 'qa-evidence.csv',
    sourceSemanticHash: source.semanticHash,
    reviewSemanticHash: reviewModel.semanticHash,
    content,
  };
  const artifact = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  const validation = validateQaEvidenceExport(artifact);
  if (!validation.ok) throw new TypeError(`QA export is invalid: ${validation.errors.join(' ')}`);
  return artifact;
}
function jsonContent(source, reviewModel) { return `${canonicalStringify({ source, reviewModel })}\n`; }
function csvContent(review) {
  const rows = [];
  append(rows, 'CONSUMERS', ['consumerId','label','implementationStatus','readinessState','requiredContractKeys','availableRequiredCount','missingRequiredContractKeys','invalidRequiredContractKeys','blockingDiagnostics','engineeringClaimPolicy'], review.consumerRows);
  append(rows, 'CONTRACTS', ['contractKey','availability','schema','semanticHash','datasetId','validatorState','datasetState','linkState','requiredByConsumerIds','optionalForConsumerIds','qualificationSummary','diagnostics'], review.contractRows);
  append(rows, 'DIAGNOSTICS', ['code','severity','contractKey','message'], review.diagnostics);
  append(rows, 'LIMITATIONS', ['limitation'], review.limitations.map((limitation) => ({ limitation })));
  return `${rows.join('\n')}\n`;
}
function append(target, group, columns, rows) { target.push([group, ...columns].map(csvCell).join(',')); rows.forEach((row) => target.push([group, ...columns.map((column) => scalar(row[column]))].map(csvCell).join(','))); }
function scalar(value) { if (Array.isArray(value) || (value && typeof value === 'object')) return canonicalStringify(value); return value ?? ''; }
function csvCell(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text; }
function assertEvidence(source, reviewModel) {
  const sourceValidation = validateQaEvidenceSource(source);
  const reviewValidation = validateQaReviewModel(reviewModel);
  if (!sourceValidation.ok) throw new TypeError(`QA export source is invalid: ${sourceValidation.errors.join(' ')}`);
  if (!reviewValidation.ok || canonicalStringify(reviewModel.consumerRows) !== canonicalStringify(source.consumerRows) || canonicalStringify(reviewModel.contractRows) !== canonicalStringify(source.contractRows)) throw new TypeError('QA export review model does not match the source evidence.');
}
