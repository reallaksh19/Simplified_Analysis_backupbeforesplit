import { canonicalStringify, deepFreeze } from '../shared-piping-model/index.js';
import { APPLICATION_NAVIGATION_ORDER_V9, IMPLEMENTATION_STATUS, READINESS_STATES } from '../workspace-consumers/index.js';

export function createQaConsumerRows(registry, readinessRows) {
  const descriptors = new Map(registry.consumers.map((row) => [row.consumerId, row]));
  const readiness = new Map(readinessRows.map((row) => [row.consumerId, row]));
  return deepFreeze(APPLICATION_NAVIGATION_ORDER_V9.map((consumerId) => {
    const descriptor = descriptors.get(consumerId);
    const row = readiness.get(consumerId);
    return {
      consumerId,
      label: descriptor.label,
      implementationStatus: descriptor.implementationStatus,
      engineeringClaimPolicy: descriptor.engineeringClaimPolicy,
      requiredContractKeys: copy(descriptor.requiredContractKeys),
      optionalContractKeys: copy(descriptor.optionalContractKeys),
      allowedActions: copy(descriptor.allowedActions),
      readinessState: row.readinessState,
      missingRequiredContractKeys: copy(row.missingRequiredContractKeys),
      invalidRequiredContractKeys: descriptor.requiredContractKeys.filter((key) => row.invalidContractKeys.includes(key)).sort(),
      blockingDiagnostics: copy(row.diagnostics),
      availableRequiredCount: descriptor.requiredContractKeys.filter((key) => row.availableContractKeys.includes(key)).length,
      availableOptionalCount: descriptor.optionalContractKeys.filter((key) => row.availableContractKeys.includes(key)).length,
    };
  }));
}

export function implementedQaSummary(rows) {
  const implemented = rows.filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED);
  return deepFreeze({
    implementedCount: implemented.length,
    availableCount: implemented.filter((row) => row.readinessState === READINESS_STATES.AVAILABLE).length,
    unavailableCount: implemented.filter((row) => row.readinessState !== READINESS_STATES.AVAILABLE).length,
  });
}

function copy(value) { return JSON.parse(canonicalStringify(value)); }
