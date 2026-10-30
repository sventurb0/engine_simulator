import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { Play, Pause, Gauge, Activity, Volume2, RotateCcw } from "lucide-react";

type InductionType = "na" | "turbo" | "supercharger";
type EngineLayout = "i3" | "i4" | "i5" | "i6" | "v4" | "v6" | "flat4" | "flat6" | "v8" | "v10" | "v12";
type TurboFamily = "small" | "medium" | "large";
type BlowerType = "roots" | "twinscrew" | "centrifugal";
type ChargeReleaseMode = "none" | "recirc" | "dump";
type ValvetrainLayout = "ohv" | "sohc" | "dohc";
type VvtMode = "none" | "intake" | "dual";
type LiftSystem = "none" | "mild" | "aggressive";
type IntakeType = "plenum" | "variable" | "dualrunner" | "itb";
type RunnerLength = "long" | "medium" | "short";
type InjectionType = "carb" | "tbi" | "port" | "direct" | "dual";
type FuelType = "regular" | "premium" | "e30" | "e85" | "race";
type ExhaustType = "restrictive" | "street" | "performance" | "race";
type HeaderType = "cast" | "shorty" | "fourtwoone" | "fourone" | "equal" | "unequal";
type FrictionClass = "economy" | "normal" | "performance" | "race";
type TurboArchitecture = "single" | "twinscroll" | "sequential" | "vgt";
type TurboBearing = "journal" | "ball";
type TurbineAR = "small" | "medium" | "large";
type IntercoolerType = "none" | "sidemount" | "small_fmic" | "large_fmic" | "water_air";
type V8CrankType = "crossplane" | "flatplane";
type MicPosition = "dyno_room" | "cockpit" | "engine_bay" | "intake_side" | "rear_exhaust";
type GraphMode = "live" | "dyno";
type GraphPage = "power" | "diagnostics";
type DiagnosticMetricKey = "vePct" | "mapKpa" | "chargeTempC" | "airLbMin" | "injectorCc" | "compressorEffPct" | "densityRatio" | "bmepPsi" | "targetAfr" | "pr" | "eventHz";
type ControlTab = "live" | "engine" | "induction" | "environment" | "audio";
type FiringSoundMode = "stock" | "even" | "crossplane_i4" | "bigbang_i4" | "cp3_triple" | "bigbang_v4" | "oddfire_v6" | "lopey_v8";
type ApplicationType = "car";
type PrivateSampleKey = "v8Burble" | "v10Edge" | "v12Sweet" | "dumpSharp" | "flutter" | "saabCrackle" | "saabDump";

type SimConfig = {
  applicationType: ApplicationType;
  engineLayout: EngineLayout;
  induction: InductionType;
  bore: number;
  stroke: number;
  compressionRatio: number;
  valvesPerCylinder: 2 | 3 | 4 | 5;
  valvetrainLayout: ValvetrainLayout;
  v8Crank: V8CrankType;
  vvtMode: VvtMode;
  liftSystem: LiftSystem;
  liftSwitchRpm: number;
  intakeType: IntakeType;
  runnerLength: RunnerLength;
  injectionType: InjectionType;
  fuelType: FuelType;
  exhaustType: ExhaustType;
  headerType: HeaderType;
  frictionClass: FrictionClass;
  camAggression: number;
  exhaustFlow: number;
  topEndFlowBias: number;
  altitude: number;
  ambientTemp: number;
  humidity: number;
  vehicleSpeedKph: number;
  dynoRollerInertia: number;
  dynoBrakeLoad: number;
  redline: number;
  idleRpm: number;
  turboFamily: TurboFamily;
  turboArchitecture: TurboArchitecture;
  turboBearing: TurboBearing;
  turbineAR: TurbineAR;
  blowerType: BlowerType;
  boostControl: number;
  boostOnsetBias: number;
  boostTaperBias: number;
  chargeReleaseMode: ChargeReleaseMode;
  antiSurge: number;
  firingSoundMode: FiringSoundMode;
  wastegateBasePsi: number;
  superchargerDriveRatio: number;
  scBoostCap: number;
  intercoolerType: IntercoolerType;
  icCoreSize: number;
  engineLoudness: number;
  turboLoudness: number;
  superchargerLoudness: number;
  soundTexture: number;
  micPosition: MicPosition;
  roomSize: number;
  cinemaMode: boolean;
};

type RuntimeState = {
  rpm: number;
  throttle: number;
  afr: number;
  ignitionDeg: number;
};

type SolvePoint = {
  rpm: number;
  dispL: number;
  mapKpa: number;
  boostPsi: number;
  pr: number;
  compressorEff: number;
  chargeTempC: number;
  densityRatio: number;
  ve: number;
  airLbMin: number;
  cfm: number;
  brakeHp: number;
  torqueLbFt: number;
  bmepPsi: number;
  injectorCc: number;
  targetAfr: number;
  shaftSignal: number;
  valveLimit: number;
  eventHz: number;
};

type SweepRow = SolvePoint & { time?: number };
type EnginePreset = { name: string; config: Partial<SimConfig>; group?: "factory" | "custom" | "saved" };

const PA_TO_PSI = 0.0001450377;
const KELVIN = 273.15;
const R_AIR = 287.05;
const GAMMA_AIR = 1.4;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothStep = (x: number, e0: number, e1: number) => {
  const t = clamp((x - e0) / Math.max(e1 - e0, 1), 0, 1);
  return t * t * (3 - 2 * t);
};
const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "—");

const engineLayouts: Record<EngineLayout, { label: string; cylinders: number; firingFactor: number; pulseSpread: number; pulseDepth: number }> = {
  i3: { label: "Inline 3", cylinders: 3, firingFactor: 1.5, pulseSpread: 0.11, pulseDepth: 0.96 },
  i4: { label: "Inline 4", cylinders: 4, firingFactor: 2.0, pulseSpread: 0.02, pulseDepth: 1.0 },
  i5: { label: "Inline 5", cylinders: 5, firingFactor: 2.5, pulseSpread: 0.16, pulseDepth: 1.05 },
  i6: { label: "Inline 6", cylinders: 6, firingFactor: 3.0, pulseSpread: 0.03, pulseDepth: 1.08 },
  v4: { label: "V4", cylinders: 4, firingFactor: 2.0, pulseSpread: 0.14, pulseDepth: 1.02 },
  v6: { label: "V6", cylinders: 6, firingFactor: 3.0, pulseSpread: 0.05, pulseDepth: 1.03 },
  flat4: { label: "Flat 4", cylinders: 4, firingFactor: 2.0, pulseSpread: 0.10, pulseDepth: 0.97 },
  flat6: { label: "Flat 6", cylinders: 6, firingFactor: 3.0, pulseSpread: 0.02, pulseDepth: 0.95 },
  v8: { label: "V8", cylinders: 8, firingFactor: 4.0, pulseSpread: 0.12, pulseDepth: 1.12 },
  v10: { label: "V10", cylinders: 10, firingFactor: 5.0, pulseSpread: 0.10, pulseDepth: 1.18 },
  v12: { label: "V12", cylinders: 12, firingFactor: 6.0, pulseSpread: 0.06, pulseDepth: 1.28 },
};

function getLayoutTorqueBonus(layout: EngineLayout) {
  switch (layout) {
    case "v12": return 28;
    case "v10": return 20;
    case "v8": return 14;
    case "i6": return 10;
    case "v6": return 8;
    case "flat4": return 5;
    case "i5": return 5;
    case "v4": return 4;
    case "flat6": return 8;
    default: return 0;
  }
}

function getLayoutLowEndBonus(layout: EngineLayout) {
  switch (layout) {
    case "v12": return 0.16;
    case "v10": return 0.12;
    case "v8": return 0.08;
    case "i6": return 0.05;
    case "v6": return 0.04;
    case "flat4": return 0.02;
    case "i5": return 0.02;
    default: return 0;
  }
}

function getLayoutAudioWeight(layout: EngineLayout) {
  switch (layout) {
    case "v12": return 1.6;
    case "v10": return 1.45;
    case "v8": return 1.35;
    case "i6": return 1.18;
    case "v6": return 1.12;
    case "flat4": return 1.05;
    case "i5": return 1.06;
    case "v4": return 1.02;
    default: return 1.0;
  }
}

function resolveIdleRpm(config: SimConfig) {
  let base = 800;
  switch (config.engineLayout) {
    case "i3": base = 850; break;
    case "i4": base = 800; break;
    case "i5": base = 820; break;
    case "i6": base = 720; break;
    case "v4": base = 820; break;
    case "v6": base = 720; break;
    case "flat4": base = 780; break;
    case "flat6": base = 780; break;
    case "v8": base = config.v8Crank === "flatplane" ? 860 : 650; break;
    case "v10": base = 760; break;
    case "v12": base = 640; break;
  }
  if (config.induction === "turbo") base += 20;
  if (config.induction === "supercharger") base += 15;
  if (config.liftSystem === "mild") base += 35;
  if (config.liftSystem === "aggressive") base += 85;
  if (config.intakeType === "itb") base += 30;
  if (config.injectionType === "carb") base += 35;
  if (config.valvetrainLayout === "ohv") base -= 20;
  const trim = (config.idleRpm ?? 900) - 900;
  return clamp(base + trim, 600, 1100);
}

function getExhaustAudioTuning(config: SimConfig) {
  const tune = { lowGain: 1, midGain: 1, highGain: 1, lowFreq: 0, midFreq: 0, highFreq: 0, qBias: 0 };
  switch (config.exhaustType) {
    case "restrictive":
      tune.lowGain += 0.15; tune.midGain -= 0.10; tune.highGain -= 0.28; tune.lowFreq -= 18; tune.highFreq -= 110; break;
    case "performance":
      tune.midGain += 0.10; tune.highGain += 0.14; tune.highFreq += 70; tune.qBias += 0.15; break;
    case "race":
      tune.lowGain -= 0.05; tune.midGain += 0.18; tune.highGain += 0.30; tune.midFreq += 45; tune.highFreq += 180; tune.qBias += 0.40; break;
  }
  switch (config.headerType) {
    case "cast":
      tune.lowGain += 0.08; tune.highGain -= 0.08; break;
    case "shorty":
      tune.midGain += 0.05; break;
    case "fourtwoone":
      tune.lowGain += 0.08; tune.midGain += 0.08; tune.midFreq -= 20; break;
    case "fourone":
      tune.midGain += 0.10; tune.highGain += 0.16; tune.highFreq += 120; break;
    case "equal":
      tune.midGain += 0.06; tune.highGain += 0.10; tune.qBias += 0.18; break;
    case "unequal":
      tune.lowGain += 0.12; tune.midGain += 0.03; tune.highGain -= 0.06; tune.lowFreq -= 8; tune.midFreq -= 12; break;
  }
  if (config.induction === "turbo") {
    tune.highGain -= 0.05;
    tune.lowGain += 0.03;
  }
  return tune;
}

function getAudioProfile(config: SimConfig, rpm: number) {
  const layout = config.engineLayout;
  const liftBlend = config.liftSystem === "none" ? 0 : smoothStep(rpm, config.liftSwitchRpm - 400, config.liftSwitchRpm + 250);
  const profile = {
    subBias: 0,
    bodyBias: 0,
    bodyFilterOffset: 0,
    pulseFilterOffset: 0,
    pulseGainBias: 0,
    raspBias: 0,
    rumbleBias: 0,
    intakeBias: 0,
    whistleBias: 0,
    smoothness: 0.5,
    roughness: 0.12,
    warble: 0,
    mechanicalGain: 0.02,
    mechanicalFreq: 2600,
    mechanicalSharpness: 2.2,
    topTick: 0,
    lowBurble: 0,
  };

  switch (layout) {
    case "i3":
      profile.warble = 0.16; profile.roughness = 0.22; profile.pulseGainBias = 0.02; profile.raspBias = 0.01; break;
    case "i4":
      profile.smoothness = 0.4; profile.topTick = 0.04; break;
    case "i5":
      profile.warble = 0.32; profile.roughness = 0.18; profile.bodyBias = 0.01; break;
    case "i6":
      profile.smoothness = 0.84; profile.roughness = 0.05; profile.bodyBias = 0.03; profile.rumbleBias = 0.02; profile.raspBias = -0.01; break;
    case "flat4":
      profile.smoothness = 0.56; profile.roughness = 0.16; profile.bodyBias = 0.02; profile.bodyFilterOffset = -24; profile.lowBurble = 0.06; profile.warble = 0.10; break;
    case "flat6":
      profile.smoothness = 0.9; profile.roughness = 0.04; profile.bodyFilterOffset = -40; profile.intakeBias = 0.03; profile.topTick = 0.05; break;
    case "v4":
      profile.roughness = 0.2; profile.warble = 0.14; profile.lowBurble = 0.03; break;
    case "v6":
      profile.smoothness = 0.62; profile.roughness = 0.12; profile.lowBurble = 0.04; break;
    case "v8":
      if (config.v8Crank === "flatplane") {
        profile.smoothness = 0.62; profile.roughness = 0.1; profile.subBias = -0.02; profile.bodyFilterOffset = 30; profile.pulseFilterOffset = 120; profile.raspBias = 0.05; profile.topTick = 0.08; profile.warble = 0.08;
      } else {
        profile.smoothness = 0.34; profile.roughness = 0.2; profile.subBias = 0.05; profile.bodyBias = 0.04; profile.rumbleBias = 0.05; profile.lowBurble = 0.1; profile.warble = 0.18;
      }
      break;
    case "v10":
      profile.smoothness = 0.74; profile.roughness = 0.08; profile.bodyFilterOffset = 55; profile.raspBias = 0.06; profile.topTick = 0.08; profile.warble = 0.12; break;
    case "v12":
      profile.smoothness = 0.96; profile.roughness = 0.03; profile.bodyBias = 0.05; profile.raspBias = 0.02; profile.rumbleBias = 0.03; profile.topTick = 0.06; break;
  }

  switch (config.valvetrainLayout) {
    case "ohv":
      profile.mechanicalGain += 0.024; profile.mechanicalFreq = 1750; profile.mechanicalSharpness = 1.5; profile.lowBurble += 0.04; profile.topTick -= 0.02; break;
    case "sohc":
      profile.mechanicalGain += 0.012; profile.mechanicalFreq = 2250; profile.mechanicalSharpness = 1.9; break;
    case "dohc":
      profile.mechanicalGain += 0.01; profile.mechanicalFreq = 3200; profile.mechanicalSharpness = 2.8; profile.topTick += 0.04; break;
  }

  if (config.valvesPerCylinder <= 2) {
    profile.subBias += 0.03; profile.lowBurble += 0.03; profile.topTick -= 0.02;
  } else if (config.valvesPerCylinder >= 4) {
    profile.topTick += 0.03; profile.raspBias += 0.01;
  }

  if (config.intakeType === "itb") {
    profile.intakeBias += 0.08; profile.topTick += 0.03;
  } else if (config.intakeType === "variable") {
    profile.lowBurble += 0.02; profile.bodyBias += 0.02;
  }

  if (config.runnerLength === "long") profile.lowBurble += 0.02;
  if (config.runnerLength === "short") profile.intakeBias += 0.02;

  if (config.induction === "turbo") profile.whistleBias += config.turboArchitecture === "twinscroll" ? 0.04 : config.turboArchitecture === "single" ? 0 : 0.02;
  if (config.induction === "supercharger" && config.blowerType === "roots") profile.lowBurble += 0.03;
  if (config.induction === "supercharger" && config.blowerType === "centrifugal") profile.raspBias += 0.03;

  switch (config.exhaustType) {
    case "restrictive":
      profile.lowBurble += 0.03; profile.raspBias -= 0.02; break;
    case "performance":
      profile.raspBias += 0.03; profile.topTick += 0.02; break;
    case "race":
      profile.raspBias += 0.06; profile.topTick += 0.04; profile.lowBurble -= 0.02; break;
  }

  switch (config.headerType) {
    case "cast":
      profile.lowBurble += 0.02; break;
    case "fourtwoone":
      profile.lowBurble += 0.03; profile.bodyBias += 0.01; break;
    case "fourone":
      profile.topTick += 0.04; profile.raspBias += 0.02; break;
    case "equal":
      profile.smoothness += 0.04; profile.topTick += 0.02; break;
    case "unequal":
      profile.lowBurble += 0.05; profile.bodyBias += 0.02; profile.warble += 0.06; profile.smoothness -= 0.04; break;
  }

  profile.roughness = clamp(profile.roughness * (0.55 + config.soundTexture * 0.45), 0.02, 0.16);
  profile.topTick += config.soundTexture * 0.02;
  profile.topTick += liftBlend * (config.liftSystem === "aggressive" ? 0.1 : 0.05);
  profile.mechanicalGain += liftBlend * (config.liftSystem === "aggressive" ? 0.02 : 0.01);
  return profile;
}

const turboFamilies: Record<TurboFamily, { label: string; effPeak: number; prCap: number; spoolStart: number; spoolFull: number; topEndHold: number; whistleScale: number; lowRpmFactor: number }> = {
  small: { label: "Small / fast spool", effPeak: 0.74, prCap: 1.72, spoolStart: 1700, spoolFull: 3200, topEndHold: 0.93, whistleScale: 1.18, lowRpmFactor: 0.92 },
  medium: { label: "Medium road turbo", effPeak: 0.77, prCap: 1.88, spoolStart: 2500, spoolFull: 4500, topEndHold: 1.0, whistleScale: 1.0, lowRpmFactor: 0.8 },
  large: { label: "Large / laggier", effPeak: 0.79, prCap: 2.14, spoolStart: 3400, spoolFull: 6200, topEndHold: 1.1, whistleScale: 0.82, lowRpmFactor: 0.66 },
};

const blowerTypes: Record<BlowerType, { label: string; eff: number; dragScale: number; soundScale: number }> = {
  roots: { label: "Roots", eff: 0.58, dragScale: 1.12, soundScale: 0.95 },
  twinscrew: { label: "Twin-screw", eff: 0.68, dragScale: 0.92, soundScale: 1.05 },
  centrifugal: { label: "Centrifugal", eff: 0.72, dragScale: 0.72, soundScale: 1.15 },
};

const PRIVATE_AUDIO_SAMPLE_KEYS: PrivateSampleKey[] = ["v8Burble", "v10Edge", "v12Sweet", "dumpSharp", "flutter", "saabCrackle", "saabDump"];

const presets: EnginePreset[] = [
  {
    name: "Saabish turbo",
    group: "custom",
    config: { engineLayout: "i4", induction: "turbo", bore: 90, stroke: 90, compressionRatio: 9.2, v8Crank: "crossplane", turboFamily: "medium", wastegateBasePsi: 11, boostControl: 0.68, camAggression: 0.44, exhaustFlow: 0.55, redline: 7200, turboArchitecture: "single", turboBearing: "ball", turbineAR: "medium", intercoolerType: "large_fmic", icCoreSize: 0.82, chargeReleaseMode: "dump" },
  },
  {
    name: "B204R",
    group: "factory",
    config: { engineLayout: "i4", induction: "turbo", bore: 90, stroke: 78, compressionRatio: 9.2, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 10, boostControl: 0.25, camAggression: 0.32, exhaustFlow: 0.42, redline: 6500, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "sidemount", icCoreSize: 0.52, chargeReleaseMode: "recirc" },
  },
  {
    name: "B234R",
    group: "factory",
    config: { engineLayout: "i4", induction: "turbo", bore: 90, stroke: 90, compressionRatio: 9.25, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 11, boostControl: 0.28, camAggression: 0.34, exhaustFlow: 0.44, redline: 6200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "sidemount", icCoreSize: 0.56, chargeReleaseMode: "recirc" },
  },
  {
    name: "SR20DET",
    group: "factory",
    config: { engineLayout: "i4", induction: "turbo", bore: 86, stroke: 86, compressionRatio: 8.5, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 9, boostControl: 0.22, camAggression: 0.42, exhaustFlow: 0.46, redline: 7000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "sidemount", icCoreSize: 0.54, chargeReleaseMode: "recirc" },
  },
  {
    name: "1UZFE",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 87.5, stroke: 82.5, compressionRatio: 10.0, v8Crank: "crossplane", camAggression: 0.34, exhaustFlow: 0.46, redline: 6200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "variable", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal" },
  },
  {
    name: "M113 5.0",
    group: "factory",
    config: {
      applicationType: "car",
      engineLayout: "v8",
      induction: "na",
      bore: 97,
      stroke: 84,
      compressionRatio: 10,
      valvesPerCylinder: 3,
      valvetrainLayout: "sohc",
      v8Crank: "crossplane",
      vvtMode: "none",
      liftSystem: "none",
      liftSwitchRpm: 6200,
      intakeType: "plenum",
      runnerLength: "long",
      injectionType: "port",
      fuelType: "premium",
      exhaustType: "restrictive",
      headerType: "cast",
      frictionClass: "economy",
      camAggression: 0.18,
      exhaustFlow: 0.28,
      topEndFlowBias: 0.39,
      altitude: 0,
      ambientTemp: 20,
      humidity: 0.45,
      vehicleSpeedKph: 0,
      dynoRollerInertia: 85,
      dynoBrakeLoad: 26,
      redline: 6100,
      idleRpm: 900,
      turboFamily: "small",
      turboArchitecture: "single",
      turboBearing: "journal",
      turbineAR: "small",
      blowerType: "roots",
      boostControl: 0.2,
      boostOnsetBias: 0,
      boostTaperBias: 0,
      chargeReleaseMode: "recirc",
      antiSurge: 0.26,
      firingSoundMode: "stock",
      wastegateBasePsi: 12,
      superchargerDriveRatio: 2,
      scBoostCap: 10,
      intercoolerType: "water_air",
      icCoreSize: 0.82,
      engineLoudness: 1,
      turboLoudness: 0.52,
      superchargerLoudness: 0.88,
      soundTexture: 0.62,
      micPosition: "dyno_room",
      roomSize: 0.55,
      cinemaMode: true,
    },
  },
  {
    name: "2ZZ-GE",
    group: "factory",
    config: { engineLayout: "i4", induction: "na", bore: 82, stroke: 85, compressionRatio: 11.5, v8Crank: "crossplane", camAggression: 0.64, exhaustFlow: 0.56, redline: 8200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "aggressive", liftSwitchRpm: 6200, intakeType: "dualrunner", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal" },
  },
  {
    name: "2ZZ SC",
    group: "custom",
    config: { engineLayout: "i4", induction: "supercharger", blowerType: "roots", bore: 82, stroke: 85, compressionRatio: 11.0, v8Crank: "crossplane", camAggression: 0.66, exhaustFlow: 0.58, redline: 8000, superchargerDriveRatio: 1.8, scBoostCap: 9.5, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "aggressive", liftSwitchRpm: 6000, intakeType: "dualrunner", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal" },
  },
  {
    name: "G16E-GTS",
    group: "factory",
    config: { engineLayout: "i3", induction: "turbo", bore: 87.5, stroke: 89.7, compressionRatio: 10.5, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "ball", turbineAR: "medium", wastegateBasePsi: 18, boostControl: 0.18, camAggression: 0.44, exhaustFlow: 0.50, redline: 7200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "direct", fuelType: "premium", exhaustType: "performance", headerType: "cast", frictionClass: "performance", intercoolerType: "large_fmic", icCoreSize: 0.74, chargeReleaseMode: "recirc" },
  },
  {
    name: "2JZ-GTE",
    group: "factory",
    config: { engineLayout: "i6", induction: "turbo", bore: 86, stroke: 86, compressionRatio: 8.5, v8Crank: "crossplane", turboFamily: "medium", turboArchitecture: "sequential", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 11, boostControl: 0.18, camAggression: 0.38, exhaustFlow: 0.48, redline: 6800, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "large_fmic", icCoreSize: 0.72, chargeReleaseMode: "recirc" },
  },
  {
    name: "Ford Cologne V4",
    group: "factory",
    config: { engineLayout: "v4", induction: "na", bore: 93.7, stroke: 72.4, compressionRatio: 9.0, v8Crank: "crossplane", camAggression: 0.24, exhaustFlow: 0.34, redline: 5800, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "carb", fuelType: "regular", exhaustType: "restrictive", headerType: "cast", frictionClass: "economy" },
  },
  {
    name: "Viper V10",
    group: "factory",
    config: { engineLayout: "v10", induction: "na", bore: 103, stroke: 100.6, compressionRatio: 10.2, v8Crank: "crossplane", camAggression: 0.30, exhaustFlow: 0.48, redline: 6200, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal" },
  },
  {
    name: "M275 V12TT",
    group: "factory",
    config: { engineLayout: "v12", induction: "turbo", bore: 82, stroke: 87, compressionRatio: 9.0, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "small", wastegateBasePsi: 12, boostControl: 0.20, camAggression: 0.24, exhaustFlow: 0.40, redline: 6000, valvesPerCylinder: 3, valvetrainLayout: "sohc", vvtMode: "intake", liftSystem: "none", intakeType: "variable", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "water_air", icCoreSize: 0.82, chargeReleaseMode: "recirc" },
  },
  {
    name: "Volvo 5 pot",
    group: "factory",
    config: { engineLayout: "i5", induction: "turbo", bore: 83, stroke: 93.2, compressionRatio: 8.5, v8Crank: "crossplane", turboFamily: "medium", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 9, boostControl: 0.22, camAggression: 0.32, exhaustFlow: 0.44, redline: 6800, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "sidemount", icCoreSize: 0.56, chargeReleaseMode: "recirc", antiSurge: 0.18 },
  },
  {
    name: "Honda K20A",
    group: "factory",
    config: { engineLayout: "i4", induction: "na", bore: 86, stroke: 86, compressionRatio: 11.7, v8Crank: "crossplane", camAggression: 0.66, exhaustFlow: 0.60, redline: 8600, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "aggressive", liftSwitchRpm: 5800, intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "fourone", frictionClass: "performance" },
  },
  {
    name: "Honda F20C",
    group: "factory",
    config: { engineLayout: "i4", induction: "na", bore: 87, stroke: 84, compressionRatio: 11.7, v8Crank: "crossplane", camAggression: 0.78, exhaustFlow: 0.66, redline: 9000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "aggressive", liftSwitchRpm: 6000, intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "fourone", frictionClass: "performance" },
  },
  {
    name: "Audi 2.5 TFSI",
    group: "factory",
    config: { engineLayout: "i5", induction: "turbo", bore: 82.5, stroke: 92.8, compressionRatio: 10.0, v8Crank: "crossplane", turboFamily: "medium", turboArchitecture: "single", turboBearing: "ball", turbineAR: "medium", wastegateBasePsi: 18, boostControl: 0.18, camAggression: 0.44, exhaustFlow: 0.50, redline: 7000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "direct", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance", intercoolerType: "large_fmic", icCoreSize: 0.76, chargeReleaseMode: "recirc", antiSurge: 0.26 },
  },
  {
    name: "Ford Coyote 5.0",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 92.2, stroke: 92.7, compressionRatio: 12.0, v8Crank: "crossplane", camAggression: 0.56, exhaustFlow: 0.58, redline: 7600, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "variable", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance" },
  },
  {
    name: "LS7 7.0",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 104.8, stroke: 101.6, compressionRatio: 11.0, v8Crank: "crossplane", camAggression: 0.42, exhaustFlow: 0.54, redline: 7100, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "shorty", frictionClass: "performance" },
  },
  {
    name: "Ferrari 458 4.5",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 94, stroke: 81, compressionRatio: 12.5, v8Crank: "flatplane", camAggression: 0.86, exhaustFlow: 0.74, redline: 9000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "itb", runnerLength: "short", injectionType: "direct", fuelType: "premium", exhaustType: "race", headerType: "equal", frictionClass: "race" },
  },
  {
    name: "911 GT3 4.0",
    group: "factory",
    config: { engineLayout: "flat6", induction: "na", bore: 102, stroke: 81.5, compressionRatio: 13.3, v8Crank: "crossplane", camAggression: 0.86, exhaustFlow: 0.72, redline: 9000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "itb", runnerLength: "short", injectionType: "direct", fuelType: "premium", exhaustType: "race", headerType: "equal", frictionClass: "race" },
  },
  {
    name: "Ford Flathead V8",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 77.8, stroke: 95.3, compressionRatio: 6.8, v8Crank: "crossplane", camAggression: 0.08, exhaustFlow: 0.16, redline: 4200, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "carb", fuelType: "regular", exhaustType: "restrictive", headerType: "cast", frictionClass: "economy" },
  },
  {
    name: "Chevy Small-Block 350",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 101.6, stroke: 88.4, compressionRatio: 9.0, v8Crank: "crossplane", camAggression: 0.18, exhaustFlow: 0.28, redline: 5600, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "carb", fuelType: "regular", exhaustType: "street", headerType: "cast", frictionClass: "normal" },
  },
  {
    name: "426 Hemi",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 108, stroke: 95.3, compressionRatio: 10.3, v8Crank: "crossplane", camAggression: 0.28, exhaustFlow: 0.38, redline: 6200, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "carb", fuelType: "premium", exhaustType: "performance", headerType: "shorty", frictionClass: "normal" },
  },
  {
    name: "BMW M30B35",
    group: "factory",
    config: { engineLayout: "i6", induction: "na", bore: 92, stroke: 86, compressionRatio: 9.0, v8Crank: "crossplane", camAggression: 0.22, exhaustFlow: 0.34, redline: 6400, valvesPerCylinder: 2, valvetrainLayout: "sohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal" },
  },
  {
    name: "Alfa Busso 3.0",
    group: "factory",
    config: { engineLayout: "v6", induction: "na", bore: 93, stroke: 72.6, compressionRatio: 10.0, v8Crank: "crossplane", camAggression: 0.34, exhaustFlow: 0.40, redline: 7200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "variable", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance" },
  },
  {
    name: "Nissan RB26DETT",
    group: "factory",
    config: { engineLayout: "i6", induction: "turbo", bore: 86, stroke: 73.7, compressionRatio: 8.5, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "sequential", turboBearing: "journal", turbineAR: "small", wastegateBasePsi: 10, boostControl: 0.20, camAggression: 0.40, exhaustFlow: 0.48, redline: 8000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance", intercoolerType: "large_fmic", icCoreSize: 0.74, chargeReleaseMode: "recirc" },
  },
  {
    name: "Toyota 4A-GE 20V",
    group: "factory",
    config: { engineLayout: "i4", induction: "na", bore: 81, stroke: 77, compressionRatio: 11.0, v8Crank: "crossplane", camAggression: 0.54, exhaustFlow: 0.48, redline: 8200, valvesPerCylinder: 5, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "none", intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "fourone", frictionClass: "performance" },
  },
  {
    name: "Toyota 3S-GTE",
    group: "factory",
    config: { engineLayout: "i4", induction: "turbo", bore: 86, stroke: 86, compressionRatio: 8.5, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 11, boostControl: 0.20, camAggression: 0.34, exhaustFlow: 0.42, redline: 7000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "sidemount", icCoreSize: 0.58, chargeReleaseMode: "recirc" },
  },
  {
    name: "Mitsubishi 4G63T",
    group: "factory",
    config: { engineLayout: "i4", induction: "turbo", bore: 85, stroke: 88, compressionRatio: 8.8, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 11, boostControl: 0.22, camAggression: 0.38, exhaustFlow: 0.44, redline: 7500, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "cast", frictionClass: "normal", intercoolerType: "large_fmic", icCoreSize: 0.70, chargeReleaseMode: "recirc" },
  },
  {
    name: "Subaru EJ257",
    group: "factory",
    config: { engineLayout: "flat4", induction: "turbo", bore: 99.5, stroke: 79, compressionRatio: 8.2, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 11, boostControl: 0.18, camAggression: 0.34, exhaustFlow: 0.40, redline: 6700, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "unequal" },
  },
  {
    name: "Honda B16B",
    group: "factory",
    config: { engineLayout: "i4", induction: "na", bore: 81, stroke: 77.4, compressionRatio: 10.8, v8Crank: "crossplane", camAggression: 0.64, exhaustFlow: 0.56, redline: 8600, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "aggressive", liftSwitchRpm: 5800, intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "fourone", frictionClass: "performance" },
  },
  {
    name: "Honda K24A",
    group: "factory",
    config: { engineLayout: "i4", induction: "na", bore: 87, stroke: 99, compressionRatio: 11.0, v8Crank: "crossplane", camAggression: 0.40, exhaustFlow: 0.44, redline: 7600, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "mild", liftSwitchRpm: 5200, intakeType: "dualrunner", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "fourtwoone", frictionClass: "normal" },
  },
  {
    name: "BMW S54B32",
    group: "factory",
    config: { engineLayout: "i6", induction: "na", bore: 87, stroke: 91, compressionRatio: 11.5, v8Crank: "crossplane", camAggression: 0.66, exhaustFlow: 0.60, redline: 8000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance" },
  },
  {
    name: "BMW S65 4.0",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 92, stroke: 75.2, compressionRatio: 12.0, v8Crank: "flatplane", camAggression: 0.82, exhaustFlow: 0.70, redline: 8400, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "race", headerType: "equal", frictionClass: "race" },
  },
  {
    name: "BMW N54",
    group: "factory",
    config: { engineLayout: "i6", induction: "turbo", bore: 84, stroke: 89.6, compressionRatio: 10.2, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "sequential", turboBearing: "journal", turbineAR: "small", wastegateBasePsi: 8, boostControl: 0.18, camAggression: 0.30, exhaustFlow: 0.40, redline: 7000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "direct", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "large_fmic", icCoreSize: 0.68, chargeReleaseMode: "recirc" },
  },
  {
    name: "Nissan VG30DETT",
    group: "factory",
    config: { engineLayout: "v6", induction: "turbo", bore: 87, stroke: 83, compressionRatio: 8.5, v8Crank: "crossplane", turboFamily: "small", turboArchitecture: "sequential", turboBearing: "journal", turbineAR: "small", wastegateBasePsi: 9, boostControl: 0.18, camAggression: 0.36, exhaustFlow: 0.42, redline: 7000, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "small_fmic", icCoreSize: 0.62, chargeReleaseMode: "recirc" },
  },
  {
    name: "Buick 3800 SC",
    group: "factory",
    config: { engineLayout: "v6", induction: "supercharger", blowerType: "roots", bore: 96.5, stroke: 86.4, compressionRatio: 8.5, v8Crank: "crossplane", camAggression: 0.20, exhaustFlow: 0.28, redline: 6200, superchargerDriveRatio: 1.65, scBoostCap: 8.5, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "none" },
  },
  {
    name: "Porsche 930 3.3",
    group: "factory",
    config: { engineLayout: "flat6", induction: "turbo", bore: 97, stroke: 74.4, compressionRatio: 7.0, v8Crank: "crossplane", turboFamily: "medium", turboArchitecture: "single", turboBearing: "journal", turbineAR: "large", wastegateBasePsi: 10, boostControl: 0.14, camAggression: 0.28, exhaustFlow: 0.36, redline: 6700, valvesPerCylinder: 2, valvetrainLayout: "sohc", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "medium", injectionType: "tbi", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "sidemount", icCoreSize: 0.56, chargeReleaseMode: "none", antiSurge: 0.08 },
  },
  {
    name: "Ford Barra 4.0T",
    group: "factory",
    config: { engineLayout: "i6", induction: "turbo", bore: 92.3, stroke: 99.3, compressionRatio: 8.7, v8Crank: "crossplane", turboFamily: "medium", turboArchitecture: "single", turboBearing: "journal", turbineAR: "medium", wastegateBasePsi: 9, boostControl: 0.24, camAggression: 0.26, exhaustFlow: 0.38, redline: 6250, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "street", headerType: "cast", frictionClass: "normal", intercoolerType: "large_fmic", icCoreSize: 0.74, chargeReleaseMode: "recirc" },
  },
  {
    name: "Jaguar AJ133 5.0 SC",
    group: "factory",
    config: { engineLayout: "v8", induction: "supercharger", blowerType: "twinscrew", bore: 92.5, stroke: 93, compressionRatio: 9.5, v8Crank: "crossplane", camAggression: 0.42, exhaustFlow: 0.52, redline: 7000, superchargerDriveRatio: 1.75, scBoostCap: 11.5, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "variable", runnerLength: "medium", injectionType: "direct", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance", intercoolerType: "water_air", icCoreSize: 0.84 },
  },
  {
    name: "Lexus 2UR-GSE",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 94, stroke: 89.5, compressionRatio: 12.3, v8Crank: "crossplane", camAggression: 0.58, exhaustFlow: 0.60, redline: 7600, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "mild", liftSwitchRpm: 5600, intakeType: "itb", runnerLength: "short", injectionType: "dual", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance" },
  },
  {
    name: "Toyota 1LR-GUE",
    group: "factory",
    config: { engineLayout: "v10", induction: "na", bore: 88, stroke: 79, compressionRatio: 12.0, v8Crank: "crossplane", camAggression: 0.86, exhaustFlow: 0.78, redline: 9200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "itb", runnerLength: "short", injectionType: "port", fuelType: "premium", exhaustType: "race", headerType: "equal", frictionClass: "race" },
  },
  {
    name: "AMG M156 6.2",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 102.2, stroke: 94.6, compressionRatio: 11.3, v8Crank: "crossplane", camAggression: 0.46, exhaustFlow: 0.56, redline: 7200, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "intake", liftSystem: "none", intakeType: "variable", runnerLength: "medium", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "equal", frictionClass: "performance" },
  },
  {
    name: "Chevrolet LS3 6.2",
    group: "factory",
    config: { engineLayout: "v8", induction: "na", bore: 103.25, stroke: 92, compressionRatio: 10.7, v8Crank: "crossplane", camAggression: 0.30, exhaustFlow: 0.42, redline: 6600, valvesPerCylinder: 2, valvetrainLayout: "ohv", vvtMode: "none", liftSystem: "none", intakeType: "plenum", runnerLength: "long", injectionType: "port", fuelType: "premium", exhaustType: "performance", headerType: "shorty", frictionClass: "normal" },
  },
  {
    name: "McLaren M838T",
    group: "factory",
    config: { engineLayout: "v8", induction: "turbo", bore: 93, stroke: 69.9, compressionRatio: 8.7, v8Crank: "flatplane", turboFamily: "medium", turboArchitecture: "twinscroll", turboBearing: "ball", turbineAR: "medium", wastegateBasePsi: 12, boostControl: 0.24, camAggression: 0.62, exhaustFlow: 0.62, redline: 8500, valvesPerCylinder: 4, valvetrainLayout: "dohc", vvtMode: "dual", liftSystem: "none", intakeType: "plenum", runnerLength: "short", injectionType: "direct", fuelType: "premium", exhaustType: "race", headerType: "equal", frictionClass: "race", intercoolerType: "water_air", icCoreSize: 0.82, chargeReleaseMode: "recirc" },
  },
];

const defaultConfig: SimConfig = {
  applicationType: "car",
  engineLayout: "i4",
  induction: "turbo",
  bore: 90,
  stroke: 90,
  compressionRatio: 9.2,
  valvesPerCylinder: 4,
  valvetrainLayout: "dohc",
  v8Crank: "crossplane",
  vvtMode: "none",
  liftSystem: "none",
  liftSwitchRpm: 6200,
  intakeType: "plenum",
  runnerLength: "medium",
  injectionType: "port",
  fuelType: "premium",
  exhaustType: "street",
  headerType: "cast",
  frictionClass: "normal",
  camAggression: 0.44,
  exhaustFlow: 0.55,
  topEndFlowBias: 0.5,
  altitude: 0,
  ambientTemp: 20,
  humidity: 0.45,
  vehicleSpeedKph: 0,
  dynoRollerInertia: 85,
  dynoBrakeLoad: 26,
  redline: 7200,
  idleRpm: 900,
  turboFamily: "medium",
  turboArchitecture: "single",
  turboBearing: "journal",
  turbineAR: "medium",
  blowerType: "roots",
  boostControl: 0.68,
  boostOnsetBias: 0,
  boostTaperBias: 0,
  chargeReleaseMode: "recirc",
  antiSurge: 0.15,
  firingSoundMode: "stock",
  wastegateBasePsi: 11,
  superchargerDriveRatio: 2.0,
  scBoostCap: 10,
  intercoolerType: "small_fmic",
  icCoreSize: 0.76,
  engineLoudness: 1.0,
  turboLoudness: 0.52,
  superchargerLoudness: 0.88,
  soundTexture: 0.62,
  micPosition: "dyno_room",
  roomSize: 0.55,
  cinemaMode: true,
};

function sanitizeConfig(config: Partial<SimConfig>): SimConfig {
  return {
    ...defaultConfig,
    ...config,
    applicationType: "car",
    engineLayout: coerceOption(config.engineLayout, engineLayoutValues, defaultConfig.engineLayout),
    induction: coerceOption(config.induction, inductionValues, defaultConfig.induction),
    valvetrainLayout: coerceOption(config.valvetrainLayout, valvetrainValues, defaultConfig.valvetrainLayout),
    v8Crank: coerceOption(config.v8Crank, v8CrankValues, defaultConfig.v8Crank),
    vvtMode: coerceOption(config.vvtMode, vvtValues, defaultConfig.vvtMode),
    liftSystem: coerceOption(config.liftSystem, liftSystemValues, defaultConfig.liftSystem),
    intakeType: coerceOption(config.intakeType, intakeValues, defaultConfig.intakeType),
    runnerLength: coerceOption(config.runnerLength, runnerLengthValues, defaultConfig.runnerLength),
    injectionType: coerceOption(config.injectionType, injectionValues, defaultConfig.injectionType),
    fuelType: coerceOption(config.fuelType, fuelValues, defaultConfig.fuelType),
    exhaustType: coerceOption(config.exhaustType, exhaustValues, defaultConfig.exhaustType),
    headerType: coerceOption(config.headerType, headerValues, defaultConfig.headerType),
    frictionClass: coerceOption(config.frictionClass, frictionValues, defaultConfig.frictionClass),
    turboFamily: coerceOption(config.turboFamily, turboFamilyValues, defaultConfig.turboFamily),
    turboArchitecture: coerceOption(config.turboArchitecture, turboArchitectureValues, defaultConfig.turboArchitecture),
    turboBearing: coerceOption(config.turboBearing, turboBearingValues, defaultConfig.turboBearing),
    turbineAR: coerceOption(config.turbineAR, turbineArValues, defaultConfig.turbineAR),
    blowerType: coerceOption(config.blowerType, blowerValues, defaultConfig.blowerType),
    chargeReleaseMode: coerceOption(config.chargeReleaseMode, chargeReleaseValues, defaultConfig.chargeReleaseMode),
    firingSoundMode: coerceOption(config.firingSoundMode, firingModeValues, defaultConfig.firingSoundMode),
    intercoolerType: coerceOption(config.intercoolerType, intercoolerValues, defaultConfig.intercoolerType),
    micPosition: coerceOption(config.micPosition, micValues, defaultConfig.micPosition),
    valvesPerCylinder: [2, 3, 4, 5].includes(config.valvesPerCylinder as number) ? (config.valvesPerCylinder as 2 | 3 | 4 | 5) : defaultConfig.valvesPerCylinder,
    cinemaMode: typeof config.cinemaMode === "boolean" ? config.cinemaMode : defaultConfig.cinemaMode,
  };
}

function sanitizePreset(preset: unknown): EnginePreset | null {
  if (!preset || typeof preset !== "object") return null;
  const candidate = preset as Partial<EnginePreset> & { config?: Partial<SimConfig> };
  if (typeof candidate.name !== "string" || !candidate.name.trim() || !candidate.config) return null;
  return {
    name: candidate.name.trim(),
    group: "saved",
    config: sanitizeConfig(candidate.config),
  };
}

const defaultRuntime: RuntimeState = { rpm: 820, throttle: 0, afr: 13.1, ignitionDeg: 24 };

const UI = {
  page: "min-h-screen bg-[radial-gradient(circle_at_top,#0d1b38_0%,#081327_35%,#040913_100%)] text-slate-100 p-4 md:p-6",
  card: "rounded-3xl border border-slate-700/80 bg-slate-950/90 shadow-[0_20px_70px_rgba(0,0,0,0.45)]",
  softCard: "rounded-2xl border border-slate-700/70 bg-slate-900/85 shadow-lg",
  title: "text-xl text-slate-50",
  tabWrap: "grid grid-cols-5 gap-2",
  tabButton: "flex min-h-[42px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-center text-xs sm:text-sm text-slate-300 transition hover:bg-slate-800 hover:text-slate-100",
  tabButtonActive: "border-blue-300/60 bg-blue-400 text-slate-950 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]",
  select: "rounded-2xl border-slate-700 bg-slate-900 text-slate-100",
  buttonPrimary: "rounded-2xl border border-blue-300/25 bg-blue-400 text-slate-950 hover:bg-blue-300 font-semibold",
  buttonSecondary: "rounded-2xl border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 font-medium",
  buttonOutline: "rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 font-medium",
};

const diagnosticMetricMeta: Record<DiagnosticMetricKey, { label: string; color: string; formatter: (v: number) => string }> = {
  vePct: { label: "VE %", color: "#a78bfa", formatter: (v) => `${fmt(v, 0)} %` },
  mapKpa: { label: "MAP kPa", color: "#f59e0b", formatter: (v) => `${fmt(v, 0)} kPa` },
  chargeTempC: { label: "Charge temp", color: "#fb7185", formatter: (v) => `${fmt(v, 1)} °C` },
  airLbMin: { label: "Airflow", color: "#22c55e", formatter: (v) => `${fmt(v, 1)} lb/min` },
  injectorCc: { label: "Injector", color: "#38bdf8", formatter: (v) => `${fmt(v, 0)} cc/min` },
  compressorEffPct: { label: "Compressor eff", color: "#f97316", formatter: (v) => `${fmt(v, 1)} %` },
  densityRatio: { label: "Density ratio", color: "#eab308", formatter: (v) => fmt(v, 2) },
  bmepPsi: { label: "BMEP", color: "#f43f5e", formatter: (v) => `${fmt(v, 0)} psi` },
  targetAfr: { label: "Target AFR", color: "#14b8a6", formatter: (v) => fmt(v, 2) },
  pr: { label: "Pressure ratio", color: "#60a5fa", formatter: (v) => fmt(v, 2) },
  eventHz: { label: "Fire events", color: "#c084fc", formatter: (v) => `${fmt(v, 1)} Hz` },
};

const storageKey = "engine-sim-user-presets";
const engineLayoutValues = ["i3", "i4", "i5", "i6", "v4", "v6", "flat4", "flat6", "v8", "v10", "v12"] as const;
const inductionValues = ["na", "turbo", "supercharger"] as const;
const valvetrainValues = ["ohv", "sohc", "dohc"] as const;
const v8CrankValues = ["crossplane", "flatplane"] as const;
const vvtValues = ["none", "intake", "dual"] as const;
const liftSystemValues = ["none", "mild", "aggressive"] as const;
const intakeValues = ["plenum", "variable", "dualrunner", "itb"] as const;
const runnerLengthValues = ["long", "medium", "short"] as const;
const injectionValues = ["carb", "tbi", "port", "direct", "dual"] as const;
const fuelValues = ["regular", "premium", "e30", "e85", "race"] as const;
const exhaustValues = ["restrictive", "street", "performance", "race"] as const;
const headerValues = ["cast", "shorty", "fourtwoone", "fourone", "equal", "unequal"] as const;
const frictionValues = ["economy", "normal", "performance", "race"] as const;
const turboFamilyValues = ["small", "medium", "large"] as const;
const turboArchitectureValues = ["single", "twinscroll", "sequential", "vgt"] as const;
const turboBearingValues = ["journal", "ball"] as const;
const turbineArValues = ["small", "medium", "large"] as const;
const blowerValues = ["roots", "twinscrew", "centrifugal"] as const;
const chargeReleaseValues = ["none", "recirc", "dump"] as const;
const firingModeValues = ["stock", "even", "crossplane_i4", "bigbang_i4", "cp3_triple", "bigbang_v4", "oddfire_v6", "lopey_v8"] as const;
const intercoolerValues = ["none", "sidemount", "small_fmic", "large_fmic", "water_air"] as const;
const micValues = ["dyno_room", "cockpit", "engine_bay", "intake_side", "rear_exhaust"] as const;

function coerceOption<T extends string>(value: unknown, options: readonly T[], fallback: T) {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}


function atmosphere(altitudeM: number, ambientC: number, humidity: number) {
  const T = ambientC + KELVIN;
  const T0 = 288.15;
  const p0 = 101325;
  const lapse = 0.0065;
  const p = p0 * Math.pow(1 - (lapse * altitudeM) / T0, 5.25588);
  const sat = 610.78 * Math.exp((17.2694 * ambientC) / (ambientC + 237.3));
  const pv = humidity * sat;
  const pd = Math.max(1000, p - pv);
  const rho = pd / (287.05 * T) + pv / (461.495 * T);
  return { pressurePa: p, pressurePsi: p * PA_TO_PSI, density: rho, tempK: T };
}

function displacementLitres(boreMm: number, strokeMm: number, cylinders: number) {
  const boreM = boreMm / 1000;
  const strokeM = strokeMm / 1000;
  return (Math.PI / 4) * boreM * boreM * strokeM * cylinders * 1000;
}

function squareBias(boreMm: number, strokeMm: number) {
  const ratio = boreMm / Math.max(strokeMm, 1);
  return { oversquare: ratio > 1.06, undersquare: ratio < 0.94, ratio };
}

function valvetrainCeiling(config: SimConfig) {
  const shape = squareBias(config.bore, config.stroke);
  const hw = getHardwareState(config, config.liftSwitchRpm + 250);
  const flowBiasRpm = (config.topEndFlowBias - 0.5) * 1700;
  if (config.induction === "na") {
    return 5850 + config.camAggression * 2250 + flowBiasRpm + hw.rpmCeilingAdj + (shape.oversquare ? 380 : 0) - (shape.undersquare ? 200 : 0);
  }
  if (config.induction === "supercharger") {
    return 5550 + config.camAggression * 1850 + flowBiasRpm + hw.rpmCeilingAdj + (config.blowerType === "centrifugal" ? 380 : 0);
  }
  return 5700 + config.camAggression * 2000 + flowBiasRpm + hw.rpmCeilingAdj + (config.turboFamily === "large" ? 320 : config.turboFamily === "small" ? -120 : 0) + (shape.oversquare ? 240 : 0);
}

function estimateVE(config: SimConfig, rpm: number, mapKpa: number, dispL: number) {
  const shape = squareBias(config.bore, config.stroke);
  const hw = getHardwareState(config, rpm);
  const isLargeNa = config.induction === "na" && dispL >= 3.8;

  const peakRpm = ((config.induction === "na"
    ? 3700 + config.camAggression * 1780 + (shape.oversquare ? 340 : 0) - (shape.undersquare ? 280 : 0) - (dispL >= 4 ? 180 : 0)
    : config.turboFamily === "small"
      ? 3300 + config.camAggression * 1000
      : config.turboFamily === "medium"
        ? 4000 + config.camAggression * 1100
        : 5000 + config.camAggression * 900) + hw.peakRpmShift);

  const width = ((config.induction === "na"
    ? 2900 - config.camAggression * 150 + (shape.undersquare ? 240 : 0) + (dispL >= 4 ? 220 : 0)
    : config.turboFamily === "large" ? 2350 : 2050) * hw.veWidthMult);

  let basePeak: number;
  if (config.induction === "na") {
    basePeak = 0.97 + config.compressionRatio * 0.006 + config.camAggression * 0.095 + config.exhaustFlow * 0.055 + (shape.oversquare ? 0.02 : 0) + (dispL >= 4 ? 0.03 : 0) + hw.vePeakAdj + hw.exhaustAdj;
  } else if (config.induction === "supercharger") {
    basePeak = 0.93 + config.compressionRatio * 0.004 + config.camAggression * 0.08 + config.exhaustFlow * 0.05 + hw.vePeakAdj + hw.exhaustAdj;
  } else {
    basePeak = 0.91 + config.compressionRatio * 0.004 + config.exhaustFlow * 0.10 + config.camAggression * 0.08 + (config.turboFamily === "large" ? 0.02 : 0) + hw.vePeakAdj + hw.exhaustAdj;
  }

  const rpmShape = Math.exp(-Math.pow((rpm - peakRpm) / Math.max(width, 900), 2));
  const lowFloor = ((config.induction === "na"
    ? clamp(0.69 + (dispL >= 4 ? 0.08 : 0) + (shape.undersquare ? 0.03 : 0), 0.65, 0.85)
    : turboFamilies[config.turboFamily].lowRpmFactor) + hw.lowFloorAdj);
  const veBase = lowFloor + (basePeak - lowFloor) * rpmShape;

  const loadFactor = config.induction === "na"
    ? clamp(0.86 + (mapKpa - 30) / 92, 0.72, isLargeNa ? 1.06 : 1.04)
    : config.induction === "supercharger"
      ? clamp(0.83 + (mapKpa - 50) / 175, 0.73, 1.05)
      : clamp(0.82 + (mapKpa - 60) / 180, 0.72, 1.06);

  const sizeFactor = dispL > 4 ? 1.01 : dispL < 2 ? 1.02 : 1.0;
  return clamp(veBase * loadFactor * sizeFactor, 0.40, 1.16);
}

function estimateFrictionTorque(config: SimConfig, rpm: number, dispL: number, cylinders: number) {
  const hw = getHardwareState(config, rpm);
  return (4 + dispL * 1.8 + cylinders * 0.4 + rpm * 0.0015 + rpm * rpm * 0.0000001) * hw.frictionScale;
}

function mbtTimingAdvance(rpm: number, mapKpa: number) {
  const lowLoad = 34 - smoothStep(rpm, 2600, 7000) * 9;
  const highLoad = 19 - smoothStep(rpm, 2600, 7000) * 9;
  return lerp(lowLoad, highLoad, clamp((mapKpa - 40) / 180, 0, 1));
}

function timingEfficiency(actual: number, mbt: number) {
  const diff = Math.max(0, mbt - actual);
  return clamp(1 - diff * 0.012, 0.82, 1.0);
}

function torqueEfficiencyFromAFR(afr: number, targetAfr: number) {
  const delta = Math.abs(afr - targetAfr);
  return clamp(1 - delta * 0.028, 0.86, 1.0);
}

function fuelTargetAfr(induction: InductionType, load: number) {
  return induction === "na" ? lerp(14.7, 12.9, load) : lerp(14.7, 11.8, load);
}

function compressorEfficiency(pr: number, family: TurboFamily) {
  const fam = turboFamilies[family];
  const prCenter = family === "small" ? 1.5 : family === "medium" ? 1.72 : 2.0;
  const prPenalty = Math.pow((pr - prCenter) / 0.42, 2);
  return clamp(fam.effPeak - 0.08 * prPenalty, 0.58, fam.effPeak);
}

function intercoolerEffectiveness(type: IntercoolerType, coreSize: number, vehicleSpeedKph: number) {
  const flowFactor = 0.34 + 0.66 * smoothStep(vehicleSpeedKph, 0, 120);
  const typeBase = type === "none" ? 0 : type === "sidemount" ? 0.53 : type === "small_fmic" ? 0.61 : type === "large_fmic" ? 0.72 : 0.78;
  const speedBias = type === "water_air" ? 0.05 : 0;
  return type === "none" ? 0 : clamp(typeBase + coreSize * 0.18 + flowFactor * 0.10 + speedBias, 0.45, 0.93);
}

function pressureDropAcrossIC(type: IntercoolerType, boostPsi: number, coreSize: number) {
  if (type === "none") return 0;
  const typeScale = type === "sidemount" ? 1.0 : type === "small_fmic" ? 1.08 : type === "large_fmic" ? 1.22 : 0.72;
  return clamp((0.20 + Math.pow(Math.max(boostPsi, 0) / 18, 1.0) * (0.90 - coreSize * 0.45)) * typeScale, 0.10, 2.2);
}

function injectorCcMinForPower(hp: number, bsfc: number, cylinders: number, duty: number) {
  const fuelLbHr = hp * bsfc;
  const perInjectorLbHr = fuelLbHr / (cylinders * Math.max(duty, 0.3));
  return perInjectorLbHr * 10.5;
}

function superchargerPressureRatio(type: BlowerType, driveRatio: number, rpm: number, throttle: number, capPsi: number) {
  const capPR = 1 + capPsi / 14.7;
  const speedShape = type === "centrifugal" ? Math.pow(clamp(rpm / 7000, 0, 1.2), 1.7) : 0.44 + 0.56 * clamp(rpm / 6500, 0, 1.1);
  const pr = 1 + (capPR - 1) * speedShape * (0.22 + 0.78 * throttle) * clamp(driveRatio / 2.2, 0.45, 1.5);
  return clamp(pr, 1, capPR);
}

function getHardwareState(config: SimConfig, rpm: number) {
  const liftBlend = config.liftSystem === "none" ? 0 : smoothStep(rpm, config.liftSwitchRpm - 450, config.liftSwitchRpm + 250) * (config.liftSystem === "mild" ? 0.55 : 1.0);

  const hw = {
    vePeakAdj: 0,
    veWidthMult: 1,
    lowFloorAdj: 0,
    peakRpmShift: 0,
    rpmCeilingAdj: 0,
    torquePerAirAdj: 0,
    timingBonus: 0,
    chargeTempRelief: 0,
    spoolStartAdj: 0,
    spoolFullAdj: 0,
    topEndHoldAdj: 0,
    compressorEffAdj: 0,
    lowTorqueBmepAdj: 0,
    frictionScale: 1,
    exhaustAdj: 0,
  };

  switch (config.valvesPerCylinder) {
    case 2:
      hw.vePeakAdj -= 0.055; hw.lowFloorAdj += 0.09; hw.lowTorqueBmepAdj += 15; hw.peakRpmShift -= 380; hw.rpmCeilingAdj -= 650; break;
    case 3:
      hw.vePeakAdj -= 0.02; hw.lowFloorAdj += 0.04; hw.lowTorqueBmepAdj += 7; hw.peakRpmShift -= 160; hw.rpmCeilingAdj -= 180; break;
    case 4:
      hw.vePeakAdj += 0.015; hw.rpmCeilingAdj += 120; break;
    case 5:
      hw.vePeakAdj += 0.03; hw.lowFloorAdj -= 0.015; hw.peakRpmShift += 180; hw.rpmCeilingAdj += 260; break;
  }

  switch (config.valvetrainLayout) {
    case "ohv":
      hw.lowTorqueBmepAdj += 16; hw.vePeakAdj -= 0.03; hw.peakRpmShift -= 260; hw.rpmCeilingAdj -= 520; hw.frictionScale *= 1.05; break;
    case "sohc":
      hw.lowTorqueBmepAdj += 6; hw.peakRpmShift -= 80; hw.rpmCeilingAdj -= 120; break;
    case "dohc":
      hw.vePeakAdj += 0.02; hw.peakRpmShift += 120; hw.rpmCeilingAdj += 260; break;
  }

  switch (config.vvtMode) {
    case "intake":
      hw.lowFloorAdj += 0.035; hw.veWidthMult *= 1.08; hw.lowTorqueBmepAdj += 10; hw.timingBonus += 0.7; break;
    case "dual":
      hw.lowFloorAdj += 0.06; hw.veWidthMult *= 1.14; hw.lowTorqueBmepAdj += 16; hw.timingBonus += 1.4; hw.peakRpmShift += 70; break;
  }

  if (config.liftSystem !== "none") {
    hw.vePeakAdj += liftBlend * (config.liftSystem === "mild" ? 0.025 : 0.055);
    hw.peakRpmShift += liftBlend * (config.liftSystem === "mild" ? 180 : 360);
    hw.rpmCeilingAdj += liftBlend * (config.liftSystem === "mild" ? 180 : 320);
    hw.lowFloorAdj -= (1 - liftBlend) * (config.liftSystem === "mild" ? 0.008 : 0.018);
  }

  switch (config.intakeType) {
    case "variable":
      hw.lowTorqueBmepAdj += 14; hw.lowFloorAdj += 0.04; hw.veWidthMult *= 1.10; break;
    case "dualrunner":
      hw.lowTorqueBmepAdj += 10; hw.lowFloorAdj += 0.025; hw.veWidthMult *= 1.07; break;
    case "itb":
      hw.vePeakAdj += 0.03; hw.lowFloorAdj -= 0.015; hw.peakRpmShift += 220; hw.rpmCeilingAdj += 120; break;
  }

  switch (config.runnerLength) {
    case "long":
      hw.lowTorqueBmepAdj += 10; hw.lowFloorAdj += 0.04; hw.peakRpmShift -= 220; break;
    case "short":
      hw.lowTorqueBmepAdj -= 4; hw.lowFloorAdj -= 0.02; hw.vePeakAdj += 0.02; hw.peakRpmShift += 220; break;
  }

  switch (config.injectionType) {
    case "carb":
      hw.lowFloorAdj -= 0.03; hw.timingBonus -= 1.6; hw.chargeTempRelief -= 0.02; break;
    case "tbi":
      hw.lowFloorAdj -= 0.015; hw.timingBonus -= 0.8; break;
    case "direct":
      hw.timingBonus += 1.6; hw.chargeTempRelief += 0.05; hw.lowTorqueBmepAdj += 3; break;
    case "dual":
      hw.timingBonus += 2.1; hw.chargeTempRelief += 0.07; hw.lowTorqueBmepAdj += 4; hw.vePeakAdj += 0.01; break;
  }

  switch (config.fuelType) {
    case "regular":
      hw.timingBonus -= 2.0; break;
    case "e30":
      hw.timingBonus += 1.1; hw.chargeTempRelief += 0.04; break;
    case "e85":
      hw.timingBonus += 3.0; hw.chargeTempRelief += 0.10; break;
    case "race":
      hw.timingBonus += 4.0; hw.chargeTempRelief += 0.06; hw.vePeakAdj += 0.01; break;
  }

  switch (config.exhaustType) {
    case "restrictive":
      hw.exhaustAdj -= 0.05; hw.topEndHoldAdj -= 0.04; break;
    case "performance":
      hw.exhaustAdj += 0.03; hw.topEndHoldAdj += 0.02; break;
    case "race":
      hw.exhaustAdj += 0.06; hw.topEndHoldAdj += 0.05; hw.lowTorqueBmepAdj -= 2; break;
  }

  switch (config.headerType) {
    case "shorty":
      hw.lowTorqueBmepAdj += 4; break;
    case "fourtwoone":
      hw.lowTorqueBmepAdj += 8; hw.veWidthMult *= 1.04; break;
    case "fourone":
      hw.vePeakAdj += 0.02; hw.peakRpmShift += 240; hw.lowTorqueBmepAdj -= 4; break;
    case "equal":
      hw.vePeakAdj += 0.02; hw.lowTorqueBmepAdj += 4; hw.exhaustAdj += 0.01; break;
    case "unequal":
      hw.lowTorqueBmepAdj += 6; hw.vePeakAdj -= 0.01; hw.veWidthMult *= 1.02; hw.exhaustAdj -= 0.005; break;
  }

  switch (config.frictionClass) {
    case "economy": hw.frictionScale *= 1.08; break;
    case "performance": hw.frictionScale *= 0.96; break;
    case "race": hw.frictionScale *= 0.92; break;
  }

  if (config.induction === "turbo") {
    switch (config.turboArchitecture) {
      case "twinscroll": hw.spoolStartAdj -= 240; hw.spoolFullAdj -= 330; hw.lowTorqueBmepAdj += 10; hw.compressorEffAdj += 0.01; break;
      case "sequential": hw.spoolStartAdj -= 420; hw.spoolFullAdj -= 560; hw.lowTorqueBmepAdj += 14; hw.topEndHoldAdj -= 0.02; break;
      case "vgt": hw.spoolStartAdj -= 300; hw.spoolFullAdj -= 420; hw.lowTorqueBmepAdj += 9; hw.compressorEffAdj += 0.015; hw.topEndHoldAdj += 0.03; break;
    }
    if (config.turboBearing === "ball") {
      hw.spoolStartAdj -= 120; hw.spoolFullAdj -= 180;
    }
    switch (config.turbineAR) {
      case "small": hw.spoolStartAdj -= 260; hw.spoolFullAdj -= 340; hw.lowTorqueBmepAdj += 8; hw.topEndHoldAdj -= 0.05; break;
      case "large": hw.spoolStartAdj += 240; hw.spoolFullAdj += 340; hw.lowTorqueBmepAdj -= 6; hw.topEndHoldAdj += 0.06; break;
    }
  }

  return hw;
}

function estimateBrakeTorqueFloor(config: SimConfig, rpm: number, throttle: number, dispL: number, boostPsi: number) {
  const dispCID = dispL * 61.0237;
  const shape = squareBias(config.bore, config.stroke);
  const fullLoad = smoothStep(throttle, 0.45, 1.0);

  const displacementBonus = dispL >= 4 ? 18 : dispL >= 3 ? 10 : dispL >= 2.2 ? 4 : 0;
  const layoutBonus = getLayoutTorqueBonus(config.engineLayout);
  const strokeBonus = shape.undersquare ? 8 : 0;
  const compressionBonus = (config.compressionRatio - 9) * 4;
  const camPenalty = config.camAggression * 10;
  const exhaustBonus = config.exhaustFlow * 5;

  const hw = getHardwareState(config, rpm);
  let targetBmep = 148 + displacementBonus + layoutBonus + strokeBonus + compressionBonus - camPenalty + exhaustBonus + hw.lowTorqueBmepAdj;

  let floorPeakRpm = 2800 + config.camAggression * 700 + (shape.oversquare ? 150 : 0) - (shape.undersquare ? 180 : 0) - (dispL >= 4 ? 250 : 0);
  let lowAnchor = 0.78 + (dispL >= 4 ? 0.06 : 0) + (config.engineLayout === "v8" ? 0.05 : 0) + (shape.undersquare ? 0.03 : 0);
  let shoulderDrop = 0.18;
  let torqueShape = 1;

  if (config.induction === "turbo") {
    const fam = turboFamilies[config.turboFamily];
    const onsetShift = config.boostOnsetBias;
    const spoolStart = Math.max(1200, fam.spoolStart + onsetShift + hw.spoolStartAdj);
    const spoolFull = Math.max(spoolStart + 400, fam.spoolFull + onsetShift + hw.spoolFullAdj);
    const targetBoost = config.wastegateBasePsi + config.boostControl * (config.turboFamily === "small" ? 6 : config.turboFamily === "medium" ? 10 : 14);
    const boostProxy = clamp(Math.max(boostPsi, targetBoost * smoothStep(rpm, spoolStart - 450, spoolFull + 250) * 0.88) / Math.max(targetBoost, 1), 0, 1.1);
    const boostBmepGain = 10.5 + (config.turboFamily === "small" ? 2.0 : config.turboFamily === "medium" ? 1.0 : 0.2);
    targetBmep += boostProxy * targetBoost * boostBmepGain + config.boostControl * 28;

    floorPeakRpm = clamp(spoolFull + (config.turboFamily === "small" ? 180 : config.turboFamily === "medium" ? 260 : 360) + config.boostTaperBias * 180, 2200, Math.min(config.redline - 900, 5600));
    lowAnchor = config.turboFamily === "small" ? 0.58 : config.turboFamily === "medium" ? 0.46 : 0.34;
    shoulderDrop = config.turboFamily === "large" ? 0.10 : 0.13;

    const rpmRise = smoothStep(rpm, 1000, floorPeakRpm);
    const chargeRise = smoothStep(boostProxy, 0.05, 0.96);
    const combinedRise = clamp(rpmRise * 0.50 + chargeRise * 0.50, 0, 1);
    const easedRise = 1 - Math.pow(1 - combinedRise, 1.45);
    const shoulder = 1 - smoothStep(rpm, floorPeakRpm + 350, floorPeakRpm + 1850) * shoulderDrop;
    torqueShape = (lowAnchor + (1 - lowAnchor) * easedRise) * shoulder;
  } else if (config.induction === "supercharger") {
    targetBmep += boostPsi * 10.0 + config.superchargerDriveRatio * 8;
    floorPeakRpm = 3000 + (config.blowerType === "centrifugal" ? 650 : 0);
    lowAnchor = 0.72;
    shoulderDrop = 0.14;
    const rise = smoothStep(rpm, 900, Math.max(1800, floorPeakRpm - 350));
    const shoulder = 1 - smoothStep(rpm, floorPeakRpm + 300, floorPeakRpm + 1900) * shoulderDrop;
    torqueShape = (lowAnchor + (1 - lowAnchor) * rise) * shoulder;
  } else {
    floorPeakRpm = clamp(floorPeakRpm, 1800, 5200);
    const phase1End = Math.max(1500, floorPeakRpm - 1100);
    const phase2Start = Math.max(1600, floorPeakRpm - 850);
    const phase2End = floorPeakRpm + 150;
    const rise1 = smoothStep(rpm, 900, phase1End);
    const rise2 = smoothStep(rpm, phase2Start, phase2End);
    const shapedRise = lowAnchor + (0.92 - lowAnchor) * rise1 + (1 - 0.92) * rise2;
    const shoulder = 1 - smoothStep(rpm, floorPeakRpm + 350, floorPeakRpm + 2100) * shoulderDrop;
    torqueShape = shapedRise * shoulder;
  }

  const brakeTorque = (targetBmep * dispCID / 150.8) * torqueShape * fullLoad;
  return Math.max(0, brakeTorque);
}

function solvePoint(config: SimConfig, runtime: RuntimeState): SolvePoint {
  const engine = engineLayouts[config.engineLayout];
  const atm = atmosphere(config.altitude, config.ambientTemp, config.humidity);
  const dispL = displacementLitres(config.bore, config.stroke, engine.cylinders);
  const dispM3 = dispL / 1000;
  const throttle = clamp(runtime.throttle, 0, 1);
  const rpm = clamp(runtime.rpm, resolveIdleRpm(config), config.redline);
  const hw = getHardwareState(config, rpm);

  let boostPsi = 0;
  let pr = 1;
  let compressorEff = 1;
  let preIcTempK = atm.tempK;
  let driveLossHp = 0;
  let shaftSignal = 0;

  if (config.induction === "turbo") {
    const fam = turboFamilies[config.turboFamily];
    const onsetShift = config.boostOnsetBias;
    const spoolStart = Math.max(1200, fam.spoolStart + onsetShift + hw.spoolStartAdj);
    const spoolFull = Math.max(spoolStart + 400, fam.spoolFull + onsetShift + hw.spoolFullAdj);
    const spool = smoothStep(rpm, spoolStart, spoolFull);
    const wgLimit = config.wastegateBasePsi + config.boostControl * (config.turboFamily === "small" ? 6 : config.turboFamily === "medium" ? 10 : 14);
    const naturalBoostTarget = wgLimit * spool * (0.20 + 0.80 * Math.pow(throttle, 0.86));
    const holdBias = config.boostTaperBias * 0.45;
    const topEndHold = 1 + smoothStep(rpm, spoolFull, config.redline - 200) * ((fam.topEndHold + holdBias + hw.topEndHoldAdj) - 1);
    boostPsi = naturalBoostTarget * Math.max(0.78, topEndHold);
    pr = (atm.pressurePsi + boostPsi) / atm.pressurePsi;
    compressorEff = compressorEfficiency(pr, config.turboFamily) + hw.compressorEffAdj;
    preIcTempK = atm.tempK * (1 + (Math.pow(pr, (GAMMA_AIR - 1) / GAMMA_AIR) - 1) / compressorEff);
    shaftSignal = spool;
  }

  if (config.induction === "supercharger") {
    pr = superchargerPressureRatio(config.blowerType, config.superchargerDriveRatio, rpm, throttle, config.scBoostCap);
    boostPsi = Math.max(0, (pr - 1) * atm.pressurePsi);
    compressorEff = blowerTypes[config.blowerType].eff;
    preIcTempK = atm.tempK * (1 + (Math.pow(pr, (GAMMA_AIR - 1) / GAMMA_AIR) - 1) / compressorEff);
    driveLossHp = boostPsi * blowerTypes[config.blowerType].dragScale * 1.28;
    shaftSignal = clamp((rpm / config.redline) * config.superchargerDriveRatio * 0.6, 0, 1.4);
  }

  const vacuumMapKpa = lerp(26, atm.pressurePa / 1000 - 2, Math.pow(throttle, 0.60));
  const boostedMapKpa = (atm.pressurePsi + boostPsi) / PA_TO_PSI / 1000;
  const mapKpaRaw = config.induction === "na" ? vacuumMapKpa : lerp(vacuumMapKpa, boostedMapKpa, Math.pow(throttle, 0.76));

  const icEff = intercoolerEffectiveness(config.intercoolerType, config.icCoreSize, config.vehicleSpeedKph);
  const icDropPsi = pressureDropAcrossIC(config.intercoolerType, boostPsi, config.icCoreSize);
  const postIcTempK = config.induction === "na" ? atm.tempK : atm.tempK + (preIcTempK - atm.tempK) * (1 - icEff);
  const chargeTempK = postIcTempK;
  const mapKpa = Math.max(25, mapKpaRaw - (config.induction === "na" ? 0 : icDropPsi * 6.894757));

  const ve = estimateVE(config, rpm, mapKpa, dispL);
  const cyclesPerSec = rpm / 120;
  const airMassKgS = dispM3 * cyclesPerSec * ve * (mapKpa * 1000) / (R_AIR * chargeTempK);
  const airLbMin = airMassKgS * 132.277;
  const load = clamp((mapKpa - 30) / 170, 0, 1);
  const targetAfr = fuelTargetAfr(config.induction, load);
  const timingEff = timingEfficiency(runtime.ignitionDeg + hw.timingBonus, mbtTimingAdvance(rpm, mapKpa));
  const afrEff = torqueEfficiencyFromAFR(runtime.afr, targetAfr);
  const chargeTempPenalty = clamp(1 - Math.max(0, chargeTempK - 323) * (0.0013 - hw.chargeTempRelief * 0.0005), 0.84, 1.0);

  const layoutTorqueBias = config.engineLayout === "i3" ? 0.10 : config.engineLayout === "v4" ? 0.12 : config.engineLayout === "flat4" ? 0.18 : config.engineLayout === "flat6" ? 0.24 : 0;
  const torquePerAir = (config.induction === "na" ? 9.5 : config.induction === "supercharger" ? 8.7 : 7.35) + hw.torquePerAirAdj + layoutTorqueBias;
  const valveLimit = valvetrainCeiling(config);
  const dispShift = dispL >= 2.2 ? -500 : dispL <= 1.8 ? 100 : 0;
  const tqPeak = config.induction === "na"
    ? 3500 + config.camAggression * 1500 + (config.bore > config.stroke ? 300 : 0)
    : config.turboFamily === "small"
      ? 2400 + dispShift
      : config.turboFamily === "medium"
        ? 3200 + dispShift
        : 4300 + dispShift;

  const lowRpmFactor = config.induction === "na"
    ? (() => {
        const bigNaBonus = dispL >= 4 ? 0.18 : dispL >= 3 ? 0.08 : 0;
        const v8Bonus = getLayoutLowEndBonus(config.engineLayout);
        const undersquareBonus = config.stroke > config.bore ? 0.06 : 0;
        const lowStart = clamp(0.73 + bigNaBonus + v8Bonus + undersquareBonus, 0.71, 1.04);
        return lerp(lowStart, 1.0, smoothStep(rpm, 1000, 2900));
      })()
    : config.turboFamily === "small"
      ? lerp(0.82, 1.0, smoothStep(rpm, 1500, 2600))
      : config.turboFamily === "medium"
        ? lerp(0.62, 1.0, smoothStep(rpm, 1900, 3400))
        : lerp(0.38, 1.0, smoothStep(rpm, 2800, 4800));

  const topEndBias = config.topEndFlowBias - 0.5;
  const softDropStart = Math.max(tqPeak + 150, valveLimit - (1200 + topEndBias * 600));
  const softDropPenaltyBase = config.induction === "na" ? 0.15 + (1 - config.camAggression) * 0.08 : config.turboFamily === "small" ? 0.28 : config.turboFamily === "medium" ? 0.20 : 0.12;
  const softDropPenalty = Math.max(0.05, softDropPenaltyBase * (1 - topEndBias * 0.45) * (1 - config.boostTaperBias * 0.10));
  const hardDropPenalty = Math.max(0.16, (config.induction === "na" ? 0.56 : 0.48) * (1 - topEndBias * 0.35));
  const softDrop = 1 - smoothStep(rpm, softDropStart, valveLimit) * softDropPenalty;
  const hardDrop = 1 - smoothStep(rpm, valveLimit, valveLimit + 1400) * hardDropPenalty;
  const highRpmTorqueFactor = Math.max(0.18, softDrop * hardDrop);

  const naLowEndAssist = config.induction === "na"
    ? 1 + (0.03 + (dispL >= 4 ? 0.12 : dispL >= 3 ? 0.06 : 0) + getLayoutLowEndBonus(config.engineLayout) * 0.7 + (config.stroke > config.bore ? 0.04 : 0)) * (1 - smoothStep(rpm, 3600, 5500))
    : 1;

  let grossTorqueLbFt = airLbMin * torquePerAir * timingEff * afrEff * chargeTempPenalty * lowRpmFactor * highRpmTorqueFactor * naLowEndAssist;
  if (config.induction === "turbo") grossTorqueLbFt *= clamp(0.96 + boostPsi / 40, 0.96, 1.18);
  if (config.induction === "supercharger") grossTorqueLbFt *= clamp(0.94 + boostPsi / 34, 0.94, 1.16);

  const netTorqueLbFt = Math.max(0, grossTorqueLbFt - estimateFrictionTorque(config, rpm, dispL, engine.cylinders));
  const rawBrakeHp = Math.max(0, netTorqueLbFt * rpm / 5252 - driveLossHp);
  const rawTorqueLbFt = rpm > 0 ? rawBrakeHp * 5252 / rpm : 0;

  const torqueFloorLbFt = estimateBrakeTorqueFloor(config, rpm, throttle, dispL, boostPsi);
  const floorPeakRpm = config.induction === "na"
    ? clamp(2800 + config.camAggression * 700 + (dispL >= 4 ? -250 : 0) + (config.stroke > config.bore ? -180 : 0), 1800, 5000)
    : config.induction === "turbo"
      ? (() => {
          const fam = turboFamilies[config.turboFamily];
          const spoolStart = Math.max(1200, fam.spoolStart + config.boostOnsetBias);
          const spoolFull = Math.max(spoolStart + 400, fam.spoolFull + config.boostOnsetBias);
          return clamp(spoolFull + (config.turboFamily === "small" ? 180 : config.turboFamily === "medium" ? 260 : 360) + config.boostTaperBias * 180, 2200, Math.min(config.redline - 900, 5600));
        })()
      : clamp(3000 + (config.blowerType === "centrifugal" ? 650 : 0), 2000, 5200);
  const torqueFloorBlend = config.induction === "turbo"
    ? (1 - smoothStep(rpm, floorPeakRpm + 250, floorPeakRpm + 1550))
    : (1 - smoothStep(rpm, floorPeakRpm + 100, floorPeakRpm + 1700));
  const supportTarget = rawTorqueLbFt * (1 - torqueFloorBlend) + torqueFloorLbFt * torqueFloorBlend;
  const softness = config.induction === "na" ? 10 : 12;
  const finalTorqueLbFt = 0.5 * (rawTorqueLbFt + supportTarget + Math.sqrt((rawTorqueLbFt - supportTarget) ** 2 + softness ** 2));
  const brakeHp = rpm > 0 ? finalTorqueLbFt * rpm / 5252 : 0;
  const bmepPsi = dispL > 0 ? (150.8 * finalTorqueLbFt) / (dispL * 61.0237) : 0;
  const bsfc = config.induction === "na" ? 0.50 : 0.56;
  const injectorCc = injectorCcMinForPower(brakeHp, bsfc, engine.cylinders, 0.85);
  const densityRatio = (mapKpa * 1000 / chargeTempK) / (atm.pressurePa / atm.tempK);
  const cfm = airLbMin * 13.5;
  const eventHz = (rpm / 60) * engine.firingFactor;

  return {
    rpm,
    dispL,
    mapKpa,
    boostPsi,
    pr,
    compressorEff,
    chargeTempC: chargeTempK - KELVIN,
    densityRatio,
    ve,
    airLbMin,
    cfm,
    brakeHp,
    torqueLbFt: finalTorqueLbFt,
    bmepPsi,
    injectorCc,
    targetAfr,
    shaftSignal,
    valveLimit,
    eventHz,
  };
}

function isotonicFit(values: number[], increasing = true) {
  const source = increasing ? [...values] : [...values].map((v) => -v);
  const blocks = source.map((v) => ({ sum: v, count: 1 }));

  for (let i = 0; i < blocks.length - 1;) {
    const a = blocks[i].sum / blocks[i].count;
    const b = blocks[i + 1].sum / blocks[i + 1].count;
    if (a <= b) {
      i += 1;
      continue;
    }
    blocks[i] = { sum: blocks[i].sum + blocks[i + 1].sum, count: blocks[i].count + blocks[i + 1].count };
    blocks.splice(i + 1, 1);
    if (i > 0) i -= 1;
  }

  const fitted: number[] = [];
  for (const block of blocks) {
    const value = block.sum / block.count;
    for (let i = 0; i < block.count; i += 1) fitted.push(increasing ? value : -value);
  }
  return fitted;
}

function smoothSeries(values: number[]) {
  return values.map((value, i) => {
    const a = values[Math.max(0, i - 2)];
    const b = values[Math.max(0, i - 1)];
    const c = value;
    const d = values[Math.min(values.length - 1, i + 1)];
    const e = values[Math.min(values.length - 1, i + 2)];
    return a * 0.08 + b * 0.22 + c * 0.40 + d * 0.22 + e * 0.08;
  });
}

function projectUnimodal(values: number[]) {
  const n = values.length;
  const rawPeak = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
  let bestFit = [...values];
  let bestError = Number.POSITIVE_INFINITY;

  for (let peak = 2; peak < n - 2; peak += 1) {
    const rising = isotonicFit(values.slice(0, peak + 1), true);
    const falling = isotonicFit(values.slice(peak), false);
    const fit = [...rising.slice(0, -1), ...falling];
    let error = Math.abs(peak - rawPeak) * 8;
    for (let i = 0; i < n; i += 1) {
      const diff = fit[i] - values[i];
      error += diff * diff;
    }
    if (error < bestError) {
      bestError = error;
      bestFit = fit;
    }
  }

  return bestFit;
}

function argMaxIndex(values: number[]) {
  return values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
}

function shapeTurboTorqueFromBoost(rows: SweepRow[], torqueValues: number[], boostValues: number[]) {
  const peakBoostIndex = argMaxIndex(boostValues);
  const peakTorqueIndex = argMaxIndex(torqueValues);
  const riseEndIndex = Math.max(peakBoostIndex, Math.min(rows.length - 3, peakTorqueIndex));
  const maxBoost = Math.max(...boostValues, 0.1);
  const startTorque = torqueValues[0];
  const targetPeakTorque = Math.max(...torqueValues.slice(Math.max(0, riseEndIndex - 2), Math.min(rows.length, riseEndIndex + 3)));
  const shaped = [...torqueValues];

  for (let i = 1; i <= riseEndIndex; i += 1) {
    const rpmNorm = smoothStep(rows[i].rpm, rows[0].rpm + 250, rows[riseEndIndex].rpm);
    const boostNorm = clamp(boostValues[i] / maxBoost, 0, 1);
    const supportShape = clamp(0.28 * rpmNorm + 0.72 * Math.pow(boostNorm, 0.82), 0, 1);
    const desiredTorque = lerp(startTorque, targetPeakTorque, supportShape);
    shaped[i] = Math.max(shaped[i], desiredTorque);

    const boostStillBuilding = boostValues[i] >= boostValues[i - 1] - 0.15;
    if (boostStillBuilding && shaped[i] < shaped[i - 1] - 1.5) {
      shaped[i] = shaped[i - 1] - 1.5;
    }
  }

  return smoothSeries(shaped);
}

function buildDynoSweep(config: SimConfig) {
  const rows: SweepRow[] = [];
  for (let rpm = Math.max(1200, resolveIdleRpm(config)); rpm <= config.redline; rpm += 100) {
    rows.push(solvePoint(config, { rpm, throttle: 1, afr: config.induction === "na" ? 12.9 : 11.8, ignitionDeg: 24 }));
  }

  let torqueInput = smoothSeries(rows.map((row) => row.torqueLbFt));
  const boostInput = smoothSeries(rows.map((row) => row.boostPsi));

  if (config.induction === "turbo") {
    torqueInput = shapeTurboTorqueFromBoost(rows, torqueInput, boostInput);
  }

  const torqueShaped = projectUnimodal(torqueInput);

  return rows.map((row, i) => ({
    ...row,
    torqueLbFt: torqueShaped[i],
    boostPsi: boostInput[i],
    brakeHp: torqueShaped[i] * row.rpm / 5252,
  }));
}

function createProceduralSampleBuffer(ctx: AudioContext, key: PrivateSampleKey) {
  const spec: Record<PrivateSampleKey, { duration: number; build: (data: Float32Array, sr: number) => void }> = {
    v8Burble: {
      duration: 0.22,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 10);
          const phase = 2 * Math.PI * (52 * t + 0.5 * 22 * t * t);
          data[i] = (Math.sin(phase) * 0.8 + Math.sin(phase * 0.51) * 0.45 + (Math.random() * 2 - 1) * 0.12) * env;
        }
      },
    },
    v10Edge: {
      duration: 0.18,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 16);
          const base = Math.sin(2 * Math.PI * (480 + t * 1400) * t) * 0.55;
          const buzz = Math.sin(2 * Math.PI * (920 + t * 1800) * t) * 0.25;
          data[i] = (base + buzz + (Math.random() * 2 - 1) * 0.08) * env;
        }
      },
    },
    v12Sweet: {
      duration: 0.26,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 9);
          const a = Math.sin(2 * Math.PI * 160 * t) * 0.45;
          const b = Math.sin(2 * Math.PI * 320 * t) * 0.20;
          const c = Math.sin(2 * Math.PI * 620 * t) * 0.08;
          data[i] = (a + b + c) * env;
        }
      },
    },
    dumpSharp: {
      duration: 0.14,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 26);
          data[i] = (Math.random() * 2 - 1) * env * 0.85;
        }
      },
    },
    flutter: {
      duration: 0.16,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 18);
          const burst = Math.sin(2 * Math.PI * (1200 + Math.sin(t * 90) * 400) * t) * 0.35;
          const noise = (Math.random() * 2 - 1) * 0.24;
          data[i] = (burst + noise) * env * (0.5 + 0.5 * Math.sin(t * 180));
        }
      },
    },
    saabCrackle: {
      duration: 0.12,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 30);
          data[i] = ((Math.random() * 2 - 1) * 0.8 + Math.sin(2 * Math.PI * 420 * t) * 0.25) * env;
        }
      },
    },
    saabDump: {
      duration: 0.18,
      build: (data, sr) => {
        for (let i = 0; i < data.length; i += 1) {
          const t = i / sr;
          const env = Math.exp(-t * 18);
          const whoosh = (Math.random() * 2 - 1) * 0.52;
          const tone = Math.sin(2 * Math.PI * (700 - t * 900) * t) * 0.16;
          data[i] = (whoosh + tone) * env;
        }
      },
    },
  };

  const sample = spec[key];
  const buffer = ctx.createBuffer(1, Math.floor(sample.duration * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  sample.build(data, ctx.sampleRate);
  return buffer;
}

function useEngineAudio(config: SimConfig, point: SolvePoint, enabled: boolean, throttle: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<any>(null);
  const stateRef = useRef({ config, point, throttle });
  const schedulerRef = useRef<number | null>(null);
  const lastThrottleRef = useRef(throttle);
  const lastBoostRef = useRef(0);
  const lastPopTimeRef = useRef(0);
  const lastLimiterTimeRef = useRef(0);
  const lastReleaseTimeRef = useRef(0);
  const lastSampleTimesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    stateRef.current = { config, point, throttle };
  }, [config, point, throttle]);

  useEffect(() => {
    return () => {
      if (schedulerRef.current) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      if (ctxRef.current) {
        ctxRef.current.close();
        ctxRef.current = null;
      }
    };
  }, []);

  const ensureAudio = async () => {
    if (ctxRef.current && nodesRef.current) {
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const makeDriveCurve = (amount = 1.8) => {
      const samples = 2048;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i += 1) {
        const x = (i * 2) / samples - 1;
        curve[i] = Math.tanh(x * amount);
      }
      return curve;
    };

    const makeNoiseBuffer = (seconds = 2) => {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return buffer;
    };

    const makeCombustionBuffer = () => {
      const duration = 0.05;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const t = i / ctx.sampleRate;
        const env = Math.exp(-t * 75);
        const body = Math.sin(2 * Math.PI * (70 + t * 90) * t) * 0.6;
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 110) * 0.5;
        data[i] = (body + crack) * env;
      }
      return buffer;
    };

    const createResonatorBank = (freqs: number[], qs: number[], gains: number[], destination: AudioNode) => {
      const input = ctx.createGain();
      const filters = freqs.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq;
        filter.Q.value = qs[i] ?? 1;
        const gain = ctx.createGain();
        gain.gain.value = gains[i] ?? 0.1;
        input.connect(filter);
        filter.connect(gain).connect(destination);
        return { filter, gain };
      });
      return { input, filters };
    };

    const master = ctx.createGain();
    master.gain.value = 0.001;
    const drive = ctx.createWaveShaper();
    drive.curve = makeDriveCurve(2.2);
    drive.oversample = "4x";
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 16;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.09;
    const micHp = ctx.createBiquadFilter();
    micHp.type = "highpass";
    micHp.frequency.value = 35;
    const micLp = ctx.createBiquadFilter();
    micLp.type = "lowpass";
    micLp.frequency.value = 9000;
    const roomDelay = ctx.createDelay(0.3);
    roomDelay.delayTime.value = 0.08;
    const roomFeedback = ctx.createGain();
    roomFeedback.gain.value = 0.16;
    const roomSend = ctx.createGain();
    roomSend.gain.value = 0.001;
    const roomReturn = ctx.createGain();
    roomReturn.gain.value = 0.001;

    drive.connect(comp).connect(micHp).connect(micLp).connect(master).connect(ctx.destination);
    drive.connect(roomSend).connect(roomDelay).connect(roomFeedback).connect(roomDelay);
    roomDelay.connect(roomReturn).connect(master);

    const exhaustBus = ctx.createGain();
    const intakeBus = ctx.createGain();
    const blockBus = ctx.createGain();
    const airBus = ctx.createGain();
    const fxBus = ctx.createGain();
    exhaustBus.connect(drive);
    intakeBus.connect(drive);
    blockBus.connect(drive);
    airBus.connect(drive);
    fxBus.connect(drive);

    const exhaustRes = createResonatorBank([95, 240, 620], [1.0, 1.6, 2.4], [0.34, 0.26, 0.16], exhaustBus);
    const intakeRes = createResonatorBank([340, 760], [1.1, 2.2], [0.18, 0.14], intakeBus);
    const blockRes = createResonatorBank([180, 1350, 2900], [0.9, 2.0, 3.0], [0.16, 0.08, 0.05], blockBus);

    const noiseBuffer = makeNoiseBuffer();
    const combustionBuffer = makeCombustionBuffer();

    const makeNoiseLayer = (type: BiquadFilterType, freq: number, q: number, bus: AudioNode) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter).connect(gain).connect(bus);
      src.start();
      return { src, filter, gain };
    };

    const turboHiss = makeNoiseLayer("bandpass", 2400, 1.9, airBus);
    const intakeWind = makeNoiseLayer("bandpass", 780, 0.9, intakeBus);
    const mechBed = makeNoiseLayer("bandpass", 2500, 2.2, blockBus);

    const turboOsc = ctx.createOscillator();
    turboOsc.type = "sine";
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0.0001;
    turboOsc.connect(turboGain).connect(airBus);
    turboOsc.start();

    const blowerOsc = ctx.createOscillator();
    blowerOsc.type = "sawtooth";
    const blowerFilter = ctx.createBiquadFilter();
    blowerFilter.type = "lowpass";
    const blowerGain = ctx.createGain();
    blowerGain.gain.value = 0.0001;
    blowerOsc.connect(blowerFilter).connect(blowerGain).connect(airBus);
    blowerOsc.start();

    const exhaustFundOsc = ctx.createOscillator();
    exhaustFundOsc.type = "sawtooth";
    const exhaustFundGain = ctx.createGain();
    exhaustFundGain.gain.value = 0.0001;
    exhaustFundOsc.connect(exhaustFundGain).connect(exhaustRes.input);
    exhaustFundOsc.start();

    const exhaustPulseOsc = ctx.createOscillator();
    exhaustPulseOsc.type = "square";
    const exhaustPulseGain = ctx.createGain();
    exhaustPulseGain.gain.value = 0.0001;
    exhaustPulseOsc.connect(exhaustPulseGain).connect(exhaustRes.input);
    exhaustPulseOsc.start();

    const intakeToneOsc = ctx.createOscillator();
    intakeToneOsc.type = "triangle";
    const intakeToneGain = ctx.createGain();
    intakeToneGain.gain.value = 0.0001;
    intakeToneOsc.connect(intakeToneGain).connect(intakeRes.input);
    intakeToneOsc.start();

    const blockToneOsc = ctx.createOscillator();
    blockToneOsc.type = "sine";
    const blockToneGain = ctx.createGain();
    blockToneGain.gain.value = 0.0001;
    blockToneOsc.connect(blockToneGain).connect(blockRes.input);
    blockToneOsc.start();

    const sampleBuffers = Object.fromEntries(PRIVATE_AUDIO_SAMPLE_KEYS.map((key) => [key, createProceduralSampleBuffer(ctx, key)]));

    ctxRef.current = ctx;
    nodesRef.current = {
      ctx,
      master,
      micHp,
      micLp,
      roomSend,
      roomReturn,
      exhaustRes,
      intakeRes,
      blockRes,
      turboHiss,
      intakeWind,
      mechBed,
      turboOsc,
      turboGain,
      blowerOsc,
      blowerFilter,
      blowerGain,
      exhaustFundOsc,
      exhaustFundGain,
      exhaustPulseOsc,
      exhaustPulseGain,
      intakeToneOsc,
      intakeToneGain,
      blockToneOsc,
      blockToneGain,
      noiseBuffer,
      fxBus,
      sampleBuffers,
    };
  };

  const getFiringPattern = (layout: EngineLayout, v8Crank: V8CrankType, firingMode: FiringSoundMode) => {
    const normalize = (vals: number[]) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return vals.map((v) => v / avg);
    };
    switch (layout) {
      case "i3":
        if (firingMode === "cp3_triple") return normalize([0.62, 1.46, 0.92]);
        if (firingMode === "even") return normalize([1, 1, 1]);
        return normalize([1.08, 0.92, 1.0]);
      case "i4":
        if (firingMode === "crossplane_i4") return normalize([0.56, 1.44, 0.56, 1.44]);
        if (firingMode === "bigbang_i4") return normalize([0.42, 0.42, 1.58, 1.58]);
        if (firingMode === "even") return normalize([1, 1, 1, 1]);
        return normalize([1, 1, 1, 1]);
      case "i5": return normalize([0.88, 1.12, 0.94, 1.06, 1.0]);
      case "v4":
        if (firingMode === "bigbang_v4") return normalize([0.46, 0.54, 1.42, 1.58]);
        if (firingMode === "even") return normalize([1, 1, 1, 1]);
        return normalize([0.92, 1.08, 0.96, 1.04]);
      case "v6":
        if (firingMode === "oddfire_v6") return normalize([0.76, 1.24, 0.76, 1.24, 0.76, 1.24]);
        if (firingMode === "even") return normalize([1, 1, 1, 1, 1, 1]);
        return normalize([1.02, 0.98, 1.0, 1.02, 0.98, 1.0]);
      case "flat4":
        return normalize([0.94, 1.06, 0.94, 1.06]);
      case "flat6": return normalize([1, 1, 1, 1, 1, 1]);
      case "v8":
        if (firingMode === "lopey_v8") return v8Crank === "flatplane" ? normalize([1.18, 0.82, 1.18, 0.82, 1.18, 0.82, 1.18, 0.82]) : normalize([0.24, 1.76, 0.60, 1.40, 0.24, 1.76, 0.60, 1.40]);
        return v8Crank === "flatplane" ? normalize([1, 1, 1, 1, 1, 1, 1, 1]) : normalize([0.36, 1.64, 0.70, 1.30, 0.36, 1.64, 0.70, 1.30]);
      case "v10": return normalize([0.94, 1.06, 0.98, 1.02, 1.0, 0.94, 1.06, 0.98, 1.02, 1.0]);
      case "v12": return normalize([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      default: return [1, 1, 1, 1];
    }
  };

  const getMicProfile = (micPosition: MicPosition) => {
    switch (micPosition) {
      case "cockpit":
        return { hp: 80, lp: 4200, room: 0.08, exhaust: 0.72, intake: 0.35, block: 0.45, air: 0.30 };
      case "engine_bay":
        return { hp: 55, lp: 7200, room: 0.04, exhaust: 0.78, intake: 0.72, block: 0.82, air: 0.50 };
      case "intake_side":
        return { hp: 70, lp: 6800, room: 0.03, exhaust: 0.55, intake: 0.95, block: 0.55, air: 0.58 };
      case "rear_exhaust":
        return { hp: 42, lp: 7600, room: 0.05, exhaust: 1.0, intake: 0.22, block: 0.40, air: 0.24 };
      default:
        return { hp: 48, lp: 8200, room: 0.13, exhaust: 0.92, intake: 0.42, block: 0.58, air: 0.36 };
    }
  };

  useEffect(() => {
    if (!enabled) {
      if (schedulerRef.current) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
      if (nodesRef.current && ctxRef.current) {
        nodesRef.current.master.gain.setTargetAtTime(0.001, ctxRef.current.currentTime, 0.03);
        window.setTimeout(() => {
          void ctxRef.current?.suspend();
        }, 120);
      }
      return;
    }

    if (!ctxRef.current || !nodesRef.current) return;
    const ctx = ctxRef.current;
    const nodes = nodesRef.current;
    nodes.master.gain.setTargetAtTime(stateRef.current.config.cinemaMode ? 0.74 : 0.60, ctx.currentTime, 0.08);

    const updateEngineAudio = () => {
      const localCtx = ctxRef.current;
      const localNodes = nodesRef.current;
      if (!localCtx || !localNodes) return;

      const s = stateRef.current;
      const localConfig = s.config;
      const localPoint = s.point;
      const localThrottle = s.throttle;
      const engine = engineLayouts[localConfig.engineLayout];
      const profile = getAudioProfile(localConfig, localPoint.rpm);
      const mic = getMicProfile(localConfig.micPosition);
      const load = clamp((localPoint.mapKpa - 30) / 170, 0, 1);
      const layoutWeight = getLayoutAudioWeight(localConfig.engineLayout);
      const samples = localNodes.sampleBuffers || {};

      const canTriggerSample = (key: string, now: number, minGap: number) => {
        const last = lastSampleTimesRef.current[key] ?? -999;
        if (now - last < minGap) return false;
        lastSampleTimesRef.current[key] = now;
        return true;
      };

      const triggerSample = (
        key: PrivateSampleKey,
        time: number,
        {
          gain = 0.02,
          rate = 1,
          filterType,
          filterFreq,
          q = 1.2,
        }: {
          gain?: number;
          rate?: number;
          filterType?: BiquadFilterType;
          filterFreq?: number;
          q?: number;
        } = {}
      ) => {
        const buffer = samples[key] as AudioBuffer | undefined;
        if (!buffer) return;
        const src = localCtx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.setValueAtTime(rate, time);
        const outGain = localCtx.createGain();
        outGain.gain.setValueAtTime(0.0001, time);
        outGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.01);
        outGain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.08, buffer.duration / Math.max(rate, 0.1)));
        if (filterType && filterFreq) {
          const filter = localCtx.createBiquadFilter();
          filter.type = filterType;
          filter.frequency.setValueAtTime(filterFreq, time);
          filter.Q.setValueAtTime(q, time);
          src.connect(filter).connect(outGain).connect(localNodes.fxBus);
        } else {
          src.connect(outGain).connect(localNodes.fxBus);
        }
        src.start(time);
        src.stop(time + Math.max(0.1, buffer.duration / Math.max(rate, 0.1) + 0.02));
      };

      localNodes.micHp.frequency.setTargetAtTime(mic.hp, localCtx.currentTime, 0.05);
      localNodes.micLp.frequency.setTargetAtTime(mic.lp, localCtx.currentTime, 0.05);
      localNodes.roomSend.gain.setTargetAtTime(mic.room * (0.35 + localConfig.roomSize * 1.1), localCtx.currentTime, 0.08);

      const exhaustTuning = getExhaustAudioTuning(localConfig);
      const exhaustGainScale = mic.exhaust * (1.15 + localConfig.engineLoudness * 0.75);
      const intakeGainScale = mic.intake * (0.72 + localConfig.engineLoudness * 0.18);
      const blockGainScale = mic.block * (0.82 + localConfig.engineLoudness * 0.24);
      const turboLoudnessScale = 0.45 + Math.pow(localConfig.turboLoudness + 0.04, 1.22) * 2.2;
      const releaseGainScale = turboLoudnessScale * clamp(0.8 + localPoint.boostPsi * 0.055, 0.8, 2.1);

      localNodes.exhaustRes.filters[0].filter.frequency.setTargetAtTime(85 + localPoint.dispL * 12 + profile.lowBurble * 40 + exhaustTuning.lowFreq, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[1].filter.frequency.setTargetAtTime(220 + localPoint.rpm * 0.03 + profile.bodyFilterOffset * 0.4 + exhaustTuning.midFreq, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[2].filter.frequency.setTargetAtTime(520 + localPoint.rpm * 0.07 + profile.topTick * 850 + exhaustTuning.highFreq, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[0].filter.Q.setTargetAtTime(1.0 + exhaustTuning.qBias, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[1].filter.Q.setTargetAtTime(1.6 + exhaustTuning.qBias, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[2].filter.Q.setTargetAtTime(2.4 + exhaustTuning.qBias, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[0].gain.gain.setTargetAtTime((0.44 + profile.lowBurble * 0.22) * exhaustGainScale * exhaustTuning.lowGain, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[1].gain.gain.setTargetAtTime((0.32 + profile.bodyBias * 0.45) * exhaustGainScale * exhaustTuning.midGain, localCtx.currentTime, 0.04);
      localNodes.exhaustRes.filters[2].gain.gain.setTargetAtTime((0.18 + profile.raspBias * 0.34 + profile.topTick * 0.22) * exhaustGainScale * exhaustTuning.highGain, localCtx.currentTime, 0.04);

      localNodes.intakeRes.filters[0].filter.frequency.setTargetAtTime(300 + localPoint.rpm * 0.06 + profile.intakeBias * 500, localCtx.currentTime, 0.05);
      localNodes.intakeRes.filters[1].filter.frequency.setTargetAtTime(720 + localPoint.rpm * 0.10 + profile.topTick * 450, localCtx.currentTime, 0.05);
      localNodes.intakeRes.filters[0].gain.gain.setTargetAtTime((0.16 + profile.intakeBias * 0.35) * intakeGainScale, localCtx.currentTime, 0.05);
      localNodes.intakeRes.filters[1].gain.gain.setTargetAtTime((0.12 + profile.topTick * 0.14) * intakeGainScale, localCtx.currentTime, 0.05);

      localNodes.blockRes.filters[0].filter.frequency.setTargetAtTime(150 + localPoint.dispL * 10, localCtx.currentTime, 0.05);
      localNodes.blockRes.filters[1].filter.frequency.setTargetAtTime(profile.mechanicalFreq * 0.6, localCtx.currentTime, 0.05);
      localNodes.blockRes.filters[2].filter.frequency.setTargetAtTime(profile.mechanicalFreq + localPoint.rpm * 0.05, localCtx.currentTime, 0.05);
      localNodes.blockRes.filters[0].gain.gain.setTargetAtTime((0.12 + profile.subBias * 0.25) * blockGainScale, localCtx.currentTime, 0.05);
      localNodes.blockRes.filters[1].gain.gain.setTargetAtTime((0.06 + profile.mechanicalGain * 0.6) * blockGainScale, localCtx.currentTime, 0.05);
      localNodes.blockRes.filters[2].gain.gain.setTargetAtTime((0.04 + profile.topTick * 0.18) * blockGainScale, localCtx.currentTime, 0.05);

      localNodes.turboHiss.filter.frequency.setTargetAtTime(1900 + localPoint.boostPsi * 90 + localPoint.shaftSignal * 950, localCtx.currentTime, 0.05);
      localNodes.turboHiss.gain.gain.setTargetAtTime(localConfig.induction === "turbo" ? (0.00012 + localPoint.boostPsi * 0.0018 + localPoint.shaftSignal * 0.0085) * mic.air * turboLoudnessScale * (0.22 + localThrottle * 0.95) : 0.00001, localCtx.currentTime, 0.05);
      localNodes.intakeWind.filter.frequency.setTargetAtTime(640 + localPoint.rpm * 0.09 + profile.intakeBias * 600, localCtx.currentTime, 0.05);
      localNodes.intakeWind.gain.gain.setTargetAtTime((localThrottle > 0.05 ? (0.00005 + localThrottle * 0.008 + load * 0.002 + profile.intakeBias * 0.006) : 0.00001) * mic.intake * (localConfig.induction === "na" ? 1.0 : 0.45), localCtx.currentTime, 0.05);
      localNodes.mechBed.filter.frequency.setTargetAtTime(profile.mechanicalFreq + localPoint.rpm * 0.04, localCtx.currentTime, 0.05);
      localNodes.mechBed.gain.gain.setTargetAtTime((0.00002 + profile.mechanicalGain * 0.045 + profile.topTick * 0.003) * mic.block * smoothStep(localPoint.rpm, resolveIdleRpm(localConfig) + 120, 5000), localCtx.currentTime, 0.05);

      const firingHz = clamp(localPoint.eventHz, 18, 320);
      const crankHz = clamp(localPoint.rpm / 60, 12, 180);
      const exhaustFundHz = clamp(firingHz * (0.46 + profile.smoothness * 0.20), 24, 260);
      const exhaustPulseHz = clamp(firingHz * (0.95 + profile.warble * 0.22 + profile.topTick * 0.10), 28, 420);
      const intakeToneHz = clamp(crankHz * (engine.cylinders * 0.36 + 0.4) + profile.intakeBias * 26, 40, 520);
      const blockToneHz = clamp(crankHz * (1.3 + profile.warble * 0.25), 20, 220);

      localNodes.exhaustFundOsc.frequency.setTargetAtTime(exhaustFundHz, localCtx.currentTime, 0.04);
      localNodes.exhaustPulseOsc.frequency.setTargetAtTime(exhaustPulseHz, localCtx.currentTime, 0.04);
      localNodes.intakeToneOsc.frequency.setTargetAtTime(intakeToneHz, localCtx.currentTime, 0.05);
      localNodes.blockToneOsc.frequency.setTargetAtTime(blockToneHz, localCtx.currentTime, 0.05);

      const throttleShape = 0.18 + localThrottle * 0.82;
      const rpmShape = smoothStep(localPoint.rpm, resolveIdleRpm(localConfig), localConfig.redline * 0.78);
      const exhaustFundAmp = (0.010 + load * 0.038 + profile.lowBurble * 0.010 + profile.bodyBias * 0.008) * mic.exhaust * layoutWeight * throttleShape;
      const exhaustPulseAmp = (0.006 + load * 0.026 + profile.raspBias * 0.010 + profile.topTick * 0.012) * mic.exhaust * (0.75 + rpmShape * 0.55);
      const intakeToneAmp = (0.002 + localThrottle * 0.016 + profile.intakeBias * 0.010) * mic.intake * (0.55 + rpmShape * 0.65);
      const blockToneAmp = (0.0015 + profile.mechanicalGain * 0.018 + profile.lowBurble * 0.003) * mic.block * (0.55 + load * 0.35);

      localNodes.exhaustFundGain.gain.setTargetAtTime(exhaustFundAmp, localCtx.currentTime, 0.04);
      localNodes.exhaustPulseGain.gain.setTargetAtTime(exhaustPulseAmp, localCtx.currentTime, 0.04);
      localNodes.intakeToneGain.gain.setTargetAtTime(intakeToneAmp, localCtx.currentTime, 0.05);
      localNodes.blockToneGain.gain.setTargetAtTime(blockToneAmp, localCtx.currentTime, 0.05);

      const turboScale = turboFamilies[localConfig.turboFamily].whistleScale + profile.whistleBias;
      localNodes.turboOsc.frequency.setTargetAtTime(280 + localPoint.shaftSignal * 1280 * turboScale + localPoint.boostPsi * 24, localCtx.currentTime, 0.05);
      localNodes.turboGain.gain.setTargetAtTime(localConfig.induction === "turbo" ? (0.0013 + localPoint.shaftSignal * 0.016 + localPoint.boostPsi * 0.0015) * mic.air * turboLoudnessScale * (0.22 + localThrottle * 0.95) : 0.0001, localCtx.currentTime, 0.05);
      localNodes.blowerOsc.frequency.setTargetAtTime(180 + localPoint.shaftSignal * 1150 * blowerTypes[localConfig.blowerType].soundScale, localCtx.currentTime, 0.05);
      localNodes.blowerFilter.frequency.setTargetAtTime(900 + localPoint.shaftSignal * 1600 + profile.raspBias * 300, localCtx.currentTime, 0.05);
      localNodes.blowerGain.gain.setTargetAtTime(localConfig.induction === "supercharger" ? (0.004 + localPoint.shaftSignal * 0.032 + profile.raspBias * 0.01) * localConfig.superchargerLoudness * mic.air : 0.0001, localCtx.currentTime, 0.05);

      const triggerPop = (time: number, intensity = 0.5) => {
        const src = localCtx.createBufferSource();
        src.buffer = localNodes.noiseBuffer;
        const filter = localCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 900 + Math.random() * 2200;
        filter.Q.value = 1.4 + Math.random() * 2.5;
        const gain = localCtx.createGain();
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.045 * intensity, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14 + Math.random() * 0.08);
        src.connect(filter).connect(gain).connect(localNodes.fxBus);
        src.start(time, Math.random() * 0.4, 0.16);
        src.stop(time + 0.22);
        if (canTriggerSample("saabCrackle", time, 0.09)) {
          triggerSample("saabCrackle", time, { gain: 0.018 * intensity, rate: 0.92 + Math.random() * 0.14, filterType: "bandpass", filterFreq: 1800 + Math.random() * 900, q: 1.2 });
        }
      };

      const triggerChirp = (time: number, intensity = 0.4) => {
        const antiSurge = clamp(localConfig.antiSurge ?? 0, 0, 1);
        const turboSizeWeight = localConfig.turboFamily === "large" ? 1.30 : localConfig.turboFamily === "medium" ? 1.05 : 0.84;
        const releaseStrength = clamp(intensity * (0.7 + localPoint.boostPsi / 8), 0.18, 2.2) * turboSizeWeight;

        if (localConfig.chargeReleaseMode === "none") {
          const flutterStrength = releaseStrength * (1 - antiSurge * 0.88);
          if (flutterStrength <= 0.05) return;
          const baseBursts = localConfig.turboFamily === "large" ? 6 : localConfig.turboFamily === "medium" ? 5 : 4;
          const burstCount = Math.max(2, Math.round(baseBursts - antiSurge * 3));
          for (let i = 0; i < burstCount; i += 1) {
            const burstTime = time + i * (0.040 + Math.random() * 0.012);
            if (canTriggerSample(`flutter-${i}`, burstTime, 0.015)) {
              triggerSample("flutter", burstTime, {
                gain: 0.032 * flutterStrength * (1 - i * 0.09) * releaseGainScale,
                rate: 0.72 + Math.random() * 0.18,
                filterType: "bandpass",
                filterFreq: 1050 + flutterStrength * 950 - i * 90,
                q: 0.95,
              });
            }
          }
          return;
        }

        const isDump = localConfig.chargeReleaseMode === "dump";
        const duration = isDump ? clamp(0.34 + releaseStrength * 0.14, 0.34, 0.64) : clamp(0.24 + releaseStrength * 0.10, 0.24, 0.44);
        const whoosh = localCtx.createBufferSource();
        whoosh.buffer = localNodes.noiseBuffer;
        const whooshFilter = localCtx.createBiquadFilter();
        whooshFilter.type = "bandpass";
        whooshFilter.frequency.setValueAtTime((isDump ? 1500 : 1180) + releaseStrength * 280, time);
        whooshFilter.frequency.exponentialRampToValueAtTime(isDump ? 340 : 320, time + duration);
        whooshFilter.Q.value = isDump ? 0.88 : 0.72;
        const whooshGain = localCtx.createGain();
        whooshGain.gain.setValueAtTime(0.0001, time);
        whooshGain.gain.exponentialRampToValueAtTime((isDump ? 0.022 : 0.015) * releaseStrength * releaseGainScale, time + 0.01);
        whooshGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        whoosh.connect(whooshFilter).connect(whooshGain).connect(localNodes.fxBus);
        whoosh.start(time, Math.random() * 0.2, duration + 0.03);
        whoosh.stop(time + duration + 0.03);

        if (!isDump) {
          const recircTone = localCtx.createOscillator();
          const recircGain = localCtx.createGain();
          recircTone.type = "triangle";
          recircTone.frequency.setValueAtTime(760 + releaseStrength * 130, time);
          recircTone.frequency.exponentialRampToValueAtTime(360, time + duration * 0.9);
          recircGain.gain.setValueAtTime(0.0001, time);
          recircGain.gain.exponentialRampToValueAtTime(0.0048 * releaseStrength * releaseGainScale, time + 0.01);
          recircGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.9);
          recircTone.connect(recircGain).connect(localNodes.fxBus);
          recircTone.start(time);
          recircTone.stop(time + duration * 0.9);
          if (canTriggerSample("saabDump-recirc", time, 0.06)) {
            triggerSample("saabDump", time, { gain: 0.013 * releaseStrength * releaseGainScale, rate: 0.54 + Math.random() * 0.08, filterType: "lowpass", filterFreq: 1100, q: 0.7 });
          }
          return;
        }

        const tone = localCtx.createOscillator();
        const toneFilter = localCtx.createBiquadFilter();
        const toneGain = localCtx.createGain();
        tone.type = "sine";
        toneFilter.type = "bandpass";
        toneFilter.frequency.setValueAtTime(1850 + releaseStrength * 520, time);
        toneFilter.Q.value = 4.6;
        tone.frequency.setValueAtTime(2050 + releaseStrength * 780, time);
        tone.frequency.exponentialRampToValueAtTime(460, time + duration * 0.82);
        toneGain.gain.setValueAtTime(0.0001, time);
        toneGain.gain.exponentialRampToValueAtTime(0.0135 * releaseStrength * releaseGainScale, time + 0.008);
        toneGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.82);
        tone.connect(toneFilter).connect(toneGain).connect(localNodes.fxBus);
        tone.start(time);
        tone.stop(time + duration * 0.82);

        if (canTriggerSample("saabDump-dump", time, 0.05)) {
          triggerSample("saabDump", time, { gain: 0.022 * releaseStrength * releaseGainScale, rate: 0.48 + Math.random() * 0.08, filterType: "lowpass", filterFreq: 1350, q: 0.85 });
        }
        if (canTriggerSample("dumpSharp-main", time, 0.05)) {
          triggerSample("dumpSharp", time, { gain: 0.022 * releaseStrength * releaseGainScale, rate: 0.82 + Math.random() * 0.12, filterType: "bandpass", filterFreq: 2200 + releaseStrength * 520, q: 1.0 });
        }
      };

      if (localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" && localPoint.rpm < 2600 && localThrottle < 0.55 && canTriggerSample("v8Burble", localCtx.currentTime, 0.11) && Math.random() < 0.18) {
        triggerSample("v8Burble", localCtx.currentTime, { gain: 0.016 * mic.exhaust, rate: 0.90 + Math.random() * 0.08, filterType: "lowpass", filterFreq: 1450, q: 0.8 });
      }
      if (localConfig.engineLayout === "v10" && localPoint.rpm > 3200 && localThrottle > 0.30 && canTriggerSample("v10Edge", localCtx.currentTime, 0.12) && Math.random() < 0.14) {
        triggerSample("v10Edge", localCtx.currentTime, { gain: 0.012 * mic.exhaust, rate: 0.96 + Math.random() * 0.10, filterType: "bandpass", filterFreq: 2200 + localPoint.rpm * 0.04, q: 1.0 });
      }
      if (localConfig.engineLayout === "v12" && localPoint.rpm > 2400 && localThrottle > 0.18 && canTriggerSample("v12Sweet", localCtx.currentTime, 0.16) && Math.random() < 0.10) {
        triggerSample("v12Sweet", localCtx.currentTime, { gain: 0.009 * mic.exhaust, rate: 0.94 + Math.random() * 0.07, filterType: "lowpass", filterFreq: 2600, q: 0.8 });
      }

      const throttleDrop = lastThrottleRef.current - localThrottle;
      const throttleRise = localThrottle - lastThrottleRef.current;
      const boostDrop = Math.max(0, lastBoostRef.current - localPoint.boostPsi);

      if (throttleRise > 0.16 && localPoint.rpm > 1600 && Math.random() < 0.4) {
        const stab = localCtx.createBufferSource();
        stab.buffer = localNodes.noiseBuffer;
        const filter = localCtx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 700 + throttleRise * 900;
        const gain = localCtx.createGain();
        gain.gain.setValueAtTime(0.0001, localCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.016 * (0.5 + throttleRise), localCtx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, localCtx.currentTime + 0.08);
        stab.connect(filter).connect(gain).connect(localNodes.fxBus);
        stab.start(localCtx.currentTime, Math.random() * 0.2, 0.08);
        stab.stop(localCtx.currentTime + 0.08);
      }

      if (localPoint.rpm > 2600 && throttleDrop > 0.18) {
        const popChance = clamp((localPoint.rpm - 2500) / 4500, 0.2, 1.0) * clamp(load + localPoint.boostPsi / 12, 0.4, 1.0);
        if (Math.random() < popChance * 0.18 && localCtx.currentTime - lastPopTimeRef.current > 0.08) {
          triggerPop(localCtx.currentTime, 0.6 + popChance * 0.7);
          lastPopTimeRef.current = localCtx.currentTime;
        }
      }

      if (localConfig.induction === "turbo" && localPoint.rpm > 1900) {
        const releaseBoost = Math.max(lastBoostRef.current, localPoint.boostPsi);
        const releaseTrigger = throttleDrop > 0.04 || boostDrop > 0.45;
        if (releaseTrigger && releaseBoost > 1.3 && localCtx.currentTime - lastReleaseTimeRef.current > 0.055) {
          const releaseIntensity = clamp(throttleDrop * 3.8 + boostDrop / 4.8 + releaseBoost / 16, 0.18, 1.45);
          triggerChirp(localCtx.currentTime, releaseIntensity);
          lastReleaseTimeRef.current = localCtx.currentTime;
        }
      }

      if (localPoint.rpm > localConfig.redline - 90 && localThrottle > 0.72 && localCtx.currentTime - lastLimiterTimeRef.current > 0.03) {
        triggerPop(localCtx.currentTime, 0.4 + load * 0.6);
        lastLimiterTimeRef.current = localCtx.currentTime;
      }

      lastThrottleRef.current = localThrottle;
      lastBoostRef.current = localPoint.boostPsi;
    };

    schedulerRef.current = window.setInterval(updateEngineAudio, 20);
    return () => {
      if (schedulerRef.current) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    };
  }, [enabled]);

  return { ensureAudio };
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className={UI.softCard}>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-1 text-2xl font-bold text-slate-100">{value}</div>
        {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function LabeledSlider({ label, value, onChange, min, max, step = 1, display }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; display: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm text-slate-300">
        <span>{label}</span>
        <span className="text-slate-400">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(vals) => onChange(vals[0] ?? value)} />
    </div>
  );
}

function CustomTooltip({ active, payload, label, graphPage }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-2xl">
      <div className="font-semibold text-slate-100">{typeof label === "number" ? (typeof row.time === "number" ? `${Number(label).toFixed(2)} s` : `${Math.round(label)} rpm`) : label}</div>
      <div className="mt-2 grid gap-1">
        {graphPage === "power" ? (
          <>
            <div>Horsepower: <b>{fmt(row.brakeHp, 1)}</b></div>
            <div>Torque: <b>{fmt(row.torqueLbFt, 1)}</b></div>
            <div>Boost: <b>{fmt(row.boostPsi, 1)} psi</b></div>
          </>
        ) : (
          payload.map((entry: any) => {
            const meta = diagnosticMetricMeta[entry.dataKey as DiagnosticMetricKey];
            return meta ? <div key={entry.dataKey}>{meta.label}: <b>{meta.formatter(entry.value)}</b></div> : null;
          })
        )}
      </div>
    </div>
  );
}


function EngineInfoBar({ config, point }: { config: SimConfig; point: SolvePoint }) {
  const layout = engineLayouts[config.engineLayout];
  const disp = displacementLitres(config.bore, config.stroke, layout.cylinders);
  const items = [
    ["Layout", layout.label],
    ["Cylinders", `${layout.cylinders}`],
    ["Capacity", `${fmt(disp, 1)} L`],
    ["Aspiration", config.induction.toUpperCase()],
    ["Compression", `${fmt(config.compressionRatio, 1)}:1`],
    ["Valvetrain", config.valvetrainLayout.toUpperCase()],
    ["Bore x stroke", `${fmt(config.bore, 0)} × ${fmt(config.stroke, 0)} mm`],
    ["Current rpm", `${fmt(point.rpm, 0)} rpm`],
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-700/70 bg-slate-900/70 p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
        </div>
      ))}
    </div>
  );
}


function ControlTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`${UI.tabButton} ${active ? UI.tabButtonActive : ""}`}>
      {children}
    </button>
  );
}

function getFiringModeOptions(layout: EngineLayout) {
  switch (layout) {
    case "i3":
      return [
        { value: "stock", label: "Stock triple" },
        { value: "even", label: "Even 120°" },
        { value: "cp3_triple", label: "CP3-style uneven" },
      ] as const;
    case "i4":
      return [
        { value: "stock", label: "Stock i4" },
        { value: "even", label: "Even 180°" },
        { value: "crossplane_i4", label: "Crossplane i4" },
        { value: "bigbang_i4", label: "Big bang i4" },
      ] as const;
    case "v4":
      return [
        { value: "stock", label: "Stock V4" },
        { value: "even", label: "Even V4" },
        { value: "bigbang_v4", label: "Big bang V4" },
      ] as const;
    case "v6":
      return [
        { value: "stock", label: "Stock V6" },
        { value: "even", label: "Even-fire V6" },
        { value: "oddfire_v6", label: "Odd-fire V6" },
      ] as const;
    case "v8":
      return [
        { value: "stock", label: "Stock V8" },
        { value: "lopey_v8", label: "Lopey V8" },
      ] as const;
    default:
      return [
        { value: "stock", label: "Stock" },
        { value: "even", label: "Even" },
      ] as const;
  }
}

function interpolateSweepAtRpm(rows: SweepRow[], rpm: number) {
  if (!rows.length) return null;
  if (rpm <= rows[0].rpm) return rows[0];
  if (rpm >= rows[rows.length - 1].rpm) return rows[rows.length - 1];
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1];
    const b = rows[i];
    if (rpm >= a.rpm && rpm <= b.rpm) {
      const t = (rpm - a.rpm) / Math.max(1, b.rpm - a.rpm);
      return {
        ...a,
        rpm,
        brakeHp: lerp(a.brakeHp, b.brakeHp, t),
        torqueLbFt: lerp(a.torqueLbFt, b.torqueLbFt, t),
        boostPsi: lerp(a.boostPsi, b.boostPsi, t),
        bmepPsi: lerp(a.bmepPsi, b.bmepPsi, t),
        targetAfr: lerp(a.targetAfr, b.targetAfr, t),
        pr: lerp(a.pr, b.pr, t),
        eventHz: lerp(a.eventHz, b.eventHz, t),
      } as SweepRow;
    }
  }
  return rows[rows.length - 1];
}

function rpmWeightedBlend(distance: number, radius: number) {
  const x = clamp(1 - distance / Math.max(radius, 1), 0, 1);
  return x * x * (3 - 2 * x);
}


function runRuntimeSelfChecks() {
  const basicChecks = [
    clamp(5, 0, 4) === 4,
    Math.abs(lerp(10, 20, 0.5) - 15) < 1e-9,
    smoothStep(0.5, 0, 1) > 0 && smoothStep(0.5, 0, 1) < 1,
    typeof createProceduralSampleBuffer === "function",
    PRIVATE_AUDIO_SAMPLE_KEYS.length === 7,
  ];
  return basicChecks.every(Boolean);
}

export default function EngineSimulatorV2() {
  const [config, setConfig] = useState<SimConfig>(defaultConfig);
  const [runtime, setRuntime] = useState<RuntimeState>(defaultRuntime);
  const [graphMode, setGraphMode] = useState<GraphMode>("dyno");
  const [graphPage, setGraphPage] = useState<GraphPage>("power");
  const [diagLeftMetric, setDiagLeftMetric] = useState<DiagnosticMetricKey>("vePct");
  const [diagRightMetric, setDiagRightMetric] = useState<DiagnosticMetricKey>("mapKpa");
  const [running, setRunning] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [tab, setTab] = useState<ControlTab>("live");
  const [liveTrace, setLiveTrace] = useState<SweepRow[]>([]);
  const [liveThrottleTarget, setLiveThrottleTarget] = useState(defaultRuntime.throttle);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepCursor, setSweepCursor] = useState(1200);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "downloaded" | "blocked">("idle");
  const [presetSearch, setPresetSearch] = useState("");
  const [savePresetName, setSavePresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<EnginePreset[]>([]);
  const lastLiveTraceSampleRef = useRef(0);

  const sweep = useMemo(() => buildDynoSweep(config), [config]);
  const maxLeftAxis = useMemo(() => Math.ceil((Math.max(...sweep.map((r) => Math.max(r.brakeHp, r.torqueLbFt))) * 1.08) / 25) * 25, [sweep]);
  const maxRightAxis = useMemo(() => Math.ceil((Math.max(...sweep.map((r) => r.boostPsi), 1) * 1.08) / 2) * 2, [sweep]);
  const livePoint = useMemo(() => solvePoint(config, runtime), [config, runtime]);
  const sweepPoint = useMemo(() => solvePoint(config, { rpm: sweepCursor, throttle: 1, afr: config.induction === "na" ? 12.9 : 11.8, ignitionDeg: 24 }), [config, sweepCursor]);
  const displayedPoint = useMemo(() => (graphMode === "dyno" && sweepRunning ? sweepPoint : livePoint), [graphMode, sweepRunning, sweepPoint, livePoint]);
  const peakHp = useMemo(() => sweep.reduce((a, b) => (b.brakeHp > a.brakeHp ? b : a), sweep[0]), [sweep]);
  const peakTq = useMemo(() => sweep.reduce((a, b) => (b.torqueLbFt > a.torqueLbFt ? b : a), sweep[0]), [sweep]);
  const peakBoost = useMemo(() => sweep.reduce((a, b) => (b.boostPsi > a.boostPsi ? b : a), sweep[0]), [sweep]);
  const presetFilter = useMemo(() => presetSearch.trim().toLowerCase(), [presetSearch]);
  const allPresets = useMemo(() => [...presets, ...savedPresets], [savedPresets]);
  const filteredPresets = useMemo(() => allPresets.filter((preset) => !presetFilter || preset.name.toLowerCase().includes(presetFilter)), [allPresets, presetFilter]);
  const factoryPresets = useMemo(() => filteredPresets.filter((p) => p.group === "factory"), [filteredPresets]);
  const customPresets = useMemo(() => filteredPresets.filter((p) => p.group === "custom"), [filteredPresets]);
  const userPresets = useMemo(() => filteredPresets.filter((p) => p.group === "saved"), [filteredPresets]);

  const { ensureAudio } = useEngineAudio(config, graphMode === "dyno" && sweepRunning ? sweepPoint : livePoint, audioEnabled, runtime.throttle);

  useEffect(() => {
    runRuntimeSelfChecks();
  }, []);

  useEffect(() => {
    if (copyStatus === "idle") return;
    const id = window.setTimeout(() => setCopyStatus("idle"), 2200);
    return () => window.clearTimeout(id);
  }, [copyStatus]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setSavedPresets(parsed.map(sanitizePreset).filter((preset): preset is EnginePreset => preset !== null));
    } catch {
      setSavedPresets([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(savedPresets));
    } catch {
      return;
    }
  }, [savedPresets]);

  useEffect(() => {
    if (diagLeftMetric !== diagRightMetric) return;
    const fallback = (Object.keys(diagnosticMetricMeta).find((key) => key !== diagLeftMetric) ?? "mapKpa") as DiagnosticMetricKey;
    setDiagRightMetric(fallback);
  }, [diagLeftMetric, diagRightMetric]);

  useEffect(() => {
    if (!running || graphMode !== "live") return;
    const id = window.setInterval(() => {
      setRuntime((prev) => {
        const nextThrottle = prev.throttle + (liveThrottleTarget - prev.throttle) * 0.14;
        const nextState = { ...prev, throttle: nextThrottle };
        const point = solvePoint(config, nextState);
        const currentThrottle = clamp(nextState.throttle, 0, 1);
        const loadedBrake = config.dynoBrakeLoad * (0.34 + 0.48 * currentThrottle) + prev.rpm * 0.00145;
        const loadedTorque = Math.max(0, point.torqueLbFt - loadedBrake);
        const inertia = 1.0 + point.dispL * 0.32 + config.dynoRollerInertia * 0.022;
        const accelPerSec = clamp((loadedTorque / inertia) * 6.2 + currentThrottle * 140, 0, 620);
        const decelPerSec = 260 + (1 - currentThrottle) * 190;
        let nextRpm = prev.rpm + accelPerSec / 60 - (currentThrottle < 0.08 ? decelPerSec / 60 : 0);
        if (nextRpm > config.redline - 90) nextRpm -= 360 / 60;
        nextRpm = clamp(nextRpm, resolveIdleRpm(config), config.redline - 25);
        return { ...nextState, rpm: nextRpm };
      });
    }, 1000 / 60);
    return () => window.clearInterval(id);
  }, [config, running, graphMode, liveThrottleTarget]);

  useEffect(() => {
    if (graphMode !== "live") return;
    const now = performance.now();
    if (now - lastLiveTraceSampleRef.current < 33) return;
    lastLiveTraceSampleRef.current = now;
    setLiveTrace((prev) => {
      const nextTime = prev.length ? (prev[prev.length - 1].time ?? 0) + 1 / 60 : 0;
      const next: SweepRow[] = [...prev, { ...livePoint, time: Number(nextTime.toFixed(2)) }];
      return next.slice(-320);
    });
  }, [livePoint, graphMode]);

  useEffect(() => {
    if (!sweepRunning) return;
    const id = window.setInterval(() => {
      setSweepCursor((prev) => {
        const next = Math.min(config.redline, prev + 7);
        if (next >= config.redline) setSweepRunning(false);
        return next;
      });
    }, 1000 / 60);
    return () => window.clearInterval(id);
  }, [sweepRunning, config.redline]);

  const graphData = useMemo(() => {
    if (graphMode === "live") return liveTrace;
    if (!sweepRunning) return sweep;
    const partial = sweep.filter((row) => row.rpm <= sweepCursor);
    return partial.length ? partial : [sweep[0]];
  }, [graphMode, liveTrace, sweep, sweepRunning, sweepCursor]);

  const chartData = useMemo(() => graphData.map((row) => ({
    ...row,
    vePct: row.ve * 100,
    compressorEffPct: row.compressorEff * 100,
  })), [graphData]);

  const diagLeftMax = useMemo(() => {
    const maxVal = Math.max(...chartData.map((row: any) => Number(row[diagLeftMetric]) || 0), 1);
    return Math.ceil(maxVal * 1.08);
  }, [chartData, diagLeftMetric]);

  const diagRightMax = useMemo(() => {
    const maxVal = Math.max(...chartData.map((row: any) => Number(row[diagRightMetric]) || 0), 1);
    return Math.ceil(maxVal * 1.08);
  }, [chartData, diagRightMetric]);

  
  const lastLiveTime = useMemo(() => Number((liveTrace[liveTrace.length - 1]?.time ?? 0).toFixed(2)), [liveTrace]);
  const liveTimeStart = useMemo(() => Math.max(0, lastLiveTime - 5), [lastLiveTime]);

  const applyPreset = (preset: EnginePreset) => {
    const nextConfig = sanitizeConfig({ ...config, ...preset.config, applicationType: "car" });
    setConfig(nextConfig);
    setRuntime({ ...defaultRuntime, rpm: resolveIdleRpm(nextConfig), throttle: 0 });
    setLiveThrottleTarget(0);
    lastLiveTraceSampleRef.current = 0;
    setGraphMode("dyno");
    setSweepRunning(false);
    setGraphPage("power");
    setSweepCursor(Math.max(1200, resolveIdleRpm(nextConfig)));
    setLiveTrace([]);
  };

  const saveCurrentPreset = () => {
    const baseName = savePresetName.trim() || `${engineLayouts[config.engineLayout].label} ${config.induction.toUpperCase()}`;
    const uniqueName = savedPresets.some((preset) => preset.name === baseName) ? `${baseName} ${savedPresets.length + 1}` : baseName;
    const nextPreset: EnginePreset = { name: uniqueName, group: "saved", config: { ...sanitizeConfig(config) } };
    setSavedPresets((prev) => [...prev.filter((preset) => preset.name !== uniqueName), nextPreset]);
    setSavePresetName(uniqueName);
  };

  const deleteSavedPreset = (name: string) => {
    setSavedPresets((prev) => prev.filter((preset) => preset.name !== name));
  };

  const updateConfig = <K extends keyof SimConfig>(key: K, value: SimConfig[K]) => setConfig((prev) => ({ ...prev, [key]: value }));
  const updateRuntime = <K extends keyof RuntimeState>(key: K, value: RuntimeState[K]) => {
    if (key === "throttle") {
      setGraphMode("live");
      setLiveThrottleTarget(Number(value));
      return;
    }
    setRuntime((prev) => ({ ...prev, [key]: value }));
  };

  const exportPayload = useMemo(() => ({
    name: `${engineLayouts[config.engineLayout].label} ${config.induction}`,
    exportedAt: new Date().toISOString(),
    config,
  }), [config]);

  const exportConfigFile = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `engine-sim-${config.engineLayout}-${config.induction}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fallbackCopyText = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  };

  const copyConfigJson = async () => {
    const text = JSON.stringify({ name: exportPayload.name, config: exportPayload.config }, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyStatus("copied");
        return;
      }
    } catch {
      // fall through
    }

    if (fallbackCopyText(text)) {
      setCopyStatus("copied");
      return;
    }

    exportConfigFile();
    setCopyStatus("downloaded");
  };

  const runSweep = async () => {
    setGraphMode("dyno");
    setGraphPage("power");
    setSweepCursor(Math.max(1200, resolveIdleRpm(config)));
    setSweepRunning(true);
    if (audioEnabled) await ensureAudio();
  };

  const copyStatusText = copyStatus === "copied" ? "Configuration copied" : copyStatus === "downloaded" ? "Clipboard blocked, JSON downloaded instead" : copyStatus === "blocked" ? "Copy blocked" : "";

  return (
    <div className={UI.page}>
      <div className="mx-auto grid max-w-7xl gap-6">
        <div className="grid gap-6 lg:grid-cols-[420px_1fr] lg:items-start">
          <Card className={`${UI.card} lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden`}>
            <CardHeader>
              <CardTitle className={UI.title}>Controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto pr-2">
              <div className={UI.tabWrap}>
                <ControlTabButton active={tab === "live"} onClick={() => setTab("live")}>Live</ControlTabButton>
                <ControlTabButton active={tab === "engine"} onClick={() => setTab("engine")}>Engine</ControlTabButton>
                <ControlTabButton active={tab === "induction"} onClick={() => setTab("induction")}>Induction</ControlTabButton>
                <ControlTabButton active={tab === "environment"} onClick={() => setTab("environment")}>Environment</ControlTabButton>
                <ControlTabButton active={tab === "audio"} onClick={() => setTab("audio")}>Audio</ControlTabButton>
              </div>

              {tab === "live" && (
                <div className="grid gap-4">
                  <div className="grid gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                      <input value={presetSearch} onChange={(e) => setPresetSearch(e.target.value)} placeholder="Search presets" className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500" />
                      <div className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-400">{factoryPresets.length + customPresets.length + userPresets.length} preset matches</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
                      <input value={savePresetName} onChange={(e) => setSavePresetName(e.target.value)} placeholder="Preset name" className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500" />
                      <Button className={UI.buttonOutline} variant="outline" onClick={saveCurrentPreset}>Save current</Button>
                      <Button className={UI.buttonOutline} variant="outline" onClick={() => setSavePresetName("")}>Clear name</Button>
                    </div>
                  </div>
                  <LabeledSlider label="Throttle" value={runtime.throttle * 100} onChange={(v) => updateRuntime("throttle", v / 100)} min={0} max={100} display={`${fmt(runtime.throttle * 100, 0)} %`} />
                  <div className="grid grid-cols-2 gap-3">
                    <Button className={UI.buttonPrimary} onClick={() => setRunning((v) => !v)}>
                      {running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />} {running ? "Pause sim" : "Resume sim"}
                    </Button>
                    <Button className={UI.buttonSecondary} variant="secondary" onClick={async () => {
                      if (!audioEnabled) {
                        await ensureAudio();
                      }
                      setAudioEnabled((v) => !v);
                    }}>
                      <Volume2 className="mr-2 h-4 w-4" /> {audioEnabled ? "Audio on" : "Start audio"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className={UI.buttonOutline} variant="outline" onClick={() => {
                      setGraphMode((currentMode) => {
                        const nextMode = currentMode === "live" ? "dyno" : "live";
                        if (nextMode === "live") {
                          setSweepRunning(false);
                          lastLiveTraceSampleRef.current = 0;
                          setLiveTrace([]);
                          setRuntime((prev) => ({ ...prev, rpm: clamp(prev.rpm, resolveIdleRpm(config), config.redline - 25) }));
                        } else {
                          setSweepRunning(false);
                          setSweepCursor(Math.max(1200, resolveIdleRpm(config)));
                        }
                        return nextMode;
                      });
                    }}>
                      <Activity className="mr-2 h-4 w-4" /> Graph: {graphMode === "live" ? "Live trace" : "Dyno curve"}
                    </Button>
                    <Button className={UI.buttonOutline} variant="outline" onClick={() => { lastLiveTraceSampleRef.current = 0; setRuntime({ ...defaultRuntime, rpm: resolveIdleRpm(config) }); setLiveThrottleTarget(defaultRuntime.throttle); setLiveTrace([]); setSweepCursor(1200); setSweepRunning(false); }}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className={UI.buttonOutline} variant="outline" onClick={exportConfigFile}>Export JSON</Button>
                    <Button className={UI.buttonOutline} variant="outline" onClick={copyConfigJson}>Copy JSON</Button>
                  </div>
                  {copyStatusText ? <div className="text-xs text-slate-300">{copyStatusText}</div> : null}
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 grid gap-3">
                    <div className="text-sm font-semibold text-slate-200">Factory engine library</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {factoryPresets.map((preset) => (
                        <Button key={preset.name} variant="secondary" className={`${UI.buttonSecondary} justify-start`} onClick={() => applyPreset(preset)}>
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 grid gap-3">
                    <div className="text-sm font-semibold text-slate-200">Custom and tuned examples</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {customPresets.map((preset) => (
                        <Button key={preset.name} variant="secondary" className={`${UI.buttonSecondary} justify-start`} onClick={() => applyPreset(preset)}>
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 grid gap-3">
                    <div className="text-sm font-semibold text-slate-200">Saved presets</div>
                    {userPresets.length ? (
                      <div className="grid gap-2">
                        {userPresets.map((preset) => (
                          <div key={preset.name} className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                            <Button variant="secondary" className={`${UI.buttonSecondary} justify-start`} onClick={() => applyPreset(preset)}>{preset.name}</Button>
                            <Button variant="outline" className={UI.buttonOutline} onClick={() => deleteSavedPreset(preset.name)}>Delete</Button>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-xs text-slate-400">No saved presets yet.</div>}
                  </div>
                  <Button className={UI.buttonOutline} variant="outline" onClick={runSweep}>
                    <Gauge className="mr-2 h-4 w-4" /> Run dyno sweep
                  </Button>
                </div>
              )}

              {tab === "engine" && (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 grid gap-4">
                    <div className="text-sm font-semibold text-slate-200">Core engine</div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Engine layout</div>
                      <Select value={config.engineLayout} onValueChange={(v: EngineLayout) => updateConfig("engineLayout", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(engineLayouts).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Induction</div>
                      <Select value={config.induction} onValueChange={(v: InductionType) => updateConfig("induction", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="na">Naturally aspirated</SelectItem>
                          <SelectItem value="turbo">Turbocharged</SelectItem>
                          <SelectItem value="supercharger">Supercharged</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <LabeledSlider label="Bore" value={config.bore} onChange={(v) => updateConfig("bore", v)} min={60} max={110} step={0.1} display={`${fmt(config.bore, 1)} mm`} />
                    <LabeledSlider label="Stroke" value={config.stroke} onChange={(v) => updateConfig("stroke", v)} min={60} max={115} step={0.1} display={`${fmt(config.stroke, 1)} mm`} />
                    <LabeledSlider label="Compression ratio" value={config.compressionRatio} onChange={(v) => updateConfig("compressionRatio", v)} min={7.5} max={14} step={0.1} display={`${fmt(config.compressionRatio, 1)} : 1`} />
                    {config.engineLayout === "v8" ? (
                      <div className="grid gap-2">
                        <div className="text-sm text-slate-300">V8 crank type</div>
                        <Select value={config.v8Crank} onValueChange={(v: V8CrankType) => updateConfig("v8Crank", v)}>
                          <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="crossplane">Cross-plane muscle</SelectItem>
                            <SelectItem value="flatplane">Flat-plane exotic</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 grid gap-4">
                    <div className="text-sm font-semibold text-slate-200">Head and valvetrain</div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Valves per cylinder</div>
                      <Select value={String(config.valvesPerCylinder)} onValueChange={(v) => updateConfig("valvesPerCylinder", Number(v) as 2 | 3 | 4 | 5)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 valves</SelectItem>
                          <SelectItem value="3">3 valves</SelectItem>
                          <SelectItem value="4">4 valves</SelectItem>
                          <SelectItem value="5">5 valves</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Valvetrain layout</div>
                      <Select value={config.valvetrainLayout} onValueChange={(v: ValvetrainLayout) => updateConfig("valvetrainLayout", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ohv">OHV / pushrod</SelectItem>
                          <SelectItem value="sohc">SOHC</SelectItem>
                          <SelectItem value="dohc">DOHC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Variable valve timing</div>
                      <Select value={config.vvtMode} onValueChange={(v: VvtMode) => updateConfig("vvtMode", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="intake">Intake VVT</SelectItem>
                          <SelectItem value="dual">Dual VVT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Lift system</div>
                      <Select value={config.liftSystem} onValueChange={(v: LiftSystem) => updateConfig("liftSystem", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="mild">Mild switch-over</SelectItem>
                          <SelectItem value="aggressive">Aggressive high cam</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {config.liftSystem !== "none" ? <LabeledSlider label="Lift switch rpm" value={config.liftSwitchRpm} onChange={(v) => updateConfig("liftSwitchRpm", v)} min={3500} max={8500} step={50} display={`${fmt(config.liftSwitchRpm, 0)} rpm`} /> : null}
                  </div>

                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 grid gap-4">
                    <div className="text-sm font-semibold text-slate-200">Intake, fuel and exhaust</div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Intake type</div>
                      <Select value={config.intakeType} onValueChange={(v: IntakeType) => updateConfig("intakeType", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plenum">Fixed plenum</SelectItem>
                          <SelectItem value="variable">Variable-length intake</SelectItem>
                          <SelectItem value="dualrunner">Dual-runner intake</SelectItem>
                          <SelectItem value="itb">Individual throttle bodies</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Runner length</div>
                      <Select value={config.runnerLength} onValueChange={(v: RunnerLength) => updateConfig("runnerLength", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="long">Long</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="short">Short</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Injection type</div>
                      <Select value={config.injectionType} onValueChange={(v: InjectionType) => updateConfig("injectionType", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="carb">Carburettor</SelectItem>
                          <SelectItem value="tbi">Throttle-body injection</SelectItem>
                          <SelectItem value="port">Port injection</SelectItem>
                          <SelectItem value="direct">Direct injection</SelectItem>
                          <SelectItem value="dual">Dual injection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Fuel type</div>
                      <Select value={config.fuelType} onValueChange={(v: FuelType) => updateConfig("fuelType", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">Regular pump</SelectItem>
                          <SelectItem value="premium">Premium pump</SelectItem>
                          <SelectItem value="e30">E30 blend</SelectItem>
                          <SelectItem value="e85">E85</SelectItem>
                          <SelectItem value="race">Race fuel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Exhaust type</div>
                      <Select value={config.exhaustType} onValueChange={(v: ExhaustType) => updateConfig("exhaustType", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restrictive">Restrictive stock</SelectItem>
                          <SelectItem value="street">Good street</SelectItem>
                          <SelectItem value="performance">Performance</SelectItem>
                          <SelectItem value="race">Race</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Header / manifold</div>
                      <Select value={config.headerType} onValueChange={(v: HeaderType) => updateConfig("headerType", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cast">Cast manifold</SelectItem>
                          <SelectItem value="shorty">Shorty header</SelectItem>
                          <SelectItem value="fourtwoone">4-2-1</SelectItem>
                          <SelectItem value="fourone">4-1</SelectItem>
                          <SelectItem value="equal">Equal length</SelectItem>
                          <SelectItem value="unequal">Unequal length</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Friction class</div>
                      <Select value={config.frictionClass} onValueChange={(v: FrictionClass) => updateConfig("frictionClass", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="economy">Economy</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="performance">Performance</SelectItem>
                          <SelectItem value="race">Race</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <LabeledSlider label="Cam aggression" value={config.camAggression * 100} onChange={(v) => updateConfig("camAggression", v / 100)} min={0} max={100} display={`${fmt(config.camAggression * 100, 0)} %`} />
                    <LabeledSlider label="Exhaust flow trim" value={config.exhaustFlow * 100} onChange={(v) => updateConfig("exhaustFlow", v / 100)} min={0} max={100} display={`${fmt(config.exhaustFlow * 100, 0)} %`} />
                    <LabeledSlider label="Top-end flow bias" value={config.topEndFlowBias * 100} onChange={(v) => updateConfig("topEndFlowBias", v / 100)} min={0} max={100} display={`${fmt(config.topEndFlowBias * 100, 0)} %`} />
                    <LabeledSlider label="RPM cutoff" value={config.redline} onChange={(v) => updateConfig("redline", v)} min={5000} max={18000} step={100} display={`${fmt(config.redline, 0)} rpm`} />
                  </div>
                </div>
              )}

              {tab === "induction" && (
                <div className="grid gap-4">
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-4 grid gap-4">
                    <div className="text-sm font-semibold text-slate-200">Induction system</div>
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Induction type</div>
                      <Select value={config.induction} onValueChange={(v: InductionType) => updateConfig("induction", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="na">Naturally aspirated</SelectItem>
                          <SelectItem value="turbo">Turbocharged</SelectItem>
                          <SelectItem value="supercharger">Supercharged</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {config.induction === "turbo" && (
                      <>
                        <div className="grid gap-2">
                          <div className="text-sm text-slate-300">Turbo family</div>
                          <Select value={config.turboFamily} onValueChange={(v: TurboFamily) => updateConfig("turboFamily", v)}>
                            <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(turboFamilies).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <div className="text-sm text-slate-300">Turbo architecture</div>
                          <Select value={config.turboArchitecture} onValueChange={(v: TurboArchitecture) => updateConfig("turboArchitecture", v)}>
                            <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single</SelectItem>
                              <SelectItem value="twinscroll">Twin-scroll</SelectItem>
                              <SelectItem value="sequential">Sequential</SelectItem>
                              <SelectItem value="vgt">Variable geometry</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="grid gap-2">
                            <div className="text-sm text-slate-300">Bearing type</div>
                            <Select value={config.turboBearing} onValueChange={(v: TurboBearing) => updateConfig("turboBearing", v)}>
                              <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="journal">Journal</SelectItem>
                                <SelectItem value="ball">Ball bearing</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <div className="text-sm text-slate-300">Turbine A/R</div>
                            <Select value={config.turbineAR} onValueChange={(v: TurbineAR) => updateConfig("turbineAR", v)}>
                              <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="small">Small</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="large">Large</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <LabeledSlider label="Boost control" value={config.boostControl * 100} onChange={(v) => updateConfig("boostControl", v / 100)} min={0} max={100} display={`${fmt(config.boostControl * 100, 0)} %`} />
                        <LabeledSlider label="Wastegate spring" value={config.wastegateBasePsi} onChange={(v) => updateConfig("wastegateBasePsi", v)} min={3} max={20} step={0.5} display={`${fmt(config.wastegateBasePsi, 1)} psi`} />
                        <LabeledSlider label="Boost onset bias" value={config.boostOnsetBias} onChange={(v) => updateConfig("boostOnsetBias", v)} min={-1200} max={1200} step={50} display={`${config.boostOnsetBias >= 0 ? "+" : ""}${fmt(config.boostOnsetBias, 0)} rpm`} />
                        <LabeledSlider label="Boost taper / hold" value={config.boostTaperBias * 100} onChange={(v) => updateConfig("boostTaperBias", v / 100)} min={-100} max={100} step={1} display={`${config.boostTaperBias >= 0 ? "+" : ""}${fmt(config.boostTaperBias * 100, 0)} %`} />
                        <div className="grid gap-2">
                          <div className="text-sm text-slate-300">Charge release valve</div>
                          <Select value={config.chargeReleaseMode} onValueChange={(v: ChargeReleaseMode) => updateConfig("chargeReleaseMode", v)}>
                            <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              <SelectItem value="recirc">Recirculation valve</SelectItem>
                              <SelectItem value="dump">Dump valve</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <LabeledSlider label="Anti-surge control" value={config.antiSurge * 100} onChange={(v) => updateConfig("antiSurge", v / 100)} min={0} max={100} display={`${fmt(config.antiSurge * 100, 0)} %`} />
                      </>
                    )}
                    {config.induction === "supercharger" && (
                      <>
                        <div className="grid gap-2">
                          <div className="text-sm text-slate-300">Blower type</div>
                          <Select value={config.blowerType} onValueChange={(v: BlowerType) => updateConfig("blowerType", v)}>
                            <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(blowerTypes).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <LabeledSlider label="Supercharger drive ratio" value={config.superchargerDriveRatio} onChange={(v) => updateConfig("superchargerDriveRatio", v)} min={1} max={3} step={0.05} display={`${fmt(config.superchargerDriveRatio, 2)} : 1`} />
                        <LabeledSlider label="Supercharger boost cap" value={config.scBoostCap} onChange={(v) => updateConfig("scBoostCap", v)} min={3} max={20} step={0.5} display={`${fmt(config.scBoostCap, 1)} psi`} />
                      </>
                    )}
                    <div className="grid gap-2">
                      <div className="text-sm text-slate-300">Intercooler type</div>
                      <Select value={config.intercoolerType} onValueChange={(v: IntercoolerType) => updateConfig("intercoolerType", v)}>
                        <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="sidemount">Side-mount</SelectItem>
                          <SelectItem value="small_fmic">Small front-mount</SelectItem>
                          <SelectItem value="large_fmic">Large front-mount</SelectItem>
                          <SelectItem value="water_air">Water-to-air</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <LabeledSlider label="Intercooler core size" value={config.icCoreSize * 100} onChange={(v) => updateConfig("icCoreSize", v / 100)} min={20} max={100} display={`${fmt(config.icCoreSize * 100, 0)} %`} />
                  </div>
                </div>
              )}

              {tab === "environment" && (
                <div className="grid gap-4">
                  <LabeledSlider label="Ambient temperature" value={config.ambientTemp} onChange={(v) => updateConfig("ambientTemp", v)} min={-10} max={45} step={1} display={`${fmt(config.ambientTemp, 0)} °C`} />
                  <LabeledSlider label="Altitude" value={config.altitude} onChange={(v) => updateConfig("altitude", v)} min={0} max={3500} step={10} display={`${fmt(config.altitude, 0)} m`} />
                  <LabeledSlider label="Humidity" value={config.humidity * 100} onChange={(v) => updateConfig("humidity", v / 100)} min={0} max={100} display={`${fmt(config.humidity * 100, 0)} %`} />
                  <LabeledSlider label="Vehicle speed" value={config.vehicleSpeedKph} onChange={(v) => updateConfig("vehicleSpeedKph", v)} min={0} max={250} step={1} display={`${fmt(config.vehicleSpeedKph, 0)} km/h`} />
                  <LabeledSlider label="Dyno roller inertia" value={config.dynoRollerInertia} onChange={(v) => updateConfig("dynoRollerInertia", v)} min={20} max={140} step={1} display={fmt(config.dynoRollerInertia, 0)} />
                  <LabeledSlider label="Dyno brake load" value={config.dynoBrakeLoad} onChange={(v) => updateConfig("dynoBrakeLoad", v)} min={0} max={60} step={1} display={`${fmt(config.dynoBrakeLoad, 0)} lb-ft`} />
                </div>
              )}

              {tab === "audio" && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="text-sm text-slate-300">Firing order / pulse mode</div>
                    <Select value={config.firingSoundMode} onValueChange={(v: FiringSoundMode) => updateConfig("firingSoundMode", v)}>
                      <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {getFiringModeOptions(config.engineLayout).map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <div className="text-sm text-slate-300">Microphone position</div>
                    <Select value={config.micPosition} onValueChange={(v: MicPosition) => updateConfig("micPosition", v)}>
                      <SelectTrigger className={UI.select}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dyno_room">Dyno room</SelectItem>
                        <SelectItem value="cockpit">Cockpit</SelectItem>
                        <SelectItem value="engine_bay">Engine bay</SelectItem>
                        <SelectItem value="intake_side">Intake side</SelectItem>
                        <SelectItem value="rear_exhaust">Rear exhaust</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <LabeledSlider label="Engine loudness" value={config.engineLoudness * 100} onChange={(v) => updateConfig("engineLoudness", v / 100)} min={20} max={160} display={`${fmt(config.engineLoudness * 100, 0)} %`} />
                  <LabeledSlider label="Turbo loudness" value={config.turboLoudness * 100} onChange={(v) => updateConfig("turboLoudness", v / 100)} min={0} max={220} display={`${fmt(config.turboLoudness * 100, 0)} %`} />
                  <LabeledSlider label="Supercharger loudness" value={config.superchargerLoudness * 100} onChange={(v) => updateConfig("superchargerLoudness", v / 100)} min={0} max={180} display={`${fmt(config.superchargerLoudness * 100, 0)} %`} />
                  <LabeledSlider label="Sound texture" value={config.soundTexture * 100} onChange={(v) => updateConfig("soundTexture", v / 100)} min={0} max={100} display={`${fmt(config.soundTexture * 100, 0)} %`} />
                  <LabeledSlider label="Room size" value={config.roomSize * 100} onChange={(v) => updateConfig("roomSize", v / 100)} min={0} max={100} display={`${fmt(config.roomSize * 100, 0)} %`} />
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-3 text-sm text-slate-300">
                    Procedural private sample buffers now replace the broken embedded base64 audio path. That keeps the flavour layers working without crashing on invalid decode strings.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:sticky lg:top-4">
            <Card className={UI.card}>
              <CardHeader>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <CardTitle className={UI.title}>{graphPage === "power" ? "Dyno Graph" : "Diagnostics Graph"}</CardTitle>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" className={graphPage === "power" ? UI.buttonPrimary : UI.buttonOutline} onClick={() => setGraphPage("power")}>Power</Button>
                      <Button type="button" variant="outline" className={graphPage === "diagnostics" ? UI.buttonPrimary : UI.buttonOutline} onClick={() => setGraphPage("diagnostics")}>Diagnostics</Button>
                    </div>
                    {graphPage === "diagnostics" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={diagLeftMetric} onValueChange={(v: DiagnosticMetricKey) => setDiagLeftMetric(v)}>
                          <SelectTrigger className={`${UI.select} w-[150px]`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(diagnosticMetricMeta).map(([key, meta]) => <SelectItem key={key} value={key}>{meta.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={diagRightMetric} onValueChange={(v: DiagnosticMetricKey) => setDiagRightMetric(v)}>
                          <SelectTrigger className={`${UI.select} w-[150px]`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(diagnosticMetricMeta).filter(([key]) => key !== diagLeftMetric).map(([key, meta]) => <SelectItem key={key} value={key}>{meta.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5">
                <EngineInfoBar config={config} point={displayedPoint} />
                                <div className="h-[500px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 18, left: 10, bottom: 8 }}>
                      <CartesianGrid stroke="#273449" strokeDasharray="3 3" />
                      <XAxis
                        dataKey={graphMode === "dyno" ? "rpm" : "time"}
                        type="number"
                        domain={graphMode === "dyno" ? [Math.max(1200, resolveIdleRpm(config)), config.redline] : [liveTimeStart, Math.max(5, lastLiveTime)]}
                        tick={{ fill: "#cbd5e1", fontSize: 12 }}
                        tickFormatter={(value) => graphMode === "dyno" ? `${Math.round(value)}` : `${Number(value).toFixed(1)}s`}
                      />
                      <YAxis yAxisId="left" domain={graphPage === "power" ? [0, maxLeftAxis] : [0, diagLeftMax]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" domain={graphPage === "power" ? [0, maxRightAxis] : [0, diagRightMax]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip graphPage={graphPage} />} />
                      <Legend wrapperStyle={{ color: "#e2e8f0" }} />
                      {graphMode === "dyno" && sweepRunning ? <ReferenceLine x={sweepCursor} stroke="#cbd5e1" strokeDasharray="6 6" /> : null}
                      {graphPage === "power" ? (
                        <>
                          <Line yAxisId="left" type="monotone" dataKey="brakeHp" name="HP" stroke="#3b82f6" strokeWidth={3} dot={false} isAnimationActive={false} />
                          <Line yAxisId="left" type="monotone" dataKey="torqueLbFt" name="Torque" stroke="#ef4444" strokeWidth={3} dot={false} isAnimationActive={false} />
                          <Line yAxisId="right" type="monotone" dataKey="boostPsi" name="Boost psi" stroke="#22c55e" strokeWidth={3} dot={false} isAnimationActive={false} />
                        </>
                      ) : (
                        <>
                          <Line yAxisId="left" type="monotone" dataKey={diagLeftMetric} name={diagnosticMetricMeta[diagLeftMetric].label} stroke={diagnosticMetricMeta[diagLeftMetric].color} strokeWidth={3} dot={false} isAnimationActive={false} />
                          <Line yAxisId="right" type="monotone" dataKey={diagRightMetric} name={diagnosticMetricMeta[diagRightMetric].label} stroke={diagnosticMetricMeta[diagRightMetric].color} strokeWidth={3} dot={false} isAnimationActive={false} />
                        </>
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard label="RPM" value={`${fmt(displayedPoint.rpm)} rpm`} sub={graphMode === "dyno" && sweepRunning ? "Dyno sweep" : "Loaded run"} />
                  <MetricCard label="Boost" value={`${fmt(displayedPoint.boostPsi, 1)} psi`} sub={`PR ${fmt(displayedPoint.pr, 2)}`} />
                  <MetricCard label="Torque" value={`${fmt(displayedPoint.torqueLbFt)} lb-ft`} sub={`BMEP ${fmt(displayedPoint.bmepPsi)} psi`} />
                  <MetricCard label={graphPage === "power" ? "Charge temp" : diagnosticMetricMeta[diagLeftMetric].label} value={graphPage === "power" ? `${fmt(displayedPoint.chargeTempC, 1)} °C` : diagnosticMetricMeta[diagLeftMetric].formatter((chartData[chartData.length - 1] as any)?.[diagLeftMetric] ?? 0)} sub={graphPage === "power" ? `IC eff ${fmt(intercoolerEffectiveness(config.intercoolerType, config.icCoreSize, config.vehicleSpeedKph) * 100)}%` : `Right axis ${diagnosticMetricMeta[diagRightMetric].label}`} />
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <MetricCard label="Peak horsepower" value={`${fmt(peakHp.brakeHp)} hp`} sub={`${fmt(peakHp.rpm)} rpm`} />
                  <MetricCard label="Peak torque" value={`${fmt(peakTq.torqueLbFt)} lb-ft`} sub={`${fmt(peakTq.rpm)} rpm`} />
                  <MetricCard label="Peak boost" value={`${fmt(peakBoost.boostPsi, 1)} psi`} sub={`${fmt(peakBoost.rpm)} rpm`} />
                  <MetricCard label="Valvetrain ceiling" value={`${fmt(valvetrainCeiling(config))} rpm`} sub={`Graph cutoff ${fmt(config.redline)} rpm`} />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Peak airflow" value={`${fmt(peakHp.airLbMin, 1)} lb/min`} />
              <MetricCard label="Peak injector" value={`${fmt(peakHp.injectorCc)} cc/min`} />
              <MetricCard label="Peak VE" value={`${fmt(peakHp.ve * 100)} %`} />
              <MetricCard label="Compressor eff" value={`${fmt(peakHp.compressorEff * 100, 1)} %`} />
              <MetricCard label="Charge temp @ peak" value={`${fmt(peakHp.chargeTempC, 1)} °C`} />
              <MetricCard label="Peak density ratio" value={fmt(peakHp.densityRatio, 2)} />
              <MetricCard label="Peak MAP" value={`${fmt(peakHp.mapKpa, 0)} kPa`} />
              <MetricCard label="Target AFR @ peak" value={fmt(peakHp.targetAfr, 1)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

