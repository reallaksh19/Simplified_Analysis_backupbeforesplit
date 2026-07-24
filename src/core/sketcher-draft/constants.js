export const SKETCHER_DRAFT_DOCUMENT_SCHEMA = 'sketcher-draft-document/v1';
export const SKETCHER_COMMAND_SCHEMA = 'sketcher-command/v1';
export const SKETCHER_DRAFT_AUDIT_SCHEMA = 'sketcher-draft-audit/v1';
export const SKETCHER_REVIEW_MODEL_SCHEMA = 'sketcher-review-model/v1';
export const SKETCHER_WORKSPACE_ADOPTION_SCHEMA = 'sketcher-workspace-adoption/v1';
export const SKETCHER_WORKSPACE_IMPORT_SCHEMA = 'sketcher-workspace-import/v1';
export const SKETCHER_WORKSPACE_PACKAGE_SCHEMA = 'inputxml-managed-stage/v1';
export const SKETCHER_LENGTH_TOLERANCE_MM = 1e-6;

export const WORKING_PLANES = Object.freeze(['XY', 'XZ', 'YZ']);
export const COMPONENT_TYPES = Object.freeze(['PIPE']);
export const IMPORT_FIDELITY = Object.freeze({
  FULL_FIDELITY: 'FULL_FIDELITY',
  PARTIAL_WITH_DIAGNOSTICS: 'PARTIAL_WITH_DIAGNOSTICS',
  REJECTED: 'REJECTED',
});
export const DIAGNOSTIC_SEVERITY = Object.freeze({ ERROR: 'ERROR', INFO: 'INFO', WARNING: 'WARNING' });
export const COMMAND_TYPES = Object.freeze([
  'CREATE_EMPTY_DRAFT', 'IMPORT_SKETCH_DOCUMENT', 'IMPORT_WORKSPACE_GEOMETRY',
  'SET_WORKING_PLANE', 'ADD_PIPE_SEGMENT', 'MOVE_NODE', 'DELETE_NODE', 'DELETE_SEGMENT',
  'UNDO_EDIT', 'REDO_EDIT', 'RESET_DRAFT', 'VALIDATE_DRAFT',
  'EXPORT_SKETCH_DOCUMENT', 'ADOPT_DRAFT_TO_WORKSPACE',
]);
export const MUTATING_COMMAND_TYPES = Object.freeze([
  'CREATE_EMPTY_DRAFT', 'IMPORT_SKETCH_DOCUMENT', 'IMPORT_WORKSPACE_GEOMETRY',
  'SET_WORKING_PLANE', 'ADD_PIPE_SEGMENT', 'MOVE_NODE', 'DELETE_NODE',
  'DELETE_SEGMENT', 'RESET_DRAFT',
]);
export const SKETCHER_EVENTS = Object.freeze({
  DRAFT_CREATE_REQUESTED: 'sketcher:draftCreateRequested',
  DOCUMENT_IMPORT_REQUESTED: 'sketcher:documentImportRequested',
  WORKSPACE_IMPORT_REQUESTED: 'sketcher:workspaceImportRequested',
  COMMAND_REQUESTED: 'sketcher:commandRequested',
  UNDO_REQUESTED: 'sketcher:undoRequested',
  REDO_REQUESTED: 'sketcher:redoRequested',
  VALIDATION_REQUESTED: 'sketcher:validationRequested',
  EXPORT_REQUESTED: 'sketcher:exportRequested',
  ADOPTION_REQUESTED: 'sketcher:adoptionRequested',
  DRAFT_CHANGED: 'sketcher:draftChanged',
  COMMAND_FAILED: 'sketcher:commandFailed',
  ADOPTION_COMPLETED: 'sketcher:adoptionCompleted',
  ADOPTION_FAILED: 'sketcher:adoptionFailed',
});
