import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  LOAD_CASE, NON_FEA_METHOD, TARGET_KIND,
} from './constants.js';
import { createGovernedLoadCaseBasis } from './load-case-basis.js';
import { createDefaultNonFeaMethodRequirementRegistry } from './method-requirements.js';
import { createPreFeaQualificationProfile } from './qualification.js';
import { createPreFeaCheckRequest } from './checker.js';
import { resolveGovernedField } from './field-resolution.js';
import { sealQualifiedPreFeaPipingInput } from './qualified-seal.js';
import { createGovernedTopologyPos } from './topology.js';

export const PRE_FEA_WORKSPACE_PREVIEW_SCHEMA = 'pre-fea-workspace-preview/v1';

const DEFAULT_REQUESTED_METHODS = deepFreeze(Object.values(NON_FEA_METHOD));
const LENGTH_FACTORS_TO_M = Object.freeze({ m: 1, mm: 1e-3, cm: 1e-2, in: 0.0254, inch: 0.0254, ft: 0.3048 });

const FIELD_ALIASES = Object.freeze({
  gravityVector: ['gravityVector', 'GRAVITY_VECTOR'],
  stressCodeBasis: ['stressCodeBasis', 'STRESS_CODE_BASIS', 'PIPING_CODE'],
  installationTemperature_K: ['installationTemperature_K', 'INSTALLATION_TEMPERATURE_K', 'STRESS_FREE_TEMPERATURE_K'],
  operatingTemperature_K: ['operatingTemperature_K', 'OPERATING_TEMPERATURE_K', 'TEMPERATURE_K'],
  schedule: ['schedule', 'SCHEDULE', 'PIPE_SCHEDULE', 'PIPE-SCHEDULE'],
  outsideDiameter_m: ['outsideDiameter_m', 'OUTSIDE_DIAMETER_M', 'OD_M', 'OUTSIDE_DIAMETER_MM', 'OD_MM', 'OUTSIDE_DIAMETER_IN', 'OD_IN'],
  wallThickness_m: ['wallThickness_m', 'WALL_THICKNESS_M', 'WALL_THICKNESS_MM', 'THICKNESS_MM', 'WALL_THICKNESS_IN', 'THICKNESS_IN'],
  materialDensity_kg_m3: ['materialDensity_kg_m3', 'MATERIAL_DENSITY_KG_M3', 'DENSITY_KG_M3'],
  fluidFillState: ['fluidFillState', 'FLUID_FILL_STATE', 'FILL_STATE'],
  fluidDensity_kg_m3: ['fluidDensity_kg_m3', 'FLUID_DENSITY_KG_M3'],
  insulationPresent: ['insulationPresent', 'INSULATION_PRESENT'],
  insulationThickness_m: ['insulationThickness_m', 'INSULATION_THICKNESS_M', 'INSULATION_THICKNESS_MM', 'INSULATION_THICKNESS_IN'],
  insulationDensity_kg_m3: ['insulationDensity_kg_m3', 'INSULATION_DENSITY_KG_M3'],
  corrosionAllowance_m: ['corrosionAllowance_m', 'CORROSION_ALLOWANCE_M', 'CORROSION_ALLOWANCE_MM', 'CA_MM', 'CORROSION_ALLOWANCE_IN', 'CA_IN'],
  sectionModulus_m3: ['sectionModulus_m3', 'SECTION_MODULUS_M3', 'SECTION_MODULUS_MM3', 'SECTION_MODULUS_IN3'],
  pressure_Pa: ['pressure_Pa', 'PRESSURE_PA', 'PRESSURE_MPA', 'PRESSURE_BAR', 'PRESSURE_PSI'],
  thermalExpansion_1_K: ['thermalExpansion_1_K', 'THERMAL_EXPANSION_1_K', 'ALPHA_1_K'],
  elasticModulus_Pa: ['elasticModulus_Pa', 'ELASTIC_MODULUS_PA', 'ELASTIC_MODULUS_GPA', 'ELASTIC_MODULUS_MPA', 'ELASTIC_MODULUS_PSI'],
  area_m2: ['area_m2', 'AREA_M2', 'AREA_MM2', 'AREA_IN2'],
  pressureBoundaryEffectiveArea_m2: ['pressureBoundaryEffectiveArea_m2', 'PRESSURE_BOUNDARY_EFFECTIVE_AREA_M2', 'PRESSURE_BOUNDARY_EFFECTIVE_AREA_MM2', 'PRESSURE_BOUNDARY_EFFECTIVE_AREA_IN2'],
  mass_kg: ['mass_kg', 'MASS_KG', 'MASS_LB'],
  centerOfGravity_m: ['centerOfGravity_m', 'CENTER_OF_GRAVITY_M'],
  type: ['supportType', 'SUPPORT_TYPE', 'type', 'TYPE', 'SKEY', 'SUPPORT-SKEY'],
  axis: ['axis', 'AXIS', 'SUPPORT_AXIS'],
  stiffness_N_m: ['stiffness_N_m', 'STIFFNESS_N_M', 'STIFFNESS_LBF_IN'],
  gap_m: ['gap_m', 'GAP_M', 'GAP_MM', 'GAP_IN'],
  preload_N: ['preload_N', 'PRELOAD_N', 'PRELOAD_LBF'],
  frictionCoefficient: ['frictionCoefficient', 'FRICTION_COEFFICIENT', 'MU'],
});

export function createPreFeaWorkspacePreview(input = {}) {
  const canonicalGeometry = input.canonicalGeometry || null;
  const components = Array.isArray(input.components) ? input.components : [];
  const engineeringDefaults = input.engineeringDefaults || {};
  const requestedMethods = normalizeRequestedMethods(input.requestedMethods);
  const diagnostics = [];

  if (!canonicalGeometry || !Array.isArray(canonicalGeometry.segments) || canonicalGeometry.segments.length === 0) {
    return createPreviewResult({
      status: 'EMPTY',
      requestedMethods,
      diagnostics: [{ code: 'WORKSPACE_GEOMETRY_EMPTY', severity: 'INFO', message: 'No structural geometry is available for Non-FEA preflight.' }],
    });
  }

  let topologyBuild;
  try {
    topologyBuild = buildGovernedTopologyFromCanonicalGeometry({ canonicalGeometry, components });
    diagnostics.push(...topologyBuild.diagnostics);
  } catch (error) {
    return createPreviewResult({
      status: 'BLOCKED_TOPOLOGY',
      requestedMethods,
      diagnostics: [{ code: 'WORKSPACE_TOPOLOGY_BLOCKED', severity: 'ERROR', message: error instanceof Error ? error.message : String(error) }],
    });
  }

  const sourceGeometryHash = semanticHash(canonicalGeometry);
  const sourceText = String(input.sourceText || '');
  const projectDataHash = semanticHash(engineeringDefaults);
  const request = createPreFeaCheckRequest({
    requestId: stringValue(input.requestId) || `WORKSPACE-${sourceGeometryHash.slice(-16)}`,
    sourcePackageRef: {
      artifactId: 'workspace-source-package',
      sourceName: stringValue(input.sourceName) || canonicalGeometry.source || 'workspace-geometry',
      schema: canonicalGeometry.schemaVersion || null,
      semanticHash: sourceGeometryHash,
      byteHash: semanticHash({ utf8: sourceText, fallbackGeometryHash: sourceGeometryHash }),
      validationState: canonicalGeometry.valid === false ? 'INVALID' : 'VALID',
      approvalState: 'NOT_REQUIRED',
    },
    sharedModelRef: {
      artifactId: 'workspace-canonical-geometry',
      schema: canonicalGeometry.schemaVersion || 'canonical-geometry-v1',
      semanticHash: sourceGeometryHash,
      revision: stringValue(input.geometryRevision) || null,
      validationState: canonicalGeometry.valid === false ? 'INVALID' : 'VALID',
      approvalState: canonicalGeometry.valid === false ? 'INVALID' : 'VALID',
    },
    projectDataRef: {
      artifactId: 'workspace-project-data',
      schema: 'workspace-project-data-preview/v1',
      semanticHash: projectDataHash,
      revision: stringValue(input.projectDataRevision) || null,
      validationState: 'VALID',
      approvalState: stringValue(input.projectDataApprovalState || engineeringDefaults.projectDataApprovalState) || 'UNAPPROVED',
    },
    masterRefs: Array.isArray(input.masterRefs) ? input.masterRefs : [],
    configuredDefaultAuthorityRef: input.configuredDefaultAuthorityRef || null,
    configuredDefaultUsageLedgerRef: input.configuredDefaultUsageLedgerRef || null,
    requestedMethods,
    requestedLoadCaseIds: input.requestedLoadCaseIds || [LOAD_CASE.W, LOAD_CASE.P, LOAD_CASE.W_PLUS_P, LOAD_CASE.OPE],
  });

  const qualificationProfile = input.qualificationProfile || createRuntimePreviewQualificationProfile();
  const loadCaseBasis = input.loadCaseBasis || createGovernedLoadCaseBasis({
    governanceInputSemanticHash: request.semanticHash,
    cases: input.loadCases || {},
    boundarySemantics: deriveBoundarySemantics(components),
    pressureBoundary: input.pressureBoundary || { graphDeclared: false, closures: [] },
  });
  const registry = input.methodRequirementRegistry || createDefaultNonFeaMethodRequirementRegistry();
  const targetIndex = createTargetIndex(topologyBuild, components);
  const applicability = createWorkspaceApplicability({ components, engineeringDefaults, loadCaseBasis, supplied: input.applicability });
  const fieldResolutions = buildWorkspaceFieldResolutions({
    registry,
    topology: topologyBuild.topology,
    components,
    engineeringDefaults,
    targetIndex,
    loadCaseBasis,
  });

  const sealed = sealQualifiedPreFeaPipingInput({
    request,
    topology: topologyBuild.topology,
    fieldResolutions,
    targetIndex,
    applicability,
    loadCaseBasis,
    qualificationProfile,
    methodRequirementRegistry: registry,
  });

  return createPreviewResult({
    status: sealed.report.decision,
    requestedMethods,
    diagnostics,
    topology: topologyBuild.topology,
    targetIndex,
    fieldResolutions,
    report: sealed.report,
    commonInput: sealed.commonInput,
    loadCaseBasis,
    qualificationProfile,
    sourceGeometryHash,
  });
}

export function buildGovernedTopologyFromCanonicalGeometry(input = {}) {
  const geometry = input.canonicalGeometry || {};
  const components = Array.isArray(input.components) ? input.components : [];
  const factor = unitFactor(geometry.unit);
  const sourceModelSemanticHash = semanticHash(geometry);
  const sourceNodes = Array.isArray(geometry.nodes) ? geometry.nodes : [];
  const sourceSegments = Array.isArray(geometry.segments) ? geometry.segments : [];
  const nodeById = new Map(sourceNodes.map((row) => [stringValue(row?.id), row]));
  const structuralSegments = sourceSegments.filter((row) => {
    const start = nodeById.get(stringValue(row?.startNodeId));
    const end = nodeById.get(stringValue(row?.endNodeId));
    if (!start || !end) return false;
    return Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) * factor > 1e-12;
  });
  if (!structuralSegments.length) throw new TypeError('No non-zero structural segments are available for governed POS construction.');

  const structuralNodeIds = new Set(structuralSegments.flatMap((row) => [stringValue(row.startNodeId), stringValue(row.endNodeId)]));
  const nodes = [...structuralNodeIds].sort().map((nodeId) => {
    const source = nodeById.get(nodeId);
    return {
      nodeId,
      position: { x: Number(source.x) * factor, y: Number(source.y) * factor, z: Number(source.z) * factor },
      sourceEntityIds: [stringValue(source.sourceComponentUid), nodeId].filter(Boolean),
      sourceLocator: { canonicalNodeId: nodeId },
    };
  });

  const ordered = orderStructuralSegments(structuralSegments);
  const positions = ordered.map((row) => ({
    posId: `POS-${String(row.globalOrder + 1).padStart(5, '0')}`,
    startNodeId: row.startNodeId,
    endNodeId: row.endNodeId,
    branchId: row.branchId,
    parentBranchId: row.parentBranchId,
    branchOrder: row.branchOrder,
    globalOrder: row.globalOrder,
    sourceEntityIds: [stringValue(row.segment.sourceComponentUid), stringValue(row.segment.id)].filter(Boolean),
    componentIds: [stringValue(row.segment.sourceComponentUid)].filter(Boolean),
    sourceLocator: { canonicalSegmentId: stringValue(row.segment.id) || null },
  }));

  const governedComponents = createGovernedComponents(positions);
  const supportBuild = createExactSupportAttachments({ components, sourceNodes, structuralNodeIds, factor });
  const topology = createGovernedTopologyPos({
    sourceModelSemanticHash,
    nodes,
    positions,
    components: governedComponents,
    supports: supportBuild.supports,
  });
  return deepFreeze({ topology, sourceSupportIds: supportBuild.sourceSupportIds, diagnostics: supportBuild.diagnostics });
}

function buildWorkspaceFieldResolutions(input) {
  const requirements = uniqueFieldRequirements(input.registry);
  const componentById = new Map(input.components.map((row, index) => [componentId(row, index), row]));
  const posById = new Map(input.topology.positions.map((row) => [row.posId, row]));
  const supportById = new Map(input.topology.supports.map((row) => [row.supportId, row]));
  const rows = [];

  requirements.forEach((requirement) => {
    const targetIds = input.targetIndex[requirement.targetKind] || [];
    targetIds.forEach((targetId) => {
      const context = {
        targetKind: requirement.targetKind,
        targetId,
        field: requirement.field,
        engineeringDefaults: input.engineeringDefaults,
        loadCaseBasis: input.loadCaseBasis,
        componentById,
        posById,
        supportById,
      };
      rows.push(resolveWorkspaceField(context));
    });
  });
  return deepFreeze(rows.sort((a, b) => `${a.targetKind}:${a.targetId}:${a.field}`.localeCompare(`${b.targetKind}:${b.targetId}:${b.field}`)));
}

function resolveWorkspaceField(context) {
  if (context.targetKind === TARGET_KIND.PROJECT && context.field === 'loadCaseBasis') {
    return resolveGovernedField({
      targetKind: context.targetKind,
      targetId: context.targetId,
      field: context.field,
      unit: 'designation',
      configuredDerivation: {
        present: true,
        approved: true,
        value: { schema: context.loadCaseBasis.schema, semanticHash: context.loadCaseBasis.semanticHash },
        provenance: { source: 'governed-load-case-basis', semanticHash: context.loadCaseBasis.semanticHash },
      },
    });
  }

  if (context.targetKind === TARGET_KIND.SUPPORT && context.field === 'attachment') {
    const support = context.supportById.get(context.targetId);
    return resolveGovernedField({
      targetKind: context.targetKind,
      targetId: context.targetId,
      field: context.field,
      unit: 'designation',
      configuredDerivation: support ? {
        present: true,
        approved: true,
        value: support.attachment,
        provenance: { source: 'exact-governed-topology', supportId: context.targetId },
      } : null,
    });
  }

  const source = sourceForTarget(context);
  const candidate = readCanonicalField(source, context.field);
  return resolveGovernedField({
    targetKind: context.targetKind,
    targetId: context.targetId,
    field: context.field,
    unit: fieldUnit(context.field),
    sourceExplicit: candidate.present ? {
      present: true,
      value: candidate.value,
      provenance: { source: candidate.source, key: candidate.key, targetId: context.targetId },
    } : null,
  });
}

function sourceForTarget(context) {
  if (context.targetKind === TARGET_KIND.PROJECT) return context.engineeringDefaults;
  if (context.targetKind === TARGET_KIND.COMPONENT || context.targetKind === TARGET_KIND.SUPPORT) return context.componentById.get(context.targetId) || null;
  if (context.targetKind === TARGET_KIND.POS) {
    const pos = context.posById.get(context.targetId);
    const sourceId = pos?.componentIds?.[0] || pos?.sourceEntityIds?.[0];
    return context.componentById.get(sourceId) || null;
  }
  return null;
}

function createTargetIndex(topologyBuild, components) {
  return deepFreeze({
    [TARGET_KIND.PROJECT]: ['PROJECT'],
    [TARGET_KIND.LINE]: [],
    [TARGET_KIND.BRANCH]: [...new Set(topologyBuild.topology.positions.map((row) => row.branchId))].sort(),
    [TARGET_KIND.POS]: topologyBuild.topology.positions.map((row) => row.posId).sort(),
    [TARGET_KIND.COMPONENT]: topologyBuild.topology.components.map((row) => row.componentId).sort(),
    [TARGET_KIND.SUPPORT]: topologyBuild.sourceSupportIds,
  });
}

function createWorkspaceApplicability(input) {
  const sourceSupports = input.components.filter(isSupportComponent);
  const explicitFillStates = input.components.map((row) => readCanonicalField(row, 'fluidFillState')).filter((row) => row.present).map((row) => String(row.value).toUpperCase());
  const explicitInsulation = input.components.map((row) => readCanonicalField(row, 'insulationPresent')).filter((row) => row.present).map((row) => row.value === true);
  const base = {
    [NON_FEA_METHOD.WEIGHT_AND_GRAVITY]: {
      FILLED_CONTENTS: explicitFillStates.length === 0 || explicitFillStates.some((value) => value !== 'EMPTY'),
      INSULATED: explicitInsulation.length === 0 || explicitInsulation.some(Boolean),
    },
    [NON_FEA_METHOD.SUSTAINED_STRESS]: {
      PRESSURE_STRESS_INCLUDED: input.engineeringDefaults.includePressureStress !== false,
    },
    [NON_FEA_METHOD.COMBINED_OPERATING_REACTION]: {
      PRESSURE_THRUST_APPLICABLE: input.loadCaseBasis.pressureBoundary.closures.some((row) => row.physicalClosure),
    },
    [NON_FEA_METHOD.SUSTAINED_REACTIONS]: { qualified: sourceSupports.length > 0 },
    [NON_FEA_METHOD.RESTRAINT_REACTIONS]: { qualified: sourceSupports.length > 0 },
    [NON_FEA_METHOD.VERTICAL_CONTACT]: { qualified: sourceSupports.length > 0 },
  };
  Object.entries(input.supplied || {}).forEach(([methodId, value]) => { base[methodId] = { ...(base[methodId] || {}), ...(value || {}) }; });
  return deepFreeze(base);
}

function createRuntimePreviewQualificationProfile() {
  return createPreFeaQualificationProfile({
    profileId: 'RUNTIME-WORKSPACE-PREVIEW-UNQUALIFIED',
    codeCommitSha: 'runtime-workspace-preview',
    fixtureHashes: { foundationContractSuite: semanticHash('pre-fea-piping-checker-contract-check') },
    guardMutations: { noImplicitQualification: semanticHash('qualification-profile-method-binding') },
    independentReferenceComparisons: [],
    qualifiedMethodIds: [NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT],
  });
}

function createPreviewResult(input) {
  const summary = {
    nodeCount: input.topology?.summary?.nodeCount || 0,
    positionCount: input.topology?.summary?.positionCount || 0,
    branchCount: input.topology?.summary?.branchCount || 0,
    supportCount: input.topology?.summary?.supportCount || 0,
    sourceSupportCount: input.targetIndex?.[TARGET_KIND.SUPPORT]?.length || 0,
    resolvedFieldCount: (input.fieldResolutions || []).filter((row) => row.authorityLevel !== 'BLOCK').length,
    blockedFieldCount: (input.fieldResolutions || []).filter((row) => row.authorityLevel === 'BLOCK').length,
    readyMethodCount: input.report?.methodReadiness?.filter((row) => row.readinessState === 'READY').length || 0,
  };
  const base = {
    schema: PRE_FEA_WORKSPACE_PREVIEW_SCHEMA,
    status: input.status,
    requestedMethods: input.requestedMethods,
    sourceGeometryHash: input.sourceGeometryHash || null,
    topology: input.topology || null,
    targetIndex: input.targetIndex || null,
    fieldResolutions: input.fieldResolutions || [],
    report: input.report || null,
    commonInput: input.commonInput || null,
    loadCaseBasis: input.loadCaseBasis || null,
    qualificationProfile: input.qualificationProfile || null,
    diagnostics: deepFreeze(input.diagnostics || []),
    summary: deepFreeze(summary),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function orderStructuralSegments(segments) {
  const normalized = segments.map((segment, index) => ({ segment, sourceOrder: index, id: stringValue(segment.id) || `SEG-${index + 1}` }));
  const adjacency = new Map();
  normalized.forEach((row) => {
    [row.segment.startNodeId, row.segment.endNodeId].forEach((nodeId) => {
      const key = stringValue(nodeId);
      const list = adjacency.get(key) || [];
      list.push(row);
      adjacency.set(key, list);
    });
  });
  adjacency.forEach((rows) => rows.sort(compareSegmentRows));

  const visited = new Set();
  const ordered = [];
  const branchOrders = new Map();
  let branchSequence = 0;
  let globalOrder = 0;
  const newBranch = (parentBranchId = null) => ({ branchId: `B${String(++branchSequence).padStart(4, '0')}`, parentBranchId });

  function walk(nodeId, branch) {
    const candidates = (adjacency.get(nodeId) || []).filter((row) => !visited.has(row.id));
    candidates.forEach((row, index) => {
      const activeBranch = index === 0 ? branch : newBranch(branch.branchId);
      visited.add(row.id);
      const startNodeId = nodeId;
      const endNodeId = stringValue(row.segment.startNodeId) === nodeId ? stringValue(row.segment.endNodeId) : stringValue(row.segment.startNodeId);
      const branchOrder = branchOrders.get(activeBranch.branchId) || 0;
      branchOrders.set(activeBranch.branchId, branchOrder + 1);
      ordered.push({ ...row, startNodeId, endNodeId, branchId: activeBranch.branchId, parentBranchId: activeBranch.parentBranchId, branchOrder, globalOrder: globalOrder++ });
      walk(endNodeId, activeBranch);
    });
  }

  const roots = [...adjacency.entries()].filter(([, rows]) => rows.length === 1).map(([nodeId]) => nodeId).sort();
  roots.forEach((nodeId) => { if ((adjacency.get(nodeId) || []).some((row) => !visited.has(row.id))) walk(nodeId, newBranch(null)); });
  normalized.sort(compareSegmentRows).forEach((row) => {
    if (visited.has(row.id)) return;
    const startNodeId = [stringValue(row.segment.startNodeId), stringValue(row.segment.endNodeId)].sort()[0];
    walk(startNodeId, newBranch(null));
  });
  return ordered;
}

function createGovernedComponents(positions) {
  const nodesByComponent = new Map();
  positions.forEach((pos) => {
    pos.componentIds.forEach((componentIdValue) => {
      const set = nodesByComponent.get(componentIdValue) || new Set();
      set.add(pos.startNodeId);
      set.add(pos.endNodeId);
      nodesByComponent.set(componentIdValue, set);
    });
  });
  return [...nodesByComponent.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([componentIdValue, nodeIds]) => ({
    componentId: componentIdValue,
    endpointNodeIds: [...nodeIds].sort(),
    sourceEntityIds: [componentIdValue],
  }));
}

function createExactSupportAttachments(input) {
  const supports = [];
  const diagnostics = [];
  const sourceSupportIds = [];
  const structuralNodes = input.sourceNodes.filter((row) => input.structuralNodeIds.has(stringValue(row.id)));
  input.components.forEach((component, index) => {
    if (!isSupportComponent(component)) return;
    const supportId = componentId(component, index);
    sourceSupportIds.push(supportId);
    const point = supportPoint(component);
    if (!point) {
      diagnostics.push({ code: 'SUPPORT_ATTACHMENT_MISSING_COORDINATE', severity: 'ERROR', message: `Support ${supportId} has no exact source coordinate.`, supportId });
      return;
    }
    const matches = structuralNodes.filter((node) => exactPointMatch(point, node));
    if (matches.length !== 1) {
      diagnostics.push({
        code: matches.length ? 'SUPPORT_ATTACHMENT_AMBIGUOUS' : 'SUPPORT_ATTACHMENT_NOT_EXACT',
        severity: 'ERROR',
        message: matches.length ? `Support ${supportId} matches more than one structural node.` : `Support ${supportId} does not exactly match a structural node; no proximity repair was attempted.`,
        supportId,
      });
      return;
    }
    supports.push({ supportId, attachment: { nodeId: stringValue(matches[0].id) }, sourceEntityIds: [supportId] });
  });
  return {
    supports: supports.sort((a, b) => a.supportId.localeCompare(b.supportId)),
    sourceSupportIds: sourceSupportIds.sort(),
    diagnostics: diagnostics.sort((a, b) => `${a.code}:${a.supportId}`.localeCompare(`${b.code}:${b.supportId}`)),
  };
}

function uniqueFieldRequirements(registry) {
  const byKey = new Map();
  registry.definitions.forEach((definition) => definition.requirements.forEach((requirement) => {
    if (requirement.requirementType !== 'FIELD') return;
    const key = `${requirement.targetKind}:${requirement.field}`;
    if (!byKey.has(key)) byKey.set(key, { targetKind: requirement.targetKind, field: requirement.field });
  }));
  return [...byKey.values()].sort((a, b) => `${a.targetKind}:${a.field}`.localeCompare(`${b.targetKind}:${b.field}`));
}

function readCanonicalField(source, field) {
  if (!source) return { present: false };
  const aliases = FIELD_ALIASES[field] || [field];
  const containers = [source, source.attributes || {}, source.properties || {}, source.engineering || {}];
  for (const container of containers) {
    for (const key of aliases) {
      if (!Object.prototype.hasOwnProperty.call(container, key)) continue;
      const raw = container[key];
      const value = canonicalFieldValue(field, raw, key);
      if (value !== null && value !== undefined) return { present: true, value, key, source: 'workspace-source-explicit' };
    }
  }
  return { present: false };
}

function canonicalFieldValue(field, raw, key) {
  const wrapped = raw && typeof raw === 'object' && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, 'value');
  const value = wrapped ? raw.value : raw;
  const unit = wrapped ? String(raw.unit || '') : '';
  if (field === 'gravityVector' || field === 'axis' || field === 'centerOfGravity_m') return normalizeVector(value, field, key, unit);
  if (field === 'insulationPresent') return explicitBoolean(value);
  if (['schedule', 'stressCodeBasis', 'fluidFillState', 'type'].includes(field)) return value === null || value === undefined || String(value).trim() === '' ? null : String(value).trim();
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const token = `${key}_${unit}`.toUpperCase();
  if (field.endsWith('_m')) return convertLength(number, token, key === field);
  if (field.endsWith('_m2')) return convertArea(number, token, key === field);
  if (field.endsWith('_m3')) return convertVolume(number, token, key === field);
  if (field.endsWith('_Pa')) return convertPressure(number, token, key === field);
  if (field === 'mass_kg') return token.includes('LB') ? number * 0.45359237 : number;
  if (field === 'preload_N') return token.includes('LBF') ? number * 4.4482216152605 : number;
  if (field === 'stiffness_N_m') return token.includes('LBF_IN') ? number * 175.126835246 : number;
  if (field.endsWith('_K')) {
    if (token.includes('_C')) return number + 273.15;
    if (token.includes('_F')) return (number - 32) * 5 / 9 + 273.15;
    return number;
  }
  return number;
}

function normalizeVector(value, field, key, unit) {
  if (!value || typeof value !== 'object') return null;
  const vector = { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
  if (Object.values(vector).some((row) => !Number.isFinite(row))) return null;
  if (field !== 'centerOfGravity_m') return vector;
  const token = `${key}_${unit}`.toUpperCase();
  const factor = token.includes('MM') ? 1e-3 : token.includes('IN') ? 0.0254 : token.includes('FT') ? 0.3048 : 1;
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function convertLength(value, token, canonicalKey) {
  if (token.includes('MM')) return value * 1e-3;
  if (token.includes('IN')) return value * 0.0254;
  if (token.includes('FT')) return value * 0.3048;
  return canonicalKey || token.includes('_M') ? value : null;
}
function convertArea(value, token, canonicalKey) {
  if (token.includes('MM2')) return value * 1e-6;
  if (token.includes('IN2')) return value * 0.00064516;
  return canonicalKey || token.includes('M2') ? value : null;
}
function convertVolume(value, token, canonicalKey) {
  if (token.includes('MM3')) return value * 1e-9;
  if (token.includes('IN3')) return value * 0.000016387064;
  return canonicalKey || token.includes('M3') ? value : null;
}
function convertPressure(value, token, canonicalKey) {
  if (token.includes('GPA')) return value * 1e9;
  if (token.includes('MPA')) return value * 1e6;
  if (token.includes('BAR')) return value * 1e5;
  if (token.includes('PSI')) return value * 6894.757293168;
  return canonicalKey || token.includes('PA') ? value : null;
}

function deriveBoundarySemantics(components) {
  const supportRows = components.filter(isSupportComponent);
  return {
    restraintAxesGoverned: supportRows.length > 0 && supportRows.every((row) => readCanonicalField(row, 'axis').present),
    bilateralOnly: supportRows.length > 0 && supportRows.every((row) => String(readCanonicalField(row, 'type').value || '').toUpperCase().includes('BILATERAL')),
    hasUnilateralRestraints: supportRows.some((row) => String(readCanonicalField(row, 'type').value || '').toUpperCase().includes('UNILATERAL')),
    hasActiveGaps: supportRows.some((row) => Number(readCanonicalField(row, 'gap_m').value || 0) > 0),
    hasFriction: supportRows.some((row) => Number(readCanonicalField(row, 'frictionCoefficient').value || 0) > 0),
  };
}

function normalizeRequestedMethods(value) {
  const rows = Array.isArray(value) && value.length ? value : DEFAULT_REQUESTED_METHODS;
  const normalized = [...new Set(rows.map(stringValue).filter((row) => Object.values(NON_FEA_METHOD).includes(row)))].sort();
  return deepFreeze(normalized.length ? normalized : [...DEFAULT_REQUESTED_METHODS]);
}
function fieldUnit(field) {
  if (field.endsWith('_m')) return 'm';
  if (field.endsWith('_m2')) return 'm2';
  if (field.endsWith('_m3')) return 'm3';
  if (field.endsWith('_Pa')) return 'Pa';
  if (field.endsWith('_kg_m3')) return 'kg/m3';
  if (field === 'mass_kg') return 'kg';
  if (field === 'stiffness_N_m') return 'N/m';
  if (field === 'preload_N') return 'N';
  if (field.endsWith('_K')) return 'K';
  if (field === 'gravityVector') return 'm/s2';
  if (field === 'frictionCoefficient') return '1';
  if (field === 'insulationPresent') return 'boolean';
  return 'designation';
}
function unitFactor(unit) {
  const factor = LENGTH_FACTORS_TO_M[String(unit || 'mm').trim().toLowerCase()];
  if (!factor) throw new TypeError(`Unsupported workspace geometry length unit ${unit}.`);
  return factor;
}
function componentId(component, index) { return stringValue(component?.id || component?.uid) || `workspace-component-${index + 1}`; }
function isSupportComponent(component) { return String(component?.type || '').trim().toUpperCase().includes('SUPPORT'); }
function supportPoint(component) { return component?.coOrds || component?.coords || component?.points?.[0] || component?.centrePoint || null; }
function exactPointMatch(point, node) { return Number(point.x) === Number(node.x) && Number(point.y) === Number(node.y) && Number(point.z) === Number(node.z); }
function explicitBoolean(value) {
  if (value === true || value === false) return value;
  const token = String(value).trim().toUpperCase();
  if (['TRUE', 'YES', '1'].includes(token)) return true;
  if (['FALSE', 'NO', '0'].includes(token)) return false;
  return null;
}
function compareSegmentRows(a, b) { return a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id); }
