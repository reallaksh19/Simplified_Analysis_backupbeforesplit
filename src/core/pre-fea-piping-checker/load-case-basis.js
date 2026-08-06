import { deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { LOAD_CASE, LOAD_CASE_BASIS_SCHEMA } from './constants.js';

export function createGovernedLoadCaseBasis(input = {}) {
  const cases = normalizeCases(input.cases || {});
  const boundarySemantics = normalizeBoundarySemantics(input.boundarySemantics || {});
  const pressureBoundary = normalizePressureBoundary(input.pressureBoundary || {});
  const base = {
    schema: LOAD_CASE_BASIS_SCHEMA,
    governanceInputSemanticHash: requiredString(input.governanceInputSemanticHash, 'governanceInputSemanticHash'),
    globalFrame: deepFreeze({ handedness: 'RIGHT_HANDED', forceConvention: 'FORCE_APPLIED_TO_PIPE', momentConvention: 'RIGHT_HAND_RULE' }),
    cases,
    boundarySemantics,
    pressureBoundary,
    linearSuperpositionPolicy: deepFreeze({
      allowedOnlyWhenLinear: true,
      prohibitedFeatures: deepFreeze(['UNILATERAL_RESTRAINT', 'ACTIVE_GAP', 'FRICTION', 'LIFT_OFF', 'RECONTACT', 'CHANGING_SUPPORT_STATE']),
      directStateCases: deepFreeze([LOAD_CASE.OPE, LOAD_CASE.HYD]),
    }),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function qualifyLoadCaseSuperposition(input = {}) {
  const basis = input.loadCaseBasis;
  if (!basis || basis.schema !== LOAD_CASE_BASIS_SCHEMA) throw new TypeError('A governed load-case basis is required.');
  const leftCase = requiredEnum(input.leftCase, Object.values(LOAD_CASE), 'leftCase');
  const rightCase = requiredEnum(input.rightCase, Object.values(LOAD_CASE), 'rightCase');
  const targetCase = requiredEnum(input.targetCase, Object.values(LOAD_CASE), 'targetCase');
  const reasons = [];
  if (targetCase !== LOAD_CASE.W_PLUS_P || new Set([leftCase, rightCase]).size !== 2 || ![leftCase, rightCase].includes(LOAD_CASE.W) || ![leftCase, rightCase].includes(LOAD_CASE.P)) {
    reasons.push('ONLY_W_PLUS_P_PRESENTATION_SUPERPOSITION_IS_DEFINED');
  }
  if (!stringValue(input.commonInputSemanticHash) || input.leftCommonInputSemanticHash !== input.commonInputSemanticHash || input.rightCommonInputSemanticHash !== input.commonInputSemanticHash) reasons.push('COMMON_INPUT_HASH_MISMATCH');
  if (basis.boundarySemantics.nonlinearFeatures.length) reasons.push('NONLINEAR_BOUNDARY_FEATURE_PRESENT');
  if (input.linearResponse !== true) reasons.push('LINEAR_RESPONSE_NOT_DEMONSTRATED');
  const base = {
    schema: 'load-case-superposition-qualification/v1',
    leftCase,
    rightCase,
    targetCase,
    commonInputSemanticHash: stringValue(input.commonInputSemanticHash) || null,
    qualified: reasons.length === 0,
    state: reasons.length === 0 ? 'QUALIFIED' : 'NOT_QUALIFIED',
    reasons: deepFreeze(reasons.sort()),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateGovernedLoadCaseBasis(value) {
  const errors = [];
  if (!value || value.schema !== LOAD_CASE_BASIS_SCHEMA) errors.push('Invalid governed load-case basis schema.');
  if (!stringValue(value?.governanceInputSemanticHash)) errors.push('Load-case basis governance-input hash is required.');
  if (!isPlainRecord(value?.cases) || !isPlainRecord(value?.boundarySemantics)) errors.push('Load-case basis cases and boundary semantics are required.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Load-case basis semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function normalizeCases(value) {
  const result = {};
  Object.values(LOAD_CASE).forEach((caseId) => {
    const row = isPlainRecord(value[caseId]) ? value[caseId] : {};
    result[caseId] = deepFreeze({
      caseId,
      directState: [LOAD_CASE.OPE, LOAD_CASE.HYD].includes(caseId),
      pressure_Pa: finiteOrNull(row.pressure_Pa),
      temperature_K: finiteOrNull(row.temperature_K),
      fluidState: stringValue(row.fluidState) || null,
      fillState: stringValue(row.fillState) || (caseId === LOAD_CASE.EMPTY ? 'EMPTY' : null),
      stressFreeTemperature_K: finiteOrNull(row.stressFreeTemperature_K),
    });
  });
  return deepFreeze(result);
}
function normalizeBoundarySemantics(value) {
  const nonlinearFeatures = [];
  if (value.hasUnilateralRestraints === true) nonlinearFeatures.push('UNILATERAL_RESTRAINT');
  if (value.hasActiveGaps === true) nonlinearFeatures.push('ACTIVE_GAP');
  if (value.hasFriction === true) nonlinearFeatures.push('FRICTION');
  if (value.hasLiftOff === true) nonlinearFeatures.push('LIFT_OFF');
  if (value.hasRecontact === true) nonlinearFeatures.push('RECONTACT');
  if (value.hasChangingSupportState === true) nonlinearFeatures.push('CHANGING_SUPPORT_STATE');
  return deepFreeze({
    restraintAxesGoverned: value.restraintAxesGoverned === true,
    bilateralOnly: value.bilateralOnly === true,
    nonlinearFeatures: deepFreeze(nonlinearFeatures.sort()),
    frictionRequiresCompressiveContact: true,
    guideAndLineStopNamesDoNotDefineAxes: true,
  });
}
function normalizePressureBoundary(value) {
  const closures = Array.isArray(value.closures) ? value.closures : [];
  return deepFreeze({
    graphDeclared: value.graphDeclared === true,
    closures: deepFreeze(closures.map((row, index) => {
      if (!isPlainRecord(row)) throw new TypeError(`Pressure-boundary closure ${index} must be a record.`);
      return deepFreeze({
        closureId: requiredString(row.closureId, 'closureId'),
        physicalClosure: row.physicalClosure === true,
        effectiveArea_m2: finiteOrNull(row.effectiveArea_m2),
        axis: normalizeAxis(row.axis),
      });
    }).sort((a, b) => a.closureId.localeCompare(b.closureId))),
    inferClosedEndsFromGeometry: false,
  });
}
function normalizeAxis(value) {
  if (!isPlainRecord(value)) return null;
  const axis = { x: finiteOrNull(value.x), y: finiteOrNull(value.y), z: finiteOrNull(value.z) };
  if (Object.values(axis).some((row) => row === null)) throw new TypeError('Pressure-boundary closure axis must be finite.');
  return deepFreeze(axis);
}
function finiteOrNull(value) { if (value === null || value === undefined || value === '') return null; const parsed = Number(value); if (!Number.isFinite(parsed)) throw new TypeError(`Expected a finite number, received ${value}.`); return parsed; }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
function requiredEnum(value, allowed, field) { if (!allowed.includes(value)) throw new TypeError(`${field} has unsupported value ${value}.`); return value; }
