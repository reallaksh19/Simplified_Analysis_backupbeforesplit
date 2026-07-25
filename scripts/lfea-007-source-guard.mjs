import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASELINE='c49749f447880261eb2126b3dd6046faa67ce88f';
const authorized=[
  /^src\/core\/lfea-consumer\//,
  /^src\/core\/workspace-consumers\//,
  /^src\/workspace\/lfea-consumer-.*\.js$/,
  /^src\/workspace\/(application-shell-controller|bootstrap|event-topics|workspace-layout)\.js$/,
  /^scripts\/lfea-007-.*\.mjs$/,
  /^docs\/element-fea\/LFEA-007_APPLICATION_CONSUMER\.md$/,
  /^e2e\/lfea-007-local-fea-consumer\.spec\.js$/,
  /^\.github\/workflows\/lfea-007-certification\.yml$/,
  /^package\.json$/,
  /^scripts\/qa-check\.mjs$/,
];
const changed=changedFiles();
const unauthorized=changed.filter((file)=>!authorized.some((rule)=>rule.test(file)));
assert.deepEqual(unauthorized,[],`Unauthorized LFEA-007 paths: ${unauthorized.join(', ')}`);
assert(!changed.some((file)=>file==='package-lock.json'));
assert(!changed.some((file)=>/^src\/core\/(element-fea|local-shell|local-stress|shared-piping-model|sketcher-draft|settings-authority)\//.test(file)));
assert(!changed.some((file)=>/^src\/workspace\/(workspace-state|dataset-controller|analysis-|pipe-solver-)/.test(file)));
assert(!changed.some((file)=>/^\.github\/workflows\/(?!lfea-007-certification)/.test(file)));

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const baselinePackage=baselineText('package.json');
if(baselinePackage){
  const before=JSON.parse(baselinePackage);
  assert.deepEqual(pkg.dependencies,before.dependencies,'LFEA-007 changed dependencies.');
  assert.deepEqual(pkg.devDependencies,before.devDependencies,'LFEA-007 changed dev dependencies.');
  const allowed=new Set(['check:lfea.007:static','check:lfea.007:browser','check:lfea.007','check:workspace-browser']);
  for(const key of new Set([...Object.keys(before.scripts),...Object.keys(pkg.scripts)]))if(!allowed.has(key))assert.equal(pkg.scripts[key],before.scripts[key],`Unauthorized package script change: ${key}`);
  assert.equal(pkg.scripts['check:workspace-browser'],`${before.scripts['check:workspace-browser']} e2e/lfea-007-local-fea-consumer.spec.js`);
}
const qa=fs.readFileSync('scripts/qa-check.mjs','utf8');
const baselineQa=baselineText('scripts/qa-check.mjs');
const registration="success &= runCheck('LFEA-007 Read-Only Local FEA Consumer Static Check', 'npm run check:lfea.007:static');\n";
assert.equal((qa.match(/LFEA-007 Read-Only Local FEA Consumer Static Check/g)||[]).length,1);
if(baselineQa)assert.equal(qa.replace(registration,''),baselineQa,'Aggregate QA contains changes beyond one additive LFEA-007 registration.');

for(const file of changed.filter((row)=>/\.(?:js|mjs)$/.test(row))){
  const text=fs.readFileSync(file,'utf8');
  if(file.includes('lfea-consumer')){
    assert(!/from ['"](?:react|zustand|three|@react-three)/.test(text),`${file} imports an unauthorized framework.`);
    assert(!/<canvas|createElement\(['"]canvas|WebGLRenderer/.test(text),`${file} adds Canvas or WebGL.`);
  }
  const lines=text.split('\n').length;
  assert(lines<=380,`${file} exceeds the bounded JavaScript size guard (${lines} lines).`);
}
const layout=fs.readFileSync('src/workspace/workspace-layout.js','utf8');
assert.equal((layout.match(/data-webgl-host/g)||[]).length,1,'Application must retain exactly one WebGL host.');
console.log(`LFEA-007 source boundary passed (${changed.length} changed paths).`);

function changedFiles(){
  try{return lines(execFileSync('git',['diff','--name-only',`${BASELINE}...HEAD`],{encoding:'utf8'}));}
  catch{return execFileSync('git',['status','--porcelain','-uall'],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean).map((row)=>row.slice(3));}
}
function baselineText(file){try{return execFileSync('git',['show',`${BASELINE}:${file}`],{encoding:'utf8'});}catch{return null;}}
function lines(value){return value.trim()?value.trim().split(/\r?\n/).filter(Boolean):[];}
