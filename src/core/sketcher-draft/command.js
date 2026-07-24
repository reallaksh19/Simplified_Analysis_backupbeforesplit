import { canonicalStringify, deepFreeze, isPlainRecord, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { COMMAND_TYPES, SKETCHER_COMMAND_SCHEMA } from './constants.js';
import { assertJsonSafe } from './validation.js';

const COMMAND_KEYS = Object.freeze(['commandId','commandType','payload','schema','semanticHash']);

export function createSketcherCommand({ commandId, commandType, payload = {} }) {
  assertJsonSafe(payload);
  const base = {
    schema: SKETCHER_COMMAND_SCHEMA,
    commandId: requiredString(commandId, 'commandId'),
    commandType: commandTypeValue(commandType),
    payload: cloneCanonical(payload),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateSketcherCommand(value) {
  const errors = [];
  try { assertJsonSafe(value); } catch (error) { errors.push(error.message); return deepFreeze({ ok: false, errors }); }
  if (value?.schema !== SKETCHER_COMMAND_SCHEMA) errors.push('Invalid Sketcher command schema.');
  if (!isPlainRecord(value) || canonicalStringify(Object.keys(value).sort()) !== canonicalStringify(COMMAND_KEYS)) errors.push('Sketcher command fields are invalid.');
  if (!stringValue(value?.commandId)) errors.push('Sketcher commandId is required.');
  if (!COMMAND_TYPES.includes(value?.commandType)) errors.push('Sketcher commandType is invalid.');
  if (!isPlainRecord(value?.payload)) errors.push('Sketcher command payload must be a plain object.');
  if (value && value.semanticHash !== semanticHash(withoutHash(value))) errors.push('Sketcher command semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function nextCommandId(sequence) {
  if (!Number.isInteger(sequence) || sequence < 1) throw new TypeError('Command sequence must be a positive integer.');
  return `command-${String(sequence).padStart(6, '0')}`;
}

function cloneCanonical(value) { return JSON.parse(canonicalStringify(value)); }
function commandTypeValue(value) { if (!COMMAND_TYPES.includes(value)) throw new TypeError('commandType is invalid.'); return value; }
function requiredString(value, label) { const result = stringValue(value); if (!result) throw new TypeError(`${label} is required.`); return result; }
function withoutHash(value) { const { semanticHash: _hash, ...rest } = value || {}; return rest; }
