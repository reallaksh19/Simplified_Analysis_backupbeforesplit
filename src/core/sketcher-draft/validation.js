import { canonicalStringify, deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { COMPONENT_TYPES, SKETCHER_DRAFT_DOCUMENT_SCHEMA, SKETCHER_LENGTH_TOLERANCE_MM, WORKING_PLANES } from './constants.js';

const DOCUMENT_KEYS = Object.freeze(['draftId','nodes','revision','schema','segments','semanticHash','source','units','workingPlane']);
const NODE_KEYS = Object.freeze(['nodeId','xMm','yMm','zMm']);
const SEGMENT_KEYS = Object.freeze(['componentType','endNodeId','segmentId','startNodeId']);
const SOURCE_KEYS = Object.freeze(['fidelity','kind','sourceDatasetId','sourceSemanticHash']);
const UNITS_KEYS = Object.freeze(['length']);

export function validateSketcherDraftDocument(value) {
  const errors = [];
  try { assertJsonSafe(value); } catch (error) { errors.push(error.message); return deepFreeze({ ok: false, errors }); }
  if (value?.schema !== SKETCHER_DRAFT_DOCUMENT_SCHEMA) errors.push('Invalid Sketcher draft document schema.');
  exactKeys(value, DOCUMENT_KEYS, 'Sketcher draft document', errors);
  if (!stringValue(value?.draftId)) errors.push('Sketcher draftId is required.');
  if (!Number.isInteger(value?.revision) || value.revision < 0) errors.push('Sketcher revision must be a non-negative integer.');
  exactKeys(value?.units, UNITS_KEYS, 'Sketcher units', errors);
  if (value?.units?.length !== 'mm') errors.push('Sketcher length unit must be mm.');
  if (!WORKING_PLANES.includes(value?.workingPlane)) errors.push('Sketcher workingPlane is invalid.');
  validateSource(value?.source, errors);
  validateNodes(value?.nodes, errors);
  validateSegments(value?.segments, value?.nodes, errors);
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Sketcher draft semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function assertJsonSafe(value) {
  inspectJson(value, '$', new Set());
}

export function segmentLengthMm(segment, nodeById) {
  const a = nodeById.get(segment.startNodeId), b = nodeById.get(segment.endNodeId);
  if (!a || !b) return null;
  return Math.hypot(b.xMm - a.xMm, b.yMm - a.yMm, b.zMm - a.zMm);
}

export function unorderedEndpointKey(startNodeId, endNodeId) {
  return [startNodeId, endNodeId].sort().join('\u0000');
}

function validateSource(source, errors) {
  exactKeys(source, SOURCE_KEYS, 'Sketcher source', errors);
  if (!stringValue(source?.kind)) errors.push('Sketcher source.kind is required.');
  for (const field of ['sourceDatasetId','sourceSemanticHash']) {
    if (source?.[field] !== null && !stringValue(source?.[field])) errors.push(`Sketcher source.${field} must be null or a non-empty string.`);
  }
  if (!['FULL_FIDELITY','PARTIAL_WITH_DIAGNOSTICS','REJECTED'].includes(source?.fidelity)) errors.push('Sketcher source.fidelity is invalid.');
}

function validateNodes(nodes, errors) {
  if (!Array.isArray(nodes)) return errors.push('Sketcher nodes must be an array.');
  const ids = [];
  nodes.forEach((node) => {
    exactKeys(node, NODE_KEYS, 'Sketcher node', errors);
    const id = stringValue(node?.nodeId); ids.push(id);
    if (!id) errors.push('Sketcher nodeId is required.');
    for (const field of ['xMm','yMm','zMm']) if (typeof node?.[field] !== 'number' || !Number.isFinite(node[field])) errors.push(`Sketcher node ${id || '?'} ${field} must be finite.`);
  });
  if (new Set(ids).size !== ids.length) errors.push('Sketcher node IDs must be unique.');
  if (canonicalStringify(ids) !== canonicalStringify([...ids].sort())) errors.push('Sketcher nodes are not canonically ordered.');
}

function validateSegments(segments, nodes, errors) {
  if (!Array.isArray(segments)) return errors.push('Sketcher segments must be an array.');
  const nodeById = new Map((nodes || []).map((node) => [node.nodeId, node]));
  const ids = [], pairs = new Set();
  segments.forEach((segment) => {
    exactKeys(segment, SEGMENT_KEYS, 'Sketcher segment', errors);
    const id = stringValue(segment?.segmentId); ids.push(id);
    if (!id) errors.push('Sketcher segmentId is required.');
    if (!COMPONENT_TYPES.includes(segment?.componentType)) errors.push(`Sketcher segment ${id || '?'} componentType is unsupported.`);
    if (!nodeById.has(segment?.startNodeId) || !nodeById.has(segment?.endNodeId)) errors.push(`Sketcher segment ${id || '?'} has a missing endpoint.`);
    if (segment?.startNodeId === segment?.endNodeId) errors.push(`Sketcher segment ${id || '?'} is a self-loop.`);
    const pair = unorderedEndpointKey(segment?.startNodeId, segment?.endNodeId);
    if (pairs.has(pair)) errors.push(`Sketcher duplicate segment endpoint pair: ${pair}.`);
    pairs.add(pair);
    const length = segmentLengthMm(segment, nodeById);
    if (length !== null && length <= SKETCHER_LENGTH_TOLERANCE_MM) errors.push(`Sketcher segment ${id || '?'} is zero-length.`);
  });
  if (new Set(ids).size !== ids.length) errors.push('Sketcher segment IDs must be unique.');
  if (canonicalStringify(ids) !== canonicalStringify([...ids].sort())) errors.push('Sketcher segments are not canonically ordered.');
}

function inspectJson(value, path, active) {
  if (value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}.`); return; }
  if (typeof value !== 'object') throw new TypeError(`Executable or unsupported value at ${path}.`);
  if (active.has(value)) throw new TypeError(`Cyclic value at ${path}.`);
  if (!Array.isArray(value) && !isPlainRecord(value)) throw new TypeError(`Non-plain mutable prototype at ${path}.`);
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) throw new TypeError(`Non-JSON record property at ${path}.`);
  active.add(value);
  if (Array.isArray(value)) {
    if (value.some((_, index) => !Object.prototype.hasOwnProperty.call(value, index))) throw new TypeError(`Sparse array at ${path}.`);
    value.forEach((child, index) => inspectJson(child, `${path}[${index}]`, active));
  } else Object.keys(value).forEach((key) => inspectJson(value[key], `${path}.${key}`, active));
  active.delete(value);
}

function exactKeys(value, keys, label, errors) {
  if (!isPlainRecord(value)) return errors.push(`${label} must be a plain object.`);
  if (canonicalStringify(Object.keys(value).sort()) !== canonicalStringify([...keys].sort())) errors.push(`${label} fields are invalid.`);
}

function withoutHash(value) { const { semanticHash: _hash, ...rest } = value || {}; return rest; }
