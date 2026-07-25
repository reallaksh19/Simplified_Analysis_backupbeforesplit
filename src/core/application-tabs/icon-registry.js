import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { APPLICATION_ICON_REGISTRY_SCHEMA } from './constants.js';

const ICONS = Object.freeze([
  icon('calculator', ['M5 3h14v18H5z','M8 7h8','M8 11h2','M12 11h2','M16 11h.01','M8 15h2','M12 15h2','M16 15h.01']),
  icon('check-square', ['M4 4h16v16H4z','M8 12l3 3 5-6']),
  icon('fallback', ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20','M9.6 9a2.6 2.6 0 1 1 3.4 2.48c-.9.34-1.5.9-1.5 2.02','M12 17h.01']),
  icon('file-text', ['M6 2h8l4 4v16H6z','M14 2v5h4','M9 12h6','M9 16h6']),
  icon('home', ['M3 11.5 12 4l9 7.5','M5 10.5V21h14V10.5','M9 21v-6h6v6']),
  icon('layers', ['M12 3 21 8 12 13 3 8z','M3 12l9 5 9-5','M3 16l9 5 9-5']),
  icon('model', ['M12 3 21 8v8l-9 5-9-5V8z','M3 8l9 5 9-5','M12 13v8']),
  icon('pen-tool', ['M12 3l7 7-9 9H3v-7z','M12 3 9 12l3 3 7-5','M3 21l4-4']),
  icon('pipeline', ['M4 8h5v8H4z','M15 8h5v8h-5z','M9 12h6','M2 12h2','M20 12h2']),
  icon('settings', ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','M4.9 4.9l2 2','M17.1 17.1l2 2','M19.1 4.9l-2 2','M6.9 17.1l-2 2','M12 2v3','M12 19v3','M2 12h3','M19 12h3']),
  icon('table-file', ['M5 3h10l4 4v14H5z','M15 3v5h4','M8 12h8','M8 16h8','M11 10v8']),
  icon('terminal-wrench', ['M4 5h16v14H4z','M7 9l3 3-3 3','M12 15h4','M17.5 7.5l-2 2 1.5 1.5 2-2']),
]);

export const APPLICATION_TAB_ICON_IDS = Object.freeze({
  HOME: 'home',
  WORKSPACE: 'model',
  LOAD_CALC: 'calculator',
  PCF: 'table-file',
  SKETCHER: 'pen-tool',
  THREE_D_CALC: 'layers',
  PIPE_SOLVER: 'pipeline',
  REPORTS: 'file-text',
  QA: 'check-square',
  SETTINGS: 'settings',
  DEBUG: 'terminal-wrench',
});

export function createApplicationIconRegistry() {
  const base = { schema: APPLICATION_ICON_REGISTRY_SCHEMA, icons: ICONS };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateApplicationIconRegistry(value) {
  const expected = createApplicationIconRegistry();
  const errors = [];
  if (value?.schema !== APPLICATION_ICON_REGISTRY_SCHEMA) errors.push('Invalid application icon registry schema.');
  if (canonicalStringify(value) !== canonicalStringify(expected)) errors.push('Application icon registry does not match the closed inline-SVG registry.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function applicationIconDescriptor(registry, iconId) {
  if (!validateApplicationIconRegistry(registry).ok) throw new TypeError('Application icon registry is invalid.');
  return registry.icons.find((row) => row.iconId === iconId)
    || registry.icons.find((row) => row.iconId === 'fallback');
}

function icon(iconId, pathData) {
  return deepFreeze({ iconId, viewBox: '0 0 24 24', pathData: [...pathData] });
}
