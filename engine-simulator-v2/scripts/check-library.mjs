import {build} from 'esbuild';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url).pathname;
const bundlePath=root+'node_modules/.cache/engine-library-test.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
const contents=fs.readFileSync(root+'/src/EngineSimulatorV2.tsx','utf8')+'\nexport { presets, legacyPresets, defaultConfig, sanitizeConfig, buildDynoSweep };';
await build({stdin:{contents,resolveDir:root+'/src',loader:'tsx'},tsconfig:root+'/tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:bundlePath});
const {presets,legacyPresets,defaultConfig,sanitizeConfig,buildDynoSweep}=await import(bundlePath);
const factory=presets.filter(p=>p.group==='factory');
assert.equal(factory.length,240);assert.equal(new Set(factory.map(p=>p.manufacturer)).size,24);
assert.equal(new Set(factory.map(p=>p.name)).size,240);
for(const manufacturer of new Set(factory.map(p=>p.manufacturer)))assert.equal(factory.filter(p=>p.manufacturer===manufacturer).length,10);
for(const p of legacyPresets.filter(p=>p.group==='factory'))assert.deepEqual(factory.find(n=>n.name===p.name).config,p.config);
let rows=0;
for(const p of factory){
 const cfg=sanitizeConfig({...defaultConfig,...p.config});const sweep=buildDynoSweep(cfg);
 assert.ok(sweep.length>20,p.name+' sweep populated');
 for(const r of sweep){for(const [k,v] of Object.entries(r))if(typeof v==='number')assert.ok(Number.isFinite(v),p.name+' '+k);assert.ok(r.brakeHp>=0,p.name);rows++;}
 if(p.setupKind==='illustrative'){
  const n={i3:3,i4:4,i5:5,i6:6,v4:4,v6:6,flat4:4,flat6:6,v8:8,v10:10,v12:12}[cfg.engineLayout];
  const l=Math.PI/4*cfg.bore**2*cfg.stroke*n/1e6;assert.ok(Math.abs(l-p.nominalLitres)<1e-8,p.name+' capacity');
 }
}
console.log(`PASS: 240 unique examples; 24 manufacturers x 10; original factory configs preserved; ${rows} dyno rows finite; nominal capacities preserved.`);

fs.unlinkSync(bundlePath);
