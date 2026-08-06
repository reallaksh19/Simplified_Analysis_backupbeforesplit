import { canonicalStringify, deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  BLOCKED_FIELD_STATUSES, FIELD_RESOLUTION_STATUS, METHOD_READINESS_STATE,
  METHOD_REQUIREMENT_REGISTRY_SCHEMA, NON_FEA_METHOD, TARGET_KIND,
} from './constants.js';
import { fieldResolutionKey, validateFieldResolutionRecord } from './field-resolution.js';

export function createDefaultNonFeaMethodRequirementRegistry() {
  return createMethodRequirementRegistry({
    definitions: [
      definition(NON_FEA_METHOD.WEIGHT_AND_GRAVITY, [
        req(TARGET_KIND.PROJECT, 'gravityVector'),
        req(TARGET_KIND.POS, 'schedule'), req(TARGET_KIND.POS, 'outsideDiameter_m'), req(TARGET_KIND.POS, 'wallThickness_m'),
        req(TARGET_KIND.POS, 'materialDensity_kg_m3'), req(TARGET_KIND.POS, 'fluidFillState'),
        req(TARGET_KIND.POS, 'fluidDensity_kg_m3', 'FILLED_CONTENTS'),
        req(TARGET_KIND.POS, 'insulationPresent'), req(TARGET_KIND.POS, 'insulationThickness_m', 'INSULATED'),
        req(TARGET_KIND.POS, 'insulationDensity_kg_m3', 'INSULATED'),
        req(TARGET_KIND.COMPONENT, 'mass_kg'), req(TARGET_KIND.COMPONENT, 'centerOfGravity_m'),
      ], 'QUALIFIED_CLOSED_FORM'),
      definition(NON_FEA_METHOD.SUSTAINED_REACTIONS, [
        reqMethod(NON_FEA_METHOD.WEIGHT_AND_GRAVITY), req(TARGET_KIND.SUPPORT, 'attachment'), req(TARGET_KIND.SUPPORT, 'type'),
        req(TARGET_KIND.SUPPORT, 'axis'), req(TARGET_KIND.SUPPORT, 'stiffness_N_m'), req(TARGET_KIND.SUPPORT, 'gap_m'),
      ], 'QUALIFIED_REFERENCE_TOOL_REQUIRED'),
      definition(NON_FEA_METHOD.SUSTAINED_MEMBER_ACTIONS, [reqMethod(NON_FEA_METHOD.SUSTAINED_REACTIONS)], 'QUALIFIED_REFERENCE_TOOL_REQUIRED'),
      definition(NON_FEA_METHOD.SUSTAINED_STRESS, [
        reqMethod(NON_FEA_METHOD.SUSTAINED_MEMBER_ACTIONS), req(TARGET_KIND.PROJECT, 'stressCodeBasis'),
        req(TARGET_KIND.POS, 'corrosionAllowance_m'), req(TARGET_KIND.POS, 'sectionModulus_m3'),
        req(TARGET_KIND.POS, 'pressure_Pa', 'PRESSURE_STRESS_INCLUDED'),
      ], 'QUALIFIED_CLOSED_FORM'),
      definition(NON_FEA_METHOD.THERMAL_FREE_DISPLACEMENT, [
        req(TARGET_KIND.PROJECT, 'installationTemperature_K'), req(TARGET_KIND.PROJECT, 'operatingTemperature_K'),
        req(TARGET_KIND.POS, 'thermalExpansion_1_K'),
      ], 'QUALIFIED_CLOSED_FORM'),
      definition(NON_FEA_METHOD.RESTRAINT_REACTIONS, [
        reqMethod(NON_FEA_METHOD.THERMAL_FREE_DISPLACEMENT), req(TARGET_KIND.POS, 'elasticModulus_Pa'),
        req(TARGET_KIND.POS, 'area_m2'), req(TARGET_KIND.SUPPORT, 'attachment'), req(TARGET_KIND.SUPPORT, 'type'),
        req(TARGET_KIND.SUPPORT, 'axis'), req(TARGET_KIND.SUPPORT, 'stiffness_N_m'), req(TARGET_KIND.SUPPORT, 'gap_m'),
        req(TARGET_KIND.SUPPORT, 'preload_N'),
      ], 'QUALIFIED_REFERENCE_TOOL_REQUIRED'),
      definition(NON_FEA_METHOD.VERTICAL_CONTACT, [
        reqMethod(NON_FEA_METHOD.RESTRAINT_REACTIONS), req(TARGET_KIND.SUPPORT, 'frictionCoefficient'),
      ], 'QUALIFIED_REFERENCE_TOOL_REQUIRED'),
      definition(NON_FEA_METHOD.COMBINED_OPERATING_REACTION, [
        reqMethod(NON_FEA_METHOD.WEIGHT_AND_GRAVITY), reqMethod(NON_FEA_METHOD.RESTRAINT_REACTIONS),
        req(TARGET_KIND.PROJECT, 'loadCaseBasis'), req(TARGET_KIND.POS, 'pressure_Pa'),
        req(TARGET_KIND.POS, 'pressureBoundaryEffectiveArea_m2', 'PRESSURE_THRUST_APPLICABLE'),
      ], 'QUALIFIED_REFERENCE_TOOL_REQUIRED'),
      definition(NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT, [], 'QUALIFIED_DETERMINISTIC_EXPORT'),
    ],
  });
}

export function createMethodRequirementRegistry(input = {}) {
  if (!Array.isArray(input.definitions)) throw new TypeError('Method requirement definitions must be an array.');
  const definitions = input.definitions.map(normalizeDefinition).sort((a, b) => a.methodId.localeCompare(b.methodId));
  const methodIds = definitions.map((row) => row.methodId);
  if (new Set(methodIds).size !== methodIds.length) throw new TypeError('Method requirement definitions contain duplicate methodId values.');
  const base = { schema: METHOD_REQUIREMENT_REGISTRY_SCHEMA, definitions };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function evaluateMethodReadiness(input = {}) {
  const registry = input.registry || createDefaultNonFeaMethodRequirementRegistry();
  validateRegistryOrThrow(registry);
  const requested = new Set(Array.isArray(input.requestedMethods) ? input.requestedMethods : []);
  requested.forEach((methodId) => { if (!registry.definitions.some((row) => row.methodId === methodId)) throw new TypeError(`Unknown requested Non-FEA method ${methodId}.`); });
  const rows = normalizeFieldRows(input.fieldResolutions || []);
  const rowByKey = new Map(rows.map((row) => [fieldResolutionKey(row), row]));
  const targetIndex = normalizeTargetIndex(input.targetIndex || {});
  const applicability = isPlainRecord(input.applicability) ? input.applicability : {};
  const definitionsById = new Map(registry.definitions.map((row) => [row.methodId, row]));
  const resultByMethod = new Map();
  const active = new Set();

  function evaluate(methodId, inheritedRequest = false) {
    if (resultByMethod.has(methodId)) {
      const cached = resultByMethod.get(methodId);
      if (!(inheritedRequest && cached.readinessState === METHOD_READINESS_STATE.NOT_REQUESTED)) return cached;
      resultByMethod.delete(methodId);
    }
    if (active.has(methodId)) throw new TypeError(`Method requirement dependency cycle detected at ${methodId}.`);
    const definitionRow = definitionsById.get(methodId);
    if (!definitionRow) throw new TypeError(`Unknown Non-FEA method dependency ${methodId}.`);
    const requestedMethod = requested.has(methodId) || inheritedRequest;
    if (!requestedMethod) {
      const row = readinessRow(definitionRow, METHOD_READINESS_STATE.NOT_REQUESTED, [], [], []);
      resultByMethod.set(methodId, row);
      return row;
    }
    active.add(methodId);
    const blockers = [];
    const usedFieldKeys = [];
    const dependencies = [];
    definitionRow.requirements.forEach((requirement) => {
      if (requirement.requirementType === 'METHOD') {
        dependencies.push(requirement.methodId);
        const dependency = evaluate(requirement.methodId, true);
        if (dependency.readinessState !== METHOD_READINESS_STATE.READY) blockers.push(blocker('METHOD_DEPENDENCY_BLOCKED', requirement.methodId, null, dependency.readinessState));
        return;
      }
      if (applicability?.[definitionRow.methodId]?.[requirement.condition] === false) return;
      const targetIds = targetIdsFor(targetIndex, requirement.targetKind);
      if (!targetIds.length) return;
      targetIds.forEach((targetId) => {
        const key = `${requirement.targetKind}:${targetId}:${requirement.field}`;
        const row = rowByKey.get(key);
        if (!row) {
          blockers.push(blocker('REQUIRED_FIELD_RECORD_MISSING', requirement.field, key, FIELD_RESOLUTION_STATUS.BLOCKED_MISSING));
          return;
        }
        usedFieldKeys.push(key);
        if (BLOCKED_FIELD_STATUSES.includes(row.status)) blockers.push(blocker('REQUIRED_FIELD_BLOCKED', requirement.field, key, row.status));
        if (row.status === FIELD_RESOLUTION_STATUS.NOT_APPLICABLE) blockers.push(blocker('REQUIRED_FIELD_NOT_APPLICABLE', requirement.field, key, row.status));
      });
    });
    if (applicability?.[definitionRow.methodId]?.qualified === false) blockers.push(blocker('METHOD_NOT_QUALIFIED', definitionRow.methodId, null, METHOD_READINESS_STATE.NOT_QUALIFIED));
    active.delete(methodId);
    const row = readinessRow(definitionRow, readinessStateFor(blockers), blockers, usedFieldKeys, dependencies);
    resultByMethod.set(methodId, row);
    return row;
  }

  registry.definitions.forEach((definitionRow) => evaluate(definitionRow.methodId, false));
  return deepFreeze([...resultByMethod.values()].sort((a, b) => a.methodId.localeCompare(b.methodId)));
}

export function validateMethodRequirementRegistry(value) {
  const errors = [];
  if (!value || value.schema !== METHOD_REQUIREMENT_REGISTRY_SCHEMA) errors.push('Invalid method requirement registry schema.');
  if (!Array.isArray(value?.definitions)) errors.push('Method requirement registry definitions are required.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Method requirement registry semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeDefinition(row) {
  const methodId = requiredEnum(row?.methodId, Object.values(NON_FEA_METHOD), 'methodId');
  const requirements = Array.isArray(row.requirements) ? row.requirements.map(normalizeRequirement) : [];
  return deepFreeze({ methodId, requirements, qualificationBasis: requiredString(row.qualificationBasis, 'qualificationBasis') });
}
function normalizeRequirement(row) {
  if (row?.requirementType === 'METHOD') return deepFreeze({ requirementType: 'METHOD', methodId: requiredEnum(row.methodId, Object.values(NON_FEA_METHOD), 'methodId') });
  return deepFreeze({
    requirementType: 'FIELD',
    targetKind: requiredEnum(row?.targetKind, Object.values(TARGET_KIND), 'targetKind'),
    field: requiredString(row?.field, 'field'),
    condition: stringValue(row?.condition || 'ALWAYS'),
  });
}
function normalizeFieldRows(rows) {
  const result = rows.map((row) => {
    const validation = validateFieldResolutionRecord(row);
    if (!validation.ok) throw new TypeError(`Invalid field resolution row: ${validation.errors.join(' ')}`);
    return row;
  });
  const keys = result.map(fieldResolutionKey);
  if (new Set(keys).size !== keys.length) throw new TypeError('Duplicate field resolution identities are not allowed.');
  return result;
}
function normalizeTargetIndex(value) {
  const result = {};
  Object.values(TARGET_KIND).forEach((kind) => {
    const rows = Array.isArray(value[kind]) ? value[kind].map(stringValue).filter(Boolean) : [];
    result[kind] = deepFreeze([...new Set(rows)].sort());
  });
  if (!result[TARGET_KIND.PROJECT].length) result[TARGET_KIND.PROJECT] = deepFreeze(['PROJECT']);
  return deepFreeze(result);
}
function targetIdsFor(index, kind) { return index[kind] || []; }
function readinessRow(definitionRow, readinessState, blockers, usedFieldKeys, dependencies) {
  const base = {
    schema: 'non-fea-method-readiness/v1',
    methodId: definitionRow.methodId,
    readinessState,
    qualificationBasis: definitionRow.qualificationBasis,
    blockingFieldKeys: deepFreeze([...new Set(blockers.map((row) => row.fieldKey).filter(Boolean))].sort()),
    blockers: deepFreeze([...blockers].sort((a, b) => canonicalStringify(a).localeCompare(canonicalStringify(b)))),
    usedFieldKeys: deepFreeze([...new Set(usedFieldKeys)].sort()),
    methodDependencies: deepFreeze([...new Set(dependencies)].sort()),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
function readinessStateFor(blockers) {
  if (!blockers.length) return METHOD_READINESS_STATE.READY;
  const statuses = blockers.map((row) => row.status);
  if (statuses.includes(METHOD_READINESS_STATE.NOT_QUALIFIED)) return METHOD_READINESS_STATE.NOT_QUALIFIED;
  if (statuses.includes(FIELD_RESOLUTION_STATUS.BLOCKED_STALE_SOURCE)) return METHOD_READINESS_STATE.BLOCKED_STALE_SOURCE;
  if (statuses.includes(FIELD_RESOLUTION_STATUS.BLOCKED_CONFLICT)) return METHOD_READINESS_STATE.BLOCKED_CONFLICTING_FIELDS;
  if (statuses.includes(FIELD_RESOLUTION_STATUS.BLOCKED_AMBIGUOUS)) return METHOD_READINESS_STATE.BLOCKED_AMBIGUOUS_FIELDS;
  if (statuses.includes(FIELD_RESOLUTION_STATUS.BLOCKED_UNAPPROVED) || statuses.includes(FIELD_RESOLUTION_STATUS.BLOCKED_OUTSIDE_SCOPE)) return METHOD_READINESS_STATE.BLOCKED_UNAPPROVED_FIELDS;
  if (statuses.includes(FIELD_RESOLUTION_STATUS.NOT_APPLICABLE)) return METHOD_READINESS_STATE.BLOCKED_APPLICABILITY;
  return METHOD_READINESS_STATE.BLOCKED_MISSING_FIELDS;
}
function blocker(code, field, fieldKey, status) { return deepFreeze({ code, field, fieldKey, status }); }
function definition(methodId, requirements, qualificationBasis) { return { methodId, requirements, qualificationBasis }; }
function req(targetKind, field, condition = 'ALWAYS') { return { requirementType: 'FIELD', targetKind, field, condition }; }
function reqMethod(methodId) { return { requirementType: 'METHOD', methodId }; }
function validateRegistryOrThrow(value) { const validation = validateMethodRequirementRegistry(value); if (!validation.ok) throw new TypeError(validation.errors.join(' ')); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
function requiredEnum(value, allowed, field) { if (!allowed.includes(value)) throw new TypeError(`${field} has unsupported value ${value}.`); return value; }
