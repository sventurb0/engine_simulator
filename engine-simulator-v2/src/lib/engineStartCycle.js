// Warm-start approximation shared by the simulator and flight game.
// Times vary with displacement and inertia. No recorded clips or engine-name rules.
export class EngineStartCycle {
  constructor(config,running=true){this.config=config;this.state=running?'running':'stopped';this.time=0;this.rpm=running?this.idle:0;this.firing=running?1:0;this.starter=0;this.power=running?1:0;this.opening=0;this.load=.12;}
  get idle(){return this.config.acousticIdleRpm??this.config.idleRpm??600;}
  start(){if(this.state==='running'||this.state==='cranking'||this.state==='catching')return;this.state='cranking';this.time=0;}
  stop(){if(this.state==='stopped')return;this.state='stopping';this.time=0;this.firing=0;this.starter=0;}
  step(dt,targetRpm,shaft){
    dt=Math.max(0,Math.min(.1,dt));this.time+=dt;
    const c=this.config,litres=Math.PI/4*(c.bore/1000)**2*(c.stroke/1000)*1000;
    const mass=Math.min(4,Math.max(.3,litres+(c.flywheelInertiaKgM2??.5)));
    const crank=100+80/(1+mass),wait=1.2+mass*.65;
    this.starter=0;
    if(this.state==='cranking'){
      this.starter=1;this.firing=0;this.rpm+=(crank-this.rpm)*(1-Math.exp(-dt*4));
      if(this.time>wait){this.state='catching';this.time=0;this.firing=.12;}
    }else if(this.state==='catching'){
      const progress=Math.min(1,this.time/(1.5+mass*.6));
      this.firing=.12+.88*progress;this.starter=progress<.55?1:0;
      const surge=this.idle*(.30+1.03*Math.sin(progress*Math.PI*.66));
      this.rpm+=(surge-this.rpm)*(1-Math.exp(-dt*3));
      if(progress===1){this.state='settling';this.time=0;}
    }else if(this.state==='settling'){
      this.firing=1;this.rpm+=(this.idle-this.rpm)*(1-Math.exp(-dt*2));
      if(this.time>1.5){this.state='running';this.time=0;}
    }else if(this.state==='running'){
      this.firing=1;
      if(shaft)this.stepShaft(dt,shaft,mass);
      else this.rpm=targetRpm;
    }else if(this.state==='stopping'){
      this.firing=0;this.opening=0;
      this.rpm*=Math.exp(-dt/(.7+mass*.6));
      if(shaft){
        const windmill=Math.max(0,(shaft.airspeed??0)-20)*8;
        this.rpm+=(windmill-this.rpm)*Math.min(1,dt*.18);
      }
      this.rpm=Math.max(0,this.rpm-dt*20);
      if(this.rpm<8){this.state='stopped';this.rpm=0;}
    }else{this.rpm=0;this.firing=0;}
    this.power=this.state==='running'?(shaft?this.power:1):this.state==='settling'?.25:0;
    return this;
  }
  stepShaft(dt,shaft,mass){
    const c=this.config,rated=c.planeRatedRpm??c.redline??3000;
    const command=Math.max(0,Math.min(1,shaft.throttle??0));
    const response=.25+mass*.11+(c.induction==='supercharger'?.10:0);
    this.opening+=(command-this.opening)*(1-Math.exp(-dt/response));
    const ratio=c.propellerRatio??1,diameter=c.propellerDiameterM??2;
    const fraction=Math.max(.01,this.rpm/rated);
    const axial=Math.max(0,(shaft.airspeed??0)*Math.cos(shaft.aoa??0));
    const advance=axial/Math.max(4,this.rpm/60*ratio*diameter);
    // Fixed-pitch propeller approximation. Forward inflow unloads the blades.
    const resistance=Math.max(.18,Math.min(1.4,1.3-.5*advance));
    const nominal=this.idle+(rated-this.idle)*this.opening;
    const idleFraction=this.idle/rated;
    const charge=(nominal/rated)**2;
    const overspeedLoss=Math.max(.05,1-Math.max(0,fraction-1)*3);
    const engineTorque=charge*overspeedLoss;
    const propTorque=fraction*fraction*resistance;
    const windmillTorque=Math.min(.5,Math.max(0,(axial-20)/150))**2;
    const idleAssist=Math.max(0,(this.idle-this.rpm)/this.idle)*idleFraction*.5;
    const powerWatts=(c.ratedPowerHp??150)*745.7;
    const ratedTorque=powerWatts/(rated*Math.PI/30);
    const sweptLitres=Math.PI/4*(c.bore/1000)**2*(c.stroke/1000)*1000;
    const cylinders=Number(String(c.engineLayout).match(/\d+/)?.[0]??1);
    const inertia=(c.flywheelInertiaKgM2??.5)+sweptLitres*cylinders*.10+.035*diameter**5*ratio**2;
    const density=Math.max(.3,Math.min(1.2,(shaft.density??1.225)/1.225));
    const acceleration=(engineTorque-propTorque+windmillTorque+idleAssist)*density*ratedTorque/inertia*30/Math.PI;
    this.rpm=Math.max(this.idle*.75,Math.min(rated*1.18,this.rpm+acceleration*dt));
    this.load=Math.max(.06,Math.min(1,(.12+.88*this.opening)*Math.sqrt(nominal/Math.max(this.idle,this.rpm))));
    // Preserve cruise power calibration while transient shaft speed changes thrust.
    this.power=Math.max(.2,Math.min(1,this.rpm/Math.max(this.idle,nominal)));
  }
}
