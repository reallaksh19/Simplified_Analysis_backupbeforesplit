import { createQaEvidenceExport, createQaEvidenceSource, createQaReviewModel, QA_EVENTS } from '../core/qa-evidence/index.js';
import { deepFreeze } from '../core/shared-piping-model/index.js';
import { EventBus } from './event-bus.js';
import { QaEvidenceView } from './qa-evidence-view.js';

export class QaEvidenceController {
  constructor(rootElement, sourceProvider, eventBus = EventBus) {
    if (typeof sourceProvider !== 'function') throw new TypeError('QA sourceProvider is required.');
    this.sourceProvider = sourceProvider;this.eventBus = eventBus;this.view = new QaEvidenceView(rootElement);
    this.source = null;this.reviewModel = null;this.active = false;this.materializationCount = 0;this.unsubscribeCallbacks = [];
  }
  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.view.init({ refresh:()=>this.eventBus.publish(QA_EVENTS.REFRESH_REQUESTED,Object.freeze({reason:'user'})), export:(format)=>this.eventBus.publish(QA_EVENTS.EXPORT_REQUESTED,Object.freeze({format})) });
    this.unsubscribeCallbacks = [this.eventBus.subscribe(QA_EVENTS.REFRESH_REQUESTED,({reason})=>this.materialize(reason)),this.eventBus.subscribe(QA_EVENTS.EXPORT_REQUESTED,({format})=>this.export(format))];
  }
  open(){this.active=true;if(!this.reviewModel)this.materialize('opened');else this.view.render(this.reviewModel);}
  close(){this.active=false;}
  refreshContext(){if(this.active)this.materialize('runtime-evidence-changed');}
  materialize(reason) {
    try {
      const input=this.sourceProvider(),nextSource=createQaEvidenceSource(input),nextReview=createQaReviewModel(nextSource);
      const changed=this.source?.semanticHash!==nextSource.semanticHash||this.reviewModel?.semanticHash!==nextReview.semanticHash;
      this.source=nextSource;this.reviewModel=nextReview;if(changed)this.materializationCount+=1;this.view.render(nextReview);
      this.eventBus.publish(QA_EVENTS.CHANGED,deepFreeze({reason,source:nextSource,reviewModel:nextReview}));return nextReview;
    } catch(error) { const payload=deepFreeze({code:'QA_EVIDENCE_REFRESH_REJECTED',message:messageOf(error)});this.view.renderFailure(payload);this.eventBus.publish(QA_EVENTS.REFRESH_FAILED,payload);return this.reviewModel; }
  }
  export(format) {
    if(!this.source||!this.reviewModel)this.materialize('export-materialization');if(!this.source||!this.reviewModel)return null;
    try{const artifact=createQaEvidenceExport({source:this.source,reviewModel:this.reviewModel,format});this.view.download(artifact);return artifact;}
    catch(error){const payload=deepFreeze({code:'QA_EVIDENCE_EXPORT_REJECTED',message:messageOf(error)});this.view.renderFailure(payload);this.eventBus.publish(QA_EVENTS.REFRESH_FAILED,payload);return null;}
  }
  getSource(){return this.source;}getReviewModel(){return this.reviewModel;}getMaterializationCount(){return this.materializationCount;}
  destroy(){this.unsubscribeCallbacks.forEach((unsubscribe)=>unsubscribe());this.unsubscribeCallbacks=[];this.view.destroy();this.sourceProvider=null;this.source=null;this.reviewModel=null;this.active=false;this.materializationCount=0;}
}
function messageOf(error){return error instanceof Error?error.message:String(error);}
