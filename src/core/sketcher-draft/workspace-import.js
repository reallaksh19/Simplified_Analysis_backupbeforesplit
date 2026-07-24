import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { IMPORT_FIDELITY, SKETCHER_WORKSPACE_IMPORT_SCHEMA } from './constants.js';
import { createSketcherDraftDocument, nextDraftId } from './document.js';

export function importWorkspaceGeometryToSketcher({ sharedModel, topologyGraph = null, currentDraftId = 'draft-000', revision = 0 }) {
  const diagnostics = [], mappings = [];
  if (!sharedModel || sharedModel.schema !== 'shared-piping-model/v1') return rejectedImport('WORKSPACE_SHARED_MODEL_UNAVAILABLE', 'A valid shared-piping-model/v1 is required.', currentDraftId, revision);
  const components = [...(sharedModel.components || [])].sort((a, b) => stringValue(a.componentKey).localeCompare(stringValue(b.componentKey)));
  const pipeComponents = components.filter((row) => stringValue(row.type).toUpperCase() === 'PIPE');
  components.filter((row) => stringValue(row.type).toUpperCase() !== 'PIPE').forEach((row) => diagnostics.push(importDiagnostic('UNSUPPORTED_WORKSPACE_ENTITY', 'WARNING', `Workspace component ${row.componentKey} of type ${row.type} is not supported by W10.R4.`, row.componentKey)));
  const topology = topologyEvidence(topologyGraph, diagnostics);
  const nodeState = createNodeState(topology);
  const segments = [];
  pipeComponents.forEach((component, index) => {
    const points = componentEndpoints(component);
    if (!points) {
      diagnostics.push(importDiagnostic('UNSUPPORTED_PIPE_GEOMETRY', 'ERROR', `Workspace pipe ${component.componentKey} lacks finite start/end centerline geometry.`, component.componentKey));
      return;
    }
    const startPortKey = `${component.componentKey}:port:start`, endPortKey = `${component.componentKey}:port:end`;
    const startNode = materializeNode(nodeState, startPortKey, points.start);
    const endNode = materializeNode(nodeState, endPortKey, points.end);
    const segmentId = `S${String(index + 1).padStart(3, '0')}`;
    segments.push({ segmentId, startNodeId: startNode.nodeId, endNodeId: endNode.nodeId, componentType: 'PIPE' });
    mappings.push({ sourceComponentKey: component.componentKey, segmentId, startPortKey, endPortKey });
  });
  const fidelity = importFidelity(pipeComponents.length, segments.length, diagnostics, topologyGraph);
  const source = { kind: 'WORKSPACE', sourceDatasetId: sharedModel.project?.datasetId || null, sourceSemanticHash: sharedModel.semanticHash || null, fidelity };
  const document = createSketcherDraftDocument({ draftId: nextDraftId(currentDraftId), revision, workingPlane: 'XY', source, nodes: [...nodeState.nodes.values()], segments });
  const base = { schema: SKETCHER_WORKSPACE_IMPORT_SCHEMA, fidelity, document, diagnostics: diagnostics.sort(diagnosticOrder), sourceMappings: mappings.sort((a, b) => a.sourceComponentKey.localeCompare(b.sourceComponentKey)) };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function topologyEvidence(topologyGraph, diagnostics) {
  if (!topologyGraph || topologyGraph.schema !== 'piping-port-topology-graph/v1') {
    diagnostics.push(importDiagnostic('WORKSPACE_TOPOLOGY_UNAVAILABLE', 'WARNING', 'Topology evidence is unavailable; endpoint identity is not inferred from coordinate proximity.', null));
    return new Map();
  }
  const parent = new Map();
  (topologyGraph.ports || []).forEach((port) => parent.set(port.portKey, port.portKey));
  (topologyGraph.connections || []).forEach((connection) => union(parent, connection.portAKey, connection.portBKey));
  return parent;
}

function createNodeState(parent) { return { parent, nodes: new Map(), nodeByRoot: new Map(), next: 1 }; }

function materializeNode(state, portKey, point) {
  const root = state.parent.has(portKey) ? find(state.parent, portKey) : portKey;
  const existingId = state.nodeByRoot.get(root);
  if (existingId) {
    const existing = state.nodes.get(existingId);
    if (!samePoint(existing, point)) throw new TypeError(`Connected Workspace port ${portKey} has inconsistent coordinates.`);
    return existing;
  }
  const nodeId = `N${String(state.next++).padStart(3, '0')}`;
  const node = { nodeId, xMm: point.x, yMm: point.y, zMm: point.z };
  state.nodeByRoot.set(root, nodeId); state.nodes.set(nodeId, node); return node;
}

function componentEndpoints(component) {
  const start = finitePoint(component?.geometry?.start), end = finitePoint(component?.geometry?.end);
  return start && end ? { start, end } : null;
}
function finitePoint(point) { return point && ['x','y','z'].every((key) => typeof point[key] === 'number' && Number.isFinite(point[key])) ? { x: point.x, y: point.y, z: point.z } : null; }
function samePoint(node, point) { return node.xMm === point.x && node.yMm === point.y && node.zMm === point.z; }

function importFidelity(pipeCount, segmentCount, diagnostics, topologyGraph) {
  if (!segmentCount || diagnostics.some((row) => row.severity === 'ERROR')) return IMPORT_FIDELITY.REJECTED;
  if (pipeCount !== segmentCount || diagnostics.some((row) => row.severity === 'WARNING') || !topologyGraph) return IMPORT_FIDELITY.PARTIAL_WITH_DIAGNOSTICS;
  return IMPORT_FIDELITY.FULL_FIDELITY;
}

function rejectedImport(code, message, currentDraftId, revision) {
  const diagnostics = [importDiagnostic(code, 'ERROR', message, null)];
  const document = createSketcherDraftDocument({ draftId: nextDraftId(currentDraftId), revision, workingPlane: 'XY', source: { kind: 'WORKSPACE', sourceDatasetId: null, sourceSemanticHash: null, fidelity: IMPORT_FIDELITY.REJECTED }, nodes: [], segments: [] });
  const base = { schema: SKETCHER_WORKSPACE_IMPORT_SCHEMA, fidelity: IMPORT_FIDELITY.REJECTED, document, diagnostics, sourceMappings: [] };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function importDiagnostic(code, severity, message, sourceEntityId) { return deepFreeze({ code, severity, message, sourceEntityId }); }
function diagnosticOrder(a, b) { return `${a.severity}|${a.code}|${a.sourceEntityId || ''}`.localeCompare(`${b.severity}|${b.code}|${b.sourceEntityId || ''}`); }
function find(parent, key) { const value = parent.get(key); if (!value || value === key) return key; const root = find(parent, value); parent.set(key, root); return root; }
function union(parent, left, right) { if (!parent.has(left)) parent.set(left, left); if (!parent.has(right)) parent.set(right, right); const a = find(parent, left), b = find(parent, right); if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); }
