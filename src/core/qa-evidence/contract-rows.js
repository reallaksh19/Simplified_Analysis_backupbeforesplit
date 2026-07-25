import { canonicalStringify, deepFreeze } from '../shared-piping-model/index.js';
import { CONTRACT_KEYS } from '../workspace-consumers/index.js';
import { contractDatasetId, contractLinkError, validateConsumerContract } from '../workspace-consumers/validators.js';

export function createQaContractRows(registry, context) {
  const requirements = consumerRequirements(registry);
  const accepted = {};
  return deepFreeze(CONTRACT_KEYS.map((contractKey) => {
    const reference = context?.contractReferences?.find((row) => row.contractKey === contractKey) || null;
    const diagnostic = context?.diagnostics?.find((row) => row.contractKey === contractKey) || null;
    const contract = context?.contracts?.[contractKey] || null;
    const states = evidenceStates(contractKey, contract, context, accepted, diagnostic);
    accepted[contractKey] = contract;
    return deepFreeze({
      contractKey,
      availability: reference?.availability || 'UNAVAILABLE',
      schema: reference?.schema || null,
      semanticHash: reference?.semanticHash || null,
      datasetId: reference?.datasetId || null,
      validatorState: states.validatorState,
      datasetState: states.datasetState,
      linkState: states.linkState,
      requiredByConsumerIds: requirements.required[contractKey],
      optionalForConsumerIds: requirements.optional[contractKey],
      qualificationSummary: copy(reference?.qualificationSummary || []),
      diagnostics: diagnostic ? copy([diagnostic]) : [],
    });
  }));
}

function evidenceStates(key, contract, context, accepted, diagnostic) {
  if (!contract) return absentStates(diagnostic);
  const validation = validateConsumerContract(key, contract, accepted);
  if (!validation.ok) throw new TypeError(`QA retained contract ${key} is invalid: ${validation.errors.join(' ')}`);
  const datasetId = contractDatasetId(key, contract);
  if (context?.datasetId && datasetId && datasetId !== context.datasetId) throw new TypeError(`QA retained contract ${key} has a dataset mismatch.`);
  const linkError = contractLinkError(key, contract, accepted);
  if (linkError) throw new TypeError(`QA retained contract ${key} is stale: ${linkError}`);
  return {
    validatorState: 'VALID',
    datasetState: context?.datasetId && datasetId ? 'MATCHED' : 'NOT_APPLICABLE',
    linkState: hasApplicableLink(key) ? 'CURRENT' : 'NOT_APPLICABLE',
  };
}
function absentStates(diagnostic) {
  if (!diagnostic) return { validatorState: 'NOT_PRESENT', datasetState: 'NOT_APPLICABLE', linkState: 'NOT_APPLICABLE' };
  if (diagnostic.code === 'INVALID_CONTRACT') return { validatorState: 'INVALID', datasetState: 'NOT_APPLICABLE', linkState: 'NOT_APPLICABLE' };
  if (diagnostic.code === 'DATASET_MISMATCH') return { validatorState: 'VALID', datasetState: 'REJECTED', linkState: 'NOT_APPLICABLE' };
  if (diagnostic.code === 'STALE_CONTRACT_EVIDENCE') return { validatorState: 'VALID', datasetState: 'NOT_APPLICABLE', linkState: 'STALE' };
  return { validatorState: 'INVALID', datasetState: 'REJECTED', linkState: 'REJECTED' };
}
function consumerRequirements(registry) {
  const required = {}, optional = {};
  CONTRACT_KEYS.forEach((key) => { required[key] = []; optional[key] = []; });
  registry.consumers.forEach((consumer) => {
    consumer.requiredContractKeys.forEach((key) => required[key].push(consumer.consumerId));
    consumer.optionalContractKeys.forEach((key) => optional[key].push(consumer.consumerId));
  });
  CONTRACT_KEYS.forEach((key) => { required[key].sort(); optional[key].sort(); });
  return { required, optional };
}
function hasApplicableLink(key) {
  return !['sharedModel','loadCaseSet','modelCalculationLedger'].includes(key);
}

function copy(value) { return JSON.parse(canonicalStringify(value)); }
