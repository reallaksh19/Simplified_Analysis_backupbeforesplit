import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  IMPLEMENTATION_STATUS,
  READINESS_STATES,
  validateWorkspaceConsumerReadinessShape,
} from '../workspace-consumers/index.js';
import {
  APPLICATION_TAB_RUNTIME_STATE_SCHEMA,
  TAB_ACTION_STATES,
  TAB_CONTENT_STATES,
  TAB_NAVIGATION_STATES,
} from './constants.js';

export function createApplicationTabRuntimeState(manifest, readinessRows, options = {}) {
  if (!manifest?.tabs?.length) throw new TypeError('Application tab runtime state requires a manifest.');
  const readiness = normalizeReadiness(manifest, readinessRows);
  const rows = manifest.tabs.map((tab) => runtimeRow(tab, readiness.get(tab.tabId)));
  const navigableTabIds = rows.filter((row) => row.navigationState === TAB_NAVIGATION_STATES.AVAILABLE).map((row) => row.tabId);
  const requested = options.activeTabId || navigableTabIds[0];
  const activeTabId = navigableTabIds.includes(requested) ? requested : navigableTabIds[0];
  const version = Number.isInteger(options.version) && options.version >= 0 ? options.version : 0;
  const base = { schema: APPLICATION_TAB_RUNTIME_STATE_SCHEMA, activeTabId, navigableTabIds, rows, version };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateApplicationTabRuntimeState(value, manifest, readinessRows) {
  const errors = [];
  if (value?.schema !== APPLICATION_TAB_RUNTIME_STATE_SCHEMA) errors.push('Invalid application tab runtime-state schema.');
  try {
    const expected = createApplicationTabRuntimeState(manifest, readinessRows, {
      activeTabId: value?.activeTabId,
      version: value?.version,
    });
    if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Application tab runtime state does not match manifest and readiness evidence.');
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function applicationTabRuntimeRow(runtimeState, tabId) {
  const row = runtimeState?.rows?.find((candidate) => candidate.tabId === tabId);
  if (!row) throw new TypeError(`Unknown application tab runtime row: ${tabId}.`);
  return row;
}

function runtimeRow(tab, readiness) {
  const implemented = tab.implementationStatus === IMPLEMENTATION_STATUS.IMPLEMENTED;
  const navigationState = implemented ? TAB_NAVIGATION_STATES.AVAILABLE : TAB_NAVIGATION_STATES.DISABLED;
  const contentState = contentStateFor(tab, readiness);
  const actionState = !implemented ? TAB_ACTION_STATES.UNAVAILABLE
    : readiness.readinessState === READINESS_STATES.AVAILABLE ? TAB_ACTION_STATES.AVAILABLE
      : TAB_ACTION_STATES.BLOCKED;
  return deepFreeze({
    tabId: tab.tabId,
    label: tab.label,
    description: tab.description,
    implementationStatus: tab.implementationStatus,
    navigationState,
    contentState,
    actionState,
    readinessState: readiness.readinessState,
    summary: summaryFor(contentState),
    availableEvidence: [...readiness.availableContractKeys],
    missingEvidence: [...readiness.missingRequiredContractKeys],
    invalidEvidence: [...readiness.invalidContractKeys],
    blockers: [...readiness.blockers],
    diagnostics: readiness.diagnostics.map((row) => deepFreeze({ ...row })),
  });
}

function contentStateFor(tab, readiness) {
  if (tab.implementationStatus !== IMPLEMENTATION_STATUS.IMPLEMENTED) return TAB_CONTENT_STATES.UNAVAILABLE;
  if (readiness.readinessState === READINESS_STATES.AVAILABLE) return TAB_CONTENT_STATES.READY;
  if (readiness.readinessState === READINESS_STATES.BLOCKED_INVALID_CONTRACTS) return TAB_CONTENT_STATES.INVALID;
  if (readiness.readinessState === READINESS_STATES.BLOCKED_MISSING_CONTRACTS) {
    return readiness.availableContractKeys.length ? TAB_CONTENT_STATES.BLOCKED : TAB_CONTENT_STATES.EMPTY;
  }
  return TAB_CONTENT_STATES.UNAVAILABLE;
}

function summaryFor(state) {
  return ({
    READY: 'Ready',
    EMPTY: 'No evidence yet',
    BLOCKED: 'Needs evidence',
    INVALID: 'Invalid evidence',
    UNAVAILABLE: 'Not implemented',
    ERROR: 'Error',
  })[state] || 'Unknown';
}

function normalizeReadiness(manifest, rows) {
  const ids = manifest.tabs.map((row) => row.tabId);
  const matching = (rows || []).filter((row) => ids.includes(row?.consumerId));
  if (matching.length !== ids.length || new Set(matching.map((row) => row.consumerId)).size !== ids.length) {
    throw new TypeError('Application tab runtime state requires exactly one readiness row per tab.');
  }
  matching.forEach((row) => {
    const validation = validateWorkspaceConsumerReadinessShape(row);
    if (!validation.ok) throw new TypeError(`Application tab readiness ${row?.consumerId || ''} is invalid: ${validation.errors.join(' ')}`);
  });
  if (new Set(matching.map((row) => row.contextSemanticHash)).size !== 1) {
    throw new TypeError('Application tab runtime readiness must reference one consumer context.');
  }
  return new Map(matching.map((row) => [row.consumerId, row]));
}
