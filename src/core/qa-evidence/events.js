import { validateQaEvidenceSource, validateQaReviewModel } from './validation.js';

export const QA_EVENTS = Object.freeze({
  REFRESH_REQUESTED: 'qaEvidence:refreshRequested',
  EXPORT_REQUESTED: 'qaEvidence:exportRequested',
  CHANGED: 'qaEvidence:changed',
  REFRESH_FAILED: 'qaEvidence:refreshFailed',
});
export function validateQaEventPayload(topic, payload) {
  if (topic === QA_EVENTS.REFRESH_REQUESTED) return refreshRequest(payload);
  if (topic === QA_EVENTS.EXPORT_REQUESTED) return exportRequest(payload);
  if (topic === QA_EVENTS.CHANGED) return changed(payload);
  if (topic === QA_EVENTS.REFRESH_FAILED) return failed(payload);
  throw new TypeError(`Unknown QA event topic: ${topic}.`);
}
function refreshRequest(value) { exact(value, ['reason'], QA_EVENTS.REFRESH_REQUESTED); nonEmpty(value.reason, 'reason'); }
function exportRequest(value) { exact(value, ['format'], QA_EVENTS.EXPORT_REQUESTED); if (!['JSON','CSV'].includes(value.format)) throw new TypeError('qaEvidence:exportRequested format is invalid.'); }
function changed(value) { exact(value, ['reason','reviewModel','source'], QA_EVENTS.CHANGED); nonEmpty(value.reason, 'reason'); if (!validateQaEvidenceSource(value.source).ok || !validateQaReviewModel(value.reviewModel).ok) throw new TypeError('qaEvidence:changed evidence is invalid.'); }
function failed(value) { exact(value, ['code','message'], QA_EVENTS.REFRESH_FAILED); nonEmpty(value.code, 'code'); nonEmpty(value.message, 'message'); }
function exact(value, keys, topic) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${topic} payload must be an object.`); if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new TypeError(`${topic} payload fields are invalid.`); }
function nonEmpty(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`QA event ${field} must be non-empty.`); }
