import {
  SKETCHER_EVENTS, SketcherDraftAuthority, createSketcherReviewModel,
  importWorkspaceGeometryToSketcher, parseSketcherDraftJson, serializeSketcherDraft,
} from '../core/sketcher-draft/index.js';
import { EventBus } from './event-bus.js';
import { EVENT_TOPICS } from './event-topics.js';
import { SketcherView } from './sketcher-view.js';
import { qualifySketcherWorkspaceAdoption } from './sketcher-workspace-adapter.js';

export class SketcherController {
  constructor(rootElement, contextProvider, eventBus = EventBus) {
    this.rootElement = rootElement;
    this.contextProvider = contextProvider;
    this.eventBus = eventBus;
    this.authority = new SketcherDraftAuthority();
    this.view = new SketcherView(rootElement, eventBus);
    this.importDiagnostics = [];
    this.adoption = null;
    this.pendingAdoption = null;
    this.unsubscribeCallbacks = [];
    this.message = 'Blank draft ready. Workspace is unchanged until explicit adoption.';
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.view.init();
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(SKETCHER_EVENTS.DRAFT_CREATE_REQUESTED, () => this.execute('CREATE_EMPTY_DRAFT', {}, 'new-draft')),
      this.eventBus.subscribe(SKETCHER_EVENTS.DOCUMENT_IMPORT_REQUESTED, ({ document }) => this.importDocument(document)),
      this.eventBus.subscribe(SKETCHER_EVENTS.WORKSPACE_IMPORT_REQUESTED, () => this.importWorkspace()),
      this.eventBus.subscribe(SKETCHER_EVENTS.COMMAND_REQUESTED, ({ commandType, payload }) => this.execute(commandType, payload, 'edit')),
      this.eventBus.subscribe(SKETCHER_EVENTS.UNDO_REQUESTED, () => this.execute('UNDO_EDIT', {}, 'undo')),
      this.eventBus.subscribe(SKETCHER_EVENTS.REDO_REQUESTED, () => this.execute('REDO_EDIT', {}, 'redo')),
      this.eventBus.subscribe(SKETCHER_EVENTS.VALIDATION_REQUESTED, () => this.validate()),
      this.eventBus.subscribe(SKETCHER_EVENTS.EXPORT_REQUESTED, ({ format }) => this.export(format)),
      this.eventBus.subscribe(SKETCHER_EVENTS.ADOPTION_REQUESTED, () => this.adopt()),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, ({ datasetId }) => this.handleDatasetLoaded(datasetId)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOAD_FAILED, ({ message }) => this.handleDatasetFailed(message)),
    ];
    this.render();
  }

  execute(commandType, payload, reason) {
    try {
      const command = this.authority.createCommand(commandType, payload);
      const result = this.authority.execute(command);
      if (!result.accepted) return this.failCommand(result.code, result.message);
      if (['CREATE_EMPTY_DRAFT','RESET_DRAFT'].includes(commandType)) { this.importDiagnostics = []; this.adoption = null; }
      this.message = messageFor(commandType);
      this.publishChanged(reason);
      return result;
    } catch (error) { return this.failCommand(error.code || 'INVALID_SKETCHER_COMMAND', error.message); }
  }

  importDocument(documentOrText) {
    try {
      const document = typeof documentOrText === 'string' ? parseSketcherDraftJson(documentOrText) : documentOrText;
      this.importDiagnostics = [];
      this.adoption = null;
      return this.execute('IMPORT_SKETCH_DOCUMENT', { document }, 'document-import');
    } catch (error) { return this.failCommand('SKETCHER_DOCUMENT_IMPORT_FAILED', error.message); }
  }

  importWorkspace() {
    try {
      const context = this.contextProvider();
      const result = importWorkspaceGeometryToSketcher({
        sharedModel: context?.contracts?.sharedModel,
        topologyGraph: context?.contracts?.topologyGraph,
        currentDraftId: this.authority.getDocument().draftId,
        revision: this.authority.getDocument().revision + 1,
      });
      if (result.fidelity === 'REJECTED') throw controllerError('SKETCHER_WORKSPACE_IMPORT_REJECTED', result.diagnostics.map((row) => row.message).join(' '));
      const command = this.authority.createCommand('IMPORT_WORKSPACE_GEOMETRY', { document: result.document });
      const accepted = this.authority.execute(command);
      if (!accepted.accepted) throw controllerError(accepted.code, accepted.message);
      this.importDiagnostics = result.diagnostics;
      this.adoption = null;
      this.message = `Workspace import completed with ${result.fidelity}.`;
      this.publishChanged('workspace-import');
      return result;
    } catch (error) { return this.failCommand(error.code || 'SKETCHER_WORKSPACE_IMPORT_FAILED', error.message); }
  }

  validate() {
    const review = this.getReviewModel();
    this.message = review.adoptionEligibility.allowed ? 'Draft validation passed for explicit Workspace adoption.' : `Draft validation found ${review.adoptionEligibility.blockers.length} adoption blocker(s).`;
    this.render();
    return review;
  }

  export(format = 'json') {
    try {
      if (format !== 'json') throw new TypeError('W10.R4 supports JSON export only.');
      const document = this.authority.getDocument();
      const artifact = Object.freeze({ filename: `${document.draftId}-r${document.revision}.json`, mediaType: 'application/json', content: serializeSketcherDraft(document) });
      this.view.download(artifact);
      this.message = `Exported ${artifact.filename}.`;
      this.render();
      return artifact;
    } catch (error) { return this.failCommand('SKETCHER_EXPORT_FAILED', error.message); }
  }

  adopt() {
    try {
      const review = this.getReviewModel();
      if (!review.adoptionEligibility.allowed) throw controllerError('SKETCHER_ADOPTION_BLOCKED', review.adoptionEligibility.blockers.join(', '));
      const qualified = qualifySketcherWorkspaceAdoption(this.authority.getDocument());
      this.pendingAdoption = qualified;
      this.message = 'Qualified Sketcher adoption requested through the existing DatasetController boundary.';
      this.render();
      this.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, { rawPackage: qualified.packageJson, sourceName: qualified.sourceName });
      return qualified.adoption;
    } catch (error) { return this.failAdoption(error.code || 'SKETCHER_ADOPTION_FAILED', error.message); }
  }

  handleDatasetLoaded(datasetId) {
    if (!this.pendingAdoption) return;
    const candidate = this.pendingAdoption;
    this.pendingAdoption = null;
    this.adoption = candidate.adoption;
    this.message = `Sketcher draft adopted as Workspace dataset ${datasetId}.`;
    this.eventBus.publish(SKETCHER_EVENTS.ADOPTION_COMPLETED, { adoption: this.adoption });
    this.render();
  }

  handleDatasetFailed(message) {
    if (!this.pendingAdoption) return;
    this.pendingAdoption = null;
    this.failAdoption('SKETCHER_WORKSPACE_LOAD_FAILED', message);
  }

  refreshContext() { this.render(); }
  getDocument() { return this.authority.getDocument(); }
  getAudit() { return this.authority.getAudit(); }
  getReviewModel() { return createSketcherReviewModel({ document: this.getDocument(), audit: this.getAudit(), importDiagnostics: this.importDiagnostics, adoption: this.adoption }); }
  getAdoption() { return this.adoption; }

  publishChanged(reason) {
    const payload = { document: this.getDocument(), audit: this.getAudit(), reviewModel: this.getReviewModel(), reason };
    this.eventBus.publish(SKETCHER_EVENTS.DRAFT_CHANGED, payload);
    this.render();
  }

  failCommand(code, message) {
    this.message = `${code}: ${message}`;
    this.eventBus.publish(SKETCHER_EVENTS.COMMAND_FAILED, { code, message });
    this.render();
    return Object.freeze({ accepted: false, code, message, document: this.getDocument() });
  }

  failAdoption(code, message) {
    this.message = `${code}: ${message}`;
    this.eventBus.publish(SKETCHER_EVENTS.ADOPTION_FAILED, { code, message });
    this.render();
    return null;
  }

  render() {
    const context = this.contextProvider();
    this.view.render({
      document: this.getDocument(), reviewModel: this.getReviewModel(), message: this.message,
      workspaceImportAvailable: Boolean(context?.contracts?.sharedModel), pendingAdoption: Boolean(this.pendingAdoption),
    });
  }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.pendingAdoption = null;
    this.view.destroy();
    this.rootElement = null;
  }
}

function messageFor(commandType) {
  return ({ ADD_PIPE_SEGMENT: 'Pipe segment added.', MOVE_NODE: 'Node moved.', DELETE_NODE: 'Node deleted.', DELETE_SEGMENT: 'Segment deleted.', SET_WORKING_PLANE: 'Working plane changed.', UNDO_EDIT: 'Edit undone.', REDO_EDIT: 'Edit redone.', CREATE_EMPTY_DRAFT: 'New blank draft created.', RESET_DRAFT: 'Draft reset.' })[commandType] || 'Sketcher draft updated.';
}
function controllerError(code, message) { const error = new TypeError(message); error.code = code; return error; }
