// Standalone module shared by the UI, tests and AudioWorklet. No engine names or IDs select a voice.
// Inferred dimensions and sound coefficients are acoustic assumptions, not measured specifications.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(value,fallback,a,b)=>Number.isFinite(value)?clamp(value,a,b):fallback;
const layouts={single:1,i2:2,flat2:2,radial5:5,radial7:7,radial9:9,radial14:14,rotary9:9,w12:12,i3:3,i4:4,i5:5,i6:6,v4:4,v6:6,flat4:4,flat6:6,v8:8,v10:10,v12:12};
// Signed events: inlet opening before TDC, inlet closing after BDC,
// exhaust opening before BDC, exhaust closing after TDC. Lift curve is an
// assumed sin² ramp; manuals do not supply checking lift or full cam lobes.
export function valveLiftAt(angle,open,duration,lift) {
  const phase=((angle-open)%720+720)%720;
  return phase<duration?lift*Math.sin(Math.PI*phase/duration)**2:0;
}
export function valveTimingFor(config={}) {
  const v=config.valveEvents;
  if(!v||!['inletOpen','inletClose','exhaustOpen','exhaustClose','inletLiftMm','exhaustLiftMm'].every(k=>Number.isFinite(v[k])))return null;
  const io=finite(v.inletOpen,0,-40,80),ic=finite(v.inletClose,40,0,100),eo=finite(v.exhaustOpen,40,0,100),ec=finite(v.exhaustClose,0,-40,80);
  const timing={io,ic,eo,ec,inletLift:finite(v.inletLiftMm,9,1,18),exhaustLift:finite(v.exhaustLiftMm,9,1,18),intakeDuration:180+io+ic,exhaustDuration:180+eo+ec};
  let area=0;
  for(let deg=-100;deg<=100;deg++)area+=Math.min(valveLiftAt(deg,-io,timing.intakeDuration,timing.inletLift),valveLiftAt(deg,-180-eo,timing.exhaustDuration,timing.exhaustLift))/9;
  return {...timing,geometricOverlap:Math.max(0,io+ec),effectiveOverlap:area};
}
export function acousticProfileFor(config={}) {
  const cylinders=layouts[config.engineLayout];if(!cylinders)return null;
  const marine=config.applicationType==='boat',large=marine||config.applicationType==='plane';
  const plane=config.applicationType==='plane',rotary=config.engineLayout==='rotary9',radial=config.engineLayout.startsWith('radial');
  const perCylinder=Math.PI/4*(finite(config.bore,86,marine?25:40,marine?300:plane?250:180)/1000)**2*(finite(config.stroke,86,marine?25:30,marine?300:plane?250:180)/1000)*1000;
  const disp=perCylinder*cylinders,cam=finite(config.camAggression,.4,0,1),valves=finite(config.valvesPerCylinder,4,large?0:2,5);
  const turbo=config.induction==='turbo',ohv=config.valvetrainLayout==='ohv',banked=/^(v|flat|w)/.test(config.engineLayout)||config.engineLayout==='radial14';
  const crossplane=config.engineLayout==='v8'&&config.v8Crank!=='flatplane';
  const banks=config.engineLayout==='w12'?Array.from({length:cylinders},(_,i)=>i%3):!banked?Array(cylinders).fill(0):crossplane?[0,1,0,1,1,0,1,0]:Array.from({length:cylinders},(_,i)=>i%2);
  const header=config.headerType??'cast';
  const runnerBase={cast:.48,shorty:.50,fourtwoone:.50,fourone:.62,equal:.50,unequal:.50}[header]??.48;
  const runner=finite(config.exhaustRunnerM,runnerBase,.15,1.5);
  const variations=header==='equal'||header==='fourone'||header==='fourtwoone'?[.99,1.01,1,1]:header==='unequal'?[.62,.94,1.46,.98]:[.88,1.04,.96,1.12];
  const collector=finite(config.collectorLengthM,turbo?1.1:ohv?1.8:1.5,.3,3);
  const tailpipe=finite(config.tailpipeLengthM,2.4+disp*.04,.5,5);
  const cutoff=clamp(1600+cam*1400+(valves-2)*350+({cast:-100,shorty:200,fourone:350,equal:150,unequal:-100}[header]??0)-(turbo?1450:0),650,6500);
  const valveTiming=valveTimingFor(config);
  const overlap=finite(config.camOverlapDeg,Math.max(0,(cam-.2)*70),0,100);
  const airCleaner=config.airCleaner==='auto'||!config.airCleaner?(config.intakeType==='itb'?'trumpets':'airbox'):config.airCleaner;
  const intakePipe=finite(config.intakePipeM,.65,.1,2),intakeBore=finite(config.intakeBoreMm,65,30,120),plenum=finite(config.intakePlenumL,disp*.8,.3,large?40:8);
  const firingPositions=radial||rotary?Array.from({length:cylinders},(_,i)=>config.engineLayout==='radial14'?(i*9)%14:(i*2)%cylinders):null;
  // Aircraft combustion detail extends to rotating cylinders, V banks and the
  // flat four. The flat twin and W source retain their previous character.
  // These are architecture/geometry rules, never preset names or a recorded voice.
  const aircraftSource=marine||plane&&(radial||rotary||!banked||config.engineLayout.startsWith('v')||config.engineLayout==='flat4');
  const aircraftBank=aircraftSource&&config.engineLayout.startsWith('v');
  const scatter=aircraftSource?finite(config.soundTexture,.5,0,1)*clamp(.10+plenum/disp*.055+perCylinder*.022,.12,.24):0;
  const twoStroke=marine&&config.engineCycle==='two';
  // Intervals in average event units. Paired opposed cylinders fire together;
  // Kelvin 2-1-0-0 gives 180/540 crank degrees across a four-stroke cycle.
  const eventGaps=marine&&cylinders===2?config.marineFiring==='paired'?[2,0]:!twoStroke&&config.marineFiring==='uneven_twin'?[.5,1.5]:null:null;
  const profile={marine,twoStroke,eventGaps,hotBulb:marine&&config.marineCombustion==='hot_bulb',
    wet:marine&&config.marineExhaust!=='dry',submerged:marine&&config.marineOutlet==='submerged',enclosure:marine?finite(config.marineEnclosure,.4,0,1):0,
    plane,rotary,radial,firingPositions,bankCount:config.engineLayout==='w12'?3:2,
    openStubs:plane&&config.planeExhaust!=='collector',sleeve:config.sleeveValves===true,
    propeller:plane&&config.propellerEnabled!==false,propBlades:Math.round(finite(config.propellerBlades,2,2,4)),
    propDiameter:finite(config.propellerDiameterM,2,.8,4.5),propRatio:finite(config.propellerRatio,1,.25,1),propLevel:finite(config.propellerLoudness,.6,0,1.5),
    valveTiming,intakePipe,intakeBore,plenum,aircraftSource,aircraftBank,scatter,
    bankPathM:aircraftBank?finite(config.bore,120,40,250)*.0036:0,
    silencerCount:Math.round(finite(config.silencerCount,0,0,2)),silencerVolume:finite(config.silencerVolumeL,8,1,25),
    vtcAdvance:finite(config.intakeCamAdvanceDeg,0,0,40),vtcMode:config.acousticVtcMode??'off',
    cylinders,banks,banked,layout:config.engineLayout,crossplane,
    runners:Array.from({length:cylinders},(_,i)=>runner*variations[i%4]),collector,tailpipe,
    cutoff:aircraftSource?cutoff*clamp((.65/perCylinder)**.22,.55,1):cutoff,
    pulseMs:clamp(valveTiming?(2.6+perCylinder*4.5)/(1+.7*valveTiming.exhaustLift/12)*(240/valveTiming.exhaustDuration):(2.6+perCylinder*4.5)/(1+.7*cam*(valves/4)),1.5,marine?50:aircraftSource?16:9),turbo,induction:config.induction??'na',
    displacementL:disp,perCylinderL:perCylinder,compression:finite(config.compressionRatio,10,large?3.5:6,16),
    cam,overlap,idleOverlap:config.camOverlapDeg!==undefined?overlap:valveTiming?valveTiming.effectiveOverlap:overlap*(config.liftSystem&&config.liftSystem!=='none'?.18:config.vvtMode==='dual'?.35:config.vvtMode==='intake'?.6:1),redline:finite(config.redline,6600,marine?200:plane?800:3000,18000),flywheel:finite(config.flywheelInertiaKgM2,.18,.04,marine?20:1),
    idle:finite(config.acousticIdleRpm,config.engineLayout==='v8'?(crossplane?650:860):800,marine?100:plane?350:500,1600),
    intake:config.intakeType??'plenum',intakeRunner:{long:.48,medium:.34,short:.20}[config.runnerLength]??.34,
    injection:config.injectionType??'port',carbSecondary:config.carbSecondary??'progressive',airCleaner,
    camDrive:config.camDrive??'chain',crossover:banked?(config.exhaustCrossover??'none'):'none',
    catalyst:config.catalyst??'stock',valvetrain:config.valvetrainLayout??'dohc',valves,
    lift:config.liftSystem??'none',liftRpm:finite(config.liftSwitchRpm,6000,2000,12000),exhaust:config.exhaustType??'street',
    texture:finite(config.soundTexture,.62,0,1)};
  // Hardware signature deliberately excludes preset name, calibration ID, manufacturer and output ratings.
  return {...profile,id:JSON.stringify(profile)};
}
const read=(buffer,index,delay)=>{const pos=(index-delay+buffer.length*2)%buffer.length,a=Math.floor(pos),t=pos-a;return buffer[a]*(1-t)+buffer[(a+1)%buffer.length]*t;};
export class EngineAcousticModel {
  constructor(sr=48000){this.sr=sr;this.phase=0;this.slot=0;this.events=0;this.seed=713;this.rpm=900;this.throttle=0;this.load=0;this.active=0;this.fuel=1;this.cut=false;this.target={rpm:900,throttle:0,load:0,active:false};this.configure(acousticProfileFor({engineLayout:'i4'}));this.huntPhase=0;this.drivePhase=0;this.pumpPhase=0;this.injectorEnv=0;this.pumpEnv=0;this.rippleRpm=0;this.lastPulseAmplitude=0;}
  configure(profile){
    if(this.profile?.id===profile.id)return;
    this.transitionL=this.lastL??0;this.transitionR=this.lastR??0;
    this.transitionP=this.lastProp??0;
    this.transitionI=this.lastI??0;this.transitionM=this.lastM??0;this.active=0;
    this.profile=profile;this.slot=0;this.phase=0;this.index=0;
    this.slow=new Float64Array(profile.cylinders);this.fast=new Float64Array(profile.cylinders);this.pulseDecay=new Float64Array(profile.cylinders);
    this.flowNoise=new Float64Array(profile.cylinders);
    this.cylinderMixture=new Float64Array(profile.cylinders);
    this.afterDelay=new Float64Array(profile.cylinders);this.afterEnergy=new Float64Array(profile.cylinders);
    this.valveEnvelope=new Float64Array(profile.cylinders);this.valveDelay=new Float64Array(profile.cylinders);
    this.valveRing1=0;this.valveRing2=0;this.gearNoise=0;this.shaftDrift=0;this.waterPressure=0;this.marineLow=[0,0];this.waterLow=0;this.hotKnock=0;
    this.lastControlThrottle=0;this.releaseFuel=0;this.afterfireCount=0;
    this.bankBody=Array(profile.bankCount).fill(0);
    this.cylinderTrim=Array.from({length:profile.cylinders},(_,c)=>1+profile.scatter*.6*Math.sin((c+1)*2.3999632297));
    this.bufferSize=Math.max(4096,2**Math.ceil(Math.log2(this.sr*.05)));
    this.lines=Array.from({length:profile.cylinders},()=>new Float32Array(this.bufferSize));
    this.collectors=Array.from({length:profile.bankCount},()=>new Float32Array(this.bufferSize));
    this.farBankLine=new Float32Array(this.bufferSize);
    this.propPhase=0;this.rotorPhase=0;this.propNoiseLow=0;this.blipGain=1;this.propRpm=0;this.bladeHz=0;
    this.vtc=0;this.resonatorX1=0;this.resonatorX2=0;this.resonatorY1=0;this.resonatorY2=0;this.silencerLow=Array.from({length:profile.bankCount},()=>[0,0]);this.silencerLines=Array.from({length:profile.bankCount*2},()=>new Float32Array(this.bufferSize));
    this.crossoverLow=0;this.low=Array(profile.bankCount).fill(0);this.hpX=Array(profile.bankCount).fill(0);this.hpY=Array(profile.bankCount).fill(0);this.intakeLow=0;this.intakeHigh=0;this.mechLow=0;
  }
  update(message){
    if(message.components?.id)this.configure(message.components);
    if(this.profile.aircraftSource&&this.profile.injection==='carb'&&Number.isFinite(message.throttle)){
      // Stored manifold fuel gives a brief over-rich exhaust on a sharp lift.
      // No random bangs at steady power, no imported recordings, no power boost.
      const drop=this.lastControlThrottle-clamp(message.throttle,0,1);
      if(drop>.18&&this.rpm>this.profile.idle*1.4)this.releaseFuel=clamp(this.releaseFuel+drop,0,1);
      this.lastControlThrottle=clamp(message.throttle,0,1);
    }
    this.target={...this.target,...message};
    if(this.profile.rotary&&this.target.rotaryBlip){
      // Ignition cut must also cancel queued afterfires. Valve/rotation/propeller
      // layers continue; releasing the cut restores combustion through blipGain.
      this.releaseFuel=0;this.afterDelay.fill(0);this.afterEnergy.fill(0);
    }
  }
  noise(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/2147483648-1;}
  render(outputs){
    const [exhaust,intake,mechanical,right,propeller]=outputs,n=exhaust.length,p=this.profile,sr=this.sr,t=this.target;
    if(!t.active && this.active<1e-6){outputs.forEach(channel=>channel?.fill(0));return;}
    const smoothing=1-Math.exp(-1/(sr*.035)),fade=1-Math.exp(-1/(sr*.025)),transitionDecay=Math.exp(-1/(sr*.012));
    const speed=520; // assumed mean exhaust acoustic speed, m/s
    const runnerScale=1;
    const delays=p.runners.map(length=>(length*runnerScale+p.collector)*sr/speed);
    const reflections=p.runners.map(length=>length*2*sr/speed);
    const tailDelay=p.tailpipe*2*sr/speed;
    const restriction=p.exhaust==='restrictive'?.65:p.exhaust==='race'?1.3:p.exhaust==='performance'?1.08:1;
    const catalyst=p.catalyst==='none'?1.15:p.catalyst==='high_flow'?1.06:.95;
    const lp=1-Math.exp(-2*Math.PI*p.cutoff*restriction*catalyst/sr),hp=Math.exp(-2*Math.PI*32/sr);
    const slowDecay=Math.exp(-1/(sr*p.pulseMs*.001)),fastDecay=Math.exp(-1/(sr*.00035));
    const intakeCutoff=(850+550/p.intakeRunner)*(p.airCleaner==='airbox'?.70:p.airCleaner==='trumpets'?1.3:1);
    const intakeLp=1-Math.exp(-2*Math.PI*intakeCutoff/sr),intakeHp=1-Math.exp(-2*Math.PI*300/sr);
    // Helmholtz approximation: neck area / (plenum volume * effective length).
    // Geometry is editable and estimated until measured for the installation.
    const resonance=clamp(343/(2*Math.PI)*Math.sqrt((Math.PI*(p.intakeBore*.001/2)**2)/(p.plenum*.001*(p.intakePipe+.85*p.intakeBore*.001))),35,900);
    const radius=Math.exp(-Math.PI*resonance/(2*sr)),resA=2*radius*Math.cos(2*Math.PI*resonance/sr),resB=radius*radius;
    const silencerDelay=Math.cbrt(p.silencerVolume*.001)*2*sr/speed;
    const silencerLp=1-Math.exp(-2*Math.PI*(1800/Math.sqrt(p.silencerVolume/8))/sr);
    const injectionGain=p.injection==='direct'?.0035:p.injection==='dual'?.0025:p.injection==='port'?.0009:p.injection==='tbi'?.0013:0;
    const tickDecay=Math.exp(-1/(sr*.0012)),pumpDecay=Math.exp(-1/(sr*.0018));
    const flowLp=1-Math.exp(-2*Math.PI*(p.aircraftSource?900/Math.sqrt(p.perCylinderL):2400)/sr);
    const releaseDecay=Math.exp(-1/(sr*.42));
    const gearLp=1-Math.exp(-2*Math.PI*650/sr);
    const bodyLp=1-Math.exp(-2*Math.PI*210/sr);
    const valveDecay=Math.exp(-1/(sr*(p.radial?.004:.002)));
    const valveRadius=Math.exp(-1/(sr*.0035)),valveB=valveRadius*valveRadius;
    const valveA=2*valveRadius*Math.cos(2*Math.PI*clamp(1900/Math.sqrt(p.perCylinderL),650,3100)/sr);
    const inertiaScale=clamp(.18/p.flywheel,.3,2.4);
    const overlapFactor=Math.pow(clamp((p.idleOverlap-8)/55,0,1),1.25);
    for(let i=0;i<n;i++){
      this.rpm+=(clamp(t.rpm??900,0,14000)-this.rpm)*smoothing;
      this.throttle+=(clamp(t.throttle??0,0,1)-this.throttle)*smoothing;
      this.load+=(clamp(t.load??0,0,1)-this.load)*smoothing;
      this.blipGain+=((p.rotary&&t.rotaryBlip?0:1)-this.blipGain)*fade;
      this.rotorPhase=(this.rotorPhase+this.rpm/60/sr)%1;
      this.active+=((t.active?1:0)-this.active)*fade;
      if(p.injection==='carb'||p.hotBulb)this.cut=false;
      else if(this.throttle<.035&&this.rpm>1900)this.cut=true;
      else if(this.throttle>.065||this.rpm<1400)this.cut=false;
      this.fuel+=((this.cut?0:1)-this.fuel)*fade;
      const idleBlend=clamp(1-(this.rpm-p.idle-150)/1200,0,1)*clamp(1-this.throttle/.4,0,1);
      const vtcTarget=p.vtcMode==='on'?p.vtcAdvance:p.vtcMode==='auto'&&this.rpm>=1050&&this.rpm<=5700&&this.load>.5?p.vtcAdvance:0;
      this.vtc+=(vtcTarget-this.vtc)*smoothing;
      const lope=overlapFactor*idleBlend;
      const aircraftIdle=p.aircraftSource?clamp(1-(this.rpm-p.idle)/Math.max(200,p.redline*.42),0,1):0;
      if(p.aircraftSource){
        this.releaseFuel*=releaseDecay;
        // Slowly changing mixture balance, rather than a repeating wobble LFO.
        this.shaftDrift+=(0-this.shaftDrift)/(sr*.18);
      }
      this.huntPhase=(this.huntPhase+this.rpm/240/sr)%1;
      const hunt=Math.sin(this.huntPhase*2*Math.PI);
      this.rippleRpm=this.rpm*lope*.07*inertiaScale*hunt;
      const eventRpm=Math.max(0,this.rpm+this.rippleRpm+(p.aircraftSource?this.shaftDrift:0));
      const step=eventRpm/(p.twoStroke?60:120)*p.cylinders/sr;
      this.phase+=step;
      for(let burst=0;burst<p.cylinders&&this.phase>=(p.eventGaps?.[this.slot]??1);burst++){
        this.phase-=p.eventGaps?.[this.slot]??1;const cylinder=this.slot;
        let variation=1+this.noise()*(.015+p.texture*.02+lope*.48)+lope*.30*hunt;
        if(p.aircraftSource){
          this.cylinderMixture[cylinder]=this.cylinderMixture[cylinder]*.65+this.noise()*.35;
          variation*=this.cylinderTrim[cylinder]*(1+this.cylinderMixture[cylinder]*p.scatter*(1+aircraftIdle*2));
          this.shaftDrift+=this.noise()*this.rpm*p.scatter*.012*(.3+aircraftIdle)*inertiaScale;
          // Occasional soft combustion at idle; never arbitrary missing cylinders
          // at rated power. Texture=0 disables this illustrative unevenness.
          if(this.noise()+1<aircraftIdle*p.scatter*.12)variation*=.45;
        }
        const volume=clamp(Math.sqrt(p.perCylinderL/.55),.65,1.5)*clamp((p.compression/10)**.25,.85,1.18);
        const limiter=!p.plane&&!p.marine&&this.rpm>=p.redline-50 && Math.floor(this.events/p.cylinders)%2===0?0:1;
        const amplitude=(.20+this.load*.80)*this.fuel*variation*volume*limiter*this.blipGain;
        this.lastPulseAmplitude=amplitude;
        if(p.marine){this.waterPressure+=amplitude/Math.sqrt(p.cylinders)*.15;if(p.hotBulb)this.hotKnock+=amplitude*.7;}
        if(!p.turbo)this.pulseDecay[cylinder]=Math.exp(-1/(sr*p.pulseMs*.001*(1+this.noise()*(p.aircraftSource?.22:.06)*p.texture)));
        if(p.aircraftSource&&!p.twoStroke){
          this.valveDelay[cylinder]=sr*60/Math.max(350,this.rpm)*.65;
          if(p.injection==='carb'&&!(p.rotary&&t.rotaryBlip)&&this.releaseFuel>.04&&this.afterDelay[cylinder]<=0&&this.noise()+1<this.releaseFuel*.28*p.texture){
            this.afterDelay[cylinder]=sr*(.012+(this.noise()+1)*.018);
            this.afterEnergy[cylinder]=(.2+.4*this.releaseFuel)*volume*this.fuel;
          }
        }
        this.injectorEnv+=this.fuel;
        this.slow[cylinder]+=amplitude;this.fast[cylinder]+=amplitude;
        this.slot=(this.slot+1)%p.cylinders;this.events++;
      }
      let bank0=0,bank1=0,bank2=0,intakeExcitation=0;
      for(let c=0;c<p.cylinders;c++){
        this.slow[c]*=this.pulseDecay[c]||slowDecay;this.fast[c]*=fastDecay;
        // Exhaust blowdown includes turbulent broadband energy. NA high-speed
        // pulses should not be identical electronic waveforms; turbine damping
        // retains the approved turbo combustion character.
        if(p.aircraftSource&&this.afterDelay[c]>0){
          this.afterDelay[c]--;
          if(this.afterDelay[c]<=0){this.slow[c]+=this.afterEnergy[c];this.fast[c]+=this.afterEnergy[c];this.afterfireCount++;}
        }
        const envelope=this.slow[c]-this.fast[c];
        const turbulence=p.turbo?0:(p.aircraftSource?.22+.30*this.load:.025+.045*this.load)*p.texture;
        let flow=turbulence?this.noise():0;
        if(p.aircraftSource){this.flowNoise[c]+=(flow-this.flowNoise[c])*flowLp;flow=this.flowNoise[c]*3;}
        const pulse=envelope*(1+flow*turbulence);
        const line=this.lines[c];line[this.index]=pulse;
        const d=delays[c]+p.banks[c]*.25*sr/speed,r=reflections[c];
        const stubDelay=p.runners[c]*sr/speed;
        // An open pipe still has a port, an open-end pressure inversion and
        // repeat travel. Removing the collector must not remove the pipe itself.
        let arriving=p.openStubs?(read(line,this.index,stubDelay)-.25*read(line,this.index,stubDelay+r)+.09*read(line,this.index,stubDelay+2*r)):read(line,this.index,d)-.32*read(line,this.index,d+r)+.10*read(line,this.index,d+r*2);
        if(p.firingPositions){
          const angle=2*Math.PI*(p.firingPositions[c]/p.cylinders+(p.rotary?this.rotorPhase:0));
          // Stationary radial outlets have fixed orientation; a rotary's outlets
          // rotate with its cylinders. This radiation approximation is unmeasured.
          arriving*=.8+.2*Math.cos(angle);
        }
        if(p.banks[c]===0)bank0+=arriving;else if(p.banks[c]===2)bank2+=arriving;else bank1+=arriving;
        if(p.valveTiming){
          const v=p.valveTiming,crank=((this.events%p.cylinders+this.phase)/p.cylinders*720-c*720/p.cylinders+720)%720;
          const lift=valveLiftAt(crank,360-v.io-this.vtc,v.intakeDuration,v.inletLift)/9;
          intakeExcitation+=lift*(.25+this.load*.75);
        }else intakeExcitation+=this.slow[c];
      }
            for(let b=0;b<p.bankCount;b++){
        const direct=b===0?bank0:b===1?bank1:bank2;
        const echo=p.openStubs?0:read(this.collectors[b],this.index,tailDelay+b*.3*sr/speed);
        this.collectors[b][this.index]=direct+echo*.23;
        let filtered=direct+echo*.35;
        for(let stage=0;stage<p.silencerCount;stage++){
          const line=this.silencerLines[b*2+stage];line[this.index]=filtered;
          // Serial expansion chambers: delayed negative reflection and loss.
          const reflected=filtered-.28*read(line,this.index,silencerDelay*(1+stage*.25));
          this.silencerLow[b][stage]+=(reflected-this.silencerLow[b][stage])*silencerLp;
          filtered=.72*this.silencerLow[b][stage]+.12*reflected;
        }
        this.low[b]+=(filtered-this.low[b])*lp;
      }
      for(let b=0;b<p.bankCount;b++){
        const raw=this.low[b]/Math.sqrt(p.cylinders)*(p.turbo?.60:1);
        const y=hp*(this.hpY[b]+raw-this.hpX[b]);this.hpX[b]=raw;this.hpY[b]=y;
      }
      let outputL=this.hpY[0]+(this.hpY[2]??0)*.707,outputR=this.hpY[1]+(this.hpY[2]??0)*.707;
      if(p.aircraftBank){
        // Retain the low exhaust-bank order at actual engine RPM. V12s have
        // six pulses per bank per two revolutions (N/20 Hz); smaller V engines
        // keep their own count and existing flat-/cross-plane bank sequence.
        for(let b=0;b<2;b++)this.bankBody[b]+=(this.hpY[b]-this.bankBody[b])*bodyLp;
        outputL+=this.bankBody[0]*.45;outputR+=this.bankBody[1]*.45;
        // Approximate off-axis observer: the far bank arrives through a longer
        // air path. Coincident opposite-phase banks cancel their low order when
        // summed to mono. Bore-scaled separation is illustrative, not measured.
        this.farBankLine[this.index]=outputR;
        outputR=.88*read(this.farBankLine,this.index,p.bankPathM*sr/343);
      }
      if(p.crossover==='x'){
        const l=outputL,r=outputR;outputL=l*.65+r*.35;outputR=r*.65+l*.35;
      } else if(p.crossover==='h'){
        this.crossoverLow+=(outputL-outputR-(this.crossoverLow??0))*.02;
        const balance=this.crossoverLow*.10;outputL-=balance;outputR+=balance;
      }
      const stereo=p.banked&&right;
      const crossfeed=p.aircraftBank?.12:.35;
      exhaust[i]=(stereo?outputL+outputR*crossfeed:outputL+outputR)*this.active*.75;
      if(right)right[i]=(stereo?outputR+outputL*crossfeed:outputL+outputR)*this.active*.75;
      const air=this.noise();
      this.intakeLow+=(air*(.18+intakeExcitation)-this.intakeLow)*intakeLp;
      this.intakeHigh+=(this.intakeLow-this.intakeHigh)*intakeHp;
      const lift=p.lift!=='none'?1+(p.lift==='aggressive'?.4:.2)*clamp((this.rpm-p.liftRpm+250)/600,0,1):1;
      const cleanerGain=p.airCleaner==='airbox'?.72:p.airCleaner==='trumpets'?1.3:1.1;
      const secondary=p.injection==='carb'&&p.carbSecondary==='progressive'?(.75+.65*clamp((this.throttle-.5)/.4,0,1)):1;
      const intakeGain=p.intake==='itb'?1.25:p.intake==='dualrunner'?(this.rpm>4500?1.12:1):1;
      const excitation=(this.intakeLow-this.intakeHigh);
      const resonated=(1-resB)*.5*(excitation-this.resonatorX2)+resA*this.resonatorY1-resB*this.resonatorY2;
      this.resonatorX2=this.resonatorX1;this.resonatorX1=excitation;
      this.resonatorY2=this.resonatorY1;this.resonatorY1=resonated;
      intake[i]=(excitation+resonated*.6)*this.throttle*lift*cleanerGain*secondary*intakeGain*this.active*.075;
      this.mechLow+=(air-this.mechLow)*.08;
      this.injectorEnv*=tickDecay;this.pumpEnv*=pumpDecay;
      this.pumpPhase+=this.rpm/120*3/sr;
      if(this.pumpPhase>=1){this.pumpPhase-=1;if(p.injection==='direct'||p.injection==='dual')this.pumpEnv=1;}
      this.drivePhase=(this.drivePhase+this.rpm/60*(p.camDrive==='gear'?12:6)/sr)%1;
      const valveNoise=(air-this.mechLow)*(p.sleeve?.35:1)*(.002+this.rpm/14000*.007)*(p.valvetrain==='ohv'?1.15:1)*(.7+p.texture*.6);
      const injectorTick=air*this.injectorEnv*injectionGain+air*this.pumpEnv*injectionGain*.5;
      let drive=Math.sin(this.drivePhase*2*Math.PI)*(p.camDrive==='gear'?.0035:p.camDrive==='chain'?.0006:p.camDrive==='belt_chain'?.0003:0);
      let aircraftMechanical=0;
      if(p.aircraftSource){
        let strikes=0;
        for(let c=0;c<p.cylinders;c++){
          if(this.valveDelay[c]>0){this.valveDelay[c]--;if(this.valveDelay[c]<=0)this.valveEnvelope[c]=.7+.3*this.noise();}
          this.valveEnvelope[c]*=valveDecay;strikes+=this.valveEnvelope[c];
        }
        const impact=air*strikes/Math.sqrt(p.cylinders)*(p.sleeve?.08:1)*(p.rotary?Math.sqrt(p.valves/2):1);
        const ring=(1-valveB)*impact+valveA*this.valveRing1-valveB*this.valveRing2;
        this.valveRing2=this.valveRing1;this.valveRing1=ring;
        this.gearNoise+=(air-this.gearNoise)*gearLp;
        const exposure=p.radial||p.rotary?1.8:p.valvetrain==='ohv'?1.1:.65;
        aircraftMechanical=(impact*.019+ring*.045)*exposure*(.5+.5*p.texture);
        // A quiet gear mesh with broadband tooth contact, not a pure siren.
        drive=drive*.22+this.gearNoise*(p.camDrive==='gear'?.003:0);
      }
      mechanical[i]=(valveNoise+injectorTick+drive+aircraftMechanical)*this.active;
      if(p.marine){
        // Port-controlled two-strokes have no poppet-valve or cam-drive layer.
        this.hotKnock*=Math.exp(-1/(sr*.009));
        mechanical[i]=(p.twoStroke?air*this.hotKnock*.035+this.mechLow*.004:mechanical[i])*(1-p.enclosure*.78)*this.active;
        intake[i]*=1-p.enclosure*.65;
        this.waterPressure*=Math.exp(-1/(sr*.075));
        this.waterLow+=(air-this.waterLow)*(1-Math.exp(-2*Math.PI*420/sr));
        const bubble=(p.wet||p.submerged)?this.waterLow*Math.min(1,this.waterPressure)*(.035+.06*this.load)*this.active:0;
        const cutoff=p.submerged?400:p.wet?1000:7000;
        const waterLp=1-Math.exp(-2*Math.PI*cutoff/sr);
        const absorption=p.submerged?.5:p.wet?.82:1;
        this.marineLow[0]+=(exhaust[i]-this.marineLow[0])*waterLp;
        exhaust[i]=(this.marineLow[0]*absorption+bubble);
        if(right){this.marineLow[1]+=(right[i]-this.marineLow[1])*waterLp;right[i]=this.marineLow[1]*absorption+bubble;}
      }
      let propSound=0;
      this.propRpm=this.rpm*p.propRatio;this.bladeHz=this.propRpm/60*p.propBlades;
      if(p.propeller){
        this.propPhase=(this.propPhase+this.bladeHz/sr)%1;
        const tipSpeed=Math.hypot(Math.PI*p.propDiameter*this.propRpm/60,clamp(t.airspeed??0,0,150));
        const tipMach=tipSpeed/343;
        const fraction=clamp(this.rpm/p.redline,0,1.2),loading=.15+.85*this.throttle;
        const noise=this.noise();
        this.propNoiseLow+=(noise-this.propNoiseLow)*(1-Math.exp(-2*Math.PI*(350+Math.min(tipMach,1.3)*3500)/sr));
        const blade=Math.sin(2*Math.PI*this.propPhase)+.3*Math.sin(4*Math.PI*this.propPhase);
        propSound=(blade*.055+this.propNoiseLow*(.025+.13*clamp((tipMach-.6)/.4,0,1)))*fraction*fraction*loading*p.propLevel*this.active;
      }
      this.transitionP*=transitionDecay;
      // With the older four-channel API the intake transition already contains
      // its propeller contribution. Only the separate output needs this tail.
      if(propeller)propeller[i]=propSound+this.transitionP;else intake[i]+=propSound;
      this.lastProp=propeller?propeller[i]:propSound;
      const tail=transitionDecay;
      this.transitionL*=tail;this.transitionR*=tail;this.transitionI*=tail;this.transitionM*=tail;
      exhaust[i]+=this.transitionL;if(right)right[i]+=this.transitionR;
      intake[i]+=this.transitionI;mechanical[i]+=this.transitionM;
      this.lastL=exhaust[i];this.lastR=right?right[i]:exhaust[i];this.lastI=intake[i];this.lastM=mechanical[i];
      this.index=(this.index+1)%this.bufferSize;
    }
  }
}

if(typeof registerProcessor==='function') {
  class EngineAcousticProcessor extends AudioWorkletProcessor {
    constructor(){super();this.engine=new EngineAcousticModel(sampleRate);this.port.onmessage=event=>this.engine.update(event.data);this.port.postMessage({type:"ready"});}
    process(_inputs,outputs){if(outputs.length<3||!outputs[0][0])return true;this.engine.render([outputs[0][0],outputs[1][0],outputs[2][0],outputs[0][1],outputs[3]?.[0]]);return true;}
  }
  registerProcessor('apex-engine-acoustics',EngineAcousticProcessor);
}



