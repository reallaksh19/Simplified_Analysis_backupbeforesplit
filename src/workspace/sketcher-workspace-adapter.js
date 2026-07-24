import { createSketcherWorkspaceAdoption, createSketcherWorkspacePackage, SKETCHER_LENGTH_TOLERANCE_MM } from '../core/sketcher-draft/index.js';
import { buildPipingPortTopologyGraph } from '../core/piping-topology/index.js';
import { normalizeWorkspaceDataset } from './dataset-adapter.js';

export function qualifySketcherWorkspaceAdoption(document) {
  const packageJson = createSketcherWorkspacePackage(document);
  const sourceName = `${document.draftId}-r${document.revision}.sketcher.json`;
  const normalizedDataset = normalizeWorkspaceDataset(packageJson, sourceName);
  const sharedModel = normalizedDataset.sharedModel;
  const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
  const parity = geometryParity(document, sharedModel);
  const proof = {
    normalizedDatasetId: normalizedDataset.datasetId,
    normalizedSharedModelSemanticHash: sharedModel.semanticHash,
    normalizedTopologySemanticHash: topologyGraph.semanticHash,
    normalizedPipeCount: sharedModel.components.filter((row) => row.type === 'PIPE').length,
    coordinatesPreserved: parity.coordinatesPreserved,
    geometryFinite: parity.geometryFinite,
  };
  const adoption = createSketcherWorkspaceAdoption({ document, packageJson, proof });
  return Object.freeze({ packageJson, sourceName, normalizedDataset, sharedModel, topologyGraph, adoption });
}

function geometryParity(document, sharedModel) {
  const nodeById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const componentByKey = new Map(sharedModel.components.map((component) => [component.componentKey, component]));
  let coordinatesPreserved = true, geometryFinite = true;
  document.segments.forEach((segment) => {
    const component = componentByKey.get(segment.segmentId);
    const start = component?.geometry?.start, end = component?.geometry?.end;
    geometryFinite = geometryFinite && finitePoint(start) && finitePoint(end);
    const a = nodeById.get(segment.startNodeId), b = nodeById.get(segment.endNodeId);
    coordinatesPreserved = coordinatesPreserved && Boolean(start && end && (
      samePoint(a, start) && samePoint(b, end) || samePoint(a, end) && samePoint(b, start)
    ));
  });
  if (!geometryFinite) throw adapterError('SKETCHER_ADOPTION_NONFINITE_GEOMETRY', 'Normalized Workspace geometry contains non-finite coordinates.');
  if (!coordinatesPreserved) throw adapterError('SKETCHER_ADOPTION_COORDINATE_MISMATCH', `Normalized Workspace geometry differs by more than ${SKETCHER_LENGTH_TOLERANCE_MM} mm.`);
  return { coordinatesPreserved, geometryFinite };
}

function samePoint(node, point) {
  return Boolean(node && point) && Math.abs(node.xMm - point.x) <= SKETCHER_LENGTH_TOLERANCE_MM
    && Math.abs(node.yMm - point.y) <= SKETCHER_LENGTH_TOLERANCE_MM
    && Math.abs(node.zMm - point.z) <= SKETCHER_LENGTH_TOLERANCE_MM;
}
function finitePoint(point) { return Boolean(point) && ['x','y','z'].every((key) => typeof point[key] === 'number' && Number.isFinite(point[key])); }
function adapterError(code, message) { const error = new TypeError(message); error.code = code; return error; }
