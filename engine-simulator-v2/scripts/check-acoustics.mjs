import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {EngineAcousticModel,acousticProfileFor,valveTimingFor} from '../src/lib/engineAcousticProcessor.js';
const root=new URL('../',import.meta.url).pathname,out=root+'node_modules/.cache/acoustic-library.mjs';
fs.mkdirSync(root+'node_modules/.cache',{recursive:true});
await build({stdin:{contents:fs.readFileSync(root+'src/EngineSimulatorV2.tsx','utf8')+'\nexport {presets,configForPreset,defaultConfig,sanitizeConfig,stepRuntime,resolveIdleRpm,documentedAcoustics};',resolveDir:root+'src',loader:'tsx'},tsconfig:root+'tsconfig.app.json',bundle:true,platform:'node',format:'esm',outfile:out});
const app=await import(out);
const configs=app.presets.filter(p=>p.group==='factory').map(p=>({name:p.name,config:app.configForPreset(p)}));
const stats=data=>{let energy=0,mean=0,peak=0;for(const v of data){assert.ok(Number.isFinite(v));energy+=v*v;mean+=v;peak=Math.max(peak,Math.abs(v));}return {rms:Math.sqrt(energy/data.length),mean:mean/data.length,peak};};
function render(config,sr=48000,seconds=1,controls={}){
 const components=acousticProfileFor({...config,acousticIdleRpm:app.resolveIdleRpm(config)});
 const model=new EngineAcousticModel(sr);model.update({components,active:true,rpm:4000,throttle:.8,load:.9,...controls});
 const data=Array.from({length:4},()=>new Float32Array(Math.ceil(sr*seconds)));
 for(let i=0;i<data[0].length;i+=128)model.render(data.map(d=>d.subarray(i,Math.min(i+128,d.length))));
 return {model,data,components};
}
for(const [index,{name,config}] of configs.entries()){
 assert.equal(config.audioModel,'acoustic');const p=acousticProfileFor(config);assert.ok(p,name+' supported');
 assert.deepEqual(p,acousticProfileFor({...config,gameMeta:{name:'Renamed'},calibrationId:'unrelated'}),'name-independent hardware');
 const {model,data}=render(config,48000,.45,{rpm:Math.min(4000,config.redline-300)});const sig=stats(data[0]);assert.ok(sig.rms>.001&&sig.peak<2,name+' output');
 const before=model.events,expected=Math.min(4000,config.redline-300)/120*p.cylinders;
 model.render(Array.from({length:4},()=>new Float32Array(48000)));assert.ok(Math.abs(model.events-before-expected)<=2,name+' cadence');
 if(index%40===39)console.log(`${index+1}/240 component models: finite audio, physical cadence, default selection, name independence`);
}
for(const layout of ['i3','i4','i5','i6','v4','v6','flat4','flat6','v8','v10','v12'])for(const sr of [44100,48000,96000]){
 const c={...app.defaultConfig,engineLayout:layout,induction:'na'};
 const {data,model,components:p}=render(c,sr,1);const sig=stats(data[0].subarray(sr/2));assert.ok(Math.abs(sig.mean)<.01,'DC removal');
 if(p.banked)assert.notDeepEqual(data[0],data[3],'separate banks');else assert.deepEqual(data[0],data[3]);
 const cut=render(c,sr,1,{throttle:0,load:0});assert.ok(stats(cut.data[0].subarray(sr*.7)).rms<sig.rms*.02,'injected fuel cut');assert.ok(stats(cut.data[2]).rms>.0001);
 cut.model.update({throttle:.3,load:.5});const recovery=Array.from({length:4},()=>new Float32Array(sr));cut.model.render(recovery);assert.ok(stats(recovery[0]).rms>.001);
}
const stock=configs.find(p=>p.name==='Chevrolet LS3 6.2').config;
const loud=render(stock,48000,1,{load:.9}).data[0],light=render(stock,48000,1,{load:.1}).data[0];assert.ok(stats(loud).rms>stats(light).rms*1.5,'load response');
const same=render({...stock,gameMeta:{name:'anything'}}).data;assert.deepEqual(same,render(stock).data,'identical waveform after rename');
// Components must change the appropriate layers, not only metadata.
const change=(key,value,channel=0)=>assert.notDeepEqual(render(stock).data[channel],render({...stock,[key]:value}).data[channel],key+' affects audio');
change('exhaustRunnerM',1);change('exhaustCrossover','x');change('exhaustCrossover','h');change('catalyst','none');change('camDrive','gear',2);change('injectionType','direct',2);change('airCleaner','trumpets',1);change('runnerLength','short',1);change('soundTexture',0,2);change('compressionRatio',12);
const carb=render({...stock,injectionType:'carb'},48000,1,{throttle:0,load:0});assert.ok(stats(carb.data[0].subarray(24000)).rms>.001,'carb retains overrun combustion');
assert.notDeepEqual(render({...stock,injectionType:'carb',carbSecondary:'progressive'}).data[1],render({...stock,injectionType:'carb',carbSecondary:'synchronous'}).data[1]);
// Heavy-cam lope derives from overlap and inertia, not V8/OHV identity.
const mild={...stock,camOverlapDeg:0},wild={...stock,camOverlapDeg:75};
const idle=controls=>render(controls,48000,2,{rpm:700,throttle:.02,load:.1}).model;
assert.ok(Math.abs(idle(mild).rippleRpm)<1e-9);assert.ok(Math.abs(idle(wild).rippleRpm)>5,'overlap produces idle ripple');
assert.ok(Math.abs(idle({...wild,flywheelInertiaKgM2:.08}).rippleRpm)>Math.abs(idle({...wild,flywheelInertiaKgM2:.6}).rippleRpm),'inertia smooths idle ripple');
assert.ok(Math.abs(render(wild,48000,1,{rpm:4000,throttle:.8}).model.rippleRpm)<1e-9,'lope fades at speed/load');
const runtime={rpm:4000,throttle:1,afr:13.1,ignitionDeg:24},base={...stock,dynoBrakeLoad:0};
assert.ok(app.stepRuntime({...base,flywheelInertiaKgM2:.08},runtime,1,.01).rpm>app.stepRuntime({...base,flywheelInertiaKgM2:.6},runtime,1,.01).rpm,'flywheel affects Drive acceleration');
// Keep the approved B234R/F20C/LS3 reference character in comparable acoustic ranges,
// without any production identity dispatch or special-case coefficients.
for(const [name,width,cutoff] of [['B234R',4.2,1150],['Honda F20C',2.8,3300],['Chevrolet LS3 6.2',5.5,2300]]){
 const c=configs.find(x=>x.name===name).config;const p=acousticProfileFor(c);if(c.liftSystem!=='none')assert.ok(Math.abs(idle(c).rippleRpm)<1e-9,'low-lift idle stays smooth');assert.ok(Math.abs(p.pulseMs/width-1)<.25,name+' pulse envelope reference');assert.ok(Math.abs(p.cutoff/cutoff-1)<.25,name+' spectral reference');
}
// Block-size independence, profile transitions and disabled output.
const a=new EngineAcousticModel(),b=new EngineAcousticModel();for(const m of [a,b])m.update({components:acousticProfileFor(stock),active:true,rpm:4000,throttle:1,load:1});
const one=Array.from({length:4},()=>new Float32Array(48000)),many=one.map(()=>new Float32Array(48000));a.render(one);for(let i=0;i<48000;i+=97)b.render(many.map(d=>d.subarray(i,Math.min(i+97,48000))));assert.deepEqual(one,many);
a.update({components:acousticProfileFor(configs[0].config),active:false});a.render(one);assert.ok(stats(one[0].subarray(24000)).peak<.0001);
assert.equal(app.sanitizeConfig({audioModel:'legacy'}).audioModel,'legacy');assert.equal(app.sanitizeConfig({}).audioModel,'acoustic');assert.equal(app.sanitizeConfig({camOverlapDeg:NaN}).camOverlapDeg,undefined);
// Documented values are preset inputs; names never enter the shared DSP.
const references=app.documentedAcoustics.map(ref=>({...app.configForPreset(app.presets.find(p=>p.name===ref.base)),...ref.overrides}));
assert.equal(references[0].valvesPerCylinder,5);assert.equal(acousticProfileFor(references[0]).camDrive,'belt_chain');
const saab=valveTimingFor(references[1]),nissan=valveTimingFor(references[2]);
assert.equal(saab.geometricOverlap,30);assert.equal(saab.intakeDuration,240);assert.equal(saab.exhaustDuration,240);
assert.ok(saab.effectiveOverlap<8,'seat overlap must not create race-cam lope');assert.ok(Math.abs(idle(references[1]).rippleRpm)<1e-9);
assert.equal(nissan.geometricOverlap,1);assert.equal(nissan.intakeDuration,240);assert.equal(nissan.inletLift,9.2);
for(const c of references){const wave=render(c).data;assert.deepEqual(wave,render({...c,gameMeta:{name:'renamed'}}).data);wave.forEach(stats);}
const off=render({...references[2],acousticVtcMode:'off'}),on=render({...references[2],acousticVtcMode:'on'});
assert.ok(on.model.vtc>19.9);assert.equal(off.model.vtc,0);assert.notDeepEqual(off.data[1],on.data[1]);
assert.ok(render(references[2],48000,1,{rpm:6000}).model.vtc<.01,'auto advance drops out above range');
assert.ok(render(references[2],48000,1,{rpm:3000,load:.9}).model.vtc>19.9,'loaded warm sweep advances intake');
for(const [key,value,channel] of [['intakePipeM',1.5,1],['intakePlenumL',4,1],['intakeBoreMm',100,1],['silencerCount',2,0],['silencerVolumeL',20,0]]){
 const c={...stock,silencerCount:1};assert.notDeepEqual(render(c).data[channel],render({...c,[key]:value}).data[channel],key+' shapes the component path');
}
for(const sr of [32000,44100,96000]){const c={...references[2],silencerCount:2,silencerVolumeL:25,intakePlenumL:.3,intakePipeM:.1,intakeBoreMm:120};render(c,sr).data.forEach(stats);}
assert.equal(valveTimingFor({valveEvents:{inletOpen:NaN}}),null);
console.log('PASS: documented variants, lift-weighted stock idle, VTC states, intake resonance, serial silencers and sample-rate stability.');
console.log('PASS: 240 engines, 11 layouts/3 sample rates, hardware responses, name-independent waveforms, lope/inertia, fuel cut, cadence and reference ranges.');
// Actual worklet registration and port/render across each architecture.
const {OfflineAudioContext,AudioWorkletNode}=await import('node-web-audio-api');
for(const layout of ['i3','i4','i5','i6','v4','v6','flat4','flat6','v8','v10','v12']){
 const ctx=new OfflineAudioContext(2,24000,48000);await ctx.audioWorklet.addModule(new URL('../src/lib/engineAcousticProcessor.js',import.meta.url).pathname);
 const node=new AudioWorkletNode(ctx,'apex-engine-acoustics',{numberOfInputs:0,numberOfOutputs:3,outputChannelCount:[2,1,1]});
 const ready=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('worklet timeout')),5000);node.port.onmessage=e=>{if(e.data.type==='ready'){clearTimeout(timeout);resolve();}};});
 const errors=[];node.onprocessorerror=e=>errors.push(e);[0,1,2].forEach(port=>node.connect(ctx.destination,port,0));await ready;
 node.port.postMessage({components:acousticProfileFor({...stock,engineLayout:layout}),active:true,rpm:4000,throttle:.8,load:.9});await new Promise(r=>setTimeout(r,20));
 const result=await ctx.startRendering();const sig=stats(result.getChannelData(0));assert.equal(errors.length,0);assert.ok(sig.rms>.001&&sig.peak<1,layout+' native worklet');node.disconnect();node.port.close();
 console.log(layout+' actual AudioWorklet PASS');
}
fs.unlinkSync(out);

