import { engineCalibrations, calibrationById, calibrationForPreset, calibrationFits, calibrationSignature, chargeCorrection } from "./data/engineCalibrations";
import { compressorMaps, mapEfficiency, correctedFlow, type CompressorMapKey } from "./data/compressorMaps";
import { WATTS_PER_HP, NM_PER_LBFT, PA_PER_PSI, KG_S_TO_LB_MIN, powerHpFromTorque, torqueFromPowerHp, bmepPsiFromTorque, fuelProperties, mixtureEfficiency, ignitionEfficiency, injectorCcFromFuel, angularAccelerationRpmS, throttleAfterStep } from "./lib/powertrainMath";
import { expandFactoryPresets, manufacturerReferences } from "./data/factoryEngines";
import { acousticProfileFor } from "./lib/engineAcousticProcessor.js";
import { useEngineAudio, createProceduralSampleBuffer } from "./lib/engineAudio.js";
import { clamp, lerp, smoothStep, engineLayouts } from "./lib/engineAudioPrimitives";
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
type ControlTab = "library" | "live" | "engine" | "induction" | "environment" | "audio";
type FiringSoundMode = "stock" | "even" | "crossplane_i4" | "bigbang_i4" | "cp3_triple" | "bigbang_v4" | "oddfire_v6" | "lopey_v8";
type ApplicationType = "car";

export type SimConfig = {
  audioModel?: "legacy" | "acoustic";
  calibrationId?: string;
  calibrationEnabled?: boolean;
  compressorMap?: CompressorMapKey;
  gameMeta?: { name: string };
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
  chargeCorrection: number;
  correctedAirLbMin: number;
  compressorMapStatus: "generic" | "low-pr" | "sampled" | "outside-sampled-region";
  indicatedHp: number;
  frictionTorqueLbFt: number;
  pumpingTorqueLbFt: number;
  driveLossHp: number;
  fuelFlowKgHr: number;
  brakeThermalEfficiency: number;
  lambda: number;
  actualAfr: number;
  ignitionDeg: number;
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
export type EnginePreset = { name: string; manufacturer?: string; nominalLitres?: number; setupKind?: "existing" | "illustrative"; config: Partial<SimConfig>; group?: "factory" | "custom" | "saved" };

const PA_TO_PSI = 1 / PA_PER_PSI;
const KELVIN = 273.15;
const R_AIR = 287.05;
const GAMMA_AIR = 1.4;

const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "—");

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


const legacyPresets: EnginePreset[] = [
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

const presets = expandFactoryPresets(legacyPresets);

const defaultConfig: SimConfig = {
  compressorMap: "generic",
  calibrationEnabled: true,
  gameMeta: { name: "Saabish turbo" },
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
    audioModel: config.audioModel === "acoustic" ? "acoustic" : "legacy",
    compressorMap: coerceOption(config.compressorMap, ["generic","g25-550","gtx3071r-gen2"] as const, "generic"),
    calibrationId: calibrationById(config.calibrationId)?.id,
    calibrationEnabled: config.calibrationEnabled !== false,
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

function configForPreset(preset:EnginePreset):SimConfig {
  const profile=preset.group==='factory'?calibrationForPreset(preset.name):undefined;
  return sanitizeConfig({...defaultConfig,...preset.config,...profile?.overrides,
    ...(profile?{calibrationId:profile.id,calibrationEnabled:true}:{}), gameMeta:{name:preset.name},applicationType:'car'});
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
  tabButtonActive: "!border-sky-400/60 !bg-sky-500/20 !text-sky-100 shadow-[0_0_0_1px_rgba(147,197,253,0.35)]",
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
  const pv = Math.min(p * 0.95, clamp(humidity, 0, 1) * sat);
  const pd = Math.max(1000, p - pv);
  const rho = pd / (287.05 * T) + pv / (461.495 * T);
  return { pressurePa: p, pressurePsi: p * PA_TO_PSI, density: rho, dryAirFraction: (p-pv)/p, tempK: T };
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
    basePeak = 0.82 + config.compressionRatio * 0.006 + config.camAggression * 0.095 + config.exhaustFlow * 0.055 + (shape.oversquare ? 0.02 : 0) + (dispL >= 4 ? 0.03 : 0) + hw.vePeakAdj + hw.exhaustAdj;
  } else if (config.induction === "supercharger") {
    basePeak = 0.93 + config.compressionRatio * 0.004 + config.camAggression * 0.08 + config.exhaustFlow * 0.05 + hw.vePeakAdj + hw.exhaustAdj;
  } else {
    basePeak = 0.91 + config.compressionRatio * 0.004 + config.exhaustFlow * 0.10 + config.camAggression * 0.08 + (config.turboFamily === "large" ? 0.02 : 0) + hw.vePeakAdj + hw.exhaustAdj;
  }

  // Smoothly saturate port efficiency without flattening the torque peak.
  basePeak = 0.65 + 0.47 * Math.tanh((basePeak - 0.65) / 0.47);
  const rpmShape = Math.exp(-Math.pow((rpm - peakRpm) / Math.max(width, 900), 2));
  const lowFloor = ((config.induction === "na"
    ? clamp(0.69 + (dispL >= 4 ? 0.08 : 0) + (shape.undersquare ? 0.03 : 0), 0.65, 0.85)
    : turboFamilies[config.turboFamily].lowRpmFactor) + hw.lowFloorAdj);
  const effectiveFloor = Math.min(lowFloor, basePeak * 0.88);
  const veBase = effectiveFloor + (basePeak - effectiveFloor) * rpmShape;

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

function fuelTargetAfr(induction: InductionType, load: number, fuelType: FuelType) {
  return fuelProperties(fuelType).stoich * lerp(1, induction === 'na' ? 0.88 : 0.80, load);
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

function superchargerPressureRatio(type: BlowerType, driveRatio: number, rpm: number, throttle: number, capPsi: number) {
  const capPR = 1 + capPsi / 14.7;
  const speedShape = type === "centrifugal" ? Math.pow(clamp(rpm / 7000, 0, 1.2), 1.7) : 0.44 + 0.56 * clamp(rpm / 6500, 0, 1.1);
  const pr = 1 + (capPR - 1) * speedShape * Math.pow(throttle, 1.2) * clamp(driveRatio / 2.2, 0.45, 1.5);
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
    timingBonus: 0,
    chargeTempRelief: 0,
    spoolStartAdj: 0,
    spoolFullAdj: 0,
    topEndHoldAdj: 0,
    compressorEffAdj: 0,
    frictionScale: 1,
    exhaustAdj: 0,
  };

  switch (config.valvesPerCylinder) {
    case 2:
      hw.vePeakAdj -= 0.055; hw.lowFloorAdj += 0.09; hw.peakRpmShift -= 380; hw.rpmCeilingAdj -= 650; break;
    case 3:
      hw.vePeakAdj -= 0.02; hw.lowFloorAdj += 0.04; hw.peakRpmShift -= 160; hw.rpmCeilingAdj -= 180; break;
    case 4:
      hw.vePeakAdj += 0.015; hw.rpmCeilingAdj += 120; break;
    case 5:
      hw.vePeakAdj += 0.03; hw.lowFloorAdj -= 0.015; hw.peakRpmShift += 180; hw.rpmCeilingAdj += 260; break;
  }

  switch (config.valvetrainLayout) {
    case "ohv":
      hw.vePeakAdj -= 0.03; hw.peakRpmShift -= 260; hw.rpmCeilingAdj -= 520; hw.frictionScale *= 1.05; break;
    case "sohc":
      hw.peakRpmShift -= 80; hw.rpmCeilingAdj -= 120; break;
    case "dohc":
      hw.vePeakAdj += 0.02; hw.peakRpmShift += 120; hw.rpmCeilingAdj += 260; break;
  }

  switch (config.vvtMode) {
    case "intake":
      hw.lowFloorAdj += 0.035; hw.veWidthMult *= 1.08; hw.timingBonus += 0.7; break;
    case "dual":
      hw.lowFloorAdj += 0.06; hw.veWidthMult *= 1.14; hw.timingBonus += 1.4; hw.peakRpmShift += 70; break;
  }

  if (config.liftSystem !== "none") {
    hw.vePeakAdj += liftBlend * (config.liftSystem === "mild" ? 0.025 : 0.055);
    hw.peakRpmShift += liftBlend * (config.liftSystem === "mild" ? 180 : 360);
    hw.rpmCeilingAdj += liftBlend * (config.liftSystem === "mild" ? 180 : 320);
    hw.lowFloorAdj -= (1 - liftBlend) * (config.liftSystem === "mild" ? 0.008 : 0.018);
  }

  switch (config.intakeType) {
    case "variable":
      hw.lowFloorAdj += 0.04; hw.veWidthMult *= 1.10; break;
    case "dualrunner":
      hw.lowFloorAdj += 0.025; hw.veWidthMult *= 1.07; break;
    case "itb":
      hw.vePeakAdj += 0.03; hw.lowFloorAdj -= 0.015; hw.peakRpmShift += 220; hw.rpmCeilingAdj += 120; break;
  }

  switch (config.runnerLength) {
    case "long":
      hw.lowFloorAdj += 0.04; hw.peakRpmShift -= 220; break;
    case "short":
      hw.lowFloorAdj -= 0.02; hw.vePeakAdj += 0.02; hw.peakRpmShift += 220; break;
  }

  switch (config.injectionType) {
    case "carb":
      hw.lowFloorAdj -= 0.03; hw.timingBonus -= 1.6; hw.chargeTempRelief -= 0.02; break;
    case "tbi":
      hw.lowFloorAdj -= 0.015; hw.timingBonus -= 0.8; break;
    case "direct":
      hw.timingBonus += 1.6; hw.chargeTempRelief += 0.05; break;
    case "dual":
      hw.timingBonus += 2.1; hw.chargeTempRelief += 0.07; hw.vePeakAdj += 0.01; break;
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
      hw.exhaustAdj += 0.06; hw.topEndHoldAdj += 0.05; break;
  }

  switch (config.headerType) {
    case "shorty":
      break;
    case "fourtwoone":
      hw.veWidthMult *= 1.04; break;
    case "fourone":
      hw.vePeakAdj += 0.02; hw.peakRpmShift += 240; break;
    case "equal":
      hw.vePeakAdj += 0.02; hw.exhaustAdj += 0.01; break;
    case "unequal":
      hw.vePeakAdj -= 0.01; hw.veWidthMult *= 1.02; hw.exhaustAdj -= 0.005; break;
  }

  switch (config.frictionClass) {
    case "economy": hw.frictionScale *= 1.08; break;
    case "performance": hw.frictionScale *= 0.96; break;
    case "race": hw.frictionScale *= 0.92; break;
  }

  if (config.induction === "turbo") {
    switch (config.turboArchitecture) {
      case "twinscroll": hw.spoolStartAdj -= 240; hw.spoolFullAdj -= 330; hw.compressorEffAdj += 0.01; break;
      case "sequential": hw.spoolStartAdj -= 420; hw.spoolFullAdj -= 560; hw.topEndHoldAdj -= 0.02; break;
      case "vgt": hw.spoolStartAdj -= 300; hw.spoolFullAdj -= 420; hw.compressorEffAdj += 0.015; hw.topEndHoldAdj += 0.03; break;
    }
    if (config.turboBearing === "ball") {
      hw.spoolStartAdj -= 120; hw.spoolFullAdj -= 180;
    }
    switch (config.turbineAR) {
      case "small": hw.spoolStartAdj -= 260; hw.spoolFullAdj -= 340; hw.topEndHoldAdj -= 0.05; break;
      case "large": hw.spoolStartAdj += 240; hw.spoolFullAdj += 340; hw.topEndHoldAdj += 0.06; break;
    }
  }

  return hw;
}

function solvePoint(config: SimConfig, runtime: RuntimeState, chargeScaleOverride?: number): SolvePoint {
  const engine = engineLayouts[config.engineLayout];
  const atm = atmosphere(config.altitude, config.ambientTemp, config.humidity);
  const dispL = displacementLitres(config.bore, config.stroke, engine.cylinders);
  const dispM3 = dispL / 1000;
  const throttle = clamp(runtime.throttle, 0, 1);
  const rpm = clamp(runtime.rpm, resolveIdleRpm(config), config.redline);
  const hw = getHardwareState(config, rpm);
  const chargeScale = chargeScaleOverride ?? chargeCorrection(config,rpm);

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
    const naturalBoostTarget = wgLimit * spool * Math.pow(throttle, 1.4);
    const holdBias = config.boostTaperBias * 0.45;
    const topEndHold = 1 + smoothStep(rpm, spoolFull, config.redline - 200) * ((fam.topEndHold + holdBias + hw.topEndHoldAdj) - 1);
    boostPsi = naturalBoostTarget * Math.max(0.78, topEndHold);
    pr = (atm.pressurePsi + boostPsi) / atm.pressurePsi;
    compressorEff = clamp(compressorEfficiency(pr, config.turboFamily) + hw.compressorEffAdj, 0.4, 0.9);
    preIcTempK = atm.tempK * (1 + (Math.pow(pr, (GAMMA_AIR - 1) / GAMMA_AIR) - 1) / compressorEff);
    shaftSignal = spool;
  }

  if (config.induction === "supercharger") {
    pr = superchargerPressureRatio(config.blowerType, config.superchargerDriveRatio, rpm, throttle, config.scBoostCap);
    boostPsi = Math.max(0, (pr - 1) * atm.pressurePsi);
    compressorEff = blowerTypes[config.blowerType].eff;
    preIcTempK = atm.tempK * (1 + (Math.pow(pr, (GAMMA_AIR - 1) / GAMMA_AIR) - 1) / compressorEff);
    shaftSignal = clamp((rpm / config.redline) * config.superchargerDriveRatio * 0.6, 0, 1.4);
  }

  const vacuumMapKpa = lerp(26, atm.pressurePa / 1000 - 2, Math.pow(throttle, 0.60));
  const boostedMapKpa = (atm.pressurePsi + boostPsi) / PA_TO_PSI / 1000;
  const mapKpaRaw = config.induction === "na" ? vacuumMapKpa : lerp(vacuumMapKpa, boostedMapKpa, Math.pow(throttle, 0.76));

  const icEff = intercoolerEffectiveness(config.intercoolerType, config.icCoreSize, config.vehicleSpeedKph);
  const icDropPsi = pressureDropAcrossIC(config.intercoolerType, boostPsi, config.icCoreSize) * smoothStep(boostPsi, 0, 1) * throttle * throttle;
  const mapKpa = Math.max(25, mapKpaRaw - (config.induction === 'na' ? 0 : icDropPsi * 6.894757));
  const valveLimit = valvetrainCeiling(config);
  const topEndBias = config.topEndFlowBias - 0.5;
  const flowFalloff = 1 - smoothStep(rpm, valveLimit, valveLimit + 1800) * (0.45 - topEndBias * 0.12);
  const ve = estimateVE(config,rpm,mapKpa,dispL) * flowFalloff * chargeScale;
  const genericEfficiency=compressorEff;
  let compressorMapStatus:SolvePoint['compressorMapStatus']='generic';
  let chargeTempK=config.induction==='na'?atm.tempK:atm.tempK+(preIcTempK-atm.tempK)*(1-icEff);
  if(config.induction==='turbo' && config.compressorMap && config.compressorMap!=='generic') {
    compressorMapStatus=pr<1.5?'low-pr':'outside-sampled-region';
    for(let iteration=0;iteration<16;iteration++) {
      const estimateKgS=dispM3*(rpm/120)*ve*(mapKpa*1000)/(R_AIR*chargeTempK)*atm.dryAirFraction;
      const flow=correctedFlow(estimateKgS*KG_S_TO_LB_MIN,atm.tempK,atm.pressurePa);
      const eff=mapEfficiency(config.compressorMap,flow,pr);
      compressorEff=eff??genericEfficiency;
      compressorMapStatus=eff!==null?'sampled':pr<1.5?'low-pr':'outside-sampled-region';
      preIcTempK=atm.tempK*(1+(Math.pow(pr,(GAMMA_AIR-1)/GAMMA_AIR)-1)/compressorEff);
      const nextTemp=atm.tempK+(preIcTempK-atm.tempK)*(1-icEff);
      chargeTempK=(chargeTempK+nextTemp)/2;
    }
  }

  const cyclesPerSec = rpm / 120; // four-stroke: one intake cycle per two revolutions
  const intakeVolumeM3S = dispM3 * cyclesPerSec * ve;
  const airMassKgS = intakeVolumeM3S * (mapKpa * 1000) / (R_AIR * chargeTempK) * atm.dryAirFraction;
  const airLbMin = airMassKgS * KG_S_TO_LB_MIN;
  const load = clamp(mapKpa / (atm.pressurePa / 1000), 0, 1);
  const fuel = fuelProperties(config.fuelType);
  const targetAfr = fuelTargetAfr(config.induction, load, config.fuelType);
  // Runtime AFR uses the familiar gasoline scale; lambda transfers across fuel blends.
  const lambda = Math.max(0.35, runtime.afr / 14.7);
  const actualAfr = lambda * fuel.stoich;
  const fuelMassKgS = airMassKgS / actualAfr;
  const combustibleFuelKgS = Math.min(fuelMassKgS, airMassKgS / fuel.stoich);
  const timingEff = ignitionEfficiency(runtime.ignitionDeg + hw.timingBonus, mbtTimingAdvance(rpm, mapKpa));
  const afrEff = mixtureEfficiency(lambda, targetAfr / fuel.stoich);
  const chargeTempPenalty = clamp(1 - Math.max(0, chargeTempK - 323) * (0.0013 - hw.chargeTempRelief * 0.0005), 0.75, 1.0);
  // Semi-empirical indicated efficiency: compression changes cycle efficiency,
  // while airflow/VE supplies the speed and hardware effects. No torque floor.
  const cycleEfficiency = (1 - Math.pow(config.compressionRatio, -0.30)) / (1 - Math.pow(10, -0.30));
  const indicatedEfficiency = clamp(0.34 * cycleEfficiency, 0.26, 0.42) * timingEff * afrEff * chargeTempPenalty;
  const indicatedWatts = combustibleFuelKgS * fuel.lowerHeatingValue * indicatedEfficiency;
  const indicatedHp = indicatedWatts / WATTS_PER_HP;
  const frictionTorqueLbFt = estimateFrictionTorque(config, rpm, dispL, engine.cylinders);
  const pumpingTorqueLbFt = Math.max(0, atm.pressurePa - mapKpa * 1000) * dispM3 / (4 * Math.PI * NM_PER_LBFT);
  // Compressor drive power comes from air mass and enthalpy rise, not boost alone.
  if (config.induction === 'supercharger') {
    driveLossHp = airMassKgS * 1005 * Math.max(0, preIcTempK - atm.tempK) / (0.9 * WATTS_PER_HP);
  }
  const finalTorqueLbFt = torqueFromPowerHp(indicatedHp - driveLossHp, rpm) - frictionTorqueLbFt - pumpingTorqueLbFt;
  const brakeHp = powerHpFromTorque(finalTorqueLbFt, rpm);
  const bmepPsi = bmepPsiFromTorque(finalTorqueLbFt, dispL);
  const injectorCc = injectorCcFromFuel(fuelMassKgS, fuel.densityKgL, engine.cylinders);
  const fuelFlowKgHr = fuelMassKgS * 3600;
  const brakeThermalEfficiency = Math.max(0, brakeHp * WATTS_PER_HP) / Math.max(1, fuelMassKgS * fuel.lowerHeatingValue);
  const densityRatio = (mapKpa * 1000 / chargeTempK) / (atm.pressurePa / atm.tempK);
  const cfm = airMassKgS / 1.225 * 60 / 0.028316846592; // standard dry-air volume
  const eventHz = (rpm / 60) * engine.firingFactor;
  boostPsi = Math.max(0, (mapKpa * 1000 - atm.pressurePa) / PA_PER_PSI);

  return {
    chargeCorrection:chargeScale, correctedAirLbMin:correctedFlow(airLbMin,atm.tempK,atm.pressurePa), compressorMapStatus,
    indicatedHp, frictionTorqueLbFt, pumpingTorqueLbFt, driveLossHp, fuelFlowKgHr, brakeThermalEfficiency, lambda, actualAfr, ignitionDeg: runtime.ignitionDeg,
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

function solveDynoPoint(config: SimConfig, rpm: number, chargeScaleOverride?: number): SolvePoint {
  const probe = solvePoint(config, {rpm, throttle:1, afr:12.9, ignitionDeg:24},chargeScaleOverride);
  const fuel = fuelProperties(config.fuelType);
  const hw = getHardwareState(config,rpm);
  return solvePoint(config, {rpm, throttle:1, afr:probe.targetAfr / fuel.stoich * 14.7,
    ignitionDeg:mbtTimingAdvance(rpm,probe.mapKpa)-hw.timingBonus},chargeScaleOverride);
}

function buildDynoSweep(config: SimConfig) {
  const rows: SweepRow[] = [];
  const start = Math.max(1200, resolveIdleRpm(config));
  for (let rpm = start; rpm < config.redline; rpm += 100) rows.push(solveDynoPoint(config,rpm));
  rows.push(solveDynoPoint(config,config.redline));
  const profile=config.calibrationEnabled===false?undefined:calibrationById(config.calibrationId);
  for(const point of profile?.points??[])if(point.rpm>=start && point.rpm<=config.redline && !rows.some(row=>row.rpm===point.rpm))rows.push(solveDynoPoint(config,point.rpm));
  return rows.sort((a,b)=>a.rpm-b.rpm);
}

function stepRuntime(config: SimConfig, runtime: RuntimeState, targetThrottle: number, dt: number): RuntimeState {
  const throttle = throttleAfterStep(runtime.throttle,targetThrottle,dt);
  const point = solvePoint(config,{...runtime,throttle});
  const brakeTorque = config.dynoBrakeLoad + runtime.rpm * 0.00145;
  const inertiaKgM2 = 0.18 + point.dispL * 0.07 + config.dynoRollerInertia * 0.018;
  const netTorque = point.torqueLbFt-brakeTorque;
  const rpm = runtime.rpm + angularAccelerationRpmS(netTorque,inertiaKgM2)*dt;
  // Idle regulation and rev limiting are explicit boundary models.
  return {...runtime, throttle, rpm:clamp(rpm,resolveIdleRpm(config),config.redline-25)};
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
      <Slider aria-label={label} value={[value]} min={min} max={max} step={step} onValueChange={(vals) => onChange(vals[0] ?? value)} />
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
    <button type="button" onClick={onClick} aria-pressed={active} className={`${UI.tabButton} ${active ? UI.tabButtonActive : ""}`}>
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

function runRuntimeSelfChecks() {
  const basicChecks = [
    clamp(5, 0, 4) === 4,
    Math.abs(lerp(10, 20, 0.5) - 15) < 1e-9,
    smoothStep(0.5, 0, 1) > 0 && smoothStep(0.5, 0, 1) < 1,
    typeof createProceduralSampleBuffer === "function",
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
  const [tab, setTab] = useState<ControlTab>("library");
  const [liveTrace, setLiveTrace] = useState<SweepRow[]>([]);
  const [liveThrottleTarget, setLiveThrottleTarget] = useState(defaultRuntime.throttle);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepCursor, setSweepCursor] = useState(1200);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "downloaded" | "blocked">("idle");
  const [presetSearch, setPresetSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("Saab");
  const [savePresetName, setSavePresetName] = useState("");
  const [savedPresets, setSavedPresets] = useState<EnginePreset[]>([]);
  const lastLiveTraceSampleRef = useRef(0);
  const liveSimulationTimeRef = useRef(0);

  const sweep = useMemo(() => buildDynoSweep(config), [config]);
  const maxLeftAxis = useMemo(() => Math.ceil((Math.max(...sweep.map((r) => Math.max(r.brakeHp, r.torqueLbFt))) * 1.08) / 25) * 25, [sweep]);
  const minLeftAxis = Math.min(0,...liveTrace.map(row=>Math.min(row.brakeHp,row.torqueLbFt)));
  const maxRightAxis = useMemo(() => Math.ceil((Math.max(...sweep.map((r) => r.boostPsi), 1) * 1.08) / 2) * 2, [sweep]);
  const livePoint = useMemo(() => solvePoint(config, runtime), [config, runtime]);
  const sweepPoint = useMemo(() => solveDynoPoint(config, sweepCursor), [config, sweepCursor]);
  const displayedPoint = useMemo(() => (graphMode === "dyno" ? sweepPoint : livePoint), [graphMode, sweepPoint, livePoint]);
  const displayedMetrics = { ...displayedPoint, vePct: displayedPoint.ve*100, compressorEffPct: displayedPoint.compressorEff*100 };
  const peakHp = useMemo(() => sweep.reduce((a, b) => (b.brakeHp > a.brakeHp ? b : a), sweep[0]), [sweep]);
  const peakTq = useMemo(() => sweep.reduce((a, b) => (b.torqueLbFt > a.torqueLbFt ? b : a), sweep[0]), [sweep]);
  const peakAirflow = useMemo(()=>sweep.reduce((a,b)=>a.airLbMin>b.airLbMin?a:b,sweep[0]),[sweep]);
  const peakInjector = useMemo(()=>sweep.reduce((a,b)=>a.injectorCc>b.injectorCc?a:b,sweep[0]),[sweep]);
  const peakBoost = useMemo(() => sweep.reduce((a, b) => (b.boostPsi > a.boostPsi ? b : a), sweep[0]), [sweep]);
  const presetFilter = useMemo(() => presetSearch.trim().toLowerCase(), [presetSearch]);
  const allPresets = useMemo(() => [...presets, ...savedPresets], [savedPresets]);
  const filteredPresets = useMemo(() => allPresets.filter((preset) => !presetFilter || `${preset.manufacturer ?? ""} ${preset.name} ${preset.config.engineLayout} ${preset.config.induction}`.toLowerCase().includes(presetFilter)), [allPresets, presetFilter]);
  const factoryPresets = useMemo(() => filteredPresets.filter((p) => p.group === "factory"), [filteredPresets]);
  const manufacturers = useMemo(() => [...new Set(presets.filter(p=>p.group==='factory').map(p=>p.manufacturer!))].sort(), []);
  const visibleManufacturers = manufacturers.filter(name => (presetFilter || manufacturer === 'all' || name === manufacturer) && factoryPresets.some(p=>p.manufacturer===name));
  const activeCalibration=calibrationById(config.calibrationId);
  const activeFit=calibrationFits[config.calibrationId??''];
  const stockCalibration=activeFit?.baselineSignature===calibrationSignature(config);
  const activeMap=config.compressorMap && config.compressorMap!=='generic'?compressorMaps[config.compressorMap]:undefined;
  const ratedTorque=activeCalibration?.points.find(p=>p.basis==='torque-rating');
  const ratedPower=activeCalibration?.points.find(p=>p.basis==='power-rating');
  const ratedHp=ratedPower?powerHpFromTorque(ratedPower.torqueNm/1.3558179483314004,ratedPower.rpm):0;
  const selectedPreset = presets.find(p=>p.name===config.gameMeta?.name);
  const customPresets = useMemo(() => filteredPresets.filter((p) => p.group === "custom"), [filteredPresets]);
  const userPresets = useMemo(() => filteredPresets.filter((p) => p.group === "saved"), [filteredPresets]);

  const { ensureAudio, acousticStatus } = useEngineAudio(config, graphMode === "dyno" && sweepRunning ? sweepPoint : livePoint, audioEnabled, graphMode === "dyno" && sweepRunning ? 1 : runtime.throttle);

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
    if (!running || graphMode !== 'live') return;
    let last = performance.now();
    let accumulator = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      // Freeze rather than fast-forward a backgrounded tab. Integrate at 120 Hz.
      accumulator += Math.min(0.1,Math.max(0,(now-last)/1000));
      last=now;
      const steps=Math.floor((accumulator+1e-10)/(1/120));
      if (!steps) return;
      accumulator-=steps/120;
      liveSimulationTimeRef.current += steps/120;
      setRuntime(prev=>{
        let next=prev;
        for(let i=0;i<steps;i++) next=stepRuntime(config,next,liveThrottleTarget,1/120);
        return next;
      });
    },1000/60);
    return ()=>window.clearInterval(id);
  },[config,running,graphMode,liveThrottleTarget]);

  useEffect(() => {
    if (graphMode!=='live' || !running) return;
    const elapsed=liveSimulationTimeRef.current;
    if (elapsed-lastLiveTraceSampleRef.current < 1/30) return;
    lastLiveTraceSampleRef.current=elapsed;
    setLiveTrace(prev=>[...prev,{...livePoint,time:elapsed}].slice(-320));
  },[livePoint,graphMode,running]);

  useEffect(() => {
    if(!sweepRunning) return;
    let last=performance.now();
    const id=window.setInterval(()=>{
      const now=performance.now();
      const dt=Math.min(0.1,Math.max(0,(now-last)/1000));last=now;
      setSweepCursor(prev=>{
        const next=Math.min(config.redline,prev+420*dt);
        if(next>=config.redline) setSweepRunning(false);
        return next;
      });
    },1000/60);
    return ()=>window.clearInterval(id);
  },[sweepRunning,config.redline]);

  const graphData = useMemo(() => {
    if (graphMode === "live") return liveTrace;
    if (!sweepRunning) return sweep;
    const partial = sweep.filter((row) => row.rpm <= sweepCursor);
    return [...partial.filter(row=>row.rpm<sweepCursor),sweepPoint];
  }, [graphMode, liveTrace, sweep, sweepRunning, sweepCursor, sweepPoint]);

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
    const nextConfig = configForPreset(preset);
    setConfig(nextConfig);
    setRuntime({ ...defaultRuntime, rpm: resolveIdleRpm(nextConfig), throttle: 0 });
    setLiveThrottleTarget(0);
    lastLiveTraceSampleRef.current = 0; liveSimulationTimeRef.current = 0;
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
      setSweepRunning(false);
      setLiveThrottleTarget(Number(value));
      return;
    }
    setGraphMode("live");
    setSweepRunning(false);
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
          <Card className={`${UI.card} lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden`}>
            <CardHeader className="shrink-0 border-b border-slate-700/60 !pb-4">
              <div className="text-[10px] uppercase tracking-[0.25em] text-sky-400">Apex · Engine laboratory</div>
              <CardTitle className={UI.title}>{config.gameMeta?.name ?? 'Custom engine'}</CardTitle>
              <div className="text-xs text-slate-400">{sweepRunning ? 'Full-load reference sweep · optimal mixture / estimated MBT' : 'Choose an engine, tune it, then run a sweep.'}</div>
              <div className="grid grid-cols-[1fr_auto] gap-2 pt-2">
                <Button className={`${UI.buttonPrimary} !h-12`} onClick={() => sweepRunning ? setSweepRunning(false) : void runSweep()}>
                  <Gauge className="h-4 w-4" /> {sweepRunning ? 'Stop dyno' : 'Run dyno'}
                </Button>
                <Button className={UI.buttonSecondary} variant="secondary" onClick={async () => { if (!audioEnabled) await ensureAudio(); setAudioEnabled(v=>!v); }}>
                  <Volume2 className="h-4 w-4" /> {audioEnabled ? 'Mute' : 'Audio'}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-3" role="navigation" aria-label="Simulator sections">
                <ControlTabButton active={tab === 'library'} onClick={() => setTab('library')}>Library</ControlTabButton>
                <ControlTabButton active={tab === 'engine'} onClick={() => setTab('engine')}>Engine</ControlTabButton>
                <ControlTabButton active={tab === 'induction'} onClick={() => setTab('induction')}>Boost</ControlTabButton>
                <ControlTabButton active={tab === 'live'} onClick={() => setTab('live')}>Drive</ControlTabButton>
                <ControlTabButton active={tab === 'environment'} onClick={() => setTab('environment')}>Test setup</ControlTabButton>
                <ControlTabButton active={tab === 'audio'} onClick={() => setTab('audio')}>Sound</ControlTabButton>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 grid gap-4 overflow-y-auto !pt-4 lg:max-h-[calc(100vh-20rem)]">
              {tab === 'library' && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <label htmlFor="engine-search" className="text-xs font-medium text-slate-300">Find an engine</label>
                    <input id="engine-search" value={presetSearch} onChange={e=>setPresetSearch(e.target.value)} placeholder="Search any make, engine or layout…" className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" />
                    <label htmlFor="manufacturer" className="text-xs font-medium text-slate-300">Manufacturer</label>
                    <select id="manufacturer" value={presetFilter ? 'all' : manufacturer} onChange={e=>{setManufacturer(e.target.value);setPresetSearch('');}} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
                      <option value="all">All manufacturers</option>
                      {manufacturers.map(name=><option key={name} value={name}>{name} · {presets.filter(p=>p.manufacturer===name).length}</option>)}
                    </select>
                    <div className="text-xs text-slate-500">{presets.filter(p=>p.group==='factory').length} examples · {manufacturers.length} manufacturers{presetFilter ? ` · ${factoryPresets.length} matches across all makes` : ''}</div>
                  </div>
                  {activeCalibration && <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-slate-300"><div className="font-medium text-sky-300">{activeCalibration.evidence==='dyno-chart'?'Dyno curve fit':'Published rating anchors'}</div><div className="mt-1">{activeCalibration.variant}</div><div className="mt-1 text-slate-400">{config.calibrationEnabled===false?'Calibration disabled':stockCalibration?'Stock model baseline':'Modified hardware · base correction retained'}</div></div>}
                  {selectedPreset?.setupKind === 'illustrative' && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">Approximate setup loaded. Nominal capacity and architecture identify the example; geometry, rev limit and tuning are illustrative.</div>}
                  <div className="grid gap-3">
                    {visibleManufacturers.map(make=><details key={`${make}-${manufacturer}-${Boolean(presetFilter)}`} open={manufacturer===make || Boolean(presetFilter)} className="rounded-xl border border-slate-700/70 bg-slate-900/60">
                      <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-slate-100">{make} <span className="float-right text-xs font-normal text-slate-400">{factoryPresets.filter(p=>p.manufacturer===make).length} engines</span></summary>
                      <div className="grid gap-1.5 px-2 pb-3">
                        {factoryPresets.filter(p=>p.manufacturer===make).map(preset=><button key={preset.name} onClick={()=>applyPreset(preset)} aria-pressed={config.gameMeta?.name===preset.name} className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${config.gameMeta?.name===preset.name ? 'border-sky-500/60 bg-sky-500/10' : 'border-transparent bg-slate-950/50 hover:border-slate-600'}`}>
                          <span className="block text-sm font-medium text-slate-100">{preset.name}</span>
                          <span className="mt-1 block text-[11px] text-slate-400">{preset.nominalLitres?.toFixed(1)} L · {engineLayouts[preset.config.engineLayout!]?.label} · {preset.config.induction==='na'?'Naturally aspirated':preset.config.induction==='turbo'?'Turbocharged':'Supercharged'}{calibrationForPreset(preset.name)?(calibrationForPreset(preset.name)?.evidence==='dyno-chart'?' · Dyno curve fit':' · Rating anchors'):preset.setupKind==='illustrative'?' · Approx. setup':''}</span>
                        </button>)}
                        {manufacturerReferences[make] && <a className="px-3 pt-2 text-xs text-sky-400 hover:underline" href={manufacturerReferences[make].url} target="_blank" rel="noreferrer">{manufacturerReferences[make].label} ↗</a>}
                      </div>
                    </details>)}
                    {!visibleManufacturers.length && <p className="text-sm text-slate-400">No factory examples match. Try an engine code or manufacturer.</p>}
                  </div>
                  <details className="rounded-xl border border-slate-700/60 p-3 text-xs text-slate-400"><summary className="cursor-pointer">About these examples</summary><p className="mt-2">Real engine families and named factory applications, with approximate simulator setups. New entries use nominal displacement and estimated square bore/stroke geometry. Rev limits, boost, compression and tuning require individual verification. Only entries labelled Dyno curve fit or Rating anchors have source-based calibration; all other examples remain generic estimates. Related applications can share an engine family. Manufacturer links are background references, not verification of every setting.</p></details>
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

                  <details className="rounded-xl border border-slate-700/60 p-3"><summary className="cursor-pointer text-sm text-slate-300">Save or export your setup</summary>
                    <div className="mt-3 grid gap-2">
                      <input value={savePresetName} onChange={e=>setSavePresetName(e.target.value)} placeholder="Name your setup" aria-label="Preset name" className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" />
                      <Button className={UI.buttonOutline} variant="outline" onClick={saveCurrentPreset}>Save current</Button>
                      <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={exportConfigFile}>Export JSON</Button><Button variant="outline" onClick={copyConfigJson}>Copy JSON</Button></div>
                      {copyStatusText && <span className="text-xs text-slate-400">{copyStatusText}</span>}
                    </div>
                  </details>
                </div>
              )}
              {tab === "live" && (
                <div className="grid gap-4">
                  <p className="text-xs text-slate-400">Move the throttle to free-rev, or use Run dyno above for a full-load sweep.</p>
                  <div className="text-xs text-slate-400">Live mode uses your mixture and ignition settings. Dyno uses fuel-specific target mixture and estimated best-torque timing.</div>
                  <LabeledSlider label="Mixture (gasoline-scale AFR)" value={runtime.afr} onChange={v=>updateRuntime("afr",v)} min={8} max={20} step={0.1} display={`${fmt(runtime.afr,1)} · λ ${fmt(runtime.afr/14.7,2)}`} />
                  <LabeledSlider label="Ignition advance" value={runtime.ignitionDeg} onChange={v=>updateRuntime("ignitionDeg",v)} min={0} max={45} step={1} display={`${fmt(runtime.ignitionDeg)}° BTDC`} />
                  <LabeledSlider label="Throttle" value={runtime.throttle * 100} onChange={(v) => updateRuntime("throttle", v / 100)} min={0} max={100} display={`${fmt(runtime.throttle * 100, 0)} %`} />
                  <div className="grid grid-cols-2 gap-3">
                    <Button className={UI.buttonPrimary} onClick={() => setRunning((v) => !v)}>
                      {running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />} {running ? "Pause sim" : "Resume sim"}
                    </Button>

                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className={UI.buttonOutline} variant="outline" onClick={() => {
                      setGraphMode((currentMode) => {
                        const nextMode = currentMode === "live" ? "dyno" : "live";
                        if (nextMode === "live") {
                          setSweepRunning(false);
                          lastLiveTraceSampleRef.current = 0; liveSimulationTimeRef.current = 0;
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
                    <Button className={UI.buttonOutline} variant="outline" onClick={() => { lastLiveTraceSampleRef.current = 0; liveSimulationTimeRef.current = 0; setRuntime({ ...defaultRuntime, rpm: resolveIdleRpm(config) }); setLiveThrottleTarget(defaultRuntime.throttle); setLiveTrace([]); setSweepCursor(1200); setSweepRunning(false); }}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button className={UI.buttonOutline} variant="outline" onClick={exportConfigFile}>Export JSON</Button>
                    <Button className={UI.buttonOutline} variant="outline" onClick={copyConfigJson}>Copy JSON</Button>
                  </div>
                  {copyStatusText ? <div className="text-xs text-slate-300">{copyStatusText}</div> : null}

                </div>
              )}

              {tab === "engine" && (
                <div className="grid gap-4">
                  {activeCalibration && <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={config.calibrationEnabled!==false} onChange={e=>updateConfig('calibrationEnabled',e.target.checked)} />Use source-based engine calibration</label>}
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
                    <LabeledSlider label="RPM cutoff" value={config.redline} onChange={(v) => updateConfig("redline", v)} min={4000} max={18000} step={100} display={`${fmt(config.redline, 0)} rpm`} />
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
                        <label className="grid gap-2 text-sm text-slate-300">Compressor efficiency model
                        <select aria-label="Compressor efficiency model" value={config.compressorMap??'generic'} onChange={e=>updateConfig('compressorMap',e.target.value as CompressorMapKey)} className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">
                          <option value="generic">Generic turbo family</option><option value="g25-550">Garrett G25-550 · sampled map</option><option value="gtx3071r-gen2">Garrett GTX3071R Gen II · sampled map</option>
                        </select>
                      </label>
                      {activeMap && <div className="text-xs text-slate-400">Manual efficiency samples, approximately ±3 percentage points. Outside the sampled interior, the generic model is used. This does not verify surge, choke, shaft speed or turbine matching. <a className="text-sky-400" href={activeMap.source} target="_blank" rel="noreferrer">Manufacturer map ↗</a></div>}
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
                  <p className="text-xs text-slate-400">Inertia and brake load affect acceleration in Drive. Reference dyno curves are steady-state estimates, independent of sweep speed.</p>
                  <LabeledSlider label="Dyno roller inertia" value={config.dynoRollerInertia} onChange={(v) => updateConfig("dynoRollerInertia", v)} min={20} max={140} step={1} display={`${fmt(config.dynoRollerInertia, 0)} · relative scale`} />
                  <LabeledSlider label="Dyno brake load" value={config.dynoBrakeLoad} onChange={(v) => updateConfig("dynoBrakeLoad", v)} min={0} max={1000} step={1} display={`${fmt(config.dynoBrakeLoad, 0)} lb-ft`} />
                </div>
              )}

              {tab === "audio" && (
                <div className="grid gap-4">
                  <div className="rounded-xl border border-sky-500/30 p-3 text-sm">
                    <label htmlFor="audio-model" className="block mb-2 text-slate-300">Sound model comparison</label>
                    <select id="audio-model" aria-label="Sound model comparison" className={UI.select} value={config.audioModel??'legacy'} onChange={e=>updateConfig('audioModel',e.target.value as 'legacy'|'acoustic')}>
                      <option value="legacy">Established engine voice</option>
                      <option value="acoustic" disabled={!acousticProfileFor(config)}>Acoustic prototype · exhaust paths</option>
                    </select>
                    <p className="mt-2 text-xs text-slate-400">{acousticStatus==='ready'?'Acoustic prototype active · not recording-calibrated':acousticStatus==='off'?'Audio is off · enable it to audition':acousticStatus==='loading'?'Loading acoustic model…':acousticStatus==='fallback'?'Acoustic model unavailable · established voice is playing':acousticStatus==='unsupported'?'This engine uses its established voice':'Established voice selected'}. Audio must be enabled to audition.</p>
                    <div className="mt-3 flex flex-wrap gap-2">{[['B234R','Saab B234R'],['Chevrolet LS3 6.2','Chevrolet LS3'],['Honda F20C','Honda F20C']].map(([name,label])=><Button key={name} className={UI.buttonOutline} onClick={()=>{const preset=presets.find(p=>p.name===name);if(preset){applyPreset(preset);setConfig(current=>({...current,audioModel:'acoustic'}));}}}>Try {label}</Button>)}</div>
                    <p className="mt-2 text-xs text-slate-400">Prototype geometry, exhaust resonances and room responses are modelled assumptions. They have not been matched to reference recordings. Lift off in Drive to hear inferred fuel-cut overrun; firing-mode overrides apply to the established voice.</p>
                  </div>

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
                  <details className="text-xs text-slate-400"><summary className="cursor-pointer">Reference listening checklist</summary><p className="mt-2">Use the same headphones and microphone position for both models. Compare a warm engine at idle, steady 2000/4000 RPM, a loaded sweep and closed-throttle coast-down. Free revving is a separate reference from an on-load dyno pull. Match playback loudness before judging tone. No reference recordings are bundled or claimed as validation; a recording of your own B234R is the best first comparison.</p></details>
                  <LabeledSlider label="Engine loudness" value={config.engineLoudness * 100} onChange={(v) => updateConfig("engineLoudness", v / 100)} min={20} max={160} display={`${fmt(config.engineLoudness * 100, 0)} %`} />
                  <LabeledSlider label="Turbo loudness" value={config.turboLoudness * 100} onChange={(v) => updateConfig("turboLoudness", v / 100)} min={0} max={220} display={`${fmt(config.turboLoudness * 100, 0)} %`} />
                  <LabeledSlider label="Supercharger loudness" value={config.superchargerLoudness * 100} onChange={(v) => updateConfig("superchargerLoudness", v / 100)} min={0} max={180} display={`${fmt(config.superchargerLoudness * 100, 0)} %`} />
                  <LabeledSlider label="Sound texture" value={config.soundTexture * 100} onChange={(v) => updateConfig("soundTexture", v / 100)} min={0} max={100} display={`${fmt(config.soundTexture * 100, 0)} %`} />
                  <LabeledSlider label="Room size" value={config.roomSize * 100} onChange={(v) => updateConfig("roomSize", v / 100)} min={0} max={100} display={`${fmt(config.roomSize * 100, 0)} %`} />
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-3 text-sm text-slate-300">
                    Apex Syndicate audio: engine-specific exhaust pulses, smoother rev transitions and load-sensitive intake and turbo sounds. Try rear exhaust for the engine note, or engine bay for induction detail.
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
                {activeCalibration && <details className="rounded-xl border border-sky-500/30 p-3 text-sm text-slate-300"><summary className="cursor-pointer text-sky-300">Calibration evidence · {activeCalibration.evidence==='dyno-chart'?'Digitised dyno curve':'Published ratings only'}</summary><p className="mt-3">{activeCalibration.variant}. {activeCalibration.note}</p><p className="mt-2 text-xs text-slate-400">Fixed charge-flow correction fitted at 20°C, sea level, 45% humidity; this normalisation is assumed, not a reconstruction of the source test conditions. Rating-only profiles use an inferred charge-flow curve constrained by published peak power, torque and RPM. This is a fit assumption, not a measured curve. Chart profiles interpolate their measured anchors. Outside the fitted range the endpoint correction is held. Hardware and environment changes remain predictions. Matching fitted anchors is not independent validation.</p><a className="mt-2 block text-sky-400" href={activeCalibration.source} target="_blank" rel="noreferrer">{activeCalibration.sourceLabel} ↗</a>{ratedTorque && ratedPower && <div className="mt-3 overflow-x-auto"><p className="mb-2 text-xs text-slate-400">Peak comparison · current hardware and test conditions. Matching these ratings is calibration, not independent validation.</p><table className="w-full text-xs"><thead><tr><th>Peak</th><th>Published</th><th>Current model</th><th>Error</th></tr></thead><tbody><tr><td>Power</td><td>{fmt(ratedHp,1)} hp @ {ratedPower.rpm}</td><td>{fmt(peakHp.brakeHp,1)} hp @ {peakHp.rpm}</td><td>{fmt((peakHp.brakeHp/ratedHp-1)*100,1)}%</td></tr><tr><td>Torque</td><td>{fmt(ratedTorque.torqueNm,1)} Nm @ {ratedTorque.rpm}</td><td>{fmt(peakTq.torqueLbFt*1.3558179483314004,1)} Nm @ {peakTq.rpm}</td><td>{fmt((peakTq.torqueLbFt*1.3558179483314004/ratedTorque.torqueNm-1)*100,1)}%</td></tr></tbody></table></div>}<div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th>RPM</th><th>Reference Nm</th><th>Current model Nm</th><th>Evidence</th></tr></thead><tbody>{activeCalibration.points.map(p=><tr key={p.rpm}><td>{p.rpm}</td><td>{fmt(p.torqueNm,1)}</td><td>{fmt(solveDynoPoint(config,p.rpm).torqueLbFt*1.3558179483314004,1)}</td><td>{p.validationOnly?'Chart holdout':p.basis}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-slate-400">{activeCalibration.evidence==='dyno-chart'?'Chart reading tolerance approximately ±4%.':'Stock peaks are constrained to published maxima. Curve shape between ratings and modified-engine output remain unvalidated predictions.'}</p></details>}
                {activeMap && config.induction==='turbo' && <div className="rounded-xl border border-slate-700 p-3 text-sm"><div>{activeMap.name} · {displayedPoint.compressorMapStatus==='sampled'?'Inside sampled efficiency region':'Generic efficiency fallback'}</div><p className="text-xs text-slate-400">Corrected flow {fmt(displayedPoint.correctedAirLbMin,1)} lb/min · pressure ratio {fmt(displayedPoint.pr,2)} · compressor efficiency {fmt(displayedPoint.compressorEff*100,1)}%. Garrett reference: 545°R / 13.95 psia. Coarse interior efficiency samples only, approximately ±3 percentage points; no surge, choke, speed or turbine validation.</p><a className="text-xs text-sky-400" href={activeMap.image} target="_blank" rel="noreferrer">Open original manufacturer compressor map ↗</a></div>}

                                <div className="h-[500px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 18, left: 10, bottom: 8 }}>
                      <CartesianGrid stroke="#273449" strokeDasharray="3 3" />
                      <XAxis
                        dataKey={graphMode === "dyno" ? "rpm" : "time"}
                        allowDataOverflow
                        type="number"
                        domain={graphMode === "dyno" ? [Math.max(1200, resolveIdleRpm(config)), config.redline] : [liveTimeStart, Math.max(5, lastLiveTime)]}
                        tick={{ fill: "#cbd5e1", fontSize: 12 }}
                        tickFormatter={(value) => graphMode === "dyno" ? `${Math.round(value)}` : `${Number(value).toFixed(1)}s`}
                      />
                      <YAxis yAxisId="left" domain={graphPage === "power" ? [graphMode === "live" ? Math.floor(minLeftAxis/25)*25 : 0, maxLeftAxis] : [0, diagLeftMax]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" domain={graphPage === "power" ? [0, maxRightAxis] : [0, diagRightMax]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip graphPage={graphPage} />} />
                      <Legend wrapperStyle={{ color: "#e2e8f0" }} />
                      {graphMode === "dyno" ? <ReferenceLine x={sweepCursor} stroke="#cbd5e1" strokeDasharray="6 6" /> : null}
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
                  <MetricCard label="RPM" value={`${fmt(displayedPoint.rpm)} rpm`} sub={graphMode === "dyno" ? (sweepRunning ? "Dyno sweep" : "Reference point") : "Loaded run"} />
                  <MetricCard label="Boost" value={`${fmt(displayedPoint.boostPsi, 1)} psi`} sub={`PR ${fmt(displayedPoint.pr, 2)}`} />
                  <MetricCard label="Torque" value={`${fmt(displayedPoint.torqueLbFt)} lb-ft`} sub={`${fmt(displayedPoint.brakeHp)} hp · BMEP ${fmt(displayedPoint.bmepPsi)} psi`} />
                  <MetricCard label={graphPage === "power" ? "Charge temp" : diagnosticMetricMeta[diagLeftMetric].label} value={graphPage === "power" ? `${fmt(displayedPoint.chargeTempC, 1)} °C` : diagnosticMetricMeta[diagLeftMetric].formatter(displayedMetrics[diagLeftMetric])} sub={graphPage === "power" ? `IC eff ${fmt(intercoolerEffectiveness(config.intercoolerType, config.icCoreSize, config.vehicleSpeedKph) * 100)}%` : `Right axis ${diagnosticMetricMeta[diagRightMetric].label}`} />
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
              <MetricCard label="Peak airflow" value={`${fmt(peakAirflow.airLbMin, 1)} lb/min`} />
              <MetricCard label="Peak injector" value={`${fmt(peakInjector.injectorCc)} cc/min`} />
              <MetricCard label="VE @ peak power" value={`${fmt(peakHp.ve * 100)} %`} />
              <MetricCard label="Compressor eff" value={`${fmt(peakHp.compressorEff * 100, 1)} %`} />
              <MetricCard label="Charge temp @ peak" value={`${fmt(peakHp.chargeTempC, 1)} °C`} />
              <MetricCard label="Density @ peak power" value={fmt(peakHp.densityRatio, 2)} />
              <MetricCard label="MAP @ peak power" value={`${fmt(peakHp.mapKpa, 0)} kPa`} />
              <MetricCard label="Target AFR @ peak" value={fmt(peakHp.targetAfr, 1)} />
              <MetricCard label="Fuel flow @ peak" value={`${fmt(peakHp.fuelFlowKgHr,1)} kg/h`} />
              <MetricCard label="Brake efficiency @ peak" value={`${fmt(peakHp.brakeThermalEfficiency*100,1)} %`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


