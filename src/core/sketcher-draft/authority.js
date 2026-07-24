import { deepFreeze } from '../shared-piping-model/index.js';
import { acceptedAuditEntry, createSketcherDraftAudit, rejectedCommandEvidence } from './audit.js';
import { createSketcherCommand, nextCommandId, validateSketcherCommand } from './command.js';
import { MUTATING_COMMAND_TYPES, SKETCHER_LENGTH_TOLERANCE_MM } from './constants.js';
import { blankSource, createEmptySketcherDraft, createSketcherDraftDocument, nextDraftId, nextNodeId, nextSegmentId } from './document.js';
import { validateSketcherDraftDocument } from './validation.js';

export class SketcherDraftAuthority {
  #document; #undo = []; #redo = []; #entries = []; #lastRejected = null; #commandSequence = 0;

  constructor(initialDocument = createEmptySketcherDraft()) {
    assertDocument(initialDocument);
    this.#document = createSketcherDraftDocument(initialDocument);
  }

  createCommand(commandType, payload = {}) {
    this.#commandSequence += 1;
    return createSketcherCommand({ commandId: nextCommandId(this.#commandSequence), commandType, payload });
  }

  execute(command) {
    const validation = validateSketcherCommand(command);
    if (!validation.ok) return this.#reject(command, 'INVALID_SKETCHER_COMMAND', validation.errors.join(' '));
    if (command.commandType === 'UNDO_EDIT') return this.undo(command);
    if (command.commandType === 'REDO_EDIT') return this.redo(command);
    if (!MUTATING_COMMAND_TYPES.includes(command.commandType)) return this.#reject(command, 'NON_MUTATING_COMMAND', `${command.commandType} is not an edit command.`);
    try {
      const candidate = applyCommand(this.#document, command);
      assertDocument(candidate);
      const previous = this.#document;
      this.#undo.push(previous); this.#redo = []; this.#document = candidate;
      this.#entries.push(acceptedAuditEntry(command, previous, candidate)); this.#lastRejected = null;
      return this.#accepted(command);
    } catch (error) { return this.#reject(command, error.code || 'SKETCHER_COMMAND_REJECTED', error.message); }
  }

  undo(command = this.createCommand('UNDO_EDIT')) {
    if (!this.#undo.length) return this.#reject(command, 'UNDO_HISTORY_EMPTY', 'No Sketcher edit is available to undo.');
    const previous = this.#document, restored = this.#undo.pop();
    this.#redo.push(previous); this.#document = restored;
    this.#entries.push(acceptedAuditEntry(command, previous, restored)); this.#lastRejected = null;
    return this.#accepted(command);
  }

  redo(command = this.createCommand('REDO_EDIT')) {
    if (!this.#redo.length) return this.#reject(command, 'REDO_HISTORY_EMPTY', 'No Sketcher edit is available to redo.');
    const previous = this.#document, restored = this.#redo.pop();
    this.#undo.push(previous); this.#document = restored;
    this.#entries.push(acceptedAuditEntry(command, previous, restored)); this.#lastRejected = null;
    return this.#accepted(command);
  }

  getDocument() { return this.#document; }
  getAudit() { return createSketcherDraftAudit({ document: this.#document, entries: this.#entries, lastRejectedCommand: this.#lastRejected, undoDepth: this.#undo.length, redoDepth: this.#redo.length }); }
  getStatus() { return deepFreeze({ canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0, lastRejectedCommand: this.#lastRejected }); }

  #accepted(command) { return deepFreeze({ accepted: true, command, document: this.#document, audit: this.getAudit() }); }
  #reject(command, code, message) {
    this.#lastRejected = rejectedCommandEvidence(command, code, message);
    return deepFreeze({ accepted: false, command, code, message, document: this.#document, audit: this.getAudit() });
  }
}

function applyCommand(current, command) {
  const nextRevision = current.revision + 1;
  switch (command.commandType) {
    case 'CREATE_EMPTY_DRAFT': return createEmptySketcherDraft({ draftId: nextDraftId(current.draftId), revision: nextRevision, workingPlane: current.workingPlane });
    case 'RESET_DRAFT': return nextDocument(current, { revision: nextRevision, source: blankSource(), nodes: [], segments: [] });
    case 'SET_WORKING_PLANE': return nextDocument(current, { revision: nextRevision, workingPlane: command.payload.workingPlane });
    case 'IMPORT_SKETCH_DOCUMENT': return importExactDocument(command.payload.document);
    case 'IMPORT_WORKSPACE_GEOMETRY': return importDerivedDocument(current, command.payload.document, nextRevision, 'WORKSPACE');
    case 'ADD_PIPE_SEGMENT': return addPipeSegment(current, command.payload, nextRevision);
    case 'MOVE_NODE': return moveNode(current, command.payload, nextRevision);
    case 'DELETE_NODE': return deleteNode(current, command.payload, nextRevision);
    case 'DELETE_SEGMENT': return deleteSegment(current, command.payload, nextRevision);
    default: throw commandError('UNSUPPORTED_SKETCHER_COMMAND', `Unsupported edit command ${command.commandType}.`);
  }
}

function importExactDocument(source) {
  assertDocument(source);
  return createSketcherDraftDocument(source);
}

function importDerivedDocument(current, source, revision, kind) {
  assertDocument(source);
  return createSketcherDraftDocument({
    draftId: nextDraftId(current.draftId), revision, workingPlane: source.workingPlane,
    source: { ...source.source, kind, sourceSemanticHash: source.semanticHash },
    nodes: source.nodes, segments: source.segments,
  });
}

function addPipeSegment(current, payload, revision) {
  const nodes = current.nodes.map((row) => ({ ...row })), segments = current.segments.map((row) => ({ ...row }));
  const start = resolveEndpoint(current, nodes, payload.start, payload, current.workingPlane);
  const end = resolveEndpoint(current, nodes, payload.end, payload, current.workingPlane);
  const segmentId = payload.segmentId || nextSegmentId(segments);
  segments.push({ segmentId, startNodeId: start.nodeId, endNodeId: end.nodeId, componentType: 'PIPE' });
  return nextDocument(current, { revision, nodes, segments });
}

function moveNode(current, payload, revision) {
  const index = current.nodes.findIndex((row) => row.nodeId === payload.nodeId);
  if (index < 0) throw commandError('SKETCHER_NODE_NOT_FOUND', `Node ${payload.nodeId || ''} does not exist.`);
  const nodes = current.nodes.map((row) => ({ ...row }));
  nodes[index] = { nodeId: nodes[index].nodeId, ...projectCoordinates(payload.position, current.workingPlane, payload) };
  return nextDocument(current, { revision, nodes, segments: current.segments });
}

function deleteNode(current, payload, revision) {
  if (!current.nodes.some((row) => row.nodeId === payload.nodeId)) throw commandError('SKETCHER_NODE_NOT_FOUND', `Node ${payload.nodeId || ''} does not exist.`);
  if (current.segments.some((row) => row.startNodeId === payload.nodeId || row.endNodeId === payload.nodeId)) throw commandError('SKETCHER_NODE_REFERENCED', `Node ${payload.nodeId} is referenced and cannot be deleted without an explicit cascade policy.`);
  return nextDocument(current, { revision, nodes: current.nodes.filter((row) => row.nodeId !== payload.nodeId), segments: current.segments });
}

function deleteSegment(current, payload, revision) {
  if (!current.segments.some((row) => row.segmentId === payload.segmentId)) throw commandError('SKETCHER_SEGMENT_NOT_FOUND', `Segment ${payload.segmentId || ''} does not exist.`);
  return nextDocument(current, { revision, nodes: current.nodes, segments: current.segments.filter((row) => row.segmentId !== payload.segmentId) });
}

function resolveEndpoint(current, nodes, endpoint, payload, plane) {
  if (endpoint?.nodeId) {
    const existing = current.nodes.find((row) => row.nodeId === endpoint.nodeId);
    if (!existing) throw commandError('SKETCHER_ENDPOINT_NOT_FOUND', `Endpoint node ${endpoint.nodeId} does not exist.`);
    return existing;
  }
  const node = { nodeId: endpoint?.newNodeId || nextNodeId(nodes), ...projectCoordinates(endpoint, plane, payload) };
  nodes.push(node); return node;
}

function projectCoordinates(position, plane, options) {
  if (!position || typeof position !== 'object') throw commandError('SKETCHER_COORDINATE_REQUIRED', 'Endpoint coordinates are required.');
  const raw = { xMm: position.xMm, yMm: position.yMm, zMm: position.zMm };
  const coordinates = plane === 'XY' ? { xMm: raw.xMm, yMm: raw.yMm, zMm: 0 }
    : plane === 'XZ' ? { xMm: raw.xMm, yMm: 0, zMm: raw.zMm }
      : { xMm: 0, yMm: raw.yMm, zMm: raw.zMm };
  Object.entries(coordinates).forEach(([key, value]) => { if (typeof value !== 'number' || !Number.isFinite(value)) throw commandError('NONFINITE_COORDINATE', `${key} must be finite.`); });
  if (options.snapToGrid === true) {
    const size = options.gridSizeMm;
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= SKETCHER_LENGTH_TOLERANCE_MM) throw commandError('INVALID_GRID_SIZE', 'gridSizeMm must be a positive finite number.');
    Object.keys(coordinates).forEach((key) => { coordinates[key] = normalizeZero(Math.round(coordinates[key] / size) * size); });
  }
  return coordinates;
}

function nextDocument(current, overrides) {
  const { schema: _schema, semanticHash: _hash, units: _units, ...base } = current;
  return createSketcherDraftDocument({ ...base, ...overrides });
}

function assertDocument(document) { const validation = validateSketcherDraftDocument(document); if (!validation.ok) throw commandError('INVALID_SKETCHER_DOCUMENT', validation.errors.join(' ')); }
function normalizeZero(value) { return Object.is(value, -0) ? 0 : value; }
function commandError(code, message) { const error = new TypeError(message); error.code = code; return error; }
