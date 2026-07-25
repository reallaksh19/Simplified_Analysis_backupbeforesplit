import { LFEA_CONSUMER_EVENTS, LFEA_LAYER_IDS, LFEA_RESULT_MODES, LFEA_SECTION_IDS, LFEA_SELECTION_TYPES, LFEA_STRESS_COMPONENTS } from './constants.js';

export function validateLfeaConsumerEventPayload(topic,payload){const validator=VALIDATORS.get(topic);if(!validator)throw new TypeError(`Unknown Local FEA event topic: ${topic}.`);validator(payload);return true;}
const VALIDATORS=new Map([
  [LFEA_CONSUMER_EVENTS.SOURCE_LOAD_REQUESTED,(p)=>{record(p);if(!p.file||typeof p.file!=='object')throw new TypeError('Local FEA source-load request requires a selected File.');}],
  [LFEA_CONSUMER_EVENTS.SOURCE_LOADED,(p)=>{record(p);text(p.sourceKind,'sourceKind');text(p.reviewIdentity,'reviewIdentity');}],
  [LFEA_CONSUMER_EVENTS.SOURCE_LOAD_FAILED,failure],[LFEA_CONSUMER_EVENTS.SOURCE_CLEAR_REQUESTED,optionalRecord],
  [LFEA_CONSUMER_EVENTS.SESSION_CHANGED,(p)=>{record(p);if(!p.session)throw new TypeError('Local FEA sessionChanged requires session.');}],
  [LFEA_CONSUMER_EVENTS.SECTION_REQUESTED,(p)=>{record(p);oneOf(p.sectionId,LFEA_SECTION_IDS,'sectionId');}],
  [LFEA_CONSUMER_EVENTS.RECORD_REQUESTED,(p)=>{record(p);if(p.selection!==null){record(p.selection);oneOf(p.selection.type,LFEA_SELECTION_TYPES,'selection.type');text(p.selection.identity,'selection.identity');}}],
  [LFEA_CONSUMER_EVENTS.DISPLAY_REQUESTED,(p)=>{record(p);if(p.resultMode!==undefined)oneOf(p.resultMode,Object.values(LFEA_RESULT_MODES),'resultMode');if(p.stressComponent!==undefined)oneOf(p.stressComponent,LFEA_STRESS_COMPONENTS,'stressComponent');if(p.layerId!==undefined){oneOf(p.layerId,LFEA_LAYER_IDS,'layerId');if(typeof p.visible!=='boolean')throw new TypeError('visible must be boolean.');}if(p.tableId!==undefined){text(p.tableId,'tableId');if(!Number.isInteger(p.page)||p.page<1)throw new TypeError('page must be a positive integer.');}}],
  [LFEA_CONSUMER_EVENTS.FILE_DOWNLOAD_REQUESTED,(p)=>{record(p);text(p.path,'path');}],
  [LFEA_CONSUMER_EVENTS.FILE_DOWNLOAD_COMPLETED,(p)=>{record(p);text(p.path,'path');text(p.contentHash,'contentHash');}],
  [LFEA_CONSUMER_EVENTS.FILE_DOWNLOAD_FAILED,failure],
]);
function failure(p){record(p);text(p.code,'code');text(p.message,'message');}
function optionalRecord(p){if(p!==undefined)record(p);}
function record(p){if(!p||typeof p!=='object'||Array.isArray(p))throw new TypeError('Local FEA event payload must be a record.');}
function text(v,n){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be non-empty text.`);}
function oneOf(v,values,n){if(!values.includes(v))throw new TypeError(`${n} is invalid.`);}
