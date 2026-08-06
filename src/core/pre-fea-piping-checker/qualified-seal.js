import { deepFreeze } from '../shared-piping-model/index.js';
import { NON_FEA_METHOD } from './constants.js';
import { sealPreFeaPipingInput } from './checker.js';

/**
 * Strict seal entry point that binds method readiness to the qualification
 * profile. Methods absent from qualifiedMethodIds are evaluated as
 * NOT_QUALIFIED, including inherited method dependencies.
 */
export function sealQualifiedPreFeaPipingInput(input = {}) {
  const qualifiedMethodIds = new Set(input.qualificationProfile?.qualifiedMethodIds || []);
  const suppliedApplicability = input.applicability || {};
  const applicability = {};

  Object.values(NON_FEA_METHOD).forEach((methodId) => {
    const supplied = suppliedApplicability[methodId] || {};
    const exportOnly = methodId === NON_FEA_METHOD.ENRICHED_STAGED_JSON_EXPORT;
    applicability[methodId] = deepFreeze({
      ...supplied,
      qualified: supplied.qualified === false
        ? false
        : exportOnly || qualifiedMethodIds.has(methodId),
    });
  });

  return sealPreFeaPipingInput({
    ...input,
    applicability: deepFreeze(applicability),
  });
}
