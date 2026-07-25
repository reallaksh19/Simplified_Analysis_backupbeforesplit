import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  APPLICATION_NAVIGATION_ORDER_V9,
  IMPLEMENTATION_STATUS,
  validateWorkspaceConsumerRegistryV9,
} from '../workspace-consumers/index.js';
import { APPLICATION_TAB_MANIFEST_SCHEMA, TAB_PRIORITIES } from './constants.js';
import {
  APPLICATION_TAB_ICON_IDS,
  createApplicationIconRegistry,
  validateApplicationIconRegistry,
} from './icon-registry.js';

const ROOT_ROLES = Object.freeze({
  HOME: 'home-consumer-root',
  WORKSPACE: 'workspace-view-root',
  LOAD_CALC: 'load-calc-consumer-root',
  PCF: 'pcf-consumer-root',
  SKETCHER: 'sketcher-consumer-root',
  THREE_D_CALC: 'three-d-calc-consumer-root',
  PIPE_SOLVER: 'pipe-solver-consumer-root',
  REPORTS: 'reports-consumer-root',
  QA: 'qa-consumer-root',
  SETTINGS: 'settings-consumer-root',
  DEBUG: 'debug-consumer-root',
});

const PRIMARY_TAB_IDS = new Set(['HOME','WORKSPACE','LOAD_CALC','PCF','SKETCHER']);

export function createApplicationTabManifest(registry, iconRegistry = createApplicationIconRegistry()) {
  const registryValidation = validateWorkspaceConsumerRegistryV9(registry);
  if (!registryValidation.ok) throw new TypeError(`Application tab manifest registry is invalid: ${registryValidation.errors.join(' ')}`);
  const iconValidation = validateApplicationIconRegistry(iconRegistry);
  if (!iconValidation.ok) throw new TypeError(`Application tab manifest icon registry is invalid: ${iconValidation.errors.join(' ')}`);
  const descriptors = new Map(registry.consumers.map((row) => [row.consumerId, row]));
  const tabs = APPLICATION_NAVIGATION_ORDER_V9.map((tabId, order) => {
    const descriptor = descriptors.get(tabId);
    if (!descriptor) throw new TypeError(`Application tab descriptor ${tabId} is unavailable.`);
    const iconId = APPLICATION_TAB_ICON_IDS[tabId] || 'fallback';
    return deepFreeze({
      tabId,
      label: descriptor.label,
      description: descriptor.purpose,
      implementationStatus: descriptor.implementationStatus,
      iconId,
      rootRole: ROOT_ROLES[tabId] || `application-${tabId.toLowerCase()}-root`,
      priority: PRIMARY_TAB_IDS.has(tabId) ? TAB_PRIORITIES.PRIMARY : TAB_PRIORITIES.OVERFLOW,
      order,
    });
  });
  const base = { schema: APPLICATION_TAB_MANIFEST_SCHEMA, tabs };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateApplicationTabManifest(value, registry, iconRegistry = createApplicationIconRegistry()) {
  const errors = [];
  if (value?.schema !== APPLICATION_TAB_MANIFEST_SCHEMA) errors.push('Invalid application tab manifest schema.');
  try {
    const expected = createApplicationTabManifest(registry, iconRegistry);
    if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Application tab manifest does not match current registry and icon evidence.');
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function applicationTabDescriptor(manifest, tabId) {
  const descriptor = manifest?.tabs?.find((row) => row.tabId === tabId);
  if (!descriptor) throw new TypeError(`Unknown application tab: ${tabId}.`);
  return descriptor;
}

export function implementedApplicationTabIds(manifest) {
  return deepFreeze(manifest.tabs
    .filter((row) => row.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED)
    .map((row) => row.tabId));
}
