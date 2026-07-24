import { SKETCHER_EVENTS, segmentLengthMm } from '../core/sketcher-draft/index.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class SketcherView {
  constructor(rootElement, eventBus) {
    this.rootElement = rootElement;
    this.eventBus = eventBus;
    this.documentRef = rootElement?.ownerDocument || globalThis.document;
    this.mode = 'SELECT';
    this.selection = null;
    this.pendingStart = null;
    this.viewport = { scale: 0.45, offsetX: 80, offsetY: 80 };
    this.pointer = { xMm: 0, yMm: 0, zMm: 0 };
    this.pan = null;
    this.objectUrl = null;
    this.state = null;
  }

  init() {
    if (!this.rootElement || this.rootElement.firstChild) return;
    const section = this.create('section', { className: 'sketcher-consumer', dataset: { role: 'sketcher-consumer' } });
    section.append(this.header(), this.toolbar(), this.workspace(), this.footer());
    this.rootElement.append(section);
    this.cache();
    this.bind();
  }

  render(state) {
    this.state = state;
    if (!this.surface) return;
    this.plane.value = state.document.workingPlane;
    this.status.textContent = state.message;
    this.sourceStatus.textContent = state.workspaceImportAvailable ? 'Workspace model available for explicit import.' : 'No Workspace model available; blank drafting remains available.';
    this.importButton.disabled = !state.workspaceImportAvailable;
    this.undoButton.disabled = !state.reviewModel.history.canUndo;
    this.redoButton.disabled = !state.reviewModel.history.canRedo;
    this.deleteButton.disabled = !this.selection;
    this.adoptButton.disabled = !state.reviewModel.adoptionEligibility.allowed || state.pendingAdoption;
    this.drawButton.setAttribute('aria-pressed', String(this.mode === 'DRAW_PIPE'));
    this.selectButton.setAttribute('aria-pressed', String(this.mode === 'SELECT'));
    this.moveButton.setAttribute('aria-pressed', String(this.mode === 'MOVE_NODE'));
    this.renderSurface();
    this.renderProperties();
    this.renderDiagnostics();
  }

  download(artifact) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined') return;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mediaType }));
    const anchor = this.create('a', { href: this.objectUrl, download: artifact.filename, hidden: true });
    this.documentRef.body?.append(anchor); anchor.click(); anchor.remove();
    const url = this.objectUrl; this.objectUrl = null; queueMicrotask(() => URL.revokeObjectURL(url));
  }

  header() {
    const header = this.create('header', { className: 'sketcher-consumer__header' });
    const copy = this.create('div');
    copy.append(this.create('span', { className: 'panel-eyebrow', text: 'Framework-neutral draft authority' }), this.create('h1', { text: 'Sketcher' }), this.create('p', { className: 'sketcher-consumer__claim', text: 'Draft geometry and explicit Workspace adoption only. No automatic analysis, FEA, report, or export action.' }));
    const statuses = this.create('div', { className: 'sketcher-consumer__statuses' });
    statuses.append(this.create('output', { dataset: { role: 'sketcher-status' }, role: 'status', ariaLive: 'polite' }), this.create('output', { dataset: { role: 'sketcher-source-status' }, ariaLive: 'polite' }));
    header.append(copy, statuses); return header;
  }

  toolbar() {
    const toolbar = this.create('div', { className: 'sketcher-toolbar', role: 'toolbar', ariaLabel: 'Sketcher commands' });
    const planeLabel = this.create('label', { text: 'Working plane ' });
    const plane = this.create('select', { dataset: { role: 'sketcher-plane' }, ariaLabel: 'Working plane' });
    ['XY','XZ','YZ'].forEach((value) => plane.append(this.create('option', { value, text: value })));
    planeLabel.append(plane); toolbar.append(planeLabel);
    const buttons = [
      ['New Draft','new-draft'],['Import Workspace','import-workspace'],['Load Draft JSON','load-json'],['Save Draft JSON','save-json'],
      ['Draw Pipe','draw-pipe'],['Select','select'],['Move Node','move-node'],['Delete','delete'],['Undo','undo'],['Redo','redo'],
      ['Validate','validate'],['Fit View','fit'],['Adopt to Workspace','adopt'],
    ];
    buttons.forEach(([label, action]) => toolbar.append(this.create('button', { type: 'button', text: label, dataset: { sketcherAction: action } })));
    toolbar.append(this.create('input', { type: 'file', accept: '.json,application/json', hidden: true, dataset: { role: 'sketcher-file' } }));
    return toolbar;
  }

  workspace() {
    const area = this.create('div', { className: 'sketcher-workspace' });
    const stage = this.create('section', { className: 'sketcher-stage', ariaLabel: '2D pipe centerline drafting surface' });
    const svg = this.svg('svg', { class: 'sketcher-surface', 'data-role': 'sketcher-surface', tabindex: '0', role: 'application', 'aria-label': 'Sketcher drafting surface' });
    svg.setAttribute('viewBox', '0 0 1000 620');
    stage.append(svg, this.create('output', { className: 'sketcher-pointer', dataset: { role: 'sketcher-pointer' }, ariaLive: 'polite' }));
    const side = this.create('aside', { className: 'sketcher-sidebar', ariaLabel: 'Sketcher properties and diagnostics' });
    side.append(this.card('Selection', 'sketcher-properties'), this.card('Draft evidence', 'sketcher-evidence'), this.card('Topology diagnostics', 'sketcher-diagnostics'));
    area.append(stage, side); return area;
  }

  footer() { return this.create('p', { className: 'sketcher-consumer__footer', text: 'Branching, disconnected components, and closed loops are reported deterministically; only blocking errors prevent adoption.' }); }
  card(title, role) { const card = this.create('section', { className: 'sketcher-card' }); card.append(this.create('h2', { text: title }), this.create('div', { dataset: { role } })); return card; }

  cache() {
    const q = (selector) => this.rootElement.querySelector(selector);
    this.surface = q('[data-role="sketcher-surface"]'); this.status = q('[data-role="sketcher-status"]'); this.sourceStatus = q('[data-role="sketcher-source-status"]');
    this.pointerOutput = q('[data-role="sketcher-pointer"]'); this.plane = q('[data-role="sketcher-plane"]'); this.fileInput = q('[data-role="sketcher-file"]');
    this.properties = q('[data-role="sketcher-properties"]'); this.evidence = q('[data-role="sketcher-evidence"]'); this.diagnostics = q('[data-role="sketcher-diagnostics"]');
    const b = (action) => q(`[data-sketcher-action="${action}"]`);
    this.importButton = b('import-workspace'); this.undoButton = b('undo'); this.redoButton = b('redo'); this.deleteButton = b('delete'); this.adoptButton = b('adopt');
    this.drawButton = b('draw-pipe'); this.selectButton = b('select'); this.moveButton = b('move-node');
  }

  bind() {
    this.rootElement.querySelector('[data-sketcher-action="new-draft"]').addEventListener('click', () => this.publish(SKETCHER_EVENTS.DRAFT_CREATE_REQUESTED, {}));
    this.importButton.addEventListener('click', () => this.publish(SKETCHER_EVENTS.WORKSPACE_IMPORT_REQUESTED, {}));
    this.rootElement.querySelector('[data-sketcher-action="load-json"]').addEventListener('click', () => this.fileInput.click());
    this.rootElement.querySelector('[data-sketcher-action="save-json"]').addEventListener('click', () => this.publish(SKETCHER_EVENTS.EXPORT_REQUESTED, { format: 'json' }));
    this.drawButton.addEventListener('click', () => this.setMode('DRAW_PIPE')); this.selectButton.addEventListener('click', () => this.setMode('SELECT')); this.moveButton.addEventListener('click', () => this.setMode('MOVE_NODE'));
    this.deleteButton.addEventListener('click', () => this.deleteSelection());
    this.undoButton.addEventListener('click', () => this.publish(SKETCHER_EVENTS.UNDO_REQUESTED, {})); this.redoButton.addEventListener('click', () => this.publish(SKETCHER_EVENTS.REDO_REQUESTED, {}));
    this.rootElement.querySelector('[data-sketcher-action="validate"]').addEventListener('click', () => this.publish(SKETCHER_EVENTS.VALIDATION_REQUESTED, {}));
    this.rootElement.querySelector('[data-sketcher-action="fit"]').addEventListener('click', () => this.fitView()); this.adoptButton.addEventListener('click', () => this.publish(SKETCHER_EVENTS.ADOPTION_REQUESTED, {}));
    this.plane.addEventListener('change', () => this.command('SET_WORKING_PLANE', { workingPlane: this.plane.value }));
    this.fileInput.addEventListener('change', () => this.loadFile());
    this.surface.addEventListener('click', (event) => this.handleClick(event)); this.surface.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.surface.addEventListener('pointerdown', (event) => this.handlePointerDown(event)); this.surface.addEventListener('pointerup', () => { this.pan = null; });
    this.surface.addEventListener('pointerleave', () => { this.pan = null; }); this.surface.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
    this.surface.addEventListener('keydown', (event) => this.handleKeydown(event));
  }

  async loadFile() {
    const file = this.fileInput.files?.[0]; if (!file) return;
    try { this.publish(SKETCHER_EVENTS.DOCUMENT_IMPORT_REQUESTED, { document: JSON.parse(await file.text()) }); }
    catch { this.publish(SKETCHER_EVENTS.COMMAND_REQUESTED, { commandType: 'IMPORT_SKETCH_DOCUMENT', payload: { document: null } }); }
    this.fileInput.value = '';
  }

  handleClick(event) {
    if (this.pan?.moved) return;
    const nodeId = event.target.dataset?.nodeId, segmentId = event.target.dataset?.segmentId;
    if (this.mode === 'SELECT') { this.selection = nodeId ? { type: 'NODE', id: nodeId } : segmentId ? { type: 'SEGMENT', id: segmentId } : null; return this.render(this.state); }
    if (this.mode === 'MOVE_NODE') {
      if (nodeId) { this.selection = { type: 'NODE', id: nodeId }; return this.render(this.state); }
      if (this.selection?.type === 'NODE') this.command('MOVE_NODE', { nodeId: this.selection.id, position: this.eventCoordinates(event) });
      return;
    }
    if (this.mode === 'DRAW_PIPE') this.drawEndpoint(nodeId ? { nodeId } : this.eventCoordinates(event));
  }

  drawEndpoint(endpoint) {
    if (!this.pendingStart) { this.pendingStart = endpoint; this.status.textContent = 'Pipe start recorded. Select an endpoint; Escape cancels.'; return; }
    const start = this.pendingStart; this.pendingStart = null;
    this.command('ADD_PIPE_SEGMENT', { start, end: endpoint, snapToGrid: true, gridSizeMm: 100 });
  }

  handlePointerDown(event) { if (event.shiftKey || event.button === 1) { this.pan = { x: event.clientX, y: event.clientY, offsetX: this.viewport.offsetX, offsetY: this.viewport.offsetY, moved: false }; this.surface.setPointerCapture?.(event.pointerId); } }
  handlePointerMove(event) {
    this.pointer = this.eventCoordinates(event); this.pointerOutput.textContent = `Pointer: ${this.pointer.xMm.toFixed(1)}, ${this.pointer.yMm.toFixed(1)}, ${this.pointer.zMm.toFixed(1)} mm`;
    if (this.pan) { const dx = event.clientX - this.pan.x, dy = event.clientY - this.pan.y; this.pan.moved ||= Math.abs(dx) + Math.abs(dy) > 2; this.viewport.offsetX = this.pan.offsetX + dx; this.viewport.offsetY = this.pan.offsetY - dy; this.renderSurface(); }
  }
  handleWheel(event) { event.preventDefault(); this.viewport.scale = Math.min(8, Math.max(0.02, this.viewport.scale * (event.deltaY < 0 ? 1.15 : 0.87))); this.renderSurface(); }
  handleKeydown(event) {
    if (event.key === 'Escape') { this.pendingStart = null; this.status.textContent = 'In-progress draw cancelled.'; return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); this.publish(event.shiftKey ? SKETCHER_EVENTS.REDO_REQUESTED : SKETCHER_EVENTS.UNDO_REQUESTED, {}); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.publish(SKETCHER_EVENTS.REDO_REQUESTED, {}); return; }
    if (event.key === 'Delete') { event.preventDefault(); this.deleteSelection(); }
  }

  deleteSelection() {
    if (!this.selection) return;
    const commandType = this.selection.type === 'NODE' ? 'DELETE_NODE' : 'DELETE_SEGMENT';
    const payload = this.selection.type === 'NODE' ? { nodeId: this.selection.id } : { segmentId: this.selection.id };
    this.command(commandType, payload);
  }

  renderSurface() {
    if (!this.state) return;
    const document = this.state.document, nodeById = new Map(document.nodes.map((node) => [node.nodeId, node]));
    const children = [...this.gridLines()];
    document.segments.forEach((segment) => {
      const a = this.screenPoint(nodeById.get(segment.startNodeId)), b = this.screenPoint(nodeById.get(segment.endNodeId));
      const line = this.svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: this.selection?.id === segment.segmentId ? 'sketcher-segment sketcher-selected' : 'sketcher-segment', 'data-segment-id': segment.segmentId, tabindex: '0' });
      const label = this.svg('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 7, class: 'sketcher-length-label' }); label.textContent = `${segment.segmentId} · ${segmentLengthMm(segment, nodeById).toFixed(1)} mm`;
      children.push(line, label);
    });
    document.nodes.forEach((node) => {
      const p = this.screenPoint(node), group = this.svg('g', { class: 'sketcher-node-group' });
      group.append(this.svg('circle', { cx: p.x, cy: p.y, r: 7, class: this.selection?.id === node.nodeId ? 'sketcher-node sketcher-selected' : 'sketcher-node', 'data-node-id': node.nodeId, tabindex: '0' }));
      const label = this.svg('text', { x: p.x + 10, y: p.y - 10, class: 'sketcher-node-label' }); label.textContent = node.nodeId; group.append(label); children.push(group);
    });
    this.surface.replaceChildren(...children);
  }

  gridLines() {
    const rows = [];
    for (let value = -2000; value <= 3000; value += 100) {
      const verticalA = this.screenUv(value, -2000), verticalB = this.screenUv(value, 3000), horizontalA = this.screenUv(-2000, value), horizontalB = this.screenUv(3000, value);
      rows.push(this.svg('line', { x1: verticalA.x, y1: verticalA.y, x2: verticalB.x, y2: verticalB.y, class: 'sketcher-grid-line' }));
      rows.push(this.svg('line', { x1: horizontalA.x, y1: horizontalA.y, x2: horizontalB.x, y2: horizontalB.y, class: 'sketcher-grid-line' }));
    }
    return rows;
  }

  renderProperties() {
    const document = this.state.document, nodeById = new Map(document.nodes.map((node) => [node.nodeId, node]));
    let rows = [['Selection','None']];
    if (this.selection?.type === 'NODE') { const node = nodeById.get(this.selection.id); rows = [['Type','Node'],['ID',node?.nodeId],['X',node?.xMm],['Y',node?.yMm],['Z',node?.zMm]]; }
    if (this.selection?.type === 'SEGMENT') { const segment = document.segments.find((row) => row.segmentId === this.selection.id); rows = [['Type','Pipe segment'],['ID',segment?.segmentId],['Start',segment?.startNodeId],['End',segment?.endNodeId],['Length mm',segment ? segmentLengthMm(segment, nodeById).toFixed(3) : '']]; }
    this.properties.replaceChildren(this.definitionList(rows));
    const review = this.state.reviewModel;
    this.evidence.replaceChildren(this.definitionList([['Draft',review.draftId],['Revision',review.revision],['Hash',review.documentSemanticHash],['Nodes',review.summary.nodeCount],['Segments',review.summary.segmentCount],['Components',review.summary.connectedComponentCount],['Adoption',review.adoptionEligibility.allowed ? 'Eligible' : 'Blocked']]));
  }

  renderDiagnostics() {
    const list = this.create('ul', { className: 'sketcher-diagnostic-list' });
    if (!this.state.reviewModel.diagnostics.length) list.append(this.create('li', { text: 'No diagnostics.' }));
    this.state.reviewModel.diagnostics.forEach((row) => list.append(this.create('li', { className: `sketcher-diagnostic sketcher-diagnostic--${row.severity.toLowerCase()}`, text: `${row.severity} · ${row.code}: ${row.message}` })));
    this.diagnostics.replaceChildren(list);
  }

  fitView() {
    const nodes = this.state?.document?.nodes || [];
    if (!nodes.length) { this.viewport = { scale: 0.45, offsetX: 80, offsetY: 80 }; return this.renderSurface(); }
    const points = nodes.map((node) => this.uvPoint(node)), u = points.map((p) => p.u), v = points.map((p) => p.v);
    const width = Math.max(100, Math.max(...u) - Math.min(...u)), height = Math.max(100, Math.max(...v) - Math.min(...v));
    this.viewport.scale = Math.min(800 / width, 460 / height);
    this.viewport.offsetX = 500 - ((Math.min(...u) + Math.max(...u)) / 2) * this.viewport.scale;
    this.viewport.offsetY = 310 - ((Math.min(...v) + Math.max(...v)) / 2) * this.viewport.scale;
    this.renderSurface();
  }

  eventCoordinates(event) {
    const rect = this.surface.getBoundingClientRect(), width = rect.width || 1000, height = rect.height || 620;
    const u = ((event.clientX - rect.left) * (1000 / width) - this.viewport.offsetX) / this.viewport.scale;
    const v = ((height - (event.clientY - rect.top)) * (620 / height) - this.viewport.offsetY) / this.viewport.scale;
    return this.state.document.workingPlane === 'XY' ? { xMm: u, yMm: v, zMm: 0 } : this.state.document.workingPlane === 'XZ' ? { xMm: u, yMm: 0, zMm: v } : { xMm: 0, yMm: u, zMm: v };
  }
  uvPoint(node) { return this.state.document.workingPlane === 'XY' ? { u: node.xMm, v: node.yMm } : this.state.document.workingPlane === 'XZ' ? { u: node.xMm, v: node.zMm } : { u: node.yMm, v: node.zMm }; }
  screenPoint(node) { const point = this.uvPoint(node); return this.screenUv(point.u, point.v); }
  screenUv(u, v) { return { x: u * this.viewport.scale + this.viewport.offsetX, y: 620 - (v * this.viewport.scale + this.viewport.offsetY) }; }

  setMode(mode) { this.mode = mode; this.pendingStart = null; this.render(this.state); this.surface.focus(); }
  command(commandType, payload) { this.publish(SKETCHER_EVENTS.COMMAND_REQUESTED, { commandType, payload }); }
  publish(topic, payload) { this.eventBus.publish(topic, payload); }
  definitionList(rows) { const dl = this.create('dl'); rows.forEach(([term, value]) => { const box = this.create('div'); box.append(this.create('dt', { text: String(term) }), this.create('dd', { text: String(value ?? '') })); dl.append(box); }); return dl; }

  create(tag, props = {}) {
    const element = this.documentRef.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'text') element.textContent = value; else if (key === 'className') element.className = value;
      else if (key === 'dataset') Object.entries(value).forEach(([name, data]) => { element.dataset[name] = data; });
      else if (key === 'ariaLive') element.setAttribute('aria-live', value); else if (key === 'ariaLabel') element.setAttribute('aria-label', value);
      else if (key in element) element[key] = value; else element.setAttribute(key, value);
    });
    return element;
  }
  svg(tag, attributes) { const element = this.documentRef.createElementNS(SVG_NS, tag); Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value))); return element; }

  destroy() {
    if (this.objectUrl && typeof URL !== 'undefined') URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null; this.rootElement?.replaceChildren(); this.state = null; this.selection = null; this.pendingStart = null;
  }
}
