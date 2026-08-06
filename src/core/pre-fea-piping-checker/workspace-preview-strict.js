import { deepFreeze } from '../shared-piping-model/index.js';
import { createPreFeaWorkspacePreview as createWorkspacePreview } from './workspace-preview.js';

const LBF_PER_IN_TO_N_PER_M = 175.1268352464764;

/**
 * Public workspace-preview entry point. Explicit imperial support stiffness is
 * converted before the generic governed-field adapter sees it, preventing the
 * `_m` field suffix from being interpreted as a length conversion.
 */
export function createPreFeaWorkspacePreview(input = {}) {
  return createWorkspacePreview({
    ...input,
    components: normalizeComponentStiffness(input.components || []),
  });
}

function normalizeComponentStiffness(components) {
  return deepFreeze(components.map((component) => {
    if (!component || typeof component !== 'object') return component;
    let changed = false;
    const clone = { ...component };
    ['attributes', 'properties', 'engineering'].forEach((containerKey) => {
      const container = component[containerKey];
      if (!container || typeof container !== 'object' || Array.isArray(container)) return;
      if (hasCanonicalStiffness(container)) return;
      if (!Object.prototype.hasOwnProperty.call(container, 'STIFFNESS_LBF_IN')) return;
      const raw = container.STIFFNESS_LBF_IN;
      const numeric = Number(raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value') ? raw.value : raw);
      if (!Number.isFinite(numeric)) return;
      clone[containerKey] = {
        ...container,
        stiffness_N_m: {
          value: numeric * LBF_PER_IN_TO_N_PER_M,
          unit: 'N/m',
          sourceKey: 'STIFFNESS_LBF_IN',
        },
      };
      changed = true;
    });
    return changed ? clone : component;
  }));
}

function hasCanonicalStiffness(container) {
  return ['stiffness_N_m', 'STIFFNESS_N_M'].some((key) => Object.prototype.hasOwnProperty.call(container, key));
}
