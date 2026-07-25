import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  APPLICATION_NAVIGATION_ORDER_V9, APPLICATION_NAVIGATION_ORDER_V10, CONTRACT_KEYS,
  WORKSPACE_CONSUMER_REGISTRY_V10_SCHEMA,
  validateWorkspaceConsumerContext, validateWorkspaceConsumerReadiness, validateWorkspaceConsumerReadinessShape,
  validateWorkspaceConsumerRegistry,
} from '../workspace-consumers/index.js';
import { QA_EVIDENCE_SOURCE_SCHEMA, QA_LIMITATIONS } from './constants.js';
import { createQaConsumerRows } from './consumer-rows.js';
import { createQaContractRows } from './contract-rows.js';
import { canonicalDiagnostics, qaSourceHashPayload, validateQaEvidenceSource } from './validation.js';

export function createQaEvidenceSource(input = {}) {
  const registry = input.workspaceConsumerRegistry;
  const context = input.workspaceConsumerContext ?? null;
  const readiness = input.workspaceConsumerReadinessRows;
  assertRegistry(registry);
  assertContext(context);
  assertReadiness(registry, context, readiness);
  const base = {
    schema: QA_EVIDENCE_SOURCE_SCHEMA,
    registryReference: registryReference(registry),
    contextReference: contextReference(context),
    consumerRows: createQaConsumerRows(registry, readiness),
    contractRows: createQaContractRows(registry, context),
    diagnostics: canonicalDiagnostics(context?.diagnostics || []),
    limitations: QA_LIMITATIONS,
  };
  const source = deepFreeze({ ...base, semanticHash: semanticHash(qaSourceHashPayload(base)) });
  const validation = validateQaEvidenceSource(source);
  if (!validation.ok) throw new TypeError(`QA evidence source is invalid: ${validation.errors.join(' ')}`);
  return source;
}
function assertRegistry(registry) {
  const validation = validateWorkspaceConsumerRegistry(registry);
  if (!validation.ok) throw new TypeError(`QA registry evidence is invalid: ${validation.errors.join(' ')}`);
  const ids = registry.consumers.map((row) => row.consumerId);
  if (ids.length !== new Set(ids).size) throw new TypeError('QA registry contains duplicate consumer identities.');
  if (canonicalStringify([...ids].sort()) !== canonicalStringify([...navigationOrder(registry)].sort())) throw new TypeError('QA registry consumer identities are incomplete or unknown.');
}
function assertContext(context) {
  if (context === null) return;
  const validation = validateWorkspaceConsumerContext(context);
  if (!validation.ok) throw new TypeError(`QA Workspace context is invalid: ${validation.errors.join(' ')}`);
  if (Object.keys(context.contracts).sort().join('|') !== [...CONTRACT_KEYS].sort().join('|')) throw new TypeError('QA Workspace context contract slots are incomplete.');
}
function assertReadiness(registry, context, rows) {
  if (!Array.isArray(rows)) throw new TypeError('QA readiness evidence must be an array.');
  const expected = registry.consumers.map((row) => row.consumerId).sort();
  const actual = rows.map((row) => row?.consumerId).sort();
  if (canonicalStringify(actual) !== canonicalStringify(expected) || new Set(actual).size !== actual.length) throw new TypeError('QA readiness consumer identities are incomplete, duplicated, or unknown.');
  rows.forEach((row) => {
    const validation = validateWorkspaceConsumerReadinessShape(row);
    if (!validation.ok) throw new TypeError(`QA readiness ${row?.consumerId || ''} is invalid: ${validation.errors.join(' ')}`);
    if (context && row.contextSemanticHash !== context.semanticHash) throw new TypeError(`QA readiness ${row.consumerId} references a different context.`);
    if (context) {
      const official = validateWorkspaceConsumerReadiness(row, registry, context, { workspaceBooted:true, settingsAuthorityInitialized:true, settingsDefinitionsAvailable:true, settingsProfileValid:true });
      if (!official.ok) throw new TypeError(`QA readiness ${row.consumerId} does not match official evidence: ${official.errors.join(' ')}`);
    }
  });
}
function registryReference(registry) {
  return deepFreeze({ schema:registry.schema, semanticHash:registry.semanticHash, consumerCount:registry.consumers.length, consumerIds:navigationOrder(registry), validationState:'VALID' });
}
function contextReference(context) {
  if (!context) return deepFreeze({ schema:null,contextId:null,semanticHash:null,datasetId:null,workspaceVersion:0,availableContractCount:0,invalidContractCount:0,unavailableContractCount:CONTRACT_KEYS.length,diagnosticCount:0,validationState:'VALID_EMPTY' });
  return deepFreeze({
    schema: context.schema, contextId: context.contextId, semanticHash: context.semanticHash,
    datasetId: context.datasetId, workspaceVersion: context.workspaceVersion,
    availableContractCount: context.availabilitySummary.availableContractKeys.length,
    invalidContractCount: context.availabilitySummary.invalidContractKeys.length,
    unavailableContractCount: context.availabilitySummary.unavailableContractKeys.length,
    diagnosticCount: context.diagnostics.length, validationState: 'VALID',
  });
}
function navigationOrder(registry) { return registry?.schema === WORKSPACE_CONSUMER_REGISTRY_V10_SCHEMA ? APPLICATION_NAVIGATION_ORDER_V10 : APPLICATION_NAVIGATION_ORDER_V9; }
