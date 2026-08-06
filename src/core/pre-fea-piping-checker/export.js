import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { ENRICHED_STAGED_JSON_SCHEMA } from './constants.js';
import { validateCommonEnrichedPipingInput, validatePreFeaCheckReport } from './checker.js';

export function createEnrichedStagedJsonExport(input = {}) {
  const commonValidation = validateCommonEnrichedPipingInput(input.commonInput);
  const reportValidation = validatePreFeaCheckReport(input.report);
  if (!commonValidation.ok) throw new TypeError(`Common enriched input is invalid: ${commonValidation.errors.join(' ')}`);
  if (!reportValidation.ok) throw new TypeError(`Pre-FEA report is invalid: ${reportValidation.errors.join(' ')}`);
  if (input.report.commonInputSemanticHash !== input.commonInput.semanticHash) throw new TypeError('Report and common input hashes do not match.');
  const payload = deepFreeze({
    schema: ENRICHED_STAGED_JSON_SCHEMA,
    commonInput: input.commonInput,
    preFeaCheckReport: input.report,
    calculatedOutputs: null,
    outputPolicy: deepFreeze({ containsCalculatedOutputs: false, downstreamMustUseCommonInputSemanticHash: true }),
  });
  const canonicalPayload = JSON.parse(canonicalStringify(payload));
  const content = `${JSON.stringify(canonicalPayload, null, 2)}\n`;
  const base = {
    schema: 'enriched-staged-piping-json-export/v1',
    mediaType: 'application/json',
    commonInputSemanticHash: input.commonInput.semanticHash,
    reportSemanticHash: input.report.semanticHash,
    payloadSemanticHash: semanticHash(payload),
    content,
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function importEnrichedStagedJson(content) {
  const parsed = JSON.parse(String(content));
  if (parsed?.schema !== ENRICHED_STAGED_JSON_SCHEMA) throw new TypeError('Invalid enriched staged JSON schema.');
  if (parsed.calculatedOutputs !== null) throw new TypeError('The enriched staged JSON must not contain calculated outputs.');
  const commonValidation = validateCommonEnrichedPipingInput(parsed.commonInput);
  const reportValidation = validatePreFeaCheckReport(parsed.preFeaCheckReport);
  if (!commonValidation.ok || !reportValidation.ok) throw new TypeError([...commonValidation.errors, ...reportValidation.errors].join(' '));
  if (parsed.preFeaCheckReport.commonInputSemanticHash !== parsed.commonInput.semanticHash) throw new TypeError('Imported report and common input hashes do not match.');
  return deepFreeze(parsed);
}
