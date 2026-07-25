import {
  APPLICATION_NAVIGATION_ORDER_V10, CONSUMER_IDS, IMPLEMENTATION_STATUS,
  createApplicationViewStateV10, createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistryV9, refreshApplicationViewStateV10,
  transitionApplicationViewStateV10, workspaceConsumerDescriptor,
} from '../core/workspace-consumers/index.js';
import {
  TAB_CONTENT_STATES, TAB_NAVIGATION_STATES,
  applicationIconDescriptor, createApplicationBuildIdentity, createApplicationEmptyState,
  createApplicationIconRegistry, createApplicationTabManifest, createApplicationTabRuntimeState,
} from '../core/application-tabs/index.js';
import { EventBus } from './event-bus.js';
import { APPLICATION_EVENTS, EVENT_TOPICS } from './event-topics.js';
import { HomeConsumerController } from './home-consumer-controller.js';
import { LoadCalcConsumerController } from './load-calc-consumer-controller.js';
import { PcfConsumerController } from './pcf-consumer-controller.js';
import { PipeSolverConsumerController } from './pipe-solver-consumer-controller.js';
import { QaEvidenceController } from './qa-evidence-controller.js';
import { SketcherController } from './sketcher-controller.js';
import { ThreeDCalcConsumerController } from './three-d-calc-consumer-controller.js';

export class ApplicationShellController {
  constructor(rootElement, consumerController, eventBus = EventBus, pipeSolverAdapter = null, settingsController = null) {
    this.eventBus = eventBus;
    this.consumerController = consumerController;
    this.settingsController = settingsController;
    this.context = consumerController.getContext();
    this.registry = createWorkspaceConsumerRegistryV9();
    this.iconRegistry = createApplicationIconRegistry();
    this.tabManifest = createApplicationTabManifest(this.registry, this.iconRegistry);
    this.buildIdentity = createApplicationBuildIdentity();
    this.readiness = this.buildReadiness();
    this.state = createApplicationViewStateV10(this.readiness, { activeViewId: CONSUMER_IDS.HOME, version: 0 });
    this.tabRuntimeState = this.buildTabRuntimeState();
    this.view = new ApplicationShellView(rootElement, eventBus);
    this.homeController = new HomeConsumerController(
      rootElement?.querySelector('[data-role="home-consumer-root"]'),
      () => ({ registry: this.registry, context: this.context, readiness: this.readiness }), eventBus,
    );
    this.pcfController = new PcfConsumerController(rootElement?.querySelector('[data-role="pcf-consumer-root"]'), eventBus);
    this.sketcherController = new SketcherController(
      rootElement?.querySelector('[data-role="sketcher-consumer-root"]'), () => this.context, eventBus,
    );
    this.qaController = new QaEvidenceController(
      rootElement?.querySelector('[data-role="qa-consumer-root"]'),
      () => ({ workspaceConsumerRegistry:this.registry, workspaceConsumerContext:this.context, workspaceConsumerReadinessRows:this.readiness }),
      eventBus,
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
    this.view.init(this.tabManifest, this.iconRegistry, this.buildIdentity);
    this.homeController.init();
    this.pcfController.init();
    this.sketcherController.init();
    this.qaController.init();
    this.loadCalcController.init();
    this.threeDCalcController.init();
    this.pipeSolverController?.init();
    this.unsubscribeCallbacks = [
      this.eventBus.subscribe(APPLICATION_EVENTS.CONTEXT_CHANGED, ({ context }) => this.handleContext(context)),
      this.eventBus.subscribe(APPLICATION_EVENTS.CHANGE_REQUESTED, (payload) => this.handleRequest(payload)),
      this.eventBus.subscribe(EVENT_TOPICS.DATASET_LOADED, () => this.handleDatasetReplacement()),
    ];
    this.view.render(this.state, this.tabRuntimeState);
    this.homeController.openDeferred();
  }

  handleContext(context) {
    const previous = this.state.activeViewId;
    const datasetBoundary = isDatasetBoundary(this.context, context);
    const readinessChanged = this.context?.semanticHash !== context?.semanticHash;
    this.context = context;
    if (readinessChanged) this.readiness = this.buildReadiness();
    if (datasetBoundary && previous !== CONSUMER_IDS.WORKSPACE) {
      this.state = createApplicationViewStateV10(this.readiness, {
        activeViewId: CONSUMER_IDS.WORKSPACE, version: this.state.version + 1,
      });
    } else if (readinessChanged) this.state = refreshApplicationViewStateV10(this.state, this.readiness);
    this.tabRuntimeState = this.buildTabRuntimeState();
    if (datasetBoundary || readinessChanged) this.view.render(this.state, this.tabRuntimeState);
    this.sketcherController.refreshContext();
    this.qaController.refreshContext();
    this.syncDeferredViews();
    if (previous !== this.state.activeViewId) this.publishChanged(previous, datasetBoundary ? 'dataset-replaced' : 'readiness-updated');
  }

  handleDatasetReplacement() {
    if (this.state.activeViewId === CONSUMER_IDS.WORKSPACE) return;
    const previous = this.state.activeViewId;
    this.state = createApplicationViewStateV10(this.readiness, {
      activeViewId: CONSUMER_IDS.WORKSPACE, version: this.state.version + 1,
    });
    this.tabRuntimeState = this.buildTabRuntimeState();
    this.view.render(this.state, this.tabRuntimeState);
    this.syncDeferredViews();
    this.publishChanged(previous, 'dataset-replaced');
  }

  handleRequest({ viewId, source }) {
    const previous = this.state.activeViewId;
    try {
      const descriptor = workspaceConsumerDescriptor(this.registry, viewId);
      assertImplementedNavigable(descriptor);
      const result = transitionApplicationViewStateV10(this.state, viewId, this.readiness);
      if (!result.activated) throw viewError('VIEW_NOT_IMPLEMENTED', `${descriptor.label} is not implemented.`);
      this.state = result.state;
      this.tabRuntimeState = this.buildTabRuntimeState();
      this.view.render(this.state, this.tabRuntimeState);
      this.syncDeferredViews();
      this.view.restoreFocus(viewId, source);
      this.publishChanged(previous, source);
    } catch (error) { this.publishFailed(viewId, error); }
  }

  syncDeferredViews() {
    if (this.state.activeViewId === CONSUMER_IDS.HOME) this.homeController.open();
    else this.homeController.close();
    if (this.state.activeViewId === CONSUMER_IDS.QA) this.qaController.open();
    else this.qaController.close();
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
  buildTabRuntimeState() {
    return createApplicationTabRuntimeState(this.tabManifest, this.readiness, {
      activeTabId: this.state.activeViewId,
      version: this.state.version,
    });
  }
  getState() { return this.state; }
  getPublicState() { return this.state; }
  getRegistry() { return this.registry; }
  getTabManifest() { return this.tabManifest; }
  getTabRuntimeState() { return this.tabRuntimeState; }
  getIconRegistry() { return this.iconRegistry; }
  getBuildIdentity() { return this.buildIdentity; }
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
  getQaEvidenceSource() { return this.qaController.getSource(); }
  getQaReviewModel() { return this.qaController.getReviewModel(); }
  getQaMaterializationCount() { return this.qaController.getMaterializationCount(); }
  getLoadCalculationReviewModel() { return this.loadCalcController.getReviewModel(); }
  getThreeDCalculationReviewModel() { return this.threeDCalcController.getReviewModel(); }
  getPipeSolverReviewModel() { return this.pipeSolverController?.getReviewModel() || null; }

  destroy() {
    this.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeCallbacks = [];
    this.pipeSolverController?.destroy();
    this.threeDCalcController.destroy();
    this.loadCalcController.destroy();
    this.qaController.destroy();
    this.sketcherController.destroy();
    this.pcfController.destroy();
    this.homeController.destroy();
    this.view.destroy();
    this.settingsController = null;
    this.context = null;
    this.state = null;
    this.tabRuntimeState = null;
    this.readiness = Object.freeze([]);
  }
}

export class ApplicationShellView {
  constructor(rootElement, eventBus) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.navElement = rootElement?.querySelector('[data-role="application-navigation"]') || null;
    this.navigationStatusElement = rootElement?.querySelector('[data-role="application-navigation-status"]') || null;
    this.globalErrorElement = rootElement?.querySelector('[data-role="application-global-error"]') || null;
    this.buildElement = rootElement?.querySelector('[data-role="application-build-identity"]') || null;
    this.overflowToggle = rootElement?.querySelector('[data-role="application-overflow-toggle"]') || null;
    this.overflowMenu = rootElement?.querySelector('[data-role="application-overflow-menu"]') || null;
    this.views = new Map(APPLICATION_NAVIGATION_ORDER_V10.map((id) => [
      id, rootElement?.querySelector(`[data-application-view="${id}"]`) || null,
    ]));
    this.statusPanels = new Map(APPLICATION_NAVIGATION_ORDER_V10.map((id) => [
      id, rootElement?.querySelector(`[data-application-view="${id}"] [data-role="application-tab-status"]`) || null,
    ]));
    this.keydownHandler = (event) => this.handleKeydown(event);
    this.overflowHandler = () => this.toggleOverflow();
    this.documentPointerHandler = (event) => this.handleDocumentPointer(event);
    this.focusOrigin = null;
  }
  init(manifest, iconRegistry, buildIdentity) {
    if (!this.navElement) return;
    const primary = manifest.tabs.map((tab) => this.navigationItem(tab, iconRegistry, 'primary'));
    const overflow = manifest.tabs.filter((tab) => tab.priority === 'OVERFLOW').map((tab) => this.navigationItem(tab, iconRegistry, 'overflow'));
    this.navElement.replaceChildren(...primary);
    this.overflowMenu?.replaceChildren(...overflow);
    if (this.buildElement) {
      this.buildElement.textContent = `${buildIdentity.appName} · ${buildIdentity.appVersion} · ${buildIdentity.shortBuildSha}`;
      this.buildElement.title = `Build ${buildIdentity.buildSha}`;
    }
    this.navElement.addEventListener('keydown', this.keydownHandler);
    this.overflowToggle?.addEventListener('click', this.overflowHandler);
    this.rootElement?.ownerDocument.addEventListener('pointerdown', this.documentPointerHandler);
  }
  render(state, runtimeState) {
    const byId = new Map(runtimeState.rows.map((row) => [row.tabId, row]));
    this.rootElement?.querySelectorAll('[data-application-nav]').forEach((button) => this.updateButton(button, state, byId.get(button.dataset.applicationNav)));
    this.views.forEach((element, id) => setViewVisibility(element, state?.activeViewId === id));
    runtimeState.rows.forEach((row) => this.renderTabStatus(row));
    if (this.navigationStatusElement) {
      const active = byId.get(state?.activeViewId);
      this.navigationStatusElement.textContent = active ? `${active.label}: ${active.summary}` : '';
    }
    if (this.globalErrorElement) { this.globalErrorElement.textContent = ''; this.globalErrorElement.hidden = true; }
  }
  renderFailure(payload) {
    if (this.globalErrorElement) {
      this.globalErrorElement.textContent = `${payload.code}: ${payload.message}`;
      this.globalErrorElement.hidden = false;
    }
    if (this.navigationStatusElement) this.navigationStatusElement.textContent = `Unable to open ${payload.viewId}.`;
  }
  navigationItem(tab, iconRegistry, location) {
    const button = this.rootElement.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.applicationNav = tab.tabId;
    button.dataset.navigationPriority = tab.priority;
    button.dataset.navigationLocation = location;
    button.className = location === 'overflow' ? 'application-overflow__item' : 'application-navigation__button';
    if (location === 'overflow') button.setAttribute('role', 'menuitem');
    button.setAttribute('aria-label', tab.label);
    const icon = this.iconElement(applicationIconDescriptor(iconRegistry, tab.iconId), `${tab.tabId}-${location}`, tab.label);
    const label = this.rootElement.ownerDocument.createElement('span');
    label.className = 'application-navigation__label';
    label.textContent = tab.label;
    const indicator = this.rootElement.ownerDocument.createElement('span');
    indicator.className = 'application-navigation__indicator';
    indicator.setAttribute('aria-hidden', 'true');
    button.append(icon, label, indicator);
    button.addEventListener('click', () => {
      this.focusOrigin = location;
      this.requestChange(tab.tabId);
    });
    return button;
  }
  iconElement(descriptor, instanceId, label) {
    const document = this.rootElement.ownerDocument;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const titleId = `application-icon-${instanceId.toLowerCase()}`;
    svg.classList.add('application-navigation__icon');
    svg.setAttribute('viewBox', descriptor.viewBox);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-labelledby', titleId);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.id = titleId;
    title.textContent = `${label} icon`;
    svg.append(title);
    descriptor.pathData.forEach((pathData) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      svg.append(path);
    });
    return svg;
  }
  updateButton(button, state, runtimeRow) {
    if (!runtimeRow) return;
    const disabled = runtimeRow.navigationState === TAB_NAVIGATION_STATES.DISABLED;
    const active = state?.activeViewId === button.dataset.applicationNav;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.dataset.contentState = runtimeRow.contentState;
    button.classList.toggle('application-navigation__button--active', active);
    button.classList.toggle('application-navigation__button--blocked', runtimeRow.actionState === 'BLOCKED');
    const diagnostic = runtimeRow.diagnostics[0]?.message || runtimeRow.description;
    button.title = `${runtimeRow.label} — ${runtimeRow.summary}. ${diagnostic}`;
    const indicator = button.querySelector('.application-navigation__indicator');
    if (indicator) indicator.title = runtimeRow.summary;
    if (button.dataset.navigationLocation === 'primary') button.tabIndex = active && !disabled ? 0 : -1;
    else button.tabIndex = disabled ? -1 : 0;
  }
  renderTabStatus(runtimeRow) {
    const panel = this.statusPanels.get(runtimeRow.tabId);
    if (!panel) return;
    const emptyState = createApplicationEmptyState(runtimeRow);
    panel.replaceChildren();
    panel.hidden = !emptyState.visible;
    panel.dataset.contentState = emptyState.state;
    if (!emptyState.visible) return;
    const document = panel.ownerDocument;
    const heading = document.createElement('h2'); heading.textContent = emptyState.title;
    const message = document.createElement('p'); message.textContent = emptyState.message;
    const action = document.createElement('p'); action.className = 'application-tab-state__action'; action.textContent = `Actions: ${emptyState.actionState}`;
    const evidence = document.createElement('dl'); evidence.className = 'application-tab-state__evidence';
    evidence.append(metric(document, 'Available', emptyState.availableEvidence.length), metric(document, 'Missing', emptyState.missingEvidence.length), metric(document, 'Invalid', emptyState.invalidEvidence.length));
    panel.append(heading, message, action, evidence);
    if (emptyState.diagnostics.length) {
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Readiness details';
      const list = document.createElement('ul');
      emptyState.diagnostics.forEach((row) => { const item = document.createElement('li'); item.textContent = row.message; list.append(item); });
      details.append(summary, list); panel.append(details);
    }
  }
  requestChange(viewId) { this.eventBus.publish(APPLICATION_EVENTS.CHANGE_REQUESTED, { viewId, source: 'navigation' }); }
  restoreFocus(viewId, source) {
    if (source !== 'navigation') return;
    if (this.focusOrigin === 'overflow') {
      this.closeOverflow();
      this.overflowToggle?.focus();
    } else {
      this.navElement?.querySelector(`[data-application-nav="${viewId}"]`)?.focus();
    }
    this.focusOrigin = null;
  }
  handleKeydown(event) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const buttons = [...this.navElement.querySelectorAll('button[data-application-nav]')]
      .filter((button) => !button.disabled && isVisible(button));
    if (!buttons.length) return;
    const current = buttons.indexOf(this.rootElement.ownerDocument.activeElement);
    const target = keyboardTarget(event.key, current, buttons.length);
    event.preventDefault();
    buttons[target].focus();
  }
  toggleOverflow() {
    if (!this.overflowMenu || !this.overflowToggle) return;
    const opening = this.overflowMenu.hidden;
    this.overflowMenu.hidden = !opening;
    this.overflowToggle.setAttribute('aria-expanded', String(opening));
    if (opening) this.overflowMenu.querySelector('button:not(:disabled)')?.focus();
  }
  closeOverflow() {
    if (!this.overflowMenu || !this.overflowToggle) return;
    this.overflowMenu.hidden = true;
    this.overflowToggle.setAttribute('aria-expanded', 'false');
  }
  handleDocumentPointer(event) {
    if (this.overflowMenu?.hidden) return;
    if (this.overflowMenu?.contains(event.target) || this.overflowToggle?.contains(event.target)) return;
    this.closeOverflow();
  }
  destroy() {
    this.navElement?.removeEventListener('keydown', this.keydownHandler);
    this.overflowToggle?.removeEventListener('click', this.overflowHandler);
    this.rootElement?.ownerDocument.removeEventListener('pointerdown', this.documentPointerHandler);
    this.navElement?.replaceChildren();
    this.overflowMenu?.replaceChildren();
    this.views.forEach((element, id) => setViewVisibility(element, id === CONSUMER_IDS.HOME));
    this.statusPanels.forEach((panel) => panel?.replaceChildren());
    if (this.navigationStatusElement) this.navigationStatusElement.textContent = '';
    if (this.globalErrorElement) { this.globalErrorElement.textContent = ''; this.globalErrorElement.hidden = true; }
  }
}

function isDatasetBoundary(previous, current) { return Boolean(previous && current && previous.workspaceVersion !== current.workspaceVersion && current.selectedEntityId === null); }
function assertImplementedNavigable(descriptor) {
  if (descriptor.implementationStatus === IMPLEMENTATION_STATUS.RECOVERY_PENDING) throw viewError('VIEW_RECOVERY_PENDING', `${descriptor.label} recovery is pending.`);
  if (descriptor.implementationStatus === IMPLEMENTATION_STATUS.NOT_IMPLEMENTED) throw viewError('VIEW_NOT_IMPLEMENTED', `${descriptor.label} is not implemented in the current runtime.`);
}
function viewError(code, message) { const error = new TypeError(message); error.code = code; return error; }
function keyboardTarget(key, current, length) { if (key === 'Home') return 0; if (key === 'End') return length - 1; if (key === 'ArrowLeft') return current <= 0 ? length - 1 : current - 1; return current < 0 || current === length - 1 ? 0 : current + 1; }
function setViewVisibility(element, visible) { if (!element) return; element.hidden = !visible; element.setAttribute('aria-hidden', String(!visible)); }
function isVisible(element) { return element.getClientRects().length > 0 && element.ownerDocument.defaultView?.getComputedStyle(element).display !== 'none'; }
function metric(document, label, value) { const wrapper=document.createElement('div'),term=document.createElement('dt'),definition=document.createElement('dd');term.textContent=label;definition.textContent=String(value);wrapper.append(term,definition);return wrapper; }
