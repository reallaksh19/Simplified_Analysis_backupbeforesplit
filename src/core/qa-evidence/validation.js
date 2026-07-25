import { canonicalStringify, deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { APPLICATION_NAVIGATION_ORDER_V9, APPLICATION_NAVIGATION_ORDER_V10, CONTRACT_KEYS, IMPLEMENTATION_STATUS, READINESS_STATES, WORKSPACE_CONSUMER_CONTEXT_SCHEMA, WORKSPACE_CONSUMER_REGISTRY_V9_SCHEMA, WORKSPACE_CONSUMER_REGISTRY_V10_SCHEMA } from '../workspace-consumers/index.js';
import {
  QA_AVAILABILITY_STATES, QA_DATASET_STATES, QA_EVIDENCE_EXPORT_SCHEMA,
  QA_EVIDENCE_SOURCE_SCHEMA, QA_EXPORT_FORMATS, QA_LINK_STATES,
  QA_QUALITY_STATES, QA_REVIEW_MODEL_SCHEMA, QA_VALIDATOR_STATES,
} from './constants.js';

export function assertPlainJson(value, label = 'QA evidence') { walk(value, label, new Set()); }
export function validateQaEvidenceSource(value) {
  const errors = [];
  exactKeys(value, ['schema','registryReference','contextReference','consumerRows','contractRows','diagnostics','limitations','semanticHash'], 'QA source', errors);
  if (value?.schema !== QA_EVIDENCE_SOURCE_SCHEMA) errors.push('Invalid QA evidence source schema.');
  validateSourceReference(value?.registryReference, value?.contextReference, errors);
  validateEvidenceRows(value, errors);
  validateContextCounts(value?.contextReference, value?.contractRows, errors);
  hashCheck(value, qaSourceHashPayload(value), 'QA source', errors);
  validatePublicEvidence(value, 'QA source', errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}
export function validateQaReviewModel(value) {
  const errors = [];
  exactKeys(value, ['schema','qualityState','registrySummary','contextSummary','consumerRows','contractRows','diagnostics','limitations','semanticHash'], 'QA review model', errors);
  if (value?.schema !== QA_REVIEW_MODEL_SCHEMA) errors.push('Invalid QA review model schema.');
  if (!Object.values(QA_QUALITY_STATES).includes(value?.qualityState)) errors.push('Invalid QA quality state.');
  validateReviewSummaries(value?.registrySummary, value?.contextSummary, errors);
  validateEvidenceRows(value, errors);
  validateContextCounts(value?.contextSummary, value?.contractRows, errors);
  validateReviewCounts(value?.registrySummary, value?.consumerRows, errors);
  hashCheck(value, qaReviewHashPayload(value), 'QA review model', errors);
  validatePublicEvidence(value, 'QA review model', errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}
export function validateQaEvidenceExport(value) {
  const errors = [];
  exactKeys(value, ['schema','format','mediaType','fileName','sourceSemanticHash','reviewSemanticHash','content','semanticHash'], 'QA export', errors);
  if (value?.schema !== QA_EVIDENCE_EXPORT_SCHEMA) errors.push('Invalid QA evidence export schema.');
  if (!QA_EXPORT_FORMATS.includes(value?.format)) errors.push('Invalid QA export format.');
  ['mediaType','fileName','sourceSemanticHash','reviewSemanticHash','content'].forEach((field) => { if (typeof value?.[field] !== 'string' || !value[field]) errors.push(`QA export ${field} is invalid.`); });
  if (typeof value?.content === 'string' && !value.content.endsWith('\n')) errors.push('QA export content must be newline terminated.');
  hashCheck(value, withoutHash(value), 'QA export', errors);
  validatePublicEvidence(value, 'QA export', errors);
  return deepFreeze({ ok: errors.length === 0, errors });
}
export function qaSourceHashPayload(value) {
  const context = value?.contextReference || {};
  const { workspaceVersion: _workspaceVersion, ...identityContext } = context;
  return { schema:value?.schema, registryReference:value?.registryReference, contextReference:identityContext, consumerRows:value?.consumerRows, contractRows:value?.contractRows, diagnostics:value?.diagnostics, limitations:value?.limitations };
}
export function qaReviewHashPayload(value) {
  const context = value?.contextSummary || {};
  const { workspaceVersion: _workspaceVersion, ...identityContext } = context;
  return { schema:value?.schema, qualityState:value?.qualityState, registrySummary:value?.registrySummary, contextSummary:identityContext, consumerRows:value?.consumerRows, contractRows:value?.contractRows, diagnostics:value?.diagnostics, limitations:value?.limitations };
}
export function canonicalDiagnostics(rows = []) { const copied=JSON.parse(canonicalStringify(rows));return deepFreeze(copied.sort((a,b)=>compareText(diagnosticKey(a),diagnosticKey(b)))); }
function validateContextCounts(context, rows, errors) {
  if (!Array.isArray(rows) || !context) return;
  const available=rows.filter((row)=>row.availability==='AVAILABLE').length,invalid=rows.filter((row)=>row.availability==='INVALID').length,unavailable=rows.filter((row)=>row.availability==='UNAVAILABLE').length;
  if (context.availableContractCount !== available || context.invalidContractCount !== invalid || context.unavailableContractCount !== unavailable) errors.push('QA context contract counts do not match contract rows.');
}
function validateReviewCounts(summary, rows, errors) {
  if (!Array.isArray(rows) || !summary) return;
  const implemented=rows.filter((row)=>row.implementationStatus===IMPLEMENTATION_STATUS.IMPLEMENTED),unavailable=implemented.filter((row)=>row.readinessState!==READINESS_STATES.AVAILABLE).length;
  if (summary.implementedCount !== implemented.length || summary.unavailableCount !== unavailable) errors.push('QA registry summary counts do not match consumer rows.');
}
function validateEvidenceRows(value, errors) {
  validateRows(value?.consumerRows, 'consumerId', 'consumer rows', errors);
  validateRows(value?.contractRows, 'contractKey', 'contract rows', errors);
  validateExactMembership(value?.consumerRows, 'consumerId', expectedNavigation(value), 'consumer rows', errors);
  validateExactMembership(value?.contractRows, 'contractKey', CONTRACT_KEYS, 'contract rows', errors);
  (value?.consumerRows || []).forEach((row) => validateConsumerRow(row, errors));
  (value?.contractRows || []).forEach((row) => validateContractRow(row, errors));
  validateCanonicalArray(value?.diagnostics, diagnosticKey, 'diagnostics', errors);
  validateCanonicalStrings(value?.limitations, 'limitations', errors);
}
function validateSourceReference(registry, context, errors) {
  exactKeys(registry, ['schema','semanticHash','consumerCount','consumerIds','validationState'], 'QA registry reference', errors);
  exactKeys(context, ['schema','contextId','semanticHash','datasetId','workspaceVersion','availableContractCount','invalidContractCount','unavailableContractCount','diagnosticCount','validationState'], 'QA context reference', errors);
  validateRegistryReferenceValues(registry, errors);validateContextReferenceValues(context, errors);
}
function validateReviewSummaries(registry, context, errors) {
  exactKeys(registry, ['schema','semanticHash','consumerCount','consumerIds','validationState','implementedCount','unavailableCount'], 'QA registry summary', errors);
  exactKeys(context, ['schema','contextId','semanticHash','datasetId','workspaceVersion','availableContractCount','invalidContractCount','unavailableContractCount','diagnosticCount','validationState'], 'QA context summary', errors);
  validateRegistryReferenceValues(registry, errors);validateContextReferenceValues(context, errors);
  if (Number.isInteger(registry?.implementedCount) && registry.implementedCount < 0) errors.push('QA registry summary implementedCount is invalid.');
  if (Number.isInteger(registry?.unavailableCount) && registry.unavailableCount < 0) errors.push('QA registry summary unavailableCount is invalid.');
}
function validateRegistryReferenceValues(registry, errors) {
  const expected=navigationForSchema(registry?.schema);
  if (!expected) errors.push('QA registry reference schema is invalid.');
  if (typeof registry?.semanticHash !== 'string' || !registry.semanticHash) errors.push('QA registry reference semantic hash is invalid.');
  if (expected && registry?.consumerCount !== expected.length) errors.push('QA registry reference consumer count is invalid.');
  if (expected && canonicalStringify(registry?.consumerIds) !== canonicalStringify(expected)) errors.push('QA registry reference consumer order is invalid.');
  if (registry?.validationState !== 'VALID') errors.push('QA registry reference validation state is invalid.');
}
function validateContextReferenceValues(context, errors) {
  if (!Number.isInteger(context?.workspaceVersion) || context.workspaceVersion < 0) errors.push('QA context Workspace version is invalid.');
  const counts=['availableContractCount','invalidContractCount','unavailableContractCount','diagnosticCount'];counts.forEach((field)=>{if(!Number.isInteger(context?.[field])||context[field]<0)errors.push(`QA context ${field} is invalid.`);});
  const total=(context?.availableContractCount||0)+(context?.invalidContractCount||0)+(context?.unavailableContractCount||0);if(total!==CONTRACT_KEYS.length)errors.push('QA context contract counts are inconsistent.');
  if(context?.validationState==='VALID_EMPTY'){if(context.schema!==null||context.contextId!==null||context.semanticHash!==null||context.datasetId!==null)errors.push('QA empty context identity is invalid.');}
  else if(context?.validationState==='VALID'){if(context.schema!==WORKSPACE_CONSUMER_CONTEXT_SCHEMA||typeof context.contextId!=='string'||!context.contextId||typeof context.semanticHash!=='string'||!context.semanticHash)errors.push('QA context identity is invalid.');}
  else errors.push('QA context validation state is invalid.');
}
function validateConsumerRow(row, errors) {
  exactKeys(row, ['consumerId','label','implementationStatus','engineeringClaimPolicy','requiredContractKeys','optionalContractKeys','allowedActions','readinessState','missingRequiredContractKeys','invalidRequiredContractKeys','blockingDiagnostics','availableRequiredCount','availableOptionalCount'], `QA consumer ${row?.consumerId || ''}`, errors);
  ['requiredContractKeys','optionalContractKeys','allowedActions','missingRequiredContractKeys','invalidRequiredContractKeys'].forEach((field)=>validateCanonicalStrings(row?.[field],`${row?.consumerId||''} ${field}`,errors));
  validateCanonicalArray(row?.blockingDiagnostics,diagnosticKey,`${row?.consumerId||''} blocking diagnostics`,errors);
  if(!Object.values(IMPLEMENTATION_STATUS).includes(row?.implementationStatus))errors.push(`QA consumer ${row?.consumerId||''} implementation status is invalid.`);
  if(!Object.values(READINESS_STATES).includes(row?.readinessState))errors.push(`QA consumer ${row?.consumerId||''} readiness state is invalid.`);
  ['availableRequiredCount','availableOptionalCount'].forEach((field)=>{if(!Number.isInteger(row?.[field])||row[field]<0)errors.push(`QA consumer ${row?.consumerId||''} ${field} is invalid.`);});
}
function validateContractRow(row, errors) {
  exactKeys(row, ['contractKey','availability','schema','semanticHash','datasetId','validatorState','datasetState','linkState','requiredByConsumerIds','optionalForConsumerIds','qualificationSummary','diagnostics'], `QA contract ${row?.contractKey || ''}`, errors);
  validateCanonicalStrings(row?.requiredByConsumerIds,`${row?.contractKey||''} required consumers`,errors);validateCanonicalStrings(row?.optionalForConsumerIds,`${row?.contractKey||''} optional consumers`,errors);validateCanonicalArray(row?.diagnostics,diagnosticKey,`${row?.contractKey||''} diagnostics`,errors);
  if(!Array.isArray(row?.qualificationSummary))errors.push(`QA contract ${row?.contractKey||''} qualification summary is invalid.`);validateContractStates(row,errors);
}
function validateContractStates(row, errors) { if(!QA_AVAILABILITY_STATES.includes(row?.availability))errors.push(`Contract ${row?.contractKey||''} availability is invalid.`);if(!QA_VALIDATOR_STATES.includes(row?.validatorState))errors.push(`Contract ${row?.contractKey||''} validator state is invalid.`);if(!QA_DATASET_STATES.includes(row?.datasetState))errors.push(`Contract ${row?.contractKey||''} dataset state is invalid.`);if(!QA_LINK_STATES.includes(row?.linkState))errors.push(`Contract ${row?.contractKey||''} link state is invalid.`); }
function validateExactMembership(rows,key,expected,label,errors){if(!Array.isArray(rows))return;if(canonicalStringify(rows.map((row)=>row?.[key]))!==canonicalStringify(expected))errors.push(`QA ${label} membership or ordering is not canonical.`);}
function validateRows(rows,key,label,errors){if(!Array.isArray(rows))return errors.push(`QA ${label} must be an array.`);const keys=rows.map((row)=>row?.[key]);if(keys.some((value)=>typeof value!=='string'||!value))errors.push(`QA ${label} contain an invalid ${key}.`);if(new Set(keys).size!==keys.length)errors.push(`QA ${label} contain duplicate ${key} values.`);}
function validateCanonicalStrings(value,label,errors){if(!Array.isArray(value)||value.some((row)=>typeof row!=='string'))return errors.push(`QA ${label} are invalid.`);if(canonicalStringify(value)!==canonicalStringify([...new Set(value)].sort()))errors.push(`QA ${label} are not canonical.`);}
function validateCanonicalArray(value,selector,label,errors){if(!Array.isArray(value))return errors.push(`QA ${label} must be an array.`);const keys=value.map(selector);if(new Set(keys).size!==keys.length||canonicalStringify(keys)!==canonicalStringify([...keys].sort()))errors.push(`QA ${label} are duplicated or non-canonical.`);}
function exactKeys(value,keys,label,errors){if(!isPlain(value))return errors.push(`${label} must be a plain record.`);if(canonicalStringify(Object.keys(value).sort())!==canonicalStringify([...keys].sort()))errors.push(`${label} fields are not exact.`);}
function hashCheck(value,payload,label,errors){if(value?.semanticHash!==semanticHash(payload))errors.push(`${label} semantic hash mismatch.`);}
function validatePublicEvidence(value,label,errors){try{assertPlainJson(value,label);}catch(error){errors.push(error.message);}if(!isDeepFrozen(value))errors.push(`${label} public evidence must be deeply frozen.`);}
function walk(value,path,seen){if(value===null||['string','boolean'].includes(typeof value)||(typeof value==='number'&&Number.isFinite(value)))return;if(typeof value!=='object')throw new TypeError(`${path} contains a non-JSON value.`);if(seen.has(value))throw new TypeError(`${path} contains a cycle.`);seen.add(value);if(Array.isArray(value)){if(Object.keys(value).length!==value.length)throw new TypeError(`${path} contains a sparse or extended array.`);value.forEach((item,index)=>walk(item,`${path}[${index}]`,seen));}else{if(!isPlain(value)||Object.getOwnPropertySymbols(value).length)throw new TypeError(`${path} contains a non-plain record.`);Object.keys(value).forEach((key)=>walk(value[key],`${path}.${key}`,seen));}seen.delete(value);}
function isDeepFrozen(value){if(value===null||typeof value!=='object')return true;return Object.isFrozen(value)&&Object.values(value).every(isDeepFrozen);}
function isPlain(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
function diagnosticKey(row){return `${row?.scope||''}|${row?.code||''}|${row?.contractKey||''}|${row?.consumerId||''}|${row?.message||''}`;}
function withoutHash(value){const{semanticHash:_hash,...rest}=value||{};return rest;}
function navigationForSchema(schema){if(schema===WORKSPACE_CONSUMER_REGISTRY_V10_SCHEMA)return APPLICATION_NAVIGATION_ORDER_V10;if(schema===WORKSPACE_CONSUMER_REGISTRY_V9_SCHEMA)return APPLICATION_NAVIGATION_ORDER_V9;return null;}
function expectedNavigation(value){return navigationForSchema(value?.registryReference?.schema||value?.registrySummary?.schema)||[];}
function compareText(a,b){return a<b?-1:a>b?1:0;}
