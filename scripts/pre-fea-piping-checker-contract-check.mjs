import assert from 'node:assert/strict';
import {
  FIELD_RESOLUTION_STATUS, NON_FEA_METHOD, SEAL_DECISION, TARGET_KIND,
  createCalculationReceipt, createEnrichedStagedJsonExport, createGovernedLoadCaseBasis,
  createGovernedTopologyPos, createPreFeaCheckRequest, createPreFeaQualificationProfile,
  evaluateReceiptStaleness, importEnrichedStagedJson, qualifyLoadCaseSuperposition,
  resolveGovernedField, sealPreFeaPipingInput, validateCommonEnrichedPipingInput,
  validatePreFeaCheckReport,
} from '../src/core/pre-fea-piping-checker/index.js';

const topology = createGovernedTopologyPos({
  sourceModelSemanticHash: 'fnv1a64:1111111111111111',
  nodes: [
    { nodeId: 'N1', position: { x: 0, y: 0, z: 0 }, sourceEntityIds: ['SRC-N1'] },
    { nodeId: 'N2', position: { x: 3, y: 0, z: 0 }, sourceEntityIds: ['SRC-N2'] },
  ],
  positions: [
    { posId: 'POS-001', startNodeId: 'N1', endNodeId: 'N2', branchId: 'B1', branchOrder: 0, globalOrder: 0, sourceEntityIds: ['SRC-POS-001'] },
  ],
});
assert.equal(topology.summary.positionCount, 1);
assert.equal(topology.positions[0].length_m, 3);
assert.equal(deepFrozen(topology), true);
assert.throws(() => createGovernedTopologyPos({
  sourceModelSemanticHash: 'fnv1a64:1111111111111111',
  nodes: [{ nodeId: 'N1', position: { x: 0, y: 0, z: 0 } }, { nodeId: 'N2', position: { x: 0, y: 0, z: 0 } }],
  positions: [{ posId: 'P1', startNodeId: 'N1', endNodeId: 'N2', branchId: 'B1', branchOrder: 0, globalOrder: 0 }],
}), /zero or invalid structural length/i);

const zeroGap = resolveGovernedField({
  targetKind: TARGET_KIND.SUPPORT, targetId: 'S1', field: 'gap_m', unit: 'm',
  sourceExplicit: { present: true, value: 0, provenance: { source: 'PCF', locator: 'SUPPORT/1' } },
});
assert.equal(zeroGap.status, FIELD_RESOLUTION_STATUS.RESOLVED_SOURCE);
assert.equal(zeroGap.value, 0);

const prohibitedScheduleDefault = resolveGovernedField({
  targetKind: TARGET_KIND.POS, targetId: 'POS-001', field: 'schedule', unit: 'designation',
  configuredDefault: { present: true, value: 'STD', approved: true, scopeQualified: true, provenance: { defaultId: 'D-SCH' } },
});
assert.equal(prohibitedScheduleDefault.status, FIELD_RESOLUTION_STATUS.BLOCKED_OUTSIDE_SCOPE);
assert.equal(prohibitedScheduleDefault.value, null);

const ambiguousMaster = resolveGovernedField({
  targetKind: TARGET_KIND.POS, targetId: 'POS-001', field: 'outsideDiameter_m', unit: 'm',
  exactMasterRows: [
    { present: true, value: 0.1143, approved: true, provenance: { row: 10 } },
    { present: true, value: 0.1143, approved: true, provenance: { row: 11 } },
  ],
});
assert.equal(ambiguousMaster.status, FIELD_RESOLUTION_STATUS.BLOCKED_AMBIGUOUS);

const request = createPreFeaCheckRequest({
  requestId: 'REQ-001',
  sourcePackageRef: { sourceName: 'fixture.pcf', schema: 'pcf-source/v1', semanticHash: 'fnv1a64:aaaaaaaaaaaaaaaa', byteHash: 'fnv1a64:bbbbbbbbbbbbbbbb', validationState: 'VALID', approvalState: 'NOT_REQUIRED' },
  sharedModelRef: { artifactId: 'shared', schema: 'shared-piping-model/v1', semanticHash: topology.sourceModelSemanticHash, revision: '1', validationState: 'VALID', approvalState: 'VALID' },
  projectDataRef: { artifactId: 'project-data', schema: 'project-data/v1', semanticHash: 'fnv1a64:cccccccccccccccc', revision: '7', validationState: 'VALID', approvalState: 'APPROVED' },
  masterRefs: [{ artifactId: 'pipe-master', schema: 'pipe-master/v1', semanticHash: 'fnv1a64:dddddddddddddddd', revision: '2026.08', validationState: 'VALID', approvalState: 'APPROVED' }],
  requestedMethods: [NON_FEA_METHOD.WEIGHT_AND_GRAVITY, NON_FEA_METHOD.SUSTAINED_STRESS, NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT],
  requestedLoadCaseIds: ['W', 'P', 'W+P'],
});

const qualificationProfile = createPreFeaQualificationProfile({
  profileId: 'PRE-FEA-NONFEA-001', codeCommitSha: 'c47e69e4991599795d137035fcc94c017b7b7a7c',
  fixtureHashes: { 'positive-source-only': 'fnv1a64:0101010101010101', 'negative-schedule-default': 'fnv1a64:0202020202020202' },
  guardMutations: { 'schedule-default-guard': 'fnv1a64:0303030303030303' },
  independentReferenceComparisons: [{ methodId: NON_FEA_METHOD.SUSTAINED_REACTIONS, tool: 'reference-tool', evidenceHash: 'fnv1a64:0404040404040404' }],
  qualifiedMethodIds: [NON_FEA_METHOD.WEIGHT_AND_GRAVITY, NON_FEA_METHOD.SUSTAINED_STRESS],
});

const loadCaseBasis = createGovernedLoadCaseBasis({
  governanceInputSemanticHash: request.semanticHash,
  cases: { W: { fillState: 'EMPTY' }, P: { pressure_Pa: 1_000_000 }, 'W+P': { pressure_Pa: 1_000_000 } },
  boundarySemantics: { restraintAxesGoverned: true, bilateralOnly: true },
  pressureBoundary: { graphDeclared: true, closures: [] },
});

const fields = [
  field(TARGET_KIND.PROJECT, 'PROJECT', 'gravityVector', { x: 0, y: -9.80665, z: 0 }, 'm/s2'),
  field(TARGET_KIND.PROJECT, 'PROJECT', 'stressCodeBasis', 'B31.3-2024', 'designation'),
  field(TARGET_KIND.POS, 'POS-001', 'schedule', 'STD', 'designation'),
  field(TARGET_KIND.POS, 'POS-001', 'outsideDiameter_m', 0.1143, 'm'),
  field(TARGET_KIND.POS, 'POS-001', 'wallThickness_m', 0.00602, 'm'),
  field(TARGET_KIND.POS, 'POS-001', 'materialDensity_kg_m3', 7850, 'kg/m3'),
  field(TARGET_KIND.POS, 'POS-001', 'fluidFillState', 'EMPTY', 'designation'),
  field(TARGET_KIND.POS, 'POS-001', 'insulationPresent', false, 'boolean'),
  field(TARGET_KIND.POS, 'POS-001', 'corrosionAllowance_m', 0, 'm'),
  field(TARGET_KIND.POS, 'POS-001', 'sectionModulus_m3', 0.000014, 'm3'),
  resolveGovernedField({ targetKind: TARGET_KIND.POS, targetId: 'POS-001', field: 'pressure_Pa', unit: 'Pa' }),
];

const sealed = sealPreFeaPipingInput({
  request,
  topology,
  fieldResolutions: fields,
  targetIndex: { PROJECT: ['PROJECT'], POS: ['POS-001'], COMPONENT: [], SUPPORT: [] },
  applicability: { [NON_FEA_METHOD.WEIGHT_AND_GRAVITY]: { FILLED_CONTENTS: false, INSULATED: false } },
  loadCaseBasis,
  qualificationProfile,
});
assert.equal(sealed.report.decision, SEAL_DECISION.PARTIALLY_READY);
assert.ok(sealed.commonInput);
assert.equal(validateCommonEnrichedPipingInput(sealed.commonInput).ok, true);
assert.equal(validatePreFeaCheckReport(sealed.report).ok, true);
assert.equal(sealed.report.methodReadiness.find((row) => row.methodId === NON_FEA_METHOD.WEIGHT_AND_GRAVITY).readinessState, 'READY');
assert.notEqual(sealed.report.methodReadiness.find((row) => row.methodId === NON_FEA_METHOD.SUSTAINED_STRESS).readinessState, 'READY');
assert.equal(sealed.commonInput.fieldResolutions.find((row) => row.field === 'pressure_Pa').value, null);
assert.equal(deepFrozen(sealed), true);

const exportA = createEnrichedStagedJsonExport({ commonInput: sealed.commonInput, report: sealed.report });
const exportB = createEnrichedStagedJsonExport({ commonInput: sealed.commonInput, report: sealed.report });
assert.equal(exportA.semanticHash, exportB.semanticHash);
assert.equal(exportA.content, exportB.content);
const imported = importEnrichedStagedJson(exportA.content);
assert.equal(imported.commonInput.semanticHash, sealed.commonInput.semanticHash);
assert.equal(imported.calculatedOutputs, null);

const nonlinearBasis = createGovernedLoadCaseBasis({
  governanceInputSemanticHash: request.semanticHash,
  cases: { W: {}, P: {}, 'W+P': {} },
  boundarySemantics: { restraintAxesGoverned: true, hasFriction: true },
  pressureBoundary: { graphDeclared: true, closures: [] },
});
const superposition = qualifyLoadCaseSuperposition({
  loadCaseBasis: nonlinearBasis, leftCase: 'W', rightCase: 'P', targetCase: 'W+P',
  commonInputSemanticHash: sealed.commonInput.semanticHash,
  leftCommonInputSemanticHash: sealed.commonInput.semanticHash,
  rightCommonInputSemanticHash: sealed.commonInput.semanticHash,
  linearResponse: true,
});
assert.equal(superposition.state, 'NOT_QUALIFIED');
assert.ok(superposition.reasons.includes('NONLINEAR_BOUNDARY_FEATURE_PRESENT'));

const receipt = createCalculationReceipt({
  calculationId: 'CALC-1', commonInputSemanticHash: sealed.commonInput.semanticHash,
  methodId: NON_FEA_METHOD.WEIGHT_AND_GRAVITY, methodVersion: '1.0.0', loadCaseId: 'W',
  numericalPolicySemanticHash: 'fnv1a64:0505050505050505', qualificationProfileSemanticHash: qualificationProfile.semanticHash,
});
assert.equal(evaluateReceiptStaleness(receipt, {
  commonInputSemanticHash: 'fnv1a64:ffffffffffffffff', methodVersion: '1.0.0',
  numericalPolicySemanticHash: 'fnv1a64:0505050505050505', qualificationProfileSemanticHash: qualificationProfile.semanticHash,
}).stale, true);

const blockedRequest = createPreFeaCheckRequest({
  ...JSON.parse(JSON.stringify(request)), requestId: 'REQ-002',
  sharedModelRef: { ...request.sharedModelRef, validationState: 'INVALID' },
});
const blocked = sealPreFeaPipingInput({
  request: blockedRequest, topology, fieldResolutions: fields,
  targetIndex: { PROJECT: ['PROJECT'], POS: ['POS-001'], COMPONENT: [], SUPPORT: [] },
  applicability: { [NON_FEA_METHOD.WEIGHT_AND_GRAVITY]: { FILLED_CONTENTS: false, INSULATED: false } },
  loadCaseBasis: createGovernedLoadCaseBasis({ governanceInputSemanticHash: blockedRequest.semanticHash, cases: {}, boundarySemantics: {}, pressureBoundary: {} }),
  qualificationProfile,
});
assert.equal(blocked.report.decision, SEAL_DECISION.BLOCKED);
assert.equal(blocked.commonInput, null);

console.log('✅ Non-FEA preflight contracts, topology guards, field authority, partial readiness, sealing, deterministic export and staleness passed.');

function field(targetKind, targetId, name, value, unit) {
  return resolveGovernedField({ targetKind, targetId, field: name, unit, sourceExplicit: { present: true, value, provenance: { source: 'fixture' } } });
}
function deepFrozen(value) { return value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen)); }
