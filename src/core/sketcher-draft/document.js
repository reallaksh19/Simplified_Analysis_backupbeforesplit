import { canonicalPrettyStringify, deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { IMPORT_FIDELITY, SKETCHER_DRAFT_DOCUMENT_SCHEMA, WORKING_PLANES } from './constants.js';
import { assertJsonSafe, validateSketcherDraftDocument } from './validation.js';

export function createEmptySketcherDraft({ draftId = 'draft-001', revision = 0, workingPlane = 'XY' } = {}) {
  return createSketcherDraftDocument({
    draftId, revision, workingPlane,
    source: blankSource(), nodes: [], segments: [],
  });
}

export function createSketcherDraftDocument(input) {
  assertJsonSafe(input);
  assertClosedInput(input);
  const base = {
    schema: SKETCHER_DRAFT_DOCUMENT_SCHEMA,
    draftId: requiredId(input?.draftId, 'draftId'),
    revision: revisionValue(input?.revision),
    units: { length: 'mm' },
    workingPlane: workingPlaneValue(input?.workingPlane),
    source: normalizeSource(input?.source),
    nodes: normalizeNodes(input?.nodes),
    segments: normalizeSegments(input?.segments),
  };
  const computedHash = semanticHash(base);
  if (input?.semanticHash !== undefined && input.semanticHash !== computedHash) throw new TypeError('Sketcher draft semantic hash mismatch.');
  const document = deepFreeze({ ...base, semanticHash: computedHash });
  const validation = validateSketcherDraftDocument(document);
  if (!validation.ok) throw new TypeError(`Invalid Sketcher draft document: ${validation.errors.join(' ')}`);
  return document;
}

export function parseSketcherDraftJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('Sketcher draft JSON text is required.');
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { throw new TypeError(`Sketcher draft JSON is invalid: ${error.message}`); }
  const validation = validateSketcherDraftDocument(parsed);
  if (!validation.ok) throw new TypeError(`Sketcher draft JSON is invalid: ${validation.errors.join(' ')}`);
  return createSketcherDraftDocument(parsed);
}

export function serializeSketcherDraft(document) {
  const validation = validateSketcherDraftDocument(document);
  if (!validation.ok) throw new TypeError(`Cannot serialize invalid Sketcher draft: ${validation.errors.join(' ')}`);
  return canonicalPrettyStringify(document);
}

export function nextDraftId(currentId) {
  const match = /^draft-(\d+)$/.exec(stringValue(currentId));
  return `draft-${String((match ? Number(match[1]) : 0) + 1).padStart(3, '0')}`;
}

export function nextNodeId(nodes) { return nextSequenceId(nodes.map((row) => row.nodeId), 'N', 3); }
export function nextSegmentId(segments) { return nextSequenceId(segments.map((row) => row.segmentId), 'S', 3); }

export function blankSource() {
  return deepFreeze({ kind: 'BLANK', sourceDatasetId: null, sourceSemanticHash: null, fidelity: IMPORT_FIDELITY.FULL_FIDELITY });
}

function assertClosedInput(input) {
  const allowed = new Set(['schema','draftId','revision','units','workingPlane','source','nodes','segments','semanticHash']);
  Object.keys(input || {}).forEach((key) => { if (!allowed.has(key)) throw new TypeError(`Unknown Sketcher draft field: ${key}.`); });
  if (input?.schema !== undefined && input.schema !== SKETCHER_DRAFT_DOCUMENT_SCHEMA) throw new TypeError('Invalid Sketcher draft document schema.');
  if (input?.units !== undefined && (Object.keys(input.units).length !== 1 || input.units.length !== 'mm')) throw new TypeError('Sketcher units must be exactly { length: mm }.');
  (input?.nodes || []).forEach((node) => assertKeys(node, ['nodeId','xMm','yMm','zMm'], 'node'));
  (input?.segments || []).forEach((segment) => assertKeys(segment, ['segmentId','startNodeId','endNodeId','componentType'], 'segment'));
  if (input?.source !== undefined) assertKeys(input.source, ['kind','sourceDatasetId','sourceSemanticHash','fidelity'], 'source');
}

function assertKeys(value, keys, label) {
  const allowed = new Set(keys);
  Object.keys(value || {}).forEach((key) => { if (!allowed.has(key)) throw new TypeError(`Unknown Sketcher ${label} field: ${key}.`); });
}

function normalizeNodes(nodes = []) {
  if (!Array.isArray(nodes)) throw new TypeError('Sketcher nodes must be an array.');
  return nodes.map((node) => ({ nodeId: requiredId(node?.nodeId, 'nodeId'), xMm: coordinate(node?.xMm), yMm: coordinate(node?.yMm), zMm: coordinate(node?.zMm) }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function normalizeSegments(segments = []) {
  if (!Array.isArray(segments)) throw new TypeError('Sketcher segments must be an array.');
  return segments.map((segment) => ({ segmentId: requiredId(segment?.segmentId, 'segmentId'), startNodeId: requiredId(segment?.startNodeId, 'startNodeId'), endNodeId: requiredId(segment?.endNodeId, 'endNodeId'), componentType: stringValue(segment?.componentType || 'PIPE').toUpperCase() }))
    .sort((left, right) => left.segmentId.localeCompare(right.segmentId));
}

function normalizeSource(source = blankSource()) {
  return {
    kind: requiredId(source?.kind || 'BLANK', 'source.kind'),
    sourceDatasetId: optionalId(source?.sourceDatasetId),
    sourceSemanticHash: optionalId(source?.sourceSemanticHash),
    fidelity: Object.values(IMPORT_FIDELITY).includes(source?.fidelity) ? source.fidelity : IMPORT_FIDELITY.FULL_FIDELITY,
  };
}

function nextSequenceId(ids, prefix, width) {
  const maximum = ids.reduce((max, id) => {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(width, '0')}`;
}

function revisionValue(value) { if (!Number.isInteger(value) || value < 0) throw new TypeError('revision must be a non-negative integer.'); return value; }
function workingPlaneValue(value) { if (!WORKING_PLANES.includes(value)) throw new TypeError('workingPlane is invalid.'); return value; }
function requiredId(value, label) { const result = stringValue(value); if (!result) throw new TypeError(`${label} is required.`); return result; }
function optionalId(value) { return value === null || value === undefined ? null : requiredId(value, 'source identity'); }
function coordinate(value) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Sketcher coordinates must be finite numbers.'); return Object.is(value, -0) ? 0 : value; }
