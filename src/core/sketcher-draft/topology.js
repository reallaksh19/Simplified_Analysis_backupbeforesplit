import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { DIAGNOSTIC_SEVERITY, SKETCHER_LENGTH_TOLERANCE_MM } from './constants.js';
import { segmentLengthMm, unorderedEndpointKey, validateSketcherDraftDocument } from './validation.js';

export function createSketcherTopologyAudit(document) {
  const validation = validateSketcherDraftDocument(document);
  const diagnostics = validation.ok ? topologyDiagnostics(document) : validationDiagnostics(document, validation.errors);
  const summary = summarize(document, diagnostics);
  const base = { diagnostics, summary, adoptionAllowed: diagnostics.every((row) => row.severity !== DIAGNOSTIC_SEVERITY.ERROR) };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function topologyDiagnostics(document) {
  const nodeById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const adjacency = new Map(document.nodes.map((node) => [node.nodeId, new Set()]));
  const diagnostics = [];
  const pairs = new Set();
  document.segments.forEach((segment) => {
    const pair = unorderedEndpointKey(segment.startNodeId, segment.endNodeId);
    if (pairs.has(pair)) diagnostics.push(diagnostic('DUPLICATE_SEGMENT', DIAGNOSTIC_SEVERITY.ERROR, `Duplicate segment endpoint pair ${pair}.`, segment.segmentId));
    pairs.add(pair);
    const length = segmentLengthMm(segment, nodeById);
    if (length === null) diagnostics.push(diagnostic('MISSING_ENDPOINT', DIAGNOSTIC_SEVERITY.ERROR, `Segment ${segment.segmentId} has a missing endpoint.`, segment.segmentId));
    else if (length <= SKETCHER_LENGTH_TOLERANCE_MM) diagnostics.push(diagnostic('ZERO_LENGTH_SEGMENT', DIAGNOSTIC_SEVERITY.ERROR, `Segment ${segment.segmentId} is zero-length.`, segment.segmentId));
    if (adjacency.has(segment.startNodeId) && adjacency.has(segment.endNodeId)) {
      adjacency.get(segment.startNodeId).add(segment.endNodeId);
      adjacency.get(segment.endNodeId).add(segment.startNodeId);
    }
  });
  document.nodes.forEach((node) => nodeDiagnostics(node, adjacency.get(node.nodeId), diagnostics));
  const components = connectedComponents(adjacency);
  diagnostics.push(diagnostic('CONNECTED_COMPONENT_COUNT', DIAGNOSTIC_SEVERITY.INFO, `Draft contains ${components.length} connected component(s).`, null, { count: components.length }));
  if (containsCycle(adjacency)) diagnostics.push(diagnostic('CLOSED_LOOP', DIAGNOSTIC_SEVERITY.INFO, 'Draft contains at least one closed loop.', null));
  return deepFreeze(diagnostics.sort(diagnosticOrder));
}

function validationDiagnostics(document, errors) {
  const diagnostics = errors.map((message) => diagnostic(codeFor(message), DIAGNOSTIC_SEVERITY.ERROR, message, null));
  const finiteErrors = document?.nodes?.filter((node) => ['xMm','yMm','zMm'].some((field) => !Number.isFinite(node?.[field]))) || [];
  finiteErrors.forEach((node) => diagnostics.push(diagnostic('NONFINITE_COORDINATE', DIAGNOSTIC_SEVERITY.ERROR, `Node ${node.nodeId || '?'} contains a non-finite coordinate.`, node.nodeId || null)));
  return deepFreeze(diagnostics.sort(diagnosticOrder));
}

function nodeDiagnostics(node, peers, diagnostics) {
  const degree = peers?.size || 0;
  if (degree === 0) diagnostics.push(diagnostic('ISOLATED_NODE', DIAGNOSTIC_SEVERITY.WARNING, `Node ${node.nodeId} is isolated.`, node.nodeId));
  if (degree === 1) diagnostics.push(diagnostic('DANGLING_ENDPOINT', DIAGNOSTIC_SEVERITY.INFO, `Node ${node.nodeId} is a dangling endpoint.`, node.nodeId));
  if (degree > 2) diagnostics.push(diagnostic('BRANCH_NODE', DIAGNOSTIC_SEVERITY.INFO, `Node ${node.nodeId} is a branch node with degree ${degree}.`, node.nodeId, { degree }));
}

function connectedComponents(adjacency) {
  const seen = new Set(), rows = [];
  [...adjacency.keys()].sort().forEach((start) => {
    if (seen.has(start)) return;
    const queue = [start], component = [];
    while (queue.length) {
      const nodeId = queue.shift();
      if (seen.has(nodeId)) continue;
      seen.add(nodeId); component.push(nodeId);
      [...(adjacency.get(nodeId) || [])].sort().forEach((peer) => { if (!seen.has(peer)) queue.push(peer); });
    }
    rows.push(component.sort());
  });
  return rows;
}

function containsCycle(adjacency) {
  const seen = new Set();
  const visit = (nodeId, parent) => {
    seen.add(nodeId);
    for (const peer of adjacency.get(nodeId) || []) {
      if (!seen.has(peer)) { if (visit(peer, nodeId)) return true; }
      else if (peer !== parent) return true;
    }
    return false;
  };
  return [...adjacency.keys()].sort().some((nodeId) => !seen.has(nodeId) && visit(nodeId, null));
}

function summarize(document, diagnostics) {
  const componentDiagnostic = diagnostics.find((row) => row.code === 'CONNECTED_COMPONENT_COUNT');
  return deepFreeze({
    nodeCount: document?.nodes?.length || 0, segmentCount: document?.segments?.length || 0,
    connectedComponentCount: componentDiagnostic?.data?.count || 0,
    blockingDiagnosticCount: diagnostics.filter((row) => row.severity === DIAGNOSTIC_SEVERITY.ERROR).length,
    warningCount: diagnostics.filter((row) => row.severity === DIAGNOSTIC_SEVERITY.WARNING).length,
  });
}

function diagnostic(code, severity, message, entityId = null, data = {}) { return deepFreeze({ code, severity, message, entityId, data }); }
function diagnosticOrder(left, right) { return `${left.severity}|${left.code}|${left.entityId || ''}|${left.message}`.localeCompare(`${right.severity}|${right.code}|${right.entityId || ''}|${right.message}`); }
function codeFor(message) { if (/missing endpoint/i.test(message)) return 'MISSING_ENDPOINT'; if (/zero-length/i.test(message)) return 'ZERO_LENGTH_SEGMENT'; if (/duplicate segment/i.test(message)) return 'DUPLICATE_SEGMENT'; if (/finite/i.test(message)) return 'NONFINITE_COORDINATE'; return 'INVALID_DRAFT_DOCUMENT'; }
