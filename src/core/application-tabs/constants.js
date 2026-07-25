export const APPLICATION_TAB_MANIFEST_SCHEMA = 'application-tab-manifest/v1';
export const APPLICATION_TAB_RUNTIME_STATE_SCHEMA = 'application-tab-runtime-state/v1';
export const APPLICATION_ICON_REGISTRY_SCHEMA = 'application-icon-registry/v1';
export const APPLICATION_EMPTY_STATE_SCHEMA = 'application-empty-state/v1';
export const APPLICATION_BUILD_IDENTITY_SCHEMA = 'application-build-identity/v1';

export const TAB_NAVIGATION_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  DISABLED: 'DISABLED',
});

export const TAB_CONTENT_STATES = Object.freeze({
  READY: 'READY',
  EMPTY: 'EMPTY',
  BLOCKED: 'BLOCKED',
  INVALID: 'INVALID',
  UNAVAILABLE: 'UNAVAILABLE',
  ERROR: 'ERROR',
});

export const TAB_ACTION_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  BLOCKED: 'BLOCKED',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const TAB_PRIORITIES = Object.freeze({
  PRIMARY: 'PRIMARY',
  OVERFLOW: 'OVERFLOW',
});
