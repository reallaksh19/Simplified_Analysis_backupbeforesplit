import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  APPLICATION_BUILD_IDENTITY_SCHEMA, APPLICATION_EMPTY_STATE_SCHEMA,
  APPLICATION_ICON_REGISTRY_SCHEMA, APPLICATION_TAB_MANIFEST_SCHEMA,
  APPLICATION_TAB_RUNTIME_STATE_SCHEMA, TAB_CONTENT_STATES,
  applicationIconDescriptor, applicationTabRuntimeRow, createApplicationBuildIdentity,
  createApplicationEmptyState, createApplicationIconRegistry, createApplicationTabManifest,
  createApplicationTabRuntimeState, validateApplicationBuildIdentity,
  validateApplicationEmptyState, validateApplicationIconRegistry,
  validateApplicationTabManifest, validateApplicationTabRuntimeState,
} from '../src/core/application-tabs/index.js';
import {
  APPLICATION_NAVIGATION_ORDER_V10, CONSUMER_IDS,
  createApplicationViewState, createApplicationViewStateV2,
  createApplicationViewStateV3, createApplicationViewStateV4,
  createApplicationViewStateV5, createApplicationViewStateV6,
  createApplicationViewStateV7, createApplicationViewStateV8,
  createApplicationViewStateV9, createApplicationViewStateV10,
  createWorkspaceConsumerContext, createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistry, createWorkspaceConsumerRegistryV2,
  createWorkspaceConsumerRegistryV3, createWorkspaceConsumerRegistryV4,
  createWorkspaceConsumerRegistryV5, createWorkspaceConsumerRegistryV6,
  createWorkspaceConsumerRegistryV7, createWorkspaceConsumerRegistryV8,
  createWorkspaceConsumerRegistryV9, transitionApplicationViewStateV10,
  validateApplicationViewStateV10,
} from '../src/core/workspace-consumers/index.js';

const registryFactories = [
  createWorkspaceConsumerRegistry,createWorkspaceConsumerRegistryV2,createWorkspaceConsumerRegistryV3,
  createWorkspaceConsumerRegistryV4,createWorkspaceConsumerRegistryV5,createWorkspaceConsumerRegistryV6,
  createWorkspaceConsumerRegistryV7,createWorkspaceConsumerRegistryV8,createWorkspaceConsumerRegistryV9,
];
const registryHashes = [
  'fnv1a64:933de417d77f43d2','fnv1a64:22f426d2b0677d92','fnv1a64:496eed4568692dfa',
  'fnv1a64:e47035052f70a27c','fnv1a64:3c6af36714a4bedf','fnv1a64:805131b97e910a7c',
  'fnv1a64:c157f6bb40161017','fnv1a64:f49703c58cac2af8','fnv1a64:2dceb406b183c067',
];
assert.deepEqual(registryFactories.map((factory) => factory().semanticHash), registryHashes);

const viewFactories = [
  createApplicationViewState,createApplicationViewStateV2,createApplicationViewStateV3,
  createApplicationViewStateV4,createApplicationViewStateV5,createApplicationViewStateV6,
  createApplicationViewStateV7,createApplicationViewStateV8,createApplicationViewStateV9,
];
const viewHashes = [
  'fnv1a64:bcd8d6c26099e9ff','fnv1a64:57389d9f6c56539a','fnv1a64:b80447adeaaff2a1',
  'fnv1a64:af4575a5919173d2','fnv1a64:45db9398b1cb8fe9','fnv1a64:4222c17148566e56',
  'fnv1a64:29a8fa0ed3f5ea60','fnv1a64:c148a9ed27f3a3d3','fnv1a64:14ae10bf84f4c094',
];
assert.deepEqual(registryFactories.map((factory,index) => semanticHash(viewFactories[index](closedReadiness(factory())))), viewHashes);

const registry = createWorkspaceConsumerRegistryV9();
const iconRegistry = createApplicationIconRegistry();
const manifest = createApplicationTabManifest(registry, iconRegistry);
const context = createWorkspaceConsumerContext({ datasetId:null, workspaceVersion:0, selectedEntityId:null, contracts:{} });
const readiness = createWorkspaceConsumerReadinessRegistry(registry, context, runtimeOptions());
const state = createApplicationViewStateV10(readiness, { activeViewId:CONSUMER_IDS.LOAD_CALC });
const runtime = createApplicationTabRuntimeState(manifest, readiness, { activeTabId:state.activeViewId, version:state.version });
const loadCalc = applicationTabRuntimeRow(runtime, CONSUMER_IDS.LOAD_CALC);
const emptyState = createApplicationEmptyState(loadCalc);
const buildIdentity = createApplicationBuildIdentity({ buildSha:'0123456789abcdef', appName:'Simplified Calc Suite', appVersion:'test' });

assert.equal(iconRegistry.schema, APPLICATION_ICON_REGISTRY_SCHEMA);
assert.equal(manifest.schema, APPLICATION_TAB_MANIFEST_SCHEMA);
assert.equal(runtime.schema, APPLICATION_TAB_RUNTIME_STATE_SCHEMA);
assert.equal(emptyState.schema, APPLICATION_EMPTY_STATE_SCHEMA);
assert.equal(buildIdentity.schema, APPLICATION_BUILD_IDENTITY_SCHEMA);
assert.equal(validateApplicationIconRegistry(iconRegistry).ok, true);
assert.equal(validateApplicationTabManifest(manifest, registry, iconRegistry).ok, true);
assert.equal(validateApplicationTabRuntimeState(runtime, manifest, readiness).ok, true);
assert.equal(validateApplicationEmptyState(emptyState, loadCalc).ok, true);
assert.equal(validateApplicationBuildIdentity(buildIdentity).ok, true);
assert.deepEqual(manifest.tabs.map((row) => row.tabId), APPLICATION_NAVIGATION_ORDER_V10);
assert.equal(new Set(manifest.tabs.map((row) => row.iconId)).size, manifest.tabs.length);
assert.equal(iconRegistry.icons.length, 12);
assert.ok(iconRegistry.icons.every((row) => row.pathData.length > 0 && row.pathData.every((path) => !/https?:|url\(/i.test(path))));
assert.equal(applicationIconDescriptor(iconRegistry, 'unknown').iconId, 'fallback');
assert.equal(state.schema, 'application-view-state/v10');
assert.equal(state.activeViewId, CONSUMER_IDS.LOAD_CALC);
assert.equal(validateApplicationViewStateV10(state).ok, true);
assert.ok(state.availableViewIds.includes(CONSUMER_IDS.LOAD_CALC));
assert.ok(!state.availableViewIds.includes(CONSUMER_IDS.DEBUG));
assert.equal(loadCalc.navigationState, 'AVAILABLE');
assert.equal(loadCalc.contentState, TAB_CONTENT_STATES.EMPTY);
assert.equal(loadCalc.actionState, 'BLOCKED');
assert.equal(emptyState.visible, true);
assert.equal(applicationTabRuntimeRow(runtime, CONSUMER_IDS.QA).contentState, TAB_CONTENT_STATES.READY);
assert.equal(applicationTabRuntimeRow(runtime, CONSUMER_IDS.DEBUG).navigationState, 'DISABLED');
assert.equal(transitionApplicationViewStateV10(state, CONSUMER_IDS.DEBUG, readiness).activated, false);
for (const value of [iconRegistry,manifest,runtime,emptyState,buildIdentity]) assert.equal(deepFrozen(value), true);
console.log('✅ MASR-01 closed tab, icon, runtime, empty-state, build and v1-v9 preservation contracts passed.');

function runtimeOptions() { return { workspaceBooted:true,settingsAuthorityInitialized:true,settingsDefinitionsAvailable:true,settingsProfileValid:true }; }
function deepFrozen(value) { return value===null||typeof value!=='object'||(Object.isFrozen(value)&&Object.values(value).every(deepFrozen)); }
function closedReadiness(closedRegistry) {
  return closedRegistry.consumers.map((descriptor) => {
    const available=descriptor.implementationStatus==='IMPLEMENTED',pending=descriptor.implementationStatus==='RECOVERY_PENDING';
    const base={schema:'workspace-consumer-readiness/v1',consumerId:descriptor.consumerId,implementationStatus:descriptor.implementationStatus,readinessState:available?'AVAILABLE':pending?'RECOVERY_PENDING':'NOT_IMPLEMENTED',availableContractKeys:[],missingRequiredContractKeys:[],invalidContractKeys:[],blockers:available?[]:pending?['VIEW_RECOVERY_PENDING']:['CONSUMER_NOT_IMPLEMENTED'],diagnostics:available?[]:[{code:pending?'VIEW_RECOVERY_PENDING':'CONSUMER_NOT_IMPLEMENTED',severity:'INFO',contractKey:null,message:pending?'pending':'not implemented'}],contextSemanticHash:'fnv1a64:1111111111111111'};
    return {...base,semanticHash:semanticHash(base)};
  });
}
