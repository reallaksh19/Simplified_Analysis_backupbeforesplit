import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { APP_NAME, APP_VERSION } from '../../config/version.js';
import { APPLICATION_BUILD_IDENTITY_SCHEMA } from './constants.js';

export function createApplicationBuildIdentity(input = {}) {
  const injectedSha = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : null;
  const buildSha = canonicalText(input.buildSha ?? injectedSha ?? 'development', 'buildSha');
  const appName = canonicalText(input.appName ?? APP_NAME, 'appName');
  const appVersion = canonicalText(input.appVersion ?? APP_VERSION, 'appVersion');
  const base = {
    schema: APPLICATION_BUILD_IDENTITY_SCHEMA,
    appName,
    appVersion,
    buildSha,
    shortBuildSha: buildSha === 'development' ? buildSha : buildSha.slice(0, 12),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateApplicationBuildIdentity(value) {
  const errors = [];
  if (value?.schema !== APPLICATION_BUILD_IDENTITY_SCHEMA) errors.push('Invalid application build identity schema.');
  try {
    const expected = createApplicationBuildIdentity(value || {});
    if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Application build identity is not canonical.');
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function canonicalText(value, field) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new TypeError(`Application build identity ${field} is invalid.`);
  return value;
}
