import {
  APPLICATION_NAVIGATION_ORDER_V8, CONSUMER_IDS, IMPLEMENTATION_STATUS, READINESS_STATES,
  createApplicationViewStateV8, createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistryV8, refreshApplicationViewStateV8,
  transitionApplicationViewStateV8, workspaceConsumerDescriptor,
} from '../core/workspace-consumers/index.js';
import { EventBus } from './event-bus.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { HomeConsumerController } from './home-consumer-controller.js';
import { LoadCalcConsumerController } from './load-calc-consumer-controller.js';
import { PcfConsumerController } from './pcf-consumer-controller.js';
import { PipeSolverConsumerController } from './pipe-solver-consumer-controller.js';
import { SketcherController } from './sketcher-controller.js';
import { ThreeDCalcConsumerController } from './three-d-calc-consumer-controller.js';

export class ApplicationShellController {
  constructor(rootElement, consumerController, eventBus = EventBus, pipeSolverAdapter = null, settingsController = null) {
    this.eventBus = eventBus;
    this.consumerController = consumerController;
    this.settingsController = settingsController;
    this.context = consumerController.getContext();
    this.registry = createWorkspaceConsumerRegistryV8();
    this.readiness = this.buildReadiness();
    this.state = createApplicationViewStateV8(this.readiness, { activeViewId: CONSUMER_IDS.HOME, version: 0 });
    this.view = new ApplicationShellView(rootElement, eventBus);
    this.homeController = new HomeConsumerController(
      rootElement?.querySelector('[data-role="home-consumer-root"]'),
      () => ({ registry: this.registry, context: this.context, readiness: this.readiness }), eventBus,
    );
    this.pcfController = new PcfConsumerController(rootElement?.querySelector('[data-role="pcf-consumer-root"]'), eventBus);
    this.sketcherController = new SketcherController(
      rootElement?.querySelector('[data-role="sketcher-consumer-root"]'), () => this.context, eventBus,
    );
    this.loadCalcController = new LoadCalcConsumerController(
      rootElement?.querySelector('[data-role="load-calc-consumer-root"]'), consumerController, eventBus,
    );
    this.threeDCalcController = new ThreeDCalcConsumerController(
      rootElement?.querySelector('[data-role="three-d-calc-consumer-root"]'), consumerController, eventBus,
    );
    this.pipeSolverController = pipeSolverAdapter ? new PipeSolverConsumerController(
      rootElement?.querySelector('[data-role="pipe-solver-consumer-root"]'), consumerController, pipeSolverAdapter, eventBus,
    ) : null;
    this.unsubscribeCallbacks = [];
  }

  init() {
    if (this.unsubscribeCallbacks.length) return;
    this.view.init(this.registry);
    this.homeController.init();
    this.pcfController.init();
    this.sketcherController.init();
    this.loadCalcController.init();
    this.threeDCalcController.init();
    this.pipeSolverController?.init();
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(APPLICATION_EVENTS.CONTEXT_CHANGED, ({ context }) => this.handleContext(context)),
      this.eventBus.subscribe(APPLICATION_EVENTS.CHANGE_REQUESTED, (payload) => this.handleRequest(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, () => this.handleDatasetReplacement()),
    ];
    this.view.render(this.state, this.readiness);
    this.homeController.openDeferred();
  }

  handleContext(context) {
    const previous = this.state.activeViewId;
    const datasetBoundary = isDatasetBoundary(this.context, context);
    const readinessChanged = this.context?.semanticHash !== context?.semanticHash;
    this.context = context;
    if (readinessChanged) this.readiness = this.buildReadiness();
    if (datasetBoundary && previous !== CONSUMER_IDS.WORKSPACE) {
      this.state = createApplicationViewStateV8(this.readiness, {
        activeViewId: CONSUMER_IDS.WORKSPACE, version: this.state.version + 1,
      });
    } else if (readinessChanged) this.state = refreshApplicationViewStateV8(this.state, this.readiness);
    if (datasetBoundary || readinessChanged) this.view.render(this.state, this.readiness);
    this.sketcherController.refreshContext();
    if (this.state.activeViewId === CONSUMER_IDS.HOME) this.homeController.refresh();
    else this.homeController.close();
    if (previous !== this.state.activeViewId) this.publishChanged(previous, datasetBoundary ? 'dataset-replaced' : 'readiness-lost');
  }

  handleDatasetReplacement() {
    if (this.state.activeViewId === CONSUMER_IDS.WORKSPACE) return;
    const previous = this.state.activeViewId;
    this.state = createApplicationViewStateV8(this.readiness, {
      activeViewId: CONSUMER_IDS.WORKSPACE, version: this.state.version + 1,
    });
    this.view.render(this.state, this.readiness);
    this.homeController.close();
    this.publishChanged(previous, 'dataset-replaced');
  }

  handleRequest({ viewId, source }) {
    const previous = this.state.activeViewId;
    try {
      const descriptor = workspaceConsumerDescriptor(this.registry, viewId);
      const readiness = this.getReadiness(viewId);
      assertImplementedAvailable(descriptor, readiness);
      const result = transitionApplicationViewStateV8(this.state, viewId, this.readiness);
      if (!result.activated) throw viewError('VIEW_NOT_AVAILABLE', `${descriptor.label} is unavailable.`);
      this.state = result.state;
      this.view.render(this.state, this.readiness);
      if (this.state.activeViewId === CONSUMER_IDS.HOME) this.homeController.open();
      else this.homeController.close();
      this.publishChanged(previous, source);
    } catch (error) { this.publishFailed(viewId, error); }
  }

  activate(viewId) {
    workspaceConsumerDescriptor(this.registry, viewId);
    this.eventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, { viewId, source: 'api' });
    return this.getPublicState();
  }
  publishChanged(previousViewId, reason) { this.eventBus.publish(APPLICATION_EVENTS.CHANGED, { state: this.state, previousViewId, reason }); }
  publishFailed(viewId, error) {
    const payload = {
      viewId, activeViewId: this.state.activeViewId, code: error.code || 'UNKNOWN_APPLICATION_VIEW',
      message: error instanceof Error ? error.message : String(error),
    };
    this.view.renderFailure(payload);
    this.eventBus.publish(APPLICATION_EVENTS.CHANGE_FAILED, payload);
  }
  buildReadiness() {
    return createWorkspaceConsumerReadinessRegistry(this.registry, this.context, {
      workspaceBooted: true,
      ...(this.settingsController?.getStatus() || {}),
    });
  }
  getState() { return this.state; }
  getPublicState() { return this.state; }
  getRegistry() { return this.registry; }
  listReadiness() { return this.readiness; }
  getReadiness(consumerId) {
    workspaceConsumerDescriptor(this.registry, consumerId);
    return this.readiness.find((row) => row.consumerId === consumerId);
  }
  getHomeReviewModel() { return this.homeController.getReviewModel(); }
  getHomeMaterializationCount() { return this.homeController.getMaterializationCount(); }
  getPcfIntakeSource() { return this.pcfController.getSource(); }
  getPcfReviewModel() { return this.pcfController.getReviewModel(); }
  getSketcherDraftDocument() { return this.sketcherController.getDocument(); }
  getSketcherDraftAudit() { return this.sketcherController.getAudit(); }
  getSketcherReviewModel() { return this.sketcherController.getReviewModel(); }
  getSketcherWorkspaceAdoption() { return this.sketcherController.getAdoption(); }
  getLoadCalculationReviewModel() { return this.loadCalcController.getReviewModel(); }
  getThreeDCalculationReviewModel() { return this.threeDCalcController.getReviewModel(); }
  getPipeSolverReviewModel() { return this.pipeSolverController?.getReviewModel() || null; }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.pipeSolverController?.destroy();
    this.threeDCalcController.destroy();
    this.loadCalcController.destroy();
    this.sketcherController.destroy();
    this.pcfController.destroy();
    this.homeController.destroy();
    this.view.destroy();
    this.settingsController = null;
    this.context = null;
    this.state = null;
    this.readiness = Object.freeze([]);
  }
}

export class ApplicationShellView {
  constructor(rootElement, eventBus) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.navElement = rootElement?.querySelector('[data-role="application-navigation"]') || null;
    this.statusElement = rootElement?.querySelector('[data-role="application-navigation-status"]') || null;
    this.views = new Map(APPLICATION_NAVIGATION_ORDER_V8.map((id) => [
      id, rootElement?.querySelector(`[data-application-view="${id}"]`) || null,
    ]));
    this.keydownHandler = (event) => this.handleKeydown(event);
  }
  init(registry) {
    if (!this.navElement) return;
    const byId = new Map(registry.consumers.map((row) => [row.consumerId, row]));
    this.navElement.replaceChildren(...APPLICATION_NAVIGATION_ORDER_V8.map((id) => this.navigationItem(byId.get(id))));
    this.navElement.addEventListener('keydown', this.keydownHandler);
  }
  render(state, readiness) {
    const byId = new Map(readiness.map((row) => [row.consumerId, row]));
    this.navElement?.querySelectorAll('[data-application-nav]').forEach((button) => this.updateButton(button, state, byId.get(button.dataset.applicationNav)));
    this.views.forEach((element, id) => setViewVisibility(element, state?.activeViewId === id));
    if (this.statusElement) this.statusElement.textContent = '';
  }
  renderFailure(payload) { if (this.statusElement) this.statusElement.textContent = `${payload.code}: ${payload.message}`; }
  navigationItem(descriptor) {
    const wrapper = this.rootElement.ownerDocument.createElement('div');
    wrapper.className = 'application-navigation__item';
    const button = this.rootElement.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.applicationNav = descriptor.consumerId;
    button.textContent = descriptor.label;
    button.addEventListener('click', () => this.requestChange(descriptor.consumerId));
    const reason = this.rootElement.ownerDocument.createElement('span');
    reason.id = `application-nav-reason-${descriptor.consumerId.toLowerCase()}`;
    reason.className = 'application-navigation__reason';
    reason.hidden = true;
    wrapper.append(button, reason);
    return wrapper;
  }
  updateButton(button, state, readiness) {
    const available = readiness?.readinessState === READINESS_STATES.AVAILABLE;
    const active = state?.activeViewId === button.dataset.applicationNav;
    const reason = button.parentElement?.querySelector('.application-navigation__reason');
    const message = readiness?.diagnostics?.[0]?.message || 'This view is unavailable.';
    button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', String(!available));
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.tabIndex = active ? 0 : -1;
    button.classList.toggle('application-navigation__button--active', active);
    button.title = available ? '' : message;
    if (reason) { reason.textContent = available ? '' : message; reason.hidden = available; }
    if (reason && available) button.removeAttribute('aria-describedby');
    if (reason && !available) button.setAttribute('aria-describedby', reason.id);
  }
  requestChange(viewId) { this.eventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, { viewId, source: 'navigation' }); }
  handleKeydown(event) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const buttons = [...this.navElement.querySelectorAll('button[data-application-nav]')];
    if (!buttons.length) return;
    const current = buttons.indexOf(this.rootElement.ownerDocument.activeElement);
    const target = keyboardTarget(event.key, current, buttons.length);
    event.preventDefault();
    buttons[target].focus();
  }
  destroy() {
    this.navElement?.removeEventListener('keydown', this.keydownHandler);
    this.navElement?.replaceChildren();
    this.views.forEach((element, id) => setViewVisibility(element, id === CONSUMER_IDS.HOME));
    if (this.statusElement) this.statusElement.textContent = '';
  }
}

function isDatasetBoundary(previous, current) { return Boolean(previous && current && previous.workspaceVersion !== current.workspaceVersion && current.selectedEntityId === null); }
function assertImplementedAvailable(descriptor, readiness) {
  if (descriptor.implementationStatus === IMPLEMENTATION_STATUS.RECOVERY_PENDING) throw viewError('VIEW_RECOVERY_PENDING', readiness?.diagnostics?.[0]?.message || `${descriptor.label} recovery is pending.`);
  if (descriptor.implementationStatus === IMPLEMENTATION_STATUS.NOT_IMPLEMENTED) throw viewError('VIEW_NOT_IMPLEMENTED', readiness?.diagnostics?.[0]?.message || `${descriptor.label} is not implemented in the current runtime.`);
  if (readiness?.readinessState !== READINESS_STATES.AVAILABLE) throw viewError('VIEW_NOT_AVAILABLE', readiness?.diagnostics?.[0]?.message || `${descriptor.label} is unavailable.`);
}
function viewError(code, message) { const error = new TypeError(message); error.code = code; return error; }
function keyboardTarget(key, current, length) { if (key === 'Home') return 0; if (key === 'End') return length - 1; if (key === 'ArrowLeft') return current <= 0 ? length - 1 : current - 1; return current < 0 || current === length - 1 ? 0 : current + 1; }
function setViewVisibility(element, visible) { if (!element) return; element.hidden = !visible; element.setAttribute('aria-hidden', String(!visible)); }
