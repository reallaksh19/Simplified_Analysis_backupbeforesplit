import { deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import {
  AUTHORITY_LEVEL, COMMON_ENRICHED_INPUT_SCHEMA, GATE_STATE, METHOD_READINESS_STATE, NON_FEA_METHOD,
  PACKAGE_BLOCKING_GATES, PREFLIGHT_GATE, PREFLIGHT_GATE_ORDER, PRE_FEA_CHECK_REPORT_SCHEMA,
  PRE_FEA_CHECK_REQUEST_SCHEMA, SEAL_DECISION,
} from './constants.js';
import { fieldResolutionKey, validateFieldResolutionRecord } from './field-resolution.js';
import { createCommonPipingLineageGraph } from './lineage.js';
import { validateGovernedLoadCaseBasis } from './load-case-basis.js';
import {
  createDefaultNonFeaMethodRequirementRegistry, evaluateMethodReadiness, validateMethodRequirementRegistry,
} from './method-requirements.js';
import { validatePreFeaQualificationProfile } from './qualification.js';
import { validateGovernedTopologyPos } from './topology.js';

export function createPreFeaCheckRequest(input = {}) {
  const requestedMethods = deepFreeze([...new Set((input.requestedMethods || []).map(stringValue).filter(Boolean))].sort());
  if (!requestedMethods.length) throw new TypeError('At least one Non-FEA method must be requested.');
  requestedMethods.forEach((methodId) => {
    if (!Object.values(NON_FEA_METHOD).includes(methodId)) throw new TypeError(`Method ${methodId} is outside the Non-FEA checker scope.`);
  });
  const base = {
    schema: PRE_FEA_CHECK_REQUEST_SCHEMA,
    requestId: requiredString(input.requestId, 'requestId'),
    sourcePackageRef: normalizeSourceRef(input.sourcePackageRef, 'sourcePackageRef'),
    sharedModelRef: normalizeEvidenceRef(input.sharedModelRef, 'sharedModelRef'),
    projectDataRef: normalizeEvidenceRef(input.projectDataRef, 'projectDataRef'),
    masterRefs: deepFreeze((input.masterRefs || []).map((row, index) => normalizeEvidenceRef(row, `masterRefs[${index}]`)).sort((a, b) => a.artifactId.localeCompare(b.artifactId))),
    configuredDefaultAuthorityRef: input.configuredDefaultAuthorityRef ? normalizeEvidenceRef(input.configuredDefaultAuthorityRef, 'configuredDefaultAuthorityRef') : null,
    configuredDefaultUsageLedgerRef: input.configuredDefaultUsageLedgerRef ? normalizeEvidenceRef(input.configuredDefaultUsageLedgerRef, 'configuredDefaultUsageLedgerRef') : null,
    requestedMethods,
    requestedLoadCaseIds: deepFreeze([...new Set((input.requestedLoadCaseIds || []).map(stringValue).filter(Boolean))].sort()),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function sealPreFeaPipingInput(input = {}) {
  validateRequestOrThrow(input.request);
  const topologyValidation = validateGovernedTopologyPos(input.topology);
  const qualificationValidation = validatePreFeaQualificationProfile(input.qualificationProfile);
  const loadCaseValidation = validateGovernedLoadCaseBasis(input.loadCaseBasis);
  const registry = input.methodRequirementRegistry || createDefaultNonFeaMethodRequirementRegistry();
  const registryValidation = validateMethodRequirementRegistry(registry);
  const fieldResolutions = normalizeFieldResolutions(input.fieldResolutions || []);
  const methodReadiness = evaluateMethodReadiness({
    registry,
    requestedMethods: input.request.requestedMethods,
    fieldResolutions,
    targetIndex: input.targetIndex || {},
    applicability: input.applicability || {},
  });

  const gates = [];
  gates.push(gate(PREFLIGHT_GATE.SOURCE_MODEL, evidenceValid(input.request.sharedModelRef) && input.request.sourcePackageRef.validationState === 'VALID', 'Source bytes and shared model must be valid.'));
  gates.push(gate(PREFLIGHT_GATE.TOPOLOGY_POS, topologyValidation.ok, topologyValidation.errors.join(' ') || 'Governed topology/POS is valid.'));
  gates.push(gate(PREFLIGHT_GATE.PROJECT_DATA, evidenceValid(input.request.projectDataRef), 'Project Data revision, hash and approval evidence must be valid.'));
  gates.push(gate(PREFLIGHT_GATE.ENGINEERING_MASTERS, input.request.masterRefs.every(evidenceValid), 'Every referenced engineering master must be approved and hash-valid.'));
  gates.push(gate(PREFLIGHT_GATE.ENRICHMENT, fieldResolutions.every((row) => validateFieldResolutionRecord(row).ok), 'Every governed field must have one explicit resolution record.'));
  gates.push(gate(PREFLIGHT_GATE.DEFAULT_PREVIEW, validateDefaultUsage(fieldResolutions, input.request), 'Configured defaults must be approved, scope-qualified and usage-ledger bound; schedule defaults are prohibited.'));
  gates.push(gate(PREFLIGHT_GATE.ENGINEERING_APPLICABILITY, qualificationValidation.ok && loadCaseValidation.ok && registryValidation.ok, [...qualificationValidation.errors, ...loadCaseValidation.errors, ...registryValidation.errors].join(' ') || 'Qualification, load-case and method requirement contracts are valid.'));

  const decision = sealDecision(input.request.requestedMethods, methodReadiness, gates);
  gates.push(gate(PREFLIGHT_GATE.SEAL_DECISION, decision !== SEAL_DECISION.BLOCKED, `Seal decision: ${decision}.`));
  const preflightReceipt = createPreflightReceipt(input.request, gates, methodReadiness, decision);
  const lineageGraph = createLineageGraph(input, registry, preflightReceipt);

  let commonInput = null;
  if (decision !== SEAL_DECISION.BLOCKED) {
    const base = {
      schema: COMMON_ENRICHED_INPUT_SCHEMA,
      requestRef: deepFreeze({ requestId: input.request.requestId, semanticHash: input.request.semanticHash }),
      sourcePackageRef: input.request.sourcePackageRef,
      sharedModelRef: input.request.sharedModelRef,
      projectDataRef: input.request.projectDataRef,
      masterRefs: input.request.masterRefs,
      configuredDefaultAuthorityRef: input.request.configuredDefaultAuthorityRef,
      configuredDefaultUsageLedgerRef: input.request.configuredDefaultUsageLedgerRef,
      topology: input.topology,
      fieldResolutions,
      methodRequirementRegistry: registry,
      methodReadiness,
      loadCaseBasis: input.loadCaseBasis,
      qualificationProfile: input.qualificationProfile,
      lineageGraph,
      seal: deepFreeze({ decision, preflightReceiptSemanticHash: preflightReceipt.semanticHash }),
    };
    commonInput = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  }

  const reportBase = {
    schema: PRE_FEA_CHECK_REPORT_SCHEMA,
    requestRef: deepFreeze({ requestId: input.request.requestId, semanticHash: input.request.semanticHash }),
    gates: deepFreeze(gates),
    decision,
    methodReadiness,
    blockedFieldKeys: deepFreeze(fieldResolutions.filter((row) => row.authorityLevel === AUTHORITY_LEVEL.BLOCK).map(fieldResolutionKey).sort()),
    preflightReceipt,
    commonInputSemanticHash: commonInput?.semanticHash || null,
    lineageGraphSemanticHash: lineageGraph.semanticHash,
  };
  const report = deepFreeze({ ...reportBase, semanticHash: semanticHash(reportBase) });
  return deepFreeze({ report, commonInput });
}

export function validateCommonEnrichedPipingInput(value) {
  const errors = [];
  if (!value || value.schema !== COMMON_ENRICHED_INPUT_SCHEMA) errors.push('Invalid common enriched piping input schema.');
  if (!validateGovernedTopologyPos(value?.topology).ok) errors.push('Common input topology is invalid.');
  if (!Array.isArray(value?.fieldResolutions) || value.fieldResolutions.some((row) => !validateFieldResolutionRecord(row).ok)) errors.push('Common input field resolution ledger is invalid.');
  if (!Array.isArray(value?.methodReadiness)) errors.push('Common input method readiness is required.');
  if (value?.seal?.decision === SEAL_DECISION.BLOCKED) errors.push('A blocked input may not be sealed as common enriched input.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Common enriched piping input semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function validatePreFeaCheckReport(value) {
  const errors = [];
  if (!value || value.schema !== PRE_FEA_CHECK_REPORT_SCHEMA) errors.push('Invalid pre-FEA check report schema.');
  if (!Array.isArray(value?.gates) || value.gates.map((row) => row.gateId).join('|') !== PREFLIGHT_GATE_ORDER.join('|')) errors.push('Preflight gates must be complete and ordered A through H.');
  if (!Object.values(SEAL_DECISION).includes(value?.decision)) errors.push('Invalid seal decision.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Pre-FEA check report semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function createPreflightReceipt(request, gates, methodReadiness, decision) {
  const base = {
    schema: 'pre-fea-preflight-receipt/v1',
    requestSemanticHash: request.semanticHash,
    gateSemanticHashes: deepFreeze(gates.map((row) => row.semanticHash)),
    methodReadinessSemanticHashes: deepFreeze(methodReadiness.map((row) => row.semanticHash).sort()),
    decision,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function createLineageGraph(input, registry, preflightReceipt) {
  const artifacts = [
    artifact('source-bytes', 'SOURCE_BYTES', input.request.sourcePackageRef),
    artifact('shared-model', 'SHARED_MODEL', input.request.sharedModelRef),
    artifact('topology-pos', 'TOPOLOGY_POS', input.topology),
    artifact('method-requirements', 'METHOD_REQUIREMENTS', registry),
    artifact('qualification-profile', 'QUALIFICATION_PROFILE', input.qualificationProfile),
    artifact('preflight-receipt', 'PREFLIGHT_RECEIPT', preflightReceipt),
    artifact('project-data', 'PROJECT_DATA', input.request.projectDataRef),
    artifact('load-case-basis', 'LOAD_CASE_BASIS', input.loadCaseBasis),
    ...input.request.masterRefs.map((row, index) => artifact(`master-${index}`, 'ENGINEERING_MASTER', row)),
  ];
  if (input.request.configuredDefaultAuthorityRef) artifacts.push(artifact('configured-default-authority', 'DEFAULT_AUTHORITY', input.request.configuredDefaultAuthorityRef));
  if (input.request.configuredDefaultUsageLedgerRef) artifacts.push(artifact('configured-default-usage', 'DEFAULT_USAGE', input.request.configuredDefaultUsageLedgerRef));
  const relations = artifacts.filter((row) => row.artifactId !== 'preflight-receipt').map((row) => ({ fromArtifactId: row.artifactId, toArtifactId: 'preflight-receipt', relation: 'GOVERNS_PREFLIGHT' }));
  return createCommonPipingLineageGraph({ artifacts, relations });
}

function sealDecision(requestedMethods, readinessRows, gates) {
  if (gates.some((row) => row.state === GATE_STATE.BLOCKED)) return SEAL_DECISION.BLOCKED;
  if (PACKAGE_BLOCKING_GATES.some((gateId) => gates.find((row) => row.gateId === gateId)?.state === GATE_STATE.BLOCKED)) return SEAL_DECISION.BLOCKED;
  const requested = readinessRows.filter((row) => requestedMethods.includes(row.methodId));
  const analysisRequested = requested.filter((row) => row.methodId !== NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT);
  const decisionRows = analysisRequested.length ? analysisRequested : requested;
  const readyCount = decisionRows.filter((row) => row.readinessState === METHOD_READINESS_STATE.READY).length;
  if (readyCount === decisionRows.length && readyCount > 0) return SEAL_DECISION.READY;
  if (readyCount > 0) return SEAL_DECISION.PARTIALLY_READY;
  return SEAL_DECISION.BLOCKED;
}

function gate(gateId, passed, message) {
  const base = { schema: 'pre-fea-preflight-gate/v1', gateId, state: passed ? GATE_STATE.PASSED : GATE_STATE.BLOCKED, message: stringValue(message) };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}
function validateDefaultUsage(rows, request) {
  return rows.every((row) => {
    if (row.authorityLevel !== AUTHORITY_LEVEL.PROJECT_CONFIGURED_DEFAULT) return true;
    if (row.field === 'schedule') return false;
    if (!request.configuredDefaultAuthorityRef || !request.configuredDefaultUsageLedgerRef) return false;
    return row.provenance.some((item) => stringValue(item.defaultId) && item.scopeQualified === true && item.authoritySemanticHash === request.configuredDefaultAuthorityRef.semanticHash && item.usageLedgerSemanticHash === request.configuredDefaultUsageLedgerRef.semanticHash);
  });
}
function evidenceValid(ref) { return ref?.validationState === 'VALID' && ['APPROVED', 'VALID', 'NOT_REQUIRED'].includes(ref?.approvalState); }
function normalizeFieldResolutions(rows) {
  const result = rows.map((row) => { const validation = validateFieldResolutionRecord(row); if (!validation.ok) throw new TypeError(validation.errors.join(' ')); return row; }).sort((a, b) => fieldResolutionKey(a).localeCompare(fieldResolutionKey(b)));
  const keys = result.map(fieldResolutionKey);
  if (new Set(keys).size !== keys.length) throw new TypeError('Duplicate governed field-resolution identities are not allowed.');
  return deepFreeze(result);
}
function normalizeSourceRef(value, field) {
  if (!isPlainRecord(value)) throw new TypeError(`${field} must be a record.`);
  return deepFreeze({
    artifactId: stringValue(value.artifactId) || 'source-package',
    schema: stringValue(value.schema) || null,
    sourceName: requiredString(value.sourceName, `${field}.sourceName`),
    semanticHash: requiredString(value.semanticHash, `${field}.semanticHash`),
    byteHash: requiredString(value.byteHash, `${field}.byteHash`),
    validationState: requiredString(value.validationState, `${field}.validationState`),
    approvalState: stringValue(value.approvalState) || 'NOT_REQUIRED',
  });
}
function normalizeEvidenceRef(value, field) {
  if (!isPlainRecord(value)) throw new TypeError(`${field} must be a record.`);
  return deepFreeze({
    artifactId: requiredString(value.artifactId, `${field}.artifactId`),
    schema: stringValue(value.schema) || null,
    semanticHash: requiredString(value.semanticHash, `${field}.semanticHash`),
    revision: stringValue(value.revision) || null,
    validationState: requiredString(value.validationState, `${field}.validationState`),
    approvalState: requiredString(value.approvalState, `${field}.approvalState`),
  });
}
function artifact(artifactId, kind, value) {
  return {
    artifactId,
    kind,
    schema: value.schema || null,
    semanticHash: value.semanticHash,
    byteHash: value.byteHash || null,
    revision: value.revision || null,
    approvalState: value.approvalState || null,
  };
}
function validateRequestOrThrow(value) {
  if (!value || value.schema !== PRE_FEA_CHECK_REQUEST_SCHEMA || value.semanticHash !== semanticHash(withoutHash(value))) throw new TypeError('Pre-FEA check request is invalid or has a semantic hash mismatch.');
}
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function requiredString(value, field) { const normalized = stringValue(value); if (!normalized) throw new TypeError(`${field} must be a non-empty string.`); return normalized; }
