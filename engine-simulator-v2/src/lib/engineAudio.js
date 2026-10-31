// Ported from sventurb0/apex_syndicate engineAudio.js (blob 1afe193869d6a584bddfa2859d3b8960951f5b70).
import { useEffect, useRef, useState } from "react";

import { acousticProfileFor } from "./engineAcousticProcessor";
import { acousticRoomBuffer } from "./engineAcousticRoom";

import { blowerVoice, releaseVoice, recoverFireTime } from "./engineAudioDynamics";

import { clamp, lerp, smoothStep, engineLayouts } from "./engineAudioPrimitives";

// Local helper to avoid pulling extra non-audio exports from engineSim.
function displacementLitres(boreMm, strokeMm, cylinders) {
  return Math.PI * Math.pow(boreMm / 2 / 10, 2) * (strokeMm / 10) * cylinders / 1000;
}

const PRIVATE_AUDIO_SAMPLE_KEYS = ["v8Burble", "v10Edge", "v12Sweet", "dumpSharp", "flutter", "saabCrackle", "saabDump"];

function getI4AudioSubtype(config = {}) {
  const car = config.gameMeta || {};
  const text = `${car.name || ""} ${car.bodyStyle || ""} ${car.className || ""} ${car.affinity || ""} ${car.engineType || ""} ${car.pulse || ""}`.toLowerCase();
  if (config.engineLayout === "flat4") return "boxerTurboFlat4";
  if (config.engineLayout !== "i4") return "notI4";
  if (config.engineKind === "turboDiesel" || car.induction === "turboDiesel" || text.includes("diesel")) return "dieselI4";
  if (config.engineKind === "hybridTurbo" || car.induction === "hybridTurbo" || car.tier >= 4 || /prototype|mule|ghostline/.test(text)) return "hybridPrototypeI4";
  if (config.induction === "turbo" || car.induction === "turbo") {
    if ((car.id === "griffin-900" || config.headerType === "unequal") && /griffin|saab|trionic|aero|b204|b234/.test(text)) return "saabUnequalTurboI4";
    if (/griffin|saab|trionic|aero|b204|b234/.test(text)) return "saabTurboI4";
    if (/drift|kaiju|200sx|s13|aeroblade/.test(text) || config.exhaustType === "race" || config.headerType === "fourone") return "driftTurboI4";
    if (config.injectionType === "direct" || car.injectionType === "direct" || config.vvtMode === "dual" || config.turboArchitecture === "twinscroll") return "modernTurboI4";
    return "classicTurboI4";
  }
  if (config.valvetrainLayout === "sohc" || car.valvetrainLayout === "sohc" || /brickline|sable|sprint|economy|saloon/.test(text)) return "oldSohcI4";
  if (/gti|rallye|ae coupe|compact rs|hot hatch|cam change/.test(text) || config.redline >= 7400 || config.vvtMode !== "none") return "hotHatchNaI4";
  return "streetNaI4";
}

function getI4PulseProfile(subtype = "streetNaI4") {
  return {
    oldSohcI4: { accent: [1.16, 0.88, 1.08, 0.92], depth: 0.46, tail: 0.066 },
    hotHatchNaI4: { accent: [1.08, 0.96, 1.04, 0.92], depth: 0.30, tail: 0.044 },
    streetNaI4: { accent: [1.06, 0.97, 1.04, 0.93], depth: 0.26, tail: 0.050 },
    classicTurboI4: { accent: [1.12, 0.90, 1.08, 0.92], depth: 0.38, tail: 0.054 },
    boxerTurboFlat4: { accent: [1.55, 0.48, 1.36, 0.60], depth: 0.92, tail: 0.092 },
    saabUnequalTurboI4: { accent: [1.68, 0.34, 1.46, 0.52], depth: 0.98, tail: 0.096 },
    saabTurboI4: { accent: [1.18, 0.84, 1.10, 0.88], depth: 0.52, tail: 0.064 },
    driftTurboI4: { accent: [1.20, 0.82, 1.12, 0.86], depth: 0.56, tail: 0.048 },
    modernTurboI4: { accent: [1.04, 0.98, 1.02, 0.96], depth: 0.20, tail: 0.043 },
    hybridPrototypeI4: { accent: [1.03, 0.99, 1.01, 0.97], depth: 0.15, tail: 0.038 },
    dieselI4: { accent: [1.24, 0.76, 1.14, 0.86], depth: 0.60, tail: 0.076 },
  }[subtype] || { accent: [1.06, 0.97, 1.04, 0.93], depth: 0.26, tail: 0.050 };
}

function getExhaustAudioTuning(config) {
  const tune = { lowGain: 1, midGain: 1, highGain: 1, lowFreq: 0, midFreq: 0, highFreq: 0, qBias: 0, oldV8Blend: 0 };
  const cylinders = engineLayouts[config.engineLayout]?.cylinders || 4;
  const dispL = config.engineLayout === "rotary2" ? 1.3 : displacementLitres(Number(config.bore || 86), Number(config.stroke || 86), cylinders);
  const oldCrossplaneV8 = config.engineLayout === "v8" && config.v8Crank === "crossplane" && config.valvetrainLayout === "ohv";
  const bigBlockBlend = oldCrossplaneV8 ? clamp((dispL - 4.8) / 2.4, 0, 1) : 0;
  if (config.exhaustType === "performance") { tune.midGain += 0.1; tune.highGain += 0.14; tune.highFreq += 70; tune.qBias += 0.15; }
  if (config.exhaustType === "race") { tune.lowGain -= 0.05; tune.midGain += 0.18; tune.highGain += 0.3; tune.midFreq += 45; tune.highFreq += 180; tune.qBias += 0.4; }
  if (config.headerType === "fourtwoone") { tune.lowGain += 0.08; tune.midGain += 0.08; tune.midFreq -= 20; }
  if (config.headerType === "fourone") { tune.midGain += 0.1; tune.highGain += 0.16; tune.highFreq += 120; }
  if (config.headerType === "equal") { tune.midGain += 0.06; tune.highGain += 0.1; tune.qBias += 0.18; }
  if (config.headerType === "unequal") { tune.lowGain += 0.12; tune.midGain += 0.03; tune.highGain -= 0.06; tune.lowFreq -= 8; tune.midFreq -= 12; }
  if (config.induction === "turbo") { tune.highGain -= 0.05; tune.lowGain += 0.03; }
  if (config.engineLayout === "i4" || config.engineLayout === "flat4") {
    const subtype = getI4AudioSubtype(config);
    if (subtype === "oldSohcI4") { tune.lowGain += 0.18; tune.midGain += 0.05; tune.highGain -= 0.12; tune.lowFreq -= 14; tune.midFreq -= 20; tune.highFreq -= 120; tune.qBias -= 0.04; }
    if (subtype === "hotHatchNaI4") { tune.lowGain -= 0.04; tune.midGain += 0.12; tune.highGain += 0.22; tune.midFreq += 36; tune.highFreq += 260; tune.qBias += 0.20; }
    if (subtype === "streetNaI4") { tune.lowGain += 0.04; tune.midGain += 0.05; tune.highGain += 0.02; tune.midFreq += 8; tune.highFreq += 55; tune.qBias += 0.05; }
    if (subtype === "classicTurboI4") { tune.lowGain += 0.08; tune.midGain += 0.08; tune.highGain -= 0.16; tune.lowFreq -= 8; tune.midFreq -= 8; tune.highFreq -= 170; tune.qBias -= 0.02; }
    if (subtype === "boxerTurboFlat4") { tune.lowGain += 0.46; tune.midGain -= 0.02; tune.highGain -= 0.42; tune.lowFreq -= 36; tune.midFreq -= 62; tune.highFreq -= 420; tune.qBias -= 0.18; }
    if (subtype === "saabUnequalTurboI4") { tune.lowGain += 0.52; tune.midGain -= 0.04; tune.highGain -= 0.44; tune.lowFreq -= 40; tune.midFreq -= 68; tune.highFreq -= 430; tune.qBias -= 0.20; }
    if (subtype === "saabTurboI4") { tune.lowGain += 0.20; tune.midGain += 0.12; tune.highGain -= 0.24; tune.lowFreq -= 18; tune.midFreq -= 22; tune.highFreq -= 230; tune.qBias -= 0.06; }
    if (subtype === "driftTurboI4") { tune.lowGain += 0.03; tune.midGain += 0.18; tune.highGain += 0.12; tune.midFreq += 34; tune.highFreq += 140; tune.qBias += 0.18; }
    if (subtype === "modernTurboI4") { tune.lowGain -= 0.02; tune.midGain += 0.08; tune.highGain -= 0.03; tune.midFreq += 16; tune.highFreq -= 20; tune.qBias += 0.04; }
    if (subtype === "hybridPrototypeI4") { tune.lowGain -= 0.08; tune.midGain += 0.05; tune.highGain += 0.02; tune.lowFreq += 4; tune.midFreq += 24; tune.highFreq += 80; tune.qBias += 0.10; }
    if (subtype === "dieselI4") { tune.lowGain += 0.26; tune.midGain += 0.06; tune.highGain -= 0.42; tune.lowFreq -= 20; tune.midFreq -= 38; tune.highFreq -= 410; tune.qBias -= 0.12; }
  }
  if (oldCrossplaneV8) {
    tune.lowGain += 0.42 + bigBlockBlend * 0.28;
    tune.midGain += 0.02 - bigBlockBlend * 0.08;
    tune.highGain -= 0.52 + bigBlockBlend * 0.18;
    tune.lowFreq -= 26 + bigBlockBlend * 10;
    tune.midFreq -= 64 + bigBlockBlend * 34;
    tune.highFreq -= 520 + bigBlockBlend * 260;
    tune.qBias -= 0.18;
    tune.oldV8Blend = 0.72 + bigBlockBlend * 0.28;
  }
  return tune;
}

function getAudioProfile(config, rpm) {
  const classicCrossplaneV8 = config.engineLayout === "v8" && config.v8Crank === "crossplane" && config.valvetrainLayout === "ohv";
  const idleBand = 1 - smoothStep(rpm, 900, 2300);
  const profile = { subBias: 0, bodyBias: 0, bodyFilterOffset: 0, pulseFilterOffset: 0, pulseGainBias: 0, raspBias: 0, rumbleBias: 0, intakeBias: 0, whistleBias: 0, smoothness: 0.5, roughness: 0.12, warble: 0, mechanicalGain: 0.02, mechanicalFreq: 2600, topTick: 0, lowBurble: 0, wooCut: 1, transientBias: 0.08, sirenCut: 1, thumpGain: 0, idleChop: 0 };
  const i4Subtype = (config.engineLayout === "i4" || config.engineLayout === "flat4") ? getI4AudioSubtype(config) : "notI4";
  if (config.engineLayout === "i3") { profile.warble = 0.16; profile.roughness = 0.22; profile.pulseGainBias = 0.02; }
  if (config.engineLayout === "i4" || config.engineLayout === "flat4") {
    if (i4Subtype === "boxerTurboFlat4") { profile.smoothness = 0.16; profile.roughness = 0.27; profile.warble = 0.34; profile.bodyBias = 0.090; profile.rumbleBias = 0.082; profile.pulseGainBias = 0.070; profile.lowBurble = 0.160; profile.raspBias = -0.065; profile.topTick = -0.050; profile.intakeBias = 0.010; profile.whistleBias += 0.004; profile.wooCut = 0.44; profile.transientBias = 0.10; profile.thumpGain = 0.006; }
    if (i4Subtype === "oldSohcI4") { profile.smoothness = 0.34; profile.roughness = 0.18; profile.warble = 0.08; profile.bodyBias = 0.032; profile.rumbleBias = 0.028; profile.pulseGainBias = 0.024; profile.mechanicalGain += 0.022; profile.mechanicalFreq = 1850; profile.topTick -= 0.025; profile.lowBurble = 0.060; profile.wooCut = 0.70; }
    if (i4Subtype === "hotHatchNaI4") { profile.smoothness = 0.48; profile.roughness = 0.12; profile.warble = 0.07; profile.bodyBias = 0.012; profile.rumbleBias = 0.006; profile.pulseGainBias = 0.010; profile.raspBias = 0.045; profile.topTick = 0.080; profile.intakeBias = 0.052; profile.wooCut = 0.82; profile.transientBias = 0.13; }
    if (i4Subtype === "streetNaI4") { profile.smoothness = 0.44; profile.roughness = 0.13; profile.warble = 0.055; profile.bodyBias = 0.016; profile.rumbleBias = 0.010; profile.pulseGainBias = 0.010; profile.raspBias = 0.020; profile.topTick = 0.035; profile.intakeBias = 0.030; profile.wooCut = 0.80; }
    if (i4Subtype === "classicTurboI4") { profile.smoothness = 0.42; profile.roughness = 0.145; profile.warble = 0.10; profile.bodyBias = 0.028; profile.rumbleBias = 0.018; profile.pulseGainBias = 0.018; profile.raspBias = -0.006; profile.topTick = 0.020; profile.intakeBias = 0.020; profile.whistleBias += 0.018; profile.wooCut = 0.66; }
    if (i4Subtype === "saabUnequalTurboI4") { profile.smoothness = 0.15; profile.roughness = 0.28; profile.warble = 0.38; profile.bodyBias = 0.102; profile.rumbleBias = 0.088; profile.pulseGainBias = 0.082; profile.lowBurble = 0.180; profile.raspBias = -0.075; profile.topTick = -0.070; profile.intakeBias = 0.008; profile.whistleBias += 0.003; profile.wooCut = 0.40; profile.transientBias = 0.10; profile.thumpGain = 0.007; }
    if (i4Subtype === "saabTurboI4") { profile.smoothness = 0.34; profile.roughness = 0.19; profile.warble = 0.12; profile.bodyBias = 0.050; profile.rumbleBias = 0.035; profile.pulseGainBias = 0.030; profile.lowBurble = 0.048; profile.raspBias = -0.018; profile.topTick = 0.000; profile.intakeBias = 0.018; profile.whistleBias += 0.010; profile.wooCut = 0.62; profile.transientBias = 0.14; }
    if (i4Subtype === "driftTurboI4") { profile.smoothness = 0.32; profile.roughness = 0.205; profile.warble = 0.11; profile.bodyBias = 0.030; profile.rumbleBias = 0.016; profile.pulseGainBias = 0.036; profile.raspBias = 0.070; profile.topTick = 0.060; profile.intakeBias = 0.046; profile.whistleBias += 0.020; profile.wooCut = 0.75; profile.transientBias = 0.18; }
    if (i4Subtype === "modernTurboI4") { profile.smoothness = 0.55; profile.roughness = 0.10; profile.warble = 0.04; profile.bodyBias = 0.008; profile.rumbleBias = 0.006; profile.pulseGainBias = 0.006; profile.raspBias = 0.010; profile.topTick = 0.035; profile.intakeBias = 0.026; profile.whistleBias += 0.026; profile.wooCut = 0.80; }
    if (i4Subtype === "hybridPrototypeI4") { profile.smoothness = 0.60; profile.roughness = 0.08; profile.warble = 0.03; profile.bodyBias = 0.004; profile.rumbleBias = 0.004; profile.pulseGainBias = 0.004; profile.raspBias = 0.025; profile.topTick = 0.025; profile.intakeBias = 0.020; profile.whistleBias += 0.045; profile.wooCut = 0.68; profile.sirenCut = 0.35; }
    if (i4Subtype === "dieselI4") { profile.smoothness = 0.22; profile.roughness = 0.24; profile.warble = 0.09; profile.bodyBias = 0.055; profile.rumbleBias = 0.060; profile.pulseGainBias = 0.038; profile.mechanicalGain += 0.040; profile.mechanicalFreq = 1250; profile.topTick -= 0.080; profile.lowBurble = 0.080; profile.wooCut = 0.55; profile.transientBias = 0.05; }
  }
  if (config.engineLayout === "i5") { profile.warble = 0.32; profile.roughness = 0.18; profile.bodyBias = 0.01; profile.rumbleBias = 0.012; profile.pulseGainBias = 0.012; }
  if (config.engineLayout === "i6") { profile.smoothness = 0.56; profile.roughness = 0.145; profile.warble = 0.22; profile.bodyBias = 0.035; profile.rumbleBias = 0.025; profile.pulseGainBias = 0.016; profile.wooCut = 0.78; }
  if (config.engineLayout === "v6") { profile.smoothness = 0.46; profile.roughness = 0.18; profile.warble = 0.34; profile.bodyBias = 0.025; profile.pulseGainBias = 0.018; profile.rumbleBias = 0.012; }
  if (config.engineLayout === "v8") { profile.smoothness = config.v8Crank === "flatplane" ? 0.62 : 0.28; profile.roughness = config.v8Crank === "flatplane" ? 0.1 : 0.25; profile.lowBurble = config.v8Crank === "flatplane" ? 0 : 0.28; profile.warble = config.v8Crank === "flatplane" ? 0.08 : 0.18; profile.subBias = config.v8Crank === "flatplane" ? -0.02 : 0.12; profile.bodyBias += config.v8Crank === "flatplane" ? 0 : 0.035; profile.rumbleBias += config.v8Crank === "flatplane" ? 0 : 0.035; profile.pulseGainBias += config.v8Crank === "flatplane" ? 0 : 0.050; profile.thumpGain += config.v8Crank === "flatplane" ? 0 : 0.006; }
  if (config.engineLayout === "v12") { profile.smoothness = 0.84; profile.roughness = 0.055; profile.bodyBias = 0.02; profile.raspBias = -0.015; profile.rumbleBias = 0.035; profile.wooCut = 0.70; profile.topTick = -0.02; }
  if (config.engineLayout === "rotary2") { profile.smoothness = 0.18; profile.roughness = 0.34; profile.warble = 0.18; profile.raspBias = 0.24; profile.topTick = 0.16; profile.intakeBias = 0.08; profile.wooCut = 0.36; profile.sirenCut = 0.12; profile.transientBias = 0.22; }
  if (config.engineLayout !== "rotary2" && config.valvetrainLayout === "ohv") { profile.mechanicalGain += 0.024; profile.mechanicalFreq = 1750; profile.lowBurble += 0.07; profile.warble += config.engineLayout === "v8" ? 0.06 : 0.02; profile.roughness += config.engineLayout === "v8" ? 0.055 : 0; profile.thumpGain += config.engineLayout === "v8" ? 0.010 : 0; }
  if (config.engineLayout !== "rotary2" && config.valvetrainLayout === "sohc") { profile.mechanicalGain += 0.012; profile.mechanicalFreq = 2250; }
  if (config.engineLayout !== "rotary2" && config.valvetrainLayout === "dohc") { profile.mechanicalGain += 0.01; profile.mechanicalFreq = 3200; profile.topTick += 0.04; }
  if (config.engineLayout !== "rotary2" && config.valvesPerCylinder >= 4) { profile.topTick += 0.03; profile.raspBias += 0.01; }
  if (config.induction === "turbo") profile.whistleBias += config.turboArchitecture === "twinscroll" ? 0.04 : config.turboArchitecture === "single" ? 0 : 0.02;
  if (config.exhaustType === "performance") { profile.raspBias += 0.03; profile.topTick += 0.02; }
  if (config.exhaustType === "race") { profile.raspBias += config.engineLayout === "v12" ? 0.015 : 0.06; profile.topTick += config.engineLayout === "v12" ? 0.005 : 0.04; profile.lowBurble -= config.engineLayout === "v8" && config.v8Crank === "crossplane" ? 0 : 0.02; }
  if (config.headerType === "unequal") { profile.lowBurble += 0.05; profile.bodyBias += 0.02; profile.warble += 0.06; profile.smoothness -= 0.04; }
  const liftBlend = config.liftSystem === "none" ? 0 : smoothStep(rpm, config.liftSwitchRpm - 400, config.liftSwitchRpm + 250);
  profile.roughness = clamp(profile.roughness * (0.55 + config.soundTexture * 0.45), 0.02, 0.28);
  profile.topTick += config.soundTexture * 0.02 + liftBlend * (config.liftSystem === "aggressive" ? 0.1 : 0.05);
  profile.mechanicalGain += liftBlend * (config.liftSystem === "aggressive" ? 0.02 : 0.01);
  if (config.engineLayout === "v12") { profile.raspBias = clamp(profile.raspBias, -0.02, 0.035); profile.topTick = clamp(profile.topTick * 0.35, -0.02, 0.035); profile.mechanicalFreq = 2450; }
  if (classicCrossplaneV8) { profile.lowBurble += 0.24 + idleBand * 0.16; profile.warble += 0.035 + idleBand * 0.10; profile.pulseGainBias += 0.070 + idleBand * 0.060; profile.rumbleBias += 0.070; profile.bodyBias += 0.055; profile.thumpGain += 0.030 + idleBand * 0.036; profile.idleChop = idleBand * 1.18; profile.mechanicalFreq = 980; profile.mechanicalGain *= 0.45; profile.topTick -= 0.10; profile.raspBias -= 0.085; profile.smoothness -= 0.16; profile.roughness += idleBand * 0.055; profile.wooCut = Math.min(profile.wooCut, 0.54); }
  return profile;
}

export function createProceduralSampleBuffer(ctx, key) {
  const spec = {
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
  const sample = spec[key] || spec.dumpSharp;
  const buffer = ctx.createBuffer(1, Math.floor(sample.duration * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  sample.build(data, ctx.sampleRate);
  return buffer;
}

export function useEngineAudio(config, point, enabled, throttle) {
  const [acousticStatus, setAcousticStatus] = useState("legacy");
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const stateRef = useRef({ config, point, throttle });
  const schedulerRef = useRef(null);
  const nextFireTimeRef = useRef(0);
  const patternIndexRef = useRef(0);
  const lastThrottleRef = useRef(throttle);
  const lastBoostRef = useRef(0);
  const lastPopTimeRef = useRef(0);
  const lastLimiterTimeRef = useRef(0);
  const lastReleaseTimeRef = useRef(0);
  const lastSampleTimesRef = useRef({});
  const audioSmoothRef = useRef(null);
  const lifecycleRef = useRef(0);
  const transientVoicesRef = useRef(new Set());
  const trackVoice = (source, ...nodes) => {
    transientVoicesRef.current.add(source);
    source.onended = () => {
      transientVoicesRef.current.delete(source);
      source.disconnect();
      nodes.forEach(node => node.disconnect());
    };
  };

  useEffect(() => { stateRef.current = { config, point, throttle }; }, [config, point, throttle]);

  const closeAudio = async () => {
    lifecycleRef.current += 1;
    transientVoicesRef.current.clear();
    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    const ctx = ctxRef.current;
    if (ctx) {
      try { await ctx.close(); } catch { /* ignored */ }
    }
    ctxRef.current = null;
    nodesRef.current = null;
    audioSmoothRef.current = null;
  };

  useEffect(() => () => { closeAudio(); }, []);

  const getLayoutAudioWeight = (layout) => ({ rotary2: 1.18, v12: 1.10, v10: 1.45, v8: 1.46, i6: 1.18, v6: 1.18, i5: 1.06, i3: 0.96, i4: 1.0 }[layout] || 1.0);

  const getMicProfile = (position = "dyno_room") => {
    switch (position) {
      case "cockpit": return { exhaust: 0.62, intake: 0.42, block: 0.54, air: 0.28, room: 0.16, hp: 65, lp: 6200 };
      case "engine_bay": return { exhaust: 0.45, intake: 0.78, block: 0.82, air: 0.52, room: 0.10, hp: 45, lp: 8800 };
      case "intake_side": return { exhaust: 0.34, intake: 0.96, block: 0.48, air: 0.74, room: 0.10, hp: 55, lp: 9600 };
      case "rear_exhaust": return { exhaust: 1.12, intake: 0.18, block: 0.28, air: 0.22, room: 0.26, hp: 38, lp: 8300 };
      default: return { exhaust: 0.88, intake: 0.46, block: 0.45, air: 0.38, room: 0.22, hp: 42, lp: 9000 };
    }
  };

  const getFiringPattern = (layout, v8Crank, firingMode) => {
    const normalize = (vals) => {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return vals.map((v) => v / avg);
    };
    switch (layout) {
      case "rotary2": return normalize(firingMode === "even" ? [1, 1, 1] : [0.42, 0.48, 2.10]);
      case "i3": return normalize(firingMode === "cp3_triple" ? [0.62, 1.46, 0.92] : [1.08, 0.92, 1.0]);
      case "i4":
        if (firingMode === "unequal_i4") return normalize([0.48, 0.58, 1.74, 1.20]);
        if (firingMode === "crossplane_i4") return normalize([0.56, 1.44, 0.56, 1.44]);
        if (firingMode === "bigbang_i4") return normalize([0.42, 0.42, 1.58, 1.58]);
        return normalize([1, 1, 1, 1]);
      case "i5": return normalize([0.88, 1.12, 0.94, 1.06, 1.0]);
      case "v4": return normalize(firingMode === "bigbang_v4" ? [0.45, 0.55, 1.45, 1.55] : [1, 1, 1, 1]);
      case "flat6": return normalize([1, 1, 1, 1, 1, 1]);
      case "v6": return normalize(firingMode === "oddfire_v6" ? [0.64, 1.36, 0.76, 1.24, 0.70, 1.30] : [0.82, 1.18, 0.90, 1.10, 0.86, 1.14]);
      case "v8": return normalize(v8Crank === "crossplane" || firingMode === "lopey_v8" ? [0.82, 0.90, 1.14, 1.14, 0.84, 0.92, 1.10, 1.14] : [1, 1, 1, 1, 1, 1, 1, 1]);
      case "v10": return normalize([0.94, 1.06, 0.92, 1.08, 1.0, 0.96, 1.04, 0.94, 1.06, 1.0]);
      case "v12": return normalize([0.96, 1.04, 1.02, 0.98, 1.03, 0.97]);
      case "i6": return normalize([0.86, 1.14, 0.94, 1.06, 0.90, 1.10]);
      default: return normalize([1, 1, 1, 1]);
    }
  };

  const stopAudio = async () => {
    const generation = ++lifecycleRef.current;
    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    const nodes = nodesRef.current;
    const ctx = ctxRef.current;
    if (nodes && ctx) {
      const now = ctx.currentTime;
      for (const source of transientVoicesRef.current) {
        try { source.stop(now + 0.06); } catch { /* already stopped */ }
      }
      nodes.master.gain.cancelScheduledValues(now);
      nodes.master.gain.setTargetAtTime(0.0001, now, 0.025);
      try {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        if (generation === lifecycleRef.current && ctxRef.current === ctx && ctx.state === "running") await ctx.suspend();
      } catch { /* ignored */ }
    }
  };

  const ensureAudio = async () => {
    if (typeof window === "undefined") return false;
    if (ctxRef.current && nodesRef.current) {
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      return true;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    const ctx = new AudioCtx();

    const makeDriveCurve = (amount = 2.2) => {
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
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 135) * 0.08;
        data[i] = (body + crack) * env;
      }
      return buffer;
    };

    const makeOldV8CombustionBuffer = () => {
      const duration = 0.115;
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const t = i / ctx.sampleRate;
        const env = Math.exp(-t * 29);
        const attack = Math.min(1, t / 0.006);
        const fundamental = Math.sin(2 * Math.PI * (36 + t * 22) * t) * 0.95;
        const second = Math.sin(2 * Math.PI * (72 + t * 16) * t) * 0.38;
        const pipe = Math.sin(2 * Math.PI * (118 - t * 18) * t) * 0.18;
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 65) * 0.028;
        data[i] = (fundamental + second + pipe + crack) * env * attack;
      }
      return buffer;
    };

    const makeI4CombustionBuffer = (subtype = "streetNaI4") => {
      const spec = {
        oldSohcI4: { duration: 0.072, decay: 50, base: 58, sweep: 58, body: 0.62, crack: 0.040, rasp: 0.050 },
        hotHatchNaI4: { duration: 0.046, decay: 92, base: 92, sweep: 165, body: 0.42, crack: 0.080, rasp: 0.160 },
        streetNaI4: { duration: 0.052, decay: 76, base: 78, sweep: 110, body: 0.48, crack: 0.060, rasp: 0.095 },
        classicTurboI4: { duration: 0.058, decay: 64, base: 70, sweep: 78, body: 0.52, crack: 0.042, rasp: 0.050 },
        boxerTurboFlat4: { duration: 0.092, decay: 36, base: 44, sweep: 26, body: 0.88, crack: 0.026, rasp: 0.014 },
        saabUnequalTurboI4: { duration: 0.098, decay: 34, base: 42, sweep: 24, body: 0.92, crack: 0.024, rasp: 0.012 },
        saabTurboI4: { duration: 0.068, decay: 52, base: 62, sweep: 64, body: 0.66, crack: 0.035, rasp: 0.036 },
        driftTurboI4: { duration: 0.050, decay: 82, base: 86, sweep: 150, body: 0.48, crack: 0.100, rasp: 0.170 },
        modernTurboI4: { duration: 0.045, decay: 86, base: 82, sweep: 100, body: 0.38, crack: 0.045, rasp: 0.070 },
        hybridPrototypeI4: { duration: 0.040, decay: 96, base: 94, sweep: 135, body: 0.32, crack: 0.040, rasp: 0.105 },
        dieselI4: { duration: 0.084, decay: 42, base: 48, sweep: 35, body: 0.76, crack: 0.090, rasp: 0.020 },
      }[subtype] || { duration: 0.052, decay: 76, base: 78, sweep: 110, body: 0.48, crack: 0.060, rasp: 0.095 };
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * spec.duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const t = i / ctx.sampleRate;
        const env = Math.exp(-t * spec.decay);
        const attack = Math.min(1, t / 0.0035);
        const body = Math.sin(2 * Math.PI * (spec.base + t * spec.sweep) * t) * spec.body;
        const second = Math.sin(2 * Math.PI * (spec.base * 2.05 + t * spec.sweep * 0.45) * t) * 0.20;
        const metallic = Math.sin(2 * Math.PI * (520 + t * 900) * t) * spec.rasp;
        const crack = (Math.random() * 2 - 1) * Math.exp(-t * 95) * spec.crack;
        data[i] = (body + second + metallic + crack) * env * attack;
      }
      return buffer;
    };

    const createResonatorBank = (freqs, qs, gains, destination) => {
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
    master.gain.value = 0.0001;
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

    const dryMix = ctx.createGain();
    const roomMix = ctx.createGain();
    const cleanGain = ctx.createGain();
    cleanGain.gain.value = 2.2; // match the shaper's small-signal gain without distortion
    // Transparent below 0.8; catches short overshoots which compressor attack can miss.
    const outputGuard = ctx.createWaveShaper();
    outputGuard.curve = Float32Array.from({length:4097}, (_, i) => {
      const x = i / 2048 - 1, a = Math.abs(x);
      return a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.15 * Math.tanh((a - 0.8) / 0.15));
    });
    outputGuard.oversample = "4x";
    const peakComp = ctx.createDynamicsCompressor();
    peakComp.threshold.value = -3;
    peakComp.knee.value = 0;
    peakComp.ratio.value = 20;
    peakComp.attack.value = 0.001;
    peakComp.release.value = 0.06;
    drive.connect(dryMix);
    cleanGain.connect(dryMix);
    dryMix.connect(roomMix).connect(comp).connect(micHp).connect(micLp).connect(peakComp).connect(master).connect(outputGuard).connect(ctx.destination);
    dryMix.connect(roomSend).connect(roomDelay).connect(roomFeedback).connect(roomDelay);
    roomDelay.connect(roomReturn).connect(roomMix);
    const acousticRoom = ctx.createConvolver();
    acousticRoom.buffer = acousticRoomBuffer(ctx);
    const acousticRoomSend = ctx.createGain();
    acousticRoomSend.gain.value = 0;
    dryMix.connect(acousticRoomSend).connect(acousticRoom).connect(roomMix);

    const exhaustBus = ctx.createGain();
    const intakeBus = ctx.createGain();
    const blockBus = ctx.createGain();
    const airBus = ctx.createGain();
    const fxBus = ctx.createGain();
    exhaustBus.connect(drive);
    intakeBus.connect(cleanGain);
    blockBus.connect(cleanGain);
    airBus.connect(cleanGain);
    fxBus.connect(cleanGain);

    const exhaustRes = createResonatorBank([95, 240, 620], [1.0, 1.6, 2.4], [0.34, 0.26, 0.16], exhaustBus);
    const intakeRes = createResonatorBank([340, 760], [1.1, 2.2], [0.18, 0.14], intakeBus);
    const blockRes = createResonatorBank([180, 1350, 2900], [0.9, 2.0, 3.0], [0.16, 0.08, 0.05], blockBus);

    const noiseBuffer = makeNoiseBuffer();
    const combustionBuffer = makeCombustionBuffer();
    const oldV8CombustionBuffer = makeOldV8CombustionBuffer();
    const i4CombustionBuffers = Object.fromEntries(["oldSohcI4", "hotHatchNaI4", "streetNaI4", "classicTurboI4", "boxerTurboFlat4", "saabUnequalTurboI4", "saabTurboI4", "driftTurboI4", "modernTurboI4", "hybridPrototypeI4", "dieselI4"].map((key) => [key, makeI4CombustionBuffer(key)]));
    const makeNoiseLayer = (type, freq, q, bus) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
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
    turboGain.gain.value = 0;
    turboOsc.connect(turboGain).connect(airBus);
    turboOsc.start();

    const blowerOsc = ctx.createOscillator();
    blowerOsc.type = "sine";
    const blowerGain = ctx.createGain();
    blowerGain.gain.value = 0;
    blowerOsc.connect(blowerGain).connect(airBus);
    blowerOsc.start();
    const blowerHarmonic = ctx.createOscillator();
    blowerHarmonic.type = "sine";
    const blowerHarmonicGain = ctx.createGain();
    blowerHarmonicGain.gain.value = 0;
    blowerHarmonic.connect(blowerHarmonicGain).connect(airBus);
    blowerHarmonic.start();

    const sampleBuffers = Object.fromEntries(PRIVATE_AUDIO_SAMPLE_KEYS.map((key) => [key, createProceduralSampleBuffer(ctx, key)]));
    ctxRef.current = ctx;
    nodesRef.current = { ctx, exhaustBus, intakeBus, blockBus, acousticRoom, acousticRoomSend, blowerOsc, blowerGain, blowerHarmonic, blowerHarmonicGain, master, micHp, micLp, roomSend, roomReturn, exhaustRes, intakeRes, blockRes, turboHiss, intakeWind, mechBed, turboOsc, turboGain, combustionBuffer, oldV8CombustionBuffer, i4CombustionBuffers, noiseBuffer, fxBus, sampleBuffers };
    nextFireTimeRef.current = ctx.currentTime + 0.04;
    patternIndexRef.current = 0;
    audioSmoothRef.current = { ...stateRef.current.point };
    return true;
  };

  useEffect(() => {
    if (!enabled) { setAcousticStatus('off'); return; }
    if (config.audioModel === 'legacy' || !acousticProfileFor(config)) {
      setAcousticStatus(config.audioModel !== 'legacy' ? 'unsupported' : 'legacy');
      return;
    }
    let cancelled = false;
    const load = async () => {
      setAcousticStatus('loading');
      await ensureAudio();
      const ctx = ctxRef.current, nodes = nodesRef.current;
      if (!ctx?.audioWorklet || typeof window.AudioWorkletNode !== 'function') {
        if (!cancelled) setAcousticStatus('fallback');
        return;
      }
      try {
        nodes.acousticPromise ??= ctx.audioWorklet.addModule(new URL('./engineAcousticProcessor.js', import.meta.url).href).then(() => {
          if (ctxRef.current !== ctx) return;
          const node = new window.AudioWorkletNode(ctx, 'apex-engine-acoustics', {numberOfInputs:0, numberOfOutputs:3, outputChannelCount:[2,1,1]});
          nodes.acousticGains = [nodes.exhaustBus,nodes.intakeBus,nodes.blockBus].map((bus,index) => {
            const gain = ctx.createGain();gain.gain.value=0;node.connect(gain,index,0);gain.connect(bus);return gain;
          });
          node.onprocessorerror = () => { nodes.acousticFailed=true;setAcousticStatus('fallback'); };
          nodes.acousticNode = node;
        });
        await nodes.acousticPromise;
        if (!cancelled) setAcousticStatus(nodes.acousticNode && !nodes.acousticFailed ? 'ready' : 'fallback');
      } catch { if (!cancelled) setAcousticStatus('fallback'); }
    };
    load();
    return () => { cancelled = true; };
  }, [enabled, config.audioModel, config.engineLayout, config.calibrationId, config.gameMeta?.name]);

  const triggerRelease = (strength = 0.18, flutter = false) => {
    const localCtx = ctxRef.current;
    const localNodes = nodesRef.current;
    if (!enabled || !localCtx || !localNodes) return;
    const time = localCtx.currentTime;
    const voice = releaseVoice(stateRef.current.config, strength);
    if (voice.gain <= 0 || stateRef.current.config.induction !== 'turbo') return;
    const src = localCtx.createBufferSource();
    src.buffer = localNodes.sampleBuffers[voice.sample];
    src.playbackRate.value = voice.rate;
    const filter = localCtx.createBiquadFilter();
    filter.type = voice.filterType;
    filter.frequency.value = voice.filterFreq;
    filter.Q.value = voice.q;
    const gain = localCtx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(voice.gain, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    src.connect(filter).connect(gain).connect(localNodes.fxBus);
    trackVoice(src, filter, gain);
    src.start(time);
    src.stop(time + 0.26);
  };

  useEffect(() => {
    if (!enabled) { stopAudio(); return undefined; }
    let cancelled = false;
    const start = async () => {
      lifecycleRef.current += 1;
      const ok = await ensureAudio();
      if (!ok || cancelled || !ctxRef.current || !nodesRef.current) return;
      const ctx = ctxRef.current;
      const nodes = nodesRef.current;
      nextFireTimeRef.current = ctx.currentTime + 0.04;
      lastThrottleRef.current = stateRef.current.throttle;
      lastBoostRef.current = stateRef.current.point.boostPsi;
      audioSmoothRef.current = { ...stateRef.current.point };
      nodes.master.gain.setTargetAtTime(stateRef.current.config.cinemaMode ? 0.74 : 0.60, ctx.currentTime, 0.08);
      if (schedulerRef.current) window.clearInterval(schedulerRef.current);

      const canTriggerSample = (key, now, minGap) => {
        const last = lastSampleTimesRef.current[key] ?? -999;
        if (now - last < minGap) return false;
        lastSampleTimesRef.current[key] = now;
        return true;
      };

      const triggerSample = (key, time, options = {}) => {
        const localNodes = nodesRef.current;
        const localCtx = ctxRef.current;
        if (!localNodes || !localCtx) return;
        const buffer = localNodes.sampleBuffers?.[key];
        if (!buffer) return;
        const { gain = 0.02, rate = 1, filterType, filterFreq, q = 1.2 } = options;
        const src = localCtx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.setValueAtTime(rate, time);
        const outGain = localCtx.createGain();
        outGain.gain.setValueAtTime(0.0001, time);
        outGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.01);
        outGain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.08, buffer.duration / Math.max(rate, 0.1)));
        let sampleFilter;
        if (filterType && filterFreq) {
          const filter = localCtx.createBiquadFilter();
          sampleFilter = filter;
          filter.type = filterType;
          filter.frequency.setValueAtTime(filterFreq, time);
          filter.Q.setValueAtTime(q, time);
          src.connect(filter).connect(outGain).connect(localNodes.fxBus);
        } else {
          src.connect(outGain).connect(localNodes.fxBus);
        }
        trackVoice(src, outGain, ...(sampleFilter ? [sampleFilter] : []));
        src.start(time);
        src.stop(time + Math.max(0.1, buffer.duration / Math.max(rate, 0.1) + 0.02));
      };

      const triggerPop = (time, intensity = 1) => {
        const localCtx = ctxRef.current;
        const localNodes = nodesRef.current;
        if (!localCtx || !localNodes) return;
        const pop = localCtx.createBufferSource();
        pop.buffer = localNodes.noiseBuffer;
        const filter = localCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(520 + intensity * 900, time);
        filter.Q.value = 1.0;
        const gain = localCtx.createGain();
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.030 * intensity, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.095);
        pop.connect(filter).connect(gain).connect(localNodes.fxBus);
        trackVoice(pop, filter, gain);
        pop.start(time, Math.random() * 0.5, 0.10);
        pop.stop(time + 0.11);
        if (canTriggerSample("saabCrackle", time, 0.06)) triggerSample("saabCrackle", time, { gain: 0.012 * intensity, rate: 0.82 + Math.random() * 0.25, filterType: "bandpass", filterFreq: 1100 + intensity * 600, q: 1.0 });
      };

      const triggerChirp = (time, releaseStrength = 1) => {
        const voice = releaseVoice(stateRef.current.config, releaseStrength);
        if (voice.gain > 0) triggerSample(voice.sample, time, voice);
      };

      const scheduleCombustion = () => {
        const localCtx = ctxRef.current;
        const localNodes = nodesRef.current;
        if (!localCtx || !localNodes || localCtx.state !== 'running') return;
        const s = stateRef.current;
        const localConfig = s.config;
        const targetPoint = s.point;
        const localThrottle = s.throttle;
        const previousAudioPoint = audioSmoothRef.current || targetPoint;
        const rpmDelta = targetPoint.rpm - (previousAudioPoint.rpm || targetPoint.rpm);
        const rpmAlpha = rpmDelta >= 0 ? 0.30 : 0.18;
        const audioRpm = previousAudioPoint.rpm ? lerp(previousAudioPoint.rpm, targetPoint.rpm, rpmAlpha) : targetPoint.rpm;
        const audioEngine = engineLayouts[localConfig.engineLayout] || engineLayouts.i4;
        const classicV8 = localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane";
        const oldMuscleV8 = classicV8 && localConfig.valvetrainLayout === "ohv";
        const i4Subtype = (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? getI4AudioSubtype(localConfig) : "notI4";
        const i4Pulse = getI4PulseProfile(i4Subtype);
        const classicV8IdleBlend = oldMuscleV8 ? (1 - smoothStep(localThrottle, 0.08, 0.38)) * (1 - smoothStep(audioRpm, 950, 2600)) : 0;
        const classicV8HeavyBlend = oldMuscleV8 ? (1 - smoothStep(audioRpm, 2600, 5200)) : 0;
        const normalFiringFactor = localConfig.engineLayout === "v12" ? 3.15 : audioEngine.firingFactor;
        const oldV8AudibleFactor = oldMuscleV8 ? lerp(3.05, 1.72, classicV8IdleBlend) : normalFiringFactor;
        const audioFiringFactor = oldMuscleV8 ? lerp(normalFiringFactor, oldV8AudibleFactor, clamp(0.58 + classicV8HeavyBlend * 0.42, 0, 1)) : normalFiringFactor;
        const audibleEventRpm = classicV8 ? audioRpm * lerp(0.64, 1, 1 - classicV8IdleBlend) : audioRpm;
        const localPoint = {
          ...targetPoint,
          rpm: audioRpm,
          eventHz: (audibleEventRpm / 60) * audioFiringFactor,
          boostPsi: previousAudioPoint.boostPsi !== undefined ? lerp(previousAudioPoint.boostPsi, targetPoint.boostPsi, 0.22) : targetPoint.boostPsi,
          mapKpa: previousAudioPoint.mapKpa !== undefined ? lerp(previousAudioPoint.mapKpa, targetPoint.mapKpa, 0.22) : targetPoint.mapKpa,
          chargeTempC: previousAudioPoint.chargeTempC !== undefined ? lerp(previousAudioPoint.chargeTempC, targetPoint.chargeTempC, 0.16) : targetPoint.chargeTempC,
        };
        audioSmoothRef.current = localPoint;
        const profile = getAudioProfile(localConfig, localPoint.rpm);
        const mic = getMicProfile(localConfig.micPosition);
        const eventHz = Math.max(10, localPoint.eventHz);
        const basePeriod = 1 / eventHz;
        const pattern = getFiringPattern(localConfig.engineLayout, localConfig.v8Crank, localConfig.firingSoundMode);
        const acousticProfile = acousticProfileFor(localConfig);
        const useAcoustics = localConfig.audioModel !== 'legacy' && acousticProfile && localNodes.acousticNode && !localNodes.acousticFailed;
        const micProfile = getMicProfile(localConfig.micPosition);
        const legacyLevel = useAcoustics ? 0 : 1;
        if(!useAcoustics && localNodes.acousticWasActive) nextFireTimeRef.current=localCtx.currentTime+.005;
        localNodes.acousticWasActive=Boolean(useAcoustics);
        for (const bank of [localNodes.exhaustRes,localNodes.intakeRes,localNodes.blockRes]) bank.input.gain.setTargetAtTime(legacyLevel,localCtx.currentTime,.025);
        if (localNodes.acousticNode) {
          const components=localNodes.acousticComponentId===acousticProfile?.id?undefined:acousticProfile;
          localNodes.acousticComponentId=acousticProfile?.id;
          localNodes.acousticNode.port.postMessage({active:Boolean(useAcoustics),components,rpm:targetPoint.rpm,throttle:localThrottle,load:clamp((targetPoint.mapKpa-30)/75,0,1),header:localConfig.headerType,exhaust:localConfig.exhaustType});
          const levels=[micProfile.exhaust*(1.5+localConfig.engineLoudness*.85),micProfile.intake*(.7+localConfig.engineLoudness*.3),micProfile.block];
          localNodes.acousticGains.forEach((gain,index)=>gain.gain.setTargetAtTime(useAcoustics?levels[index]:0,localCtx.currentTime,.025));
        }
        if(useAcoustics && localNodes.acousticRoomPosition !== localConfig.micPosition){localNodes.acousticRoom.buffer=acousticRoomBuffer(localCtx,localConfig.micPosition);localNodes.acousticRoomPosition=localConfig.micPosition;}
        localNodes.acousticRoomSend.gain.setTargetAtTime(useAcoustics?micProfile.room*(.35+(localConfig.roomSize??.38)*1.1):0,localCtx.currentTime,.04);
        const lookAhead = localCtx.currentTime + 0.12;
        nextFireTimeRef.current = recoverFireTime(nextFireTimeRef.current, localCtx.currentTime);
        localNodes.master.gain.setTargetAtTime(localConfig.cinemaMode ? 0.74 : 0.60, localCtx.currentTime, 0.08);
        const blower = blowerVoice(localConfig, localPoint, localThrottle, localCtx.sampleRate);
        localNodes.blowerOsc.frequency.setTargetAtTime(blower.frequency, localCtx.currentTime, 0.06);
        localNodes.blowerHarmonic.frequency.setTargetAtTime(blower.frequency * 2, localCtx.currentTime, 0.06);
        localNodes.blowerGain.gain.setTargetAtTime(blower.gain * getMicProfile(localConfig.micPosition).air, localCtx.currentTime, 0.06);
        localNodes.blowerHarmonicGain.gain.setTargetAtTime(blower.harmonicGain * getMicProfile(localConfig.micPosition).air, localCtx.currentTime, 0.06);
        const load = clamp((localPoint.mapKpa - 30) / 170, 0, 1);
        const throttleAudio = clamp(localThrottle, 0, 1);
        const activeAudio = clamp(Math.max(throttleAudio, load * 0.65), 0, 1);
        const idleAudio = 1 - smoothStep(throttleAudio, 0.04, 0.20);
        const layoutWeight = getLayoutAudioWeight(localConfig.engineLayout);
        const exhaustTuning = getExhaustAudioTuning(localConfig);
        const exhaustGainScale = mic.exhaust * (1.15 + localConfig.engineLoudness * 0.75);
        const intakeGainScale = mic.intake * (0.72 + localConfig.engineLoudness * 0.18);
        const blockGainScale = mic.block * (0.82 + localConfig.engineLoudness * 0.24);
        const boostNorm = clamp(localPoint.boostPsi / Math.max(1, localConfig.targetBoostPsi || localConfig.wastegateBasePsi + localConfig.boostControl * 14), 0, 1.2);
        const profileTopTick = profile.topTick || 0;
        const profileSharpness = profile.mechanicalSharpness || (localConfig.valvetrainLayout === "dohc" ? 2.8 : localConfig.valvetrainLayout === "ohv" ? 1.5 : 1.9);

        localNodes.micHp.frequency.setTargetAtTime(mic.hp, localCtx.currentTime, 0.05);
        const muscleHighCut = !useAcoustics && oldMuscleV8 ? clamp(4550 - localPoint.dispL * 155 - classicV8HeavyBlend * 650, 2700, 5200) : mic.lp;
        localNodes.micLp.frequency.setTargetAtTime(Math.min(mic.lp, muscleHighCut), localCtx.currentTime, 0.05);
        localNodes.roomSend.gain.setTargetAtTime(legacyLevel * mic.room * (0.35 + (localConfig.roomSize || 0.38) * 1.1), localCtx.currentTime, 0.08);
        localNodes.roomReturn.gain.setTargetAtTime(mic.room * 0.18, localCtx.currentTime, 0.08);

        const i4LowFreq = (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? ({ oldSohcI4: 72, hotHatchNaI4: 96, streetNaI4: 84, classicTurboI4: 76, boxerTurboFlat4: 46, saabUnequalTurboI4: 46, saabTurboI4: 68, driftTurboI4: 88, modernTurboI4: 82, hybridPrototypeI4: 92, dieselI4: 58 }[i4Subtype] || 84) + localPoint.dispL * 8 + (profile.lowBurble || 0) * 26 : null;
        const i4MidBase = (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? ({ oldSohcI4: 185, hotHatchNaI4: 285, streetNaI4: 235, classicTurboI4: 210, boxerTurboFlat4: 138, saabUnequalTurboI4: 138, saabTurboI4: 198, driftTurboI4: 275, modernTurboI4: 245, hybridPrototypeI4: 290, dieselI4: 145 }[i4Subtype] || 230) : null;
        const i4HighBase = (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? ({ oldSohcI4: 460, hotHatchNaI4: 780, streetNaI4: 610, classicTurboI4: 520, boxerTurboFlat4: 310, saabUnequalTurboI4: 310, saabTurboI4: 480, driftTurboI4: 820, modernTurboI4: 650, hybridPrototypeI4: 760, dieselI4: 340 }[i4Subtype] || 600) : null;
        const classicV8LowFreq = localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" ? (oldMuscleV8 ? 42 + localPoint.dispL * 3.6 + (profile.lowBurble || 0) * 10 : 54 + localPoint.dispL * 8.4 + (profile.lowBurble || 0) * 18) : i4LowFreq ?? (85 + localPoint.dispL * 12 + (profile.lowBurble || 0) * 40);
        localNodes.exhaustRes.filters[0].filter.frequency.setTargetAtTime(classicV8LowFreq + exhaustTuning.lowFreq, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[1].filter.frequency.setTargetAtTime((oldMuscleV8 ? 155 + localPoint.rpm * 0.014 : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? i4MidBase + localPoint.rpm * (i4Subtype === "dieselI4" ? 0.010 : i4Subtype === "hotHatchNaI4" || i4Subtype === "driftTurboI4" ? 0.040 : 0.025) : 220 + localPoint.rpm * 0.03) + (profile.bodyFilterOffset || 0) * 0.4 + exhaustTuning.midFreq, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[2].filter.frequency.setTargetAtTime((oldMuscleV8 ? 340 + localPoint.rpm * 0.030 : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? i4HighBase + localPoint.rpm * (i4Subtype === "dieselI4" ? 0.020 : i4Subtype === "hotHatchNaI4" || i4Subtype === "driftTurboI4" ? 0.090 : 0.055) : 520 + localPoint.rpm * 0.07) + profileTopTick * 850 + exhaustTuning.highFreq, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[0].filter.Q.setTargetAtTime(1.0 + exhaustTuning.qBias, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[1].filter.Q.setTargetAtTime(1.6 + exhaustTuning.qBias, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[2].filter.Q.setTargetAtTime(2.4 + exhaustTuning.qBias, localCtx.currentTime, 0.04);
        const idleLump = localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" ? idleAudio * (localConfig.valvetrainLayout === "ohv" ? 0.32 : 0.10) : 0;
        const v8DrivePulse = localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" ? activeAudio * (localConfig.valvetrainLayout === "ohv" ? 0.18 : 0.090) * (1 - smoothStep(localPoint.rpm, localConfig.redline * 0.78, localConfig.redline + 200)) : 0;
        const i6BodyPulse = localConfig.engineLayout === "i6" ? activeAudio * 0.050 : 0;
        localNodes.exhaustRes.filters[0].gain.gain.setTargetAtTime((0.28 + activeAudio * 0.22 + idleLump + v8DrivePulse + (profile.lowBurble || 0) * 0.10) * exhaustGainScale * exhaustTuning.lowGain, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[1].gain.gain.setTargetAtTime((0.18 + activeAudio * 0.26 + i6BodyPulse + (profile.bodyBias || 0) * 0.22) * exhaustGainScale * exhaustTuning.midGain, localCtx.currentTime, 0.04);
        localNodes.exhaustRes.filters[2].gain.gain.setTargetAtTime(Math.max(0, (0.05 + activeAudio * 0.20 + (profile.raspBias || 0) * 0.22 + profileTopTick * 0.10) * (oldMuscleV8 ? 0.24 : 1)) * exhaustGainScale * Math.max(0.08, exhaustTuning.highGain), localCtx.currentTime, 0.04);

        localNodes.intakeRes.filters[0].filter.frequency.setTargetAtTime(300 + localPoint.rpm * 0.06 + (profile.intakeBias || 0) * 500, localCtx.currentTime, 0.05);
        localNodes.intakeRes.filters[1].filter.frequency.setTargetAtTime(720 + localPoint.rpm * 0.10 + profileTopTick * 500, localCtx.currentTime, 0.05);
        localNodes.intakeRes.filters[0].gain.gain.setTargetAtTime(throttleAudio > 0.12 ? ((throttleAudio - 0.12) * 0.20 + (profile.intakeBias || 0) * 0.03) * intakeGainScale : 0, localCtx.currentTime, 0.05);
        localNodes.intakeRes.filters[1].gain.gain.setTargetAtTime(throttleAudio > 0.18 ? ((throttleAudio - 0.18) * 0.11 + profileTopTick * 0.02) * intakeGainScale : 0, localCtx.currentTime, 0.05);

        localNodes.blockRes.filters[0].filter.frequency.setTargetAtTime(150 + localPoint.dispL * 8, localCtx.currentTime, 0.06);
        localNodes.blockRes.filters[1].filter.frequency.setTargetAtTime(profile.mechanicalFreq + localPoint.rpm * 0.025, localCtx.currentTime, 0.06);
        localNodes.blockRes.filters[2].filter.frequency.setTargetAtTime(2600 + profileTopTick * 1100 + localPoint.rpm * 0.035, localCtx.currentTime, 0.06);
        localNodes.blockRes.filters[0].gain.gain.setTargetAtTime((0.025 + activeAudio * 0.05 + (profile.rumbleBias || 0) * 0.025) * blockGainScale, localCtx.currentTime, 0.08);
        localNodes.blockRes.filters[1].gain.gain.setTargetAtTime((activeAudio * 0.020 + (profile.mechanicalGain || 0.02) * 0.035) * blockGainScale, localCtx.currentTime, 0.08);
        localNodes.blockRes.filters[2].gain.gain.setTargetAtTime((activeAudio * 0.012 + profileTopTick * 0.012) * blockGainScale, localCtx.currentTime, 0.08);

        localNodes.turboHiss.filter.frequency.setTargetAtTime(1600 + boostNorm * 3600, localCtx.currentTime, 0.06);
        const turboHissGain = localConfig.induction === "turbo" && boostNorm > 0.12 && throttleAudio > 0.22 ? (0.001 + (useAcoustics ? 0.015 : (profile.whistleBias || 0)) * 0.006 + (localConfig.turboLoudness || 0.7) * 0.007) * Math.pow(boostNorm, 1.25) * mic.air : 0;
        localNodes.turboHiss.gain.gain.setTargetAtTime(turboHissGain, localCtx.currentTime, 0.08);
        localNodes.turboOsc.frequency.setTargetAtTime(1600 + boostNorm * 4100, localCtx.currentTime, 0.10);
        localNodes.turboGain.gain.setTargetAtTime(0, localCtx.currentTime, 0.12);
        localNodes.intakeWind.filter.frequency.setTargetAtTime(650 + localPoint.rpm * 0.07 + localThrottle * 500, localCtx.currentTime, 0.08);
        localNodes.intakeWind.gain.gain.setTargetAtTime(!useAcoustics && throttleAudio > 0.38 ? ((throttleAudio - 0.38) * 0.010 + (profile.intakeBias || 0) * 0.002) * mic.intake : 0, localCtx.currentTime, 0.08);
        localNodes.mechBed.filter.frequency.setTargetAtTime(profile.mechanicalFreq + localPoint.rpm * 0.04, localCtx.currentTime, 0.06);
        localNodes.mechBed.filter.Q.setTargetAtTime(profileSharpness, localCtx.currentTime, 0.06);
        localNodes.mechBed.gain.gain.setTargetAtTime(!useAcoustics && throttleAudio > 0.18 ? (profileTopTick * 0.001 + (profile.mechanicalGain || 0.02) * 0.002) * mic.block : 0, localCtx.currentTime, 0.10);

        if (useAcoustics) nextFireTimeRef.current = lookAhead;
        while (nextFireTimeRef.current < lookAhead) {
          const fireTime = nextFireTimeRef.current;
          const roughness = clamp((profile.roughness || 0.12) + localConfig.soundTexture * 0.015, 0.02, localConfig.engineLayout === "rotary2" ? 0.18 : localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" ? 0.22 : localConfig.engineLayout === "v6" ? 0.18 : 0.14);
          const ampJitter = 1 + (Math.random() - 0.5) * roughness * 0.28;
          const rotaryMultiplier = localConfig.engineLayout === "rotary2" ? 0.78 : 1;
          const patternSlot = patternIndexRef.current % pattern.length;
          const patternPulse = pattern[patternSlot] || 1;
          let pulseAccent = 1;
          let i4AccentDepth = 0.18;
          if (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") {
            pulseAccent = i4Pulse.accent[patternSlot % 4] || 1;
            if (i4Subtype === "saabUnequalTurboI4") {
              const rpmBlend = 1 - smoothStep(localPoint.rpm, 1200, 4200);
              const offbeatAccent = [1.82, 0.28, 1.58, 0.44][patternSlot % 4];
              pulseAccent = lerp(pulseAccent, offbeatAccent, 0.58 + rpmBlend * 0.28);
            }
            i4AccentDepth = i4Pulse.depth;
          }
          if (localConfig.engineLayout === "i5") pulseAccent = [1.12, 0.90, 1.06, 0.96, 1.16][patternSlot % 5];
          if (localConfig.engineLayout === "i6") pulseAccent = [1.10, 0.91, 1.06, 0.95, 1.08, 0.92][patternSlot % 6];
          if (localConfig.engineLayout === "v6") pulseAccent = [1.12, 0.88, 1.06, 0.94, 1.10, 0.90][patternSlot % 6];
          if (localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane") {
            const driveAccent = [1.30, 0.82, 1.14, 0.88, 1.26, 0.84, 1.10, 0.86][patternSlot % 8];
            const chopAccent = [1.88, 0.30, 1.34, 0.46, 1.78, 0.34, 1.22, 0.42][patternSlot % 8];
            const chopBlend = localConfig.valvetrainLayout === "ohv" ? clamp((profile.idleChop || 0) * idleAudio, 0, 1) : 0;
            pulseAccent = lerp(driveAccent, chopAccent, chopBlend);
          }
          const accentDepth = localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" ? (localConfig.valvetrainLayout === "ohv" ? 0.96 : 0.78) : localConfig.engineLayout === "i6" ? 0.42 : localConfig.engineLayout === "v6" ? 0.44 : localConfig.engineLayout === "i5" ? 0.56 : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? i4AccentDepth : 0.18;
          const layoutPulseAccent = lerp(1, pulseAccent, accentDepth);
          const combustionAmp = (0.010 + activeAudio * 0.082 + throttleAudio * 0.020 + (profile.bodyBias || 0) * 0.025 + (profile.pulseGainBias || 0) * 0.20) * ampJitter * rotaryMultiplier * layoutPulseAccent;

          const combustionNoise = localCtx.createBufferSource();
          combustionNoise.buffer = oldMuscleV8 ? localNodes.oldV8CombustionBuffer : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? (localNodes.i4CombustionBuffers?.[i4Subtype] || localNodes.i4CombustionBuffers?.streetNaI4 || localNodes.combustionBuffer) : localNodes.combustionBuffer;
          const exhaustGain = localCtx.createGain();
          const combustionTail = oldMuscleV8 ? lerp(0.105, 0.070, smoothStep(localPoint.rpm, 1200, 3600)) : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? lerp(i4Pulse.tail, i4Pulse.tail * 0.70, smoothStep(localPoint.rpm, 1800, 5200)) : 0.055;
          exhaustGain.gain.setValueAtTime(0.0001, fireTime);
          exhaustGain.gain.exponentialRampToValueAtTime(combustionAmp * mic.exhaust * (oldMuscleV8 ? 1.18 : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") ? (i4Subtype === "boxerTurboFlat4" ? 1.22 : i4Subtype === "saabTurboI4" ? 1.12 : i4Subtype === "dieselI4" ? 1.18 : i4Subtype === "hotHatchNaI4" || i4Subtype === "driftTurboI4" ? 1.04 : 1) : 1), fireTime + 0.003);
          exhaustGain.gain.exponentialRampToValueAtTime(0.0001, fireTime + combustionTail);
          combustionNoise.connect(exhaustGain).connect(localNodes.exhaustRes.input);
          trackVoice(combustionNoise, exhaustGain);
          combustionNoise.start(fireTime);
          combustionNoise.stop(fireTime + combustionTail + 0.012);

          if (profile.thumpGain > 0 && (localConfig.engineLayout !== "v8" || localConfig.v8Crank !== "crossplane" || patternSlot % 2 === 0 || idleAudio > 0.62)) {
            const thump = localCtx.createOscillator();
            thump.type = localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" ? "triangle" : localConfig.engineLayout === "rotary2" ? "square" : "sine";
            const thumpGain = localCtx.createGain();
            thump.frequency.setValueAtTime(localConfig.engineLayout === "rotary2" ? 85 + localPoint.rpm * 0.006 : oldMuscleV8 ? 33 + localPoint.dispL * 2.9 + (profile.lowBurble || 0) * 8 : 55 + localPoint.dispL * 8 + (profile.lowBurble || 0) * 30, fireTime);
            thump.frequency.exponentialRampToValueAtTime(localConfig.engineLayout === "rotary2" ? 52 : oldMuscleV8 ? 23 + localPoint.dispL * 1.8 : 34 + localPoint.dispL * 5, fireTime + (oldMuscleV8 ? 0.085 : 0.05));
            thumpGain.gain.setValueAtTime(0.0001, fireTime);
            thumpGain.gain.exponentialRampToValueAtTime(profile.thumpGain * mic.exhaust * layoutWeight, fireTime + 0.003);
            thumpGain.gain.exponentialRampToValueAtTime(0.0001, fireTime + (oldMuscleV8 ? 0.090 : 0.05));
            thump.connect(thumpGain).connect(localNodes.exhaustRes.input);
            trackVoice(thump, thumpGain);
            thump.start(fireTime);
            thump.stop(fireTime + (oldMuscleV8 ? 0.100 : 0.055));
          }

          if (throttleAudio > 0.18) {
            const intakeBurst = localCtx.createBufferSource();
            intakeBurst.buffer = localNodes.noiseBuffer;
            const intakeFilter = localCtx.createBiquadFilter();
            intakeFilter.type = "bandpass";
            intakeFilter.frequency.setValueAtTime(380 + localPoint.rpm * 0.08 + (profile.intakeBias || 0) * 700, fireTime);
            intakeFilter.Q.value = 1.3;
            const intakeGain = localCtx.createGain();
            intakeGain.gain.setValueAtTime(0.0001, fireTime);
            intakeGain.gain.exponentialRampToValueAtTime((0.002 + (throttleAudio - 0.18) * 0.018 + (profile.intakeBias || 0) * 0.006) * mic.intake, fireTime + 0.004);
            intakeGain.gain.exponentialRampToValueAtTime(0.0001, fireTime + 0.028);
            intakeBurst.connect(intakeFilter).connect(intakeGain).connect(localNodes.intakeRes.input);
            trackVoice(intakeBurst, intakeFilter, intakeGain);
            intakeBurst.start(fireTime, Math.random() * 0.4, 0.04);
            intakeBurst.stop(fireTime + 0.04);
          }

          const mechTick = localCtx.createBufferSource();
          mechTick.buffer = localNodes.noiseBuffer;
          const mechFilter = localCtx.createBiquadFilter();
          mechFilter.type = "bandpass";
          mechFilter.frequency.setValueAtTime(profile.mechanicalFreq + profileTopTick * 400 + localPoint.rpm * ((localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") && i4Subtype === "dieselI4" ? 0.020 : (localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") && i4Subtype === "oldSohcI4" ? 0.028 : 0.04), fireTime);
          mechFilter.Q.value = profileSharpness + 0.8;
          const mechGain = localCtx.createGain();
          mechGain.gain.setValueAtTime(0.0001, fireTime);
          mechGain.gain.exponentialRampToValueAtTime((throttleAudio > 0.15 ? 0.0008 + (profile.mechanicalGain || 0.02) * 0.08 + profileTopTick * 0.002 : 0.0001) * mic.block, fireTime + 0.002);
          mechGain.gain.exponentialRampToValueAtTime(0.0001, fireTime + 0.016);
          mechTick.connect(mechFilter).connect(mechGain).connect(localNodes.blockRes.input);
          trackVoice(mechTick, mechFilter, mechGain);
          mechTick.start(fireTime, Math.random() * 0.3, 0.025);
          mechTick.stop(fireTime + 0.025);

          if ((localConfig.engineLayout === "i4" || localConfig.engineLayout === "flat4") && (i4Subtype === "boxerTurboFlat4" || i4Subtype === "saabUnequalTurboI4" || i4Subtype === "saabTurboI4" || i4Subtype === "driftTurboI4") && localPoint.rpm > 2400 && localThrottle < 0.22 && canTriggerSample(`i4Overrun-${i4Subtype}`, fireTime, i4Subtype === "saabTurboI4" ? 0.13 : 0.09) && Math.random() < (i4Subtype === "boxerTurboFlat4" ? 0.045 : i4Subtype === "saabUnequalTurboI4" ? 0.055 : i4Subtype === "saabTurboI4" ? 0.08 : 0.13)) {
            triggerSample("saabCrackle", fireTime, { gain: (i4Subtype === "boxerTurboFlat4" ? 0.0035 : i4Subtype === "saabUnequalTurboI4" ? 0.0045 : i4Subtype === "saabTurboI4" ? 0.006 : 0.010) * mic.exhaust, rate: i4Subtype === "boxerTurboFlat4" ? 0.62 + Math.random() * 0.14 : i4Subtype === "saabUnequalTurboI4" ? 0.72 + Math.random() * 0.16 : 0.92 + Math.random() * 0.28, filterType: "bandpass", filterFreq: i4Subtype === "boxerTurboFlat4" ? 520 + localPoint.rpm * 0.018 : i4Subtype === "saabUnequalTurboI4" ? 620 + localPoint.rpm * 0.025 : i4Subtype === "saabTurboI4" ? 820 + localPoint.rpm * 0.035 : 1300 + localPoint.rpm * 0.060, q: 0.95 });
          }
          if (localConfig.engineLayout === "rotary2" && localPoint.rpm > 2200 && canTriggerSample("flutter-rotary", fireTime, 0.11) && Math.random() < 0.18) {
            triggerSample("saabCrackle", fireTime, { gain: 0.008 * mic.exhaust, rate: 1.25 + Math.random() * 0.20, filterType: "bandpass", filterFreq: 1800 + localPoint.rpm * 0.07, q: 1.2 });
          }
          if (localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" && localPoint.rpm < 2600 && localThrottle < 0.55 && canTriggerSample("v8Burble", fireTime, 0.09) && Math.random() < 0.26) {
            triggerSample("v8Burble", fireTime, { gain: 0.020 * mic.exhaust, rate: 0.88 + Math.random() * 0.10, filterType: "lowpass", filterFreq: 1450, q: 0.8 });
          }
          if (localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane" && localPoint.rpm >= 2500 && localThrottle > 0.32 && canTriggerSample("v8DriveBurble", fireTime, 0.16) && Math.random() < 0.11) {
            triggerSample("v8Burble", fireTime, { gain: 0.010 * mic.exhaust * activeAudio, rate: 1.08 + Math.random() * 0.10, filterType: "lowpass", filterFreq: 1150 + activeAudio * 550, q: 0.7 });
          }
          if (localConfig.engineLayout === "v12" && localPoint.rpm > 2200 && localThrottle > 0.24 && canTriggerSample("v12Sweet", fireTime, 0.22) && Math.random() < 0.05) {
            triggerSample("v12Sweet", fireTime, { gain: 0.004 * mic.exhaust, rate: 0.58 + Math.random() * 0.05, filterType: "lowpass", filterFreq: 1350, q: 0.65 });
          }

          let patternStep = pattern[patternIndexRef.current % pattern.length] ?? 1;
          if (localConfig.engineLayout === "i4" && i4Subtype === "saabUnequalTurboI4") {
            const slot = patternIndexRef.current % 4;
            const unevenStep = [0.42, 0.58, 1.86, 1.14][slot];
            const rpmSmooth = smoothStep(localPoint.rpm, 1800, 5000);
            patternStep = lerp(unevenStep, patternStep, rpmSmooth * 0.36);
          }
          if (localConfig.engineLayout === "v8" && localConfig.v8Crank === "crossplane") {
            const slot = patternIndexRef.current % 8;
            const driveStep = [0.84, 0.92, 1.10, 1.14, 0.86, 0.94, 1.06, 1.14][slot];
            const chopStep = [0.48, 0.52, 1.85, 0.54, 0.50, 1.70, 0.58, 1.83][slot];
            const chopBlend = localConfig.valvetrainLayout === "ohv" ? clamp((profile.idleChop || 0) * idleAudio, 0, 1) : 0;
            patternStep = lerp(driveStep, chopStep, chopBlend);
          }
          patternIndexRef.current = (patternIndexRef.current + 1) % pattern.length;
          nextFireTimeRef.current += basePeriod * patternStep;
        }

        const throttleDrop = lastThrottleRef.current - localThrottle;
        const throttleRise = localThrottle - lastThrottleRef.current;
        const boostDrop = Math.max(0, lastBoostRef.current - localPoint.boostPsi);
        if (!useAcoustics && throttleRise > 0.16 && localPoint.rpm > 1600 && Math.random() < 0.4) {
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
          trackVoice(stab, filter, gain);
          stab.start(localCtx.currentTime, Math.random() * 0.2, 0.08);
          stab.stop(localCtx.currentTime + 0.08);
        }
        if (!useAcoustics && localPoint.rpm > 2600 && throttleDrop > 0.18) {
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
        if (!useAcoustics && localPoint.rpm > localConfig.redline - 90 && localThrottle > 0.72 && localCtx.currentTime - lastLimiterTimeRef.current > 0.03) {
          triggerPop(localCtx.currentTime, 0.4 + load * 0.6);
          lastLimiterTimeRef.current = localCtx.currentTime;
        }
        lastThrottleRef.current = localThrottle;
        lastBoostRef.current = localPoint.boostPsi;
      };

      schedulerRef.current = window.setInterval(scheduleCombustion, 20);
    };
    start();
    return () => {
      cancelled = true;
      if (schedulerRef.current) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    };
  }, [enabled]);

  return { ensureAudio, stopAudio, triggerRelease, acousticStatus };
}

export function useApexEngineAudio({ config, point, enabled, throttle, pageActive }) {
  return useEngineAudio(config, point, Boolean(enabled && pageActive), throttle);
}


