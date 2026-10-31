import assert from 'node:assert/strict';
import {EngineAcousticModel,acousticProfiles,acousticProfileFor} from '../src/lib/engineAcousticProcessor.js';
const stats=data=>{let energy=0,mean=0,peak=0;for(const v of data){assert.ok(Number.isFinite(v));energy+=v*v;mean+=v;peak=Math.max(peak,Math.abs(v));}return {rms:Math.sqrt(energy/data.length),mean:mean/data.length,peak};};
function render(profile,sr,seconds=3,controls={}){
 const model=new EngineAcousticModel(sr);model.update({profile:profile.id,active:true,rpm:4000,throttle:.8,load:.9,...controls});
 const data=Array.from({length:4},()=>new Float32Array(sr*seconds));
 for(let offset=0;offset<data[0].length;offset+=128)model.render(data.map(d=>d.subarray(offset,Math.min(offset+128,d.length))));
 return {model,data};
}
for(const sr of [44100,48000,96000])for(const profile of Object.values(acousticProfiles)){
 const {model,data}=render(profile,sr);const signal=stats(data[0].subarray(sr));
 assert.ok(signal.peak<2&&signal.rms>.001,profile.id+' stable non-silent signal');assert.ok(Math.abs(signal.mean)<.005,'DC removed');
 const before=model.events;model.render(Array.from({length:4},()=>new Float32Array(sr)));assert.ok(Math.abs(model.events-before-4000/120*profile.cylinders)<=1,'physical firing count');
 if(profile.id==='ls3')assert.notDeepEqual(data[0],data[3],'distinct collector banks');else assert.deepEqual(data[0],data[3],'single bank centred');
 const loaded=signal.rms,free=stats(render(profile,sr,3,{load:.1}).data[0].subarray(sr)).rms;assert.ok(loaded>free*1.5,'load changes combustion at same RPM');
 const cut=render(profile,sr,3,{throttle:0,load:0});assert.ok(stats(cut.data[0].subarray(sr*2)).rms<loaded*.01,'overrun removes combustion');assert.ok(stats(cut.data[2].subarray(sr*2)).rms>.0001,'mechanical overrun remains');
 cut.model.update({throttle:.3,load:.5});const recovery=Array.from({length:4},()=>new Float32Array(sr));cut.model.render(recovery);assert.ok(stats(recovery[0]).rms>.001,'fuel returns after throttle opens');
 console.log(`${profile.name} @ ${sr}: peak ${signal.peak.toFixed(3)}, RMS ${signal.rms.toFixed(3)}, correct firing count/load/fuel cut/bank routing`);
}
// DSP must not depend on render-block size.
const a=new EngineAcousticModel(),b=new EngineAcousticModel();for(const e of [a,b])e.update({profile:'ls3',active:true,rpm:6200,throttle:1,load:1});
const one=Array.from({length:4},()=>new Float32Array(48000)),many=one.map(()=>new Float32Array(48000));a.render(one);for(let i=0;i<48000;i+=97)b.render(many.map(d=>d.subarray(i,Math.min(i+97,48000))));assert.deepEqual(one,many);
// Rapid profile changes and disable/enable must remain finite and fade away.
for(const id of ['b234r','ls3','f20c']){a.update({profile:id,rpm:9000,throttle:1,load:1,active:true});a.render(one);stats(one[0]);}a.update({active:false});a.render(one);assert.ok(stats(one[0].subarray(24000)).peak<.0001,'mode fades out');
assert.equal(acousticProfileFor({engineLayout:'i4',gameMeta:{name:'B234R'}}).id,'b234r');assert.equal(acousticProfileFor({engineLayout:'v12',gameMeta:{name:'B234R'}}),null);assert.equal(acousticProfileFor({engineLayout:'i4',gameMeta:{name:'Unknown'}}),null);
console.log('PASS: DSP at 3 sample rates, physical cadence, load separation, overrun/recovery, stereo bank paths, block invariance and switching. No recording-based accuracy claim.');

// Exercise the actual processor registration and message port, not only its DSP class.
const {OfflineAudioContext,AudioWorkletNode}=await import('node-web-audio-api');
for(const profile of Object.values(acousticProfiles)){
 const ctx=new OfflineAudioContext(2,48000,48000);
 await ctx.audioWorklet.addModule(new URL('../src/lib/engineAcousticProcessor.js',import.meta.url).pathname);
 const node=new AudioWorkletNode(ctx,'apex-engine-acoustics',{numberOfInputs:0,numberOfOutputs:3,outputChannelCount:[2,1,1]});
 const ready=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Processor readiness timeout')),5000);node.port.onmessage=e=>{if(e.data.type==='ready'){clearTimeout(timeout);resolve();}};});
 const errors=[];node.onprocessorerror=e=>errors.push(e);
 node.connect(ctx.destination,0,0);node.connect(ctx.destination,1,0);node.connect(ctx.destination,2,0);
 await ready;node.port.postMessage({profile:profile.id,active:true,rpm:4000,throttle:.8,load:.9});
 await new Promise(resolve=>setTimeout(resolve,20));
 const result=await ctx.startRendering();const signal=stats(result.getChannelData(0));
 assert.equal(errors.length,0);assert.ok(signal.rms>.001&&signal.peak<1,profile.id+' actual worklet output');
 console.log(profile.name+' actual AudioWorklet registration/port/render PASS');node.disconnect();node.port.close();
}
