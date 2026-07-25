export const LFEA_CONSUMER_PROFILE_SCHEMA = 'lfea-consumer-profile/v1';
export const LFEA_CONSUMER_SESSION_SCHEMA = 'lfea-consumer-session/v1';
export const LFEA_CONSUMER_VIEW_MODEL_SCHEMA = 'lfea-consumer-view-model/v1';

export const LFEA_CONSUMER_STATUSES = Object.freeze({
  EMPTY: 'EMPTY', QUALIFIED: 'QUALIFIED', REJECTED: 'REJECTED', CAPACITY_BLOCKED: 'CAPACITY_BLOCKED',
});
export const LFEA_SOURCE_KINDS = Object.freeze({ ENGINEERING_REVIEW: 'ENGINEERING_REVIEW', EVIDENCE_EXPORT: 'EVIDENCE_EXPORT' });
export const LFEA_RESULT_MODES = Object.freeze({ RAW: 'RAW', PROJECTED: 'PROJECTED' });
export const LFEA_STRESS_COMPONENTS = Object.freeze(['SX','SY','TXY','SIGMA_Z','PRINCIPAL_1','PRINCIPAL_2','VON_MISES']);
export const LFEA_LAYER_IDS = Object.freeze(['UNDEFORMED_MESH','DEFORMED_REVIEW_GEOMETRY','NODES','LOADS','CONSTRAINTS','RAW_STRESS','PROJECTED_STRESS','SELECTION']);
export const LFEA_SECTION_IDS = Object.freeze(['ANALYSIS','QUALIFICATION','MODEL_SOLVER','LOADS_CONSTRAINTS','DISPLACEMENTS_REACTIONS','RAW_STRESS','PROJECTED_STRESS','CONVERGENCE','DIAGNOSTICS','LIMITATIONS','SUPPLIED_FILES']);
export const LFEA_SELECTION_TYPES = Object.freeze(['NODE','ELEMENT','RAW_STRESS_LOCATION','PROJECTED_STRESS_LOCATION','LOAD','CONSTRAINT','REACTION','CONVERGENCE_QUANTITY','SUPPLIED_FILE']);
export const LFEA_CONSUMER_EVENTS = Object.freeze({
  SOURCE_LOAD_REQUESTED:'lfeaConsumer:sourceLoadRequested', SOURCE_LOADED:'lfeaConsumer:sourceLoaded', SOURCE_LOAD_FAILED:'lfeaConsumer:sourceLoadFailed', SOURCE_CLEAR_REQUESTED:'lfeaConsumer:sourceClearRequested', SESSION_CHANGED:'lfeaConsumer:sessionChanged', SECTION_REQUESTED:'lfeaConsumer:sectionRequested', RECORD_REQUESTED:'lfeaConsumer:recordRequested', DISPLAY_REQUESTED:'lfeaConsumer:displayRequested', FILE_DOWNLOAD_REQUESTED:'lfeaConsumer:fileDownloadRequested', FILE_DOWNLOAD_COMPLETED:'lfeaConsumer:fileDownloadCompleted', FILE_DOWNLOAD_FAILED:'lfeaConsumer:fileDownloadFailed',
});
export const INITIAL_LFEA_CONSUMER_PROFILE = Object.freeze({
  schema:LFEA_CONSUMER_PROFILE_SCHEMA, profileIdentity:'lfea-007-consumer-profile-v1', maximumSourceBytes:16777216, maximumNodes:20000, maximumElements:10000, maximumRawStressRows:40000, maximumProjectedStressRows:50000, maximumConvergenceRows:10000, maximumSuppliedExportFiles:128, tablePageSize:100,
});
