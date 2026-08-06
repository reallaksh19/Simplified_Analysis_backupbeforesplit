import assert from 'node:assert/strict';
import {
  NON_FEA_METHOD,
  TARGET_KIND,
  createPreFeaQualificationProfile,
  createPreFeaWorkspacePreview,
} from '../src/core/pre-fea-piping-checker/index.js';

const geometry = {
  schemaVersion: 'canonical-geometry-v1',
  source: 'workspace-check',
  unit: 'mm',
  valid: true,
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, sourceComponentUid: 'PIPE-1' },
    { id: 'N2', x: 3000, y: 0, z: 0, sourceComponentUid: 'PIPE-1' },
  ],
  segments: [
    { id: 'S1', startNodeId: 'N1', endNodeId: 'N2', type: 'PIPE', sourceComponentUid: 'PIPE-1' },
  ],
  diagnostics: [],
  summary: { nodeCount: 2, segmentCount: 1 },
};

const pipe = {
  id: 'PIPE-1',
  type: 'PIPE',
  attributes: {
    SCHEDULE: 'STD',
    OUTSIDE_DIAMETER_MM: 114.3,
    WALL_THICKNESS_MM: 6.02,
    MATERIAL_DENSITY_KG_M3: 7850,
    FLUID_FILL_STATE: 'EMPTY',
    INSULATION_PRESENT: false,
    MASS_KG: 4.5,
    CENTER_OF_GRAVITY_M: { x: 1.5, y: 0, z: 0 },
  },
};
const exactSupport = {
  id: 'SUP-EXACT',
  type: 'SUPPORT',
  coOrds: { x: 0, y: 0, z: 0 },
  attributes: { SUPPORT_TYPE: 'BILATERAL', AXIS: { x: 0, y: 1, z: 0 }, STIFFNESS_N_M: 1e9, GAP_M: 0, PRELOAD_N: 0, FRICTION_COEFFICIENT: 0 },
};
const nonExactSupport = {
  id: 'SUP-NONEXACT',
  type: 'SUPPORT',
  coOrds: { x: 0.001, y: 0, z: 0 },
  attributes: { SUPPORT_TYPE: 'BILATERAL', AXIS: { x: 0, y: 1, z: 0 }, STIFFNESS_N_M: 1e9, GAP_M: 0, PRELOAD_N: 0, FRICTION_COEFFICIENT: 0 },
};

const defaultPreview = createPreFeaWorkspacePreview({
  canonicalGeometry: geometry,
  components: [pipe, exactSupport, nonExactSupport],
  engineeringDefaults: { gravityVector: { x: 0, y: -9.80665, z: 0 } },
  requestedMethods: [NON_FEA_METHOD.WEIGHT_AND_GRAVITY, NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT],
});

assert.equal(defaultPreview.schema, 'pre-fea-workspace-preview/v1');
assert.equal(defaultPreview.topology.summary.positionCount, 1);
assert.equal(defaultPreview.topology.positions[0].length_m, 3);
assert.equal(defaultPreview.topology.summary.supportCount, 1);
assert.equal(defaultPreview.targetIndex[TARGET_KIND.SUPPORT].length, 2);
assert.equal(defaultPreview.topology.supports[0].supportId, 'SUP-EXACT');
assert.ok(defaultPreview.diagnostics.some((row) => row.code === 'SUPPORT_ATTACHMENT_NOT_EXACT' && row.supportId === 'SUP-NONEXACT'));
assert.equal(defaultPreview.report.methodReadiness.find((row) => row.methodId === NON_FEA_METHOD.WEIGHT_AND_GRAVITY).readinessState, 'NOT_QUALIFIED');
assert.equal(defaultPreview.report.decision, 'BLOCKED');
assert.equal(defaultPreview.commonInput, null);
assert.equal(deepFrozen(defaultPreview), true);

const repeatedPreview = createPreFeaWorkspacePreview({
  canonicalGeometry: geometry,
  components: [pipe, exactSupport, nonExactSupport],
  engineeringDefaults: { gravityVector: { x: 0, y: -9.80665, z: 0 } },
  requestedMethods: [NON_FEA_METHOD.WEIGHT_AND_GRAVITY, NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT],
});
assert.equal(defaultPreview.semanticHash, repeatedPreview.semanticHash);

const qualifiedProfile = createPreFeaQualificationProfile({
  profileId: 'WORKSPACE-WEIGHT-QUALIFIED',
  codeCommitSha: 'workspace-check',
  fixtureHashes: { weightFixture: 'fnv1a64:1111111111111111' },
  guardMutations: { exactSupportOnly: 'fnv1a64:2222222222222222' },
  independentReferenceComparisons: [],
  qualifiedMethodIds: [NON_FEA_METHOD.WEIGHT_AND_GRAVITY],
});
const qualifiedPreview = createPreFeaWorkspacePreview({
  canonicalGeometry: geometry,
  components: [pipe],
  engineeringDefaults: { gravityVector: { x: 0, y: -9.80665, z: 0 } },
  projectDataApprovalState: 'APPROVED',
  qualificationProfile: qualifiedProfile,
  requestedMethods: [NON_FEA_METHOD.WEIGHT_AND_GRAVITY],
  applicability: { [NON_FEA_METHOD.WEIGHT_AND_GRAVITY]: { FILLED_CONTENTS: false, INSULATED: false } },
});
assert.equal(qualifiedPreview.report.methodReadiness.find((row) => row.methodId === NON_FEA_METHOD.WEIGHT_AND_GRAVITY).readinessState, 'READY');
assert.equal(qualifiedPreview.report.decision, 'READY');
assert.ok(qualifiedPreview.commonInput);

const disconnected = createPreFeaWorkspacePreview({
  canonicalGeometry: {
    ...geometry,
    nodes: [...geometry.nodes, { id: 'N3', x: 10000, y: 0, z: 0 }, { id: 'N4', x: 11000, y: 0, z: 0 }],
    segments: [...geometry.segments, { id: 'S2', startNodeId: 'N3', endNodeId: 'N4', type: 'PIPE', sourceComponentUid: 'PIPE-2' }],
  },
  components: [pipe],
});
assert.equal(disconnected.status, 'BLOCKED_TOPOLOGY');
assert.ok(disconnected.diagnostics.some((row) => row.code === 'WORKSPACE_TOPOLOGY_BLOCKED'));

console.log('✅ Non-FEA workspace preview, exact support attachment, qualification binding and deterministic evidence passed.');

function deepFrozen(value) {
  return value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));
}
