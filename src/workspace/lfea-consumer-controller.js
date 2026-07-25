import {
  LFEA_CONSUMER_EVENTS,LFEA_CONSUMER_STATUSES,LFEA_LAYER_IDS,LFEA_RESULT_MODES,LFEA_SECTION_IDS,LFEA_STRESS_COMPONENTS,
  LFEA_TABLE_IDS,createEmptyLfeaConsumerSession,createFailedLfeaConsumerSession,
  createLfeaConsumerViewModel,createQualifiedLfeaConsumerSession,parseLfeaSourceText,resolveLfeaSelection,
  updateLfeaConsumerSession,validateLfeaConsumerProfile,validateSuppliedFileForDownload,
} from '../core/lfea-consumer/index.js';
import { EventBus } from './event-bus.js';
import { LfeaConsumerView } from './lfea-consumer-view.js';

export class LfeaConsumerController {
  constructor(rootElement,eventBus=EventBus,profile){
    const profileValidation=validateLfeaConsumerProfile(profile);
    if(!profileValidation.ok)throw new TypeError(profileValidation.errors[0]);
    this.rootElement=rootElement;this.eventBus=eventBus;this.profile=profile;
    this.documentRef=rootElement?.ownerDocument||globalThis.document;this.view=new LfeaConsumerView(rootElement);
    this.session=createEmptyLfeaConsumerSession();this.bundle=null;this.viewModel=null;this.objectUrls=new Set();this.initialized=false;
  }
  init(){if(this.initialized)return;this.initialized=true;this.view.init({
    onFileSelected:(file)=>this.loadFile(file),onClear:()=>this.clear(),onSection:(id)=>this.selectSection(id),
    onSelection:(selection)=>this.selectRecord(selection),onResultMode:(mode)=>this.setResultMode(mode),
    onStressComponent:(component)=>this.setStressComponent(component),onLayer:(id,visible)=>this.setLayerVisibility(id,visible),
    onPage:(tableId,page)=>this.setTablePage(tableId,page),onDownload:(path)=>this.downloadSuppliedFile(path),
  });this.render();}
  async loadFile(file){
    if(!file)return null;this.eventBus.publish(LFEA_CONSUMER_EVENTS.SOURCE_LOAD_REQUESTED,{file});
    const sourceName=file.name||'selected-source.json';
    try{
      if(file.size>this.profile.maximumSourceBytes)throw capacityError('maximumSourceBytes',file.size,this.profile.maximumSourceBytes);
      if(!sourceName.toLowerCase().endsWith('.json')&&file.type!=='application/json')throw operationError('LFEA_SOURCE_TYPE_UNSUPPORTED','Selected source must be JSON.');
      const text=await readUtf8File(file);const bundle=parseLfeaSourceText(text,{profile:this.profile,sourceName,sourceByteLength:file.size});
      const session=createQualifiedLfeaConsumerSession(bundle,this.session);const viewModel=createLfeaConsumerViewModel(bundle,session,this.profile);
      this.bundle=bundle;this.session=session;this.viewModel=viewModel;this.render();
      this.eventBus.publish(LFEA_CONSUMER_EVENTS.SOURCE_LOADED,{sourceKind:bundle.sourceKind,reviewIdentity:bundle.review.reviewIdentity});this.publishSession();return viewModel;
    }catch(error){
      const retained=Boolean(this.bundle);const diagnostic={severity:'ERROR',code:error.code||'LFEA_SOURCE_LOAD_FAILED',message:error.message,sourceName,sourceKind:null,capacityField:error.capacityField,requested:error.requested,limit:error.limit,previousQualifiedReviewRetained:retained};
      this.session=createFailedLfeaConsumerSession(this.session,diagnostic,error.code==='LFEA_CAPACITY_BLOCKED');this.render();
      this.eventBus.publish(LFEA_CONSUMER_EVENTS.SOURCE_LOAD_FAILED,{code:diagnostic.code,message:diagnostic.message});this.publishSession();return null;
    }
  }
  clear(){this.eventBus.publish(LFEA_CONSUMER_EVENTS.SOURCE_CLEAR_REQUESTED,{});const previous=this.session;this.bundle=null;this.viewModel=null;this.session=createEmptyLfeaConsumerSession(previous);this.view.resetFileInput();this.render();this.publishSession();}
  selectSection(sectionId){if(!LFEA_SECTION_IDS.includes(sectionId))return;this.eventBus.publish(LFEA_CONSUMER_EVENTS.SECTION_REQUESTED,{sectionId});this.update({activeSection:sectionId});}
  selectRecord(selection){this.eventBus.publish(LFEA_CONSUMER_EVENTS.RECORD_REQUESTED,{selection});if(selection===null){this.update({selectedRecord:null});return;}if(!resolveLfeaSelection(this.viewModel,selection)){this.failDisplay('LFEA_SELECTED_RECORD_MISSING','Selected identity is absent from the qualified source.');return;}this.update({selectedRecord:selection});}
  setResultMode(resultMode){if(!Object.values(LFEA_RESULT_MODES).includes(resultMode))return;this.eventBus.publish(LFEA_CONSUMER_EVENTS.DISPLAY_REQUESTED,{resultMode});if(resultMode==='PROJECTED'&&this.bundle?.review?.projectedStressReview?.status!=='AVAILABLE_NON_AUTHORITATIVE'){this.failDisplay('LFEA_PROJECTED_STRESS_UNAVAILABLE','Projected mode requires supplied non-authoritative projection evidence.');return;}this.update({resultMode});}
  setStressComponent(stressComponent){if(!LFEA_STRESS_COMPONENTS.includes(stressComponent)){this.failDisplay('LFEA_STRESS_COMPONENT_UNSUPPORTED','Unsupported stress component.');return;}this.eventBus.publish(LFEA_CONSUMER_EVENTS.DISPLAY_REQUESTED,{stressComponent});this.update({stressComponent});}
  setLayerVisibility(layerId,visible){if(!LFEA_LAYER_IDS.includes(layerId)||typeof visible!=='boolean')return;this.eventBus.publish(LFEA_CONSUMER_EVENTS.DISPLAY_REQUESTED,{layerId,visible});this.update({layerVisibility:{...this.session.layerVisibility,[layerId]:visible}});}
  setTablePage(tableId,page){if(!LFEA_TABLE_IDS.includes(tableId)||!Number.isInteger(page)||page<1)return;this.eventBus.publish(LFEA_CONSUMER_EVENTS.DISPLAY_REQUESTED,{tableId,page});this.update({tablePages:{...this.session.tablePages,[tableId]:page}});}
  update(changes){if(!this.bundle)return;this.session=updateLfeaConsumerSession(this.session,{...changes,status:LFEA_CONSUMER_STATUSES.QUALIFIED,diagnostics:[]});this.viewModel=createLfeaConsumerViewModel(this.bundle,this.session,this.profile);this.render();this.publishSession();}
  failDisplay(code,message){const diagnostic={severity:'ERROR',code,message,sourceName:this.session.sourceName,sourceKind:this.session.sourceKind,previousQualifiedReviewRetained:Boolean(this.bundle)};this.session=createFailedLfeaConsumerSession(this.session,diagnostic,false);this.render();this.eventBus.publish(LFEA_CONSUMER_EVENTS.SOURCE_LOAD_FAILED,{code,message});this.publishSession();}
  downloadSuppliedFile(path){
    this.eventBus.publish(LFEA_CONSUMER_EVENTS.FILE_DOWNLOAD_REQUESTED,{path});
    try{if(!this.bundle?.export)throw new TypeError('Supplied file download requires an imported evidence export.');const file=this.bundle.export.files.find((row)=>row.path===path);const artifact=validateSuppliedFileForDownload(file,this.bundle.export);this.download(artifact);this.eventBus.publish(LFEA_CONSUMER_EVENTS.FILE_DOWNLOAD_COMPLETED,{path:artifact.path,contentHash:artifact.contentHash});return artifact;}
    catch(error){this.eventBus.publish(LFEA_CONSUMER_EVENTS.FILE_DOWNLOAD_FAILED,{code:error.code||'LFEA_FILE_DOWNLOAD_FAILED',message:error.message});this.failDisplay(error.code||'LFEA_FILE_DOWNLOAD_FAILED',error.message);return null;}
  }
  download(artifact){if(!this.documentRef||typeof Blob==='undefined'||typeof URL==='undefined')return;const url=URL.createObjectURL(new Blob([artifact.content],{type:artifact.mediaType}));this.objectUrls.add(url);const anchor=this.documentRef.createElement('a');anchor.href=url;anchor.download=artifact.filename;anchor.hidden=true;this.documentRef.body?.append(anchor);anchor.click();anchor.remove();queueMicrotask(()=>{URL.revokeObjectURL(url);this.objectUrls.delete(url);});}
  publishSession(){this.eventBus.publish(LFEA_CONSUMER_EVENTS.SESSION_CHANGED,{session:this.session});}
  render(){this.view.render({session:this.session,viewModel:this.viewModel,profile:this.profile,hasRetainedReview:Boolean(this.bundle)});}
  getSession(){return this.session;}getViewModel(){return this.viewModel;}getLoadedReview(){return this.bundle?.review||null;}getLoadedExport(){return this.bundle?.export||null;}
  destroy(){this.objectUrls.forEach((url)=>URL.revokeObjectURL(url));this.objectUrls.clear();this.view.destroy();this.bundle=null;this.viewModel=null;this.session=null;this.initialized=false;this.rootElement=null;}
}
async function readUtf8File(file){if(typeof file.arrayBuffer==='function'){let bytes;try{bytes=await file.arrayBuffer();return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(error){if(error?.code)throw error;throw operationError('LFEA_SOURCE_UTF8_INVALID','Selected source is not valid UTF-8 text.');}}if(typeof file.text==='function')return file.text();throw operationError('LFEA_SOURCE_READ_UNAVAILABLE','Selected source cannot be read.');}
function operationError(code,message){const error=new TypeError(message);error.code=code;return error;}
function capacityError(field,requested,limit){const error=operationError('LFEA_CAPACITY_BLOCKED',`Selected source byte length ${requested} exceeds ${limit}.`);error.capacityField=field;error.requested=requested;error.limit=limit;return error;}
