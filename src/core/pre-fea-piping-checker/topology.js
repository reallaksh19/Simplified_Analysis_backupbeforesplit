import { canonicalStringify, deepFreeze, finiteNumber, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { GOVERNED_TOPOLOGY_POS_SCHEMA } from './constants.js';

const ZERO_LENGTH_TOLERANCE_M = 1e-12;

export function createGovernedTopologyPos(input = {}) {
  const errors = [];
  const nodes = normalizeNodes(input.nodes, errors);
  const nodeById = new Map(nodes.map((row) => [row.nodeId, row]));
  const positions = normalizePositions(input.positions, nodeById, errors);
  validateIdentityAndOrder(nodes, positions, errors);
  validateConnectivity(nodes, positions, errors);
  validateExactOverlaps(positions, errors);
  const components = normalizeComponents(input.components, nodeById, errors);
  const supports = normalizeSupports(input.supports, nodeById, positions, errors);
  if (errors.length) throw new TypeError(`Governed topology/POS is invalid: ${errors.join(' ')}`);

  const base = {
    schema: GOVERNED_TOPOLOGY_POS_SCHEMA,
    sourceModelSemanticHash: requiredString(input.sourceModelSemanticHash, 'sourceModelSemanticHash'),
    units: deepFreeze({ length: 'm' }),
    nodes,
    positions,
    components,
    supports,
    summary: deepFreeze({
      nodeCount: nodes.length,
      positionCount: positions.length,
      componentCount: components.length,
      supportCount: supports.length,
      branchCount: new Set(positions.map((row) => row.branchId)).size,
      totalLength_m: positions.reduce((sum, row) => sum + row.length_m, 0),
    }),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateGovernedTopologyPos(value) {
  const errors = [];
  if (!value || value.schema !== GOVERNED_TOPOLOGY_POS_SCHEMA) errors.push('Invalid governed topology/POS schema.');
  if (!Array.isArray(value?.nodes) || !Array.isArray(value?.positions)) errors.push('Topology nodes and positions are required.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Governed topology/POS semantic hash mismatch.');
  if (!errors.length) {
    try {
      const rebuilt = createGovernedTopologyPos({
        sourceModelSemanticHash: value.sourceModelSemanticHash,
        nodes: value.nodes,
        positions: value.positions,
        components: value.components,
        supports: value.supports,
      });
      if (rebuilt.semanticHash !== value.semanticHash) errors.push('Governed topology/POS does not match canonical normalization.');
    } catch (error) {
      errors.push(error.message);
    }
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeNodes(rows, errors) {
  if (!Array.isArray(rows) || rows.length < 2) {
    errors.push('At least two topology nodes are required.');
    return [];
  }
  return [...rows].map((row, index) => {
    const nodeId = stringValue(row?.nodeId);
    if (!nodeId) errors.push(`Node ${index} is missing nodeId.`);
    const position = normalizePoint(row?.position, `node ${nodeId || index}`, errors);
    return deepFreeze({
      nodeId,
      position,
      sourceEntityIds: sortedUniqueStrings(row?.sourceEntityIds || []),
      sourceLocator: normalizeOptionalRecord(row?.sourceLocator),
    });
  }).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function normalizePositions(rows, nodeById, errors) {
  if (!Array.isArray(rows) || rows.length < 1) {
    errors.push('At least one structural POS record is required.');
    return [];
  }
  return [...rows].map((row, index) => {
    const posId = stringValue(row?.posId);
    const startNodeId = stringValue(row?.startNodeId);
    const endNodeId = stringValue(row?.endNodeId);
    const branchId = stringValue(row?.branchId);
    const branchOrder = finiteNumber(row?.branchOrder);
    const globalOrder = finiteNumber(row?.globalOrder);
    if (!posId) errors.push(`POS ${index} is missing posId.`);
    if (!startNodeId || !endNodeId) errors.push(`POS ${posId || index} requires startNodeId and endNodeId.`);
    if (startNodeId === endNodeId) errors.push(`POS ${posId || index} cannot connect a node to itself.`);
    if (!branchId) errors.push(`POS ${posId || index} is missing branchId.`);
    if (!Number.isInteger(branchOrder) || branchOrder < 0) errors.push(`POS ${posId || index} branchOrder must be a non-negative integer.`);
    if (!Number.isInteger(globalOrder) || globalOrder < 0) errors.push(`POS ${posId || index} globalOrder must be a non-negative integer.`);
    const start = nodeById.get(startNodeId);
    const end = nodeById.get(endNodeId);
    if (!start || !end) errors.push(`POS ${posId || index} references an unknown endpoint node.`);
    const length_m = start && end ? distance(start.position, end.position) : NaN;
    if (!Number.isFinite(length_m) || length_m <= ZERO_LENGTH_TOLERANCE_M) errors.push(`POS ${posId || index} has zero or invalid structural length.`);
    return deepFreeze({
      posId,
      startNodeId,
      endNodeId,
      branchId,
      parentBranchId: stringValue(row?.parentBranchId) || null,
      branchOrder,
      globalOrder,
      length_m,
      sourceEntityIds: sortedUniqueStrings(row?.sourceEntityIds || []),
      sectionTransitionId: stringValue(row?.sectionTransitionId) || null,
      relationshipId: stringValue(row?.relationshipId) || null,
      componentIds: sortedUniqueStrings(row?.componentIds || []),
      sourceLocator: normalizeOptionalRecord(row?.sourceLocator),
    });
  }).sort((a, b) => a.globalOrder - b.globalOrder || a.branchOrder - b.branchOrder || a.posId.localeCompare(b.posId));
}

function normalizeComponents(rows, nodeById, errors) {
  if (!Array.isArray(rows)) return deepFreeze([]);
  const result = rows.map((row, index) => {
    const componentId = stringValue(row?.componentId);
    const endpointNodeIds = sortedUniqueStrings(row?.endpointNodeIds || []);
    if (!componentId) errors.push(`Component ${index} is missing componentId.`);
    if (!endpointNodeIds.length) errors.push(`Component ${componentId || index} requires at least one governed endpoint node.`);
    endpointNodeIds.forEach((nodeId) => { if (!nodeById.has(nodeId)) errors.push(`Component ${componentId || index} references unknown node ${nodeId}.`); });
    return deepFreeze({ componentId, endpointNodeIds, sourceEntityIds: sortedUniqueStrings(row?.sourceEntityIds || []), sourceLocator: normalizeOptionalRecord(row?.sourceLocator) });
  }).sort((a, b) => a.componentId.localeCompare(b.componentId));
  duplicateValues(result.map((row) => row.componentId)).forEach((id) => errors.push(`Duplicate componentId ${id}.`));
  return deepFreeze(result);
}

function normalizeSupports(rows, nodeById, positions, errors) {
  if (!Array.isArray(rows)) return deepFreeze([]);
  const posById = new Map(positions.map((row) => [row.posId, row]));
  const result = rows.map((row, index) => {
    const supportId = stringValue(row?.supportId);
    const nodeId = stringValue(row?.attachment?.nodeId);
    const posId = stringValue(row?.attachment?.posId);
    const station_m = finiteNumber(row?.attachment?.station_m);
    const nodeAttachment = Boolean(nodeId);
    const posAttachment = Boolean(posId);
    if (!supportId) errors.push(`Support ${index} is missing supportId.`);
    if (nodeAttachment === posAttachment) errors.push(`Support ${supportId || index} must attach to exactly one node or POS station.`);
    if (nodeAttachment && !nodeById.has(nodeId)) errors.push(`Support ${supportId || index} references unknown node ${nodeId}.`);
    if (posAttachment) {
      const pos = posById.get(posId);
      if (!pos) errors.push(`Support ${supportId || index} references unknown POS ${posId}.`);
      if (!Number.isFinite(station_m) || station_m < 0 || (pos && station_m > pos.length_m)) errors.push(`Support ${supportId || index} has an invalid POS station.`);
    }
    return deepFreeze({
      supportId,
      attachment: nodeAttachment ? deepFreeze({ nodeId }) : deepFreeze({ posId, station_m }),
      sourceEntityIds: sortedUniqueStrings(row?.sourceEntityIds || []),
      sourceLocator: normalizeOptionalRecord(row?.sourceLocator),
    });
  }).sort((a, b) => a.supportId.localeCompare(b.supportId));
  duplicateValues(result.map((row) => row.supportId)).forEach((id) => errors.push(`Duplicate supportId ${id}.`));
  return deepFreeze(result);
}

function validateIdentityAndOrder(nodes, positions, errors) {
  duplicateValues(nodes.map((row) => row.nodeId)).forEach((id) => errors.push(`Duplicate nodeId ${id}.`));
  duplicateValues(positions.map((row) => row.posId)).forEach((id) => errors.push(`Duplicate posId ${id}.`));
  duplicateValues(positions.map((row) => String(row.globalOrder))).forEach((id) => errors.push(`Duplicate globalOrder ${id}.`));
  const branchOrderKeys = positions.map((row) => `${row.branchId}:${row.branchOrder}`);
  duplicateValues(branchOrderKeys).forEach((id) => errors.push(`Duplicate branch ordering ${id}.`));
  const branchParents = new Map();
  positions.forEach((row) => {
    const existing = branchParents.get(row.branchId);
    if (existing !== undefined && existing !== row.parentBranchId) errors.push(`Branch ${row.branchId} has conflicting parent ownership.`);
    branchParents.set(row.branchId, row.parentBranchId);
  });
  positions.forEach((row) => {
    if (!row.parentBranchId) return;
    const parentRows = positions.filter((candidate) => candidate.branchId === row.parentBranchId);
    if (!parentRows.length) errors.push(`Branch ${row.branchId} references unknown parent branch ${row.parentBranchId}.`);
    if (parentRows.some((parent) => parent.globalOrder >= row.globalOrder)) errors.push(`Parent branch ${row.parentBranchId} must precede child branch ${row.branchId}.`);
  });
}

function validateConnectivity(nodes, positions, errors) {
  if (!positions.length) return;
  const adjacency = new Map(nodes.map((row) => [row.nodeId, new Set()]));
  positions.forEach((row) => { adjacency.get(row.startNodeId)?.add(row.endNodeId); adjacency.get(row.endNodeId)?.add(row.startNodeId); });
  const activeIds = new Set(positions.flatMap((row) => [row.startNodeId, row.endNodeId]));
  const first = activeIds.values().next().value;
  const visited = new Set(first ? [first] : []);
  const queue = first ? [first] : [];
  while (queue.length) {
    const current = queue.shift();
    adjacency.get(current)?.forEach((next) => { if (!visited.has(next)) { visited.add(next); queue.push(next); } });
  }
  const disconnected = [...activeIds].filter((id) => !visited.has(id));
  if (disconnected.length) errors.push(`Declared structural network is disconnected at nodes ${disconnected.sort().join(', ')}.`);
  const isolatedDeclared = nodes.map((row) => row.nodeId).filter((id) => !activeIds.has(id));
  if (isolatedDeclared.length) errors.push(`Declared topology contains isolated nodes ${isolatedDeclared.sort().join(', ')}.`);
}

function validateExactOverlaps(positions, errors) {
  const byPair = new Map();
  positions.forEach((row) => {
    const key = [row.startNodeId, row.endNodeId].sort().join('|');
    const group = byPair.get(key) || [];
    group.push(row);
    byPair.set(key, group);
  });
  byPair.forEach((group, key) => {
    if (group.length > 1 && group.some((row) => !row.relationshipId)) errors.push(`Overlapping active POS records at ${key} require an explicit relationshipId.`);
  });
}

function normalizePoint(value, label, errors) {
  if (!isPlainRecord(value)) { errors.push(`${label} requires a position record.`); return deepFreeze({ x: NaN, y: NaN, z: NaN }); }
  const point = { x: finiteNumber(value.x), y: finiteNumber(value.y), z: finiteNumber(value.z) };
  if (Object.values(point).some((item) => !Number.isFinite(item))) errors.push(`${label} position must contain finite x, y and z coordinates.`);
  return deepFreeze(point);
}
function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
function sortedUniqueStrings(rows) { return deepFreeze([...new Set(rows.map(stringValue).filter(Boolean))].sort()); }
function duplicateValues(values) { const seen = new Set(); const duplicates = new Set(); values.forEach((value) => { if (seen.has(value)) duplicates.add(value); seen.add(value); }); return [...duplicates].sort(); }
function normalizeOptionalRecord(value) { return isPlainRecord(value) ? deepFreeze(JSON.parse(canonicalStringify(value))) : null; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
