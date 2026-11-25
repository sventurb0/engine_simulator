import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildInductionScene } from './engineInductionScene';
import type { SimConfig } from '../EngineSimulatorV2';
import { camLobePhase, cylinderMotion, planAssembly, valveLayout, valveLift, TAU, type PartId } from './engineAssembly';

export type AssemblyAppearance = { colour: string; cover: 'ribbed' | 'smooth' | 'classic' };
export type AssemblyView = { mode: 'assembled' | 'cutaway' | 'exploded'; cut: number; explode: number; axis: 'x' | 'z'; hidden: Set<PartId>; selected: PartId | null };
const up = new THREE.Vector3(0, 1, 0);
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function createEngineAssembly(config: SimConfig, appearance: AssemblyAppearance) {
  const plan = planAssembly(config);
  const airCooled = plan.radial || config.visualModel?.cooling === 'air';
  const hotBulb = config.applicationType === 'boat' && config.marineCombustion === 'hot_bulb';
  const twinScroll = config.induction === 'turbo' && config.turboArchitecture === 'twinscroll';
  const root = new THREE.Group();
  root.name = 'Engine assembly';
  root.rotation.z = config.visualModel?.orientation === 'inverted' ? Math.PI : 0;
  const body = new THREE.Group(); root.add(body);
  body.name = plan.rotating ? 'Rotating crankcase and cylinders' : 'Stationary engine case';
  body.userData.role = plan.rotating ? 'rotating-case' : 'stationary-case';
  const fixed = new THREE.Group(); root.add(fixed);
  fixed.name = 'Fixed shaft, mounting and fuel supply'; fixed.userData.role = 'fixed-accessories';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.MeshStandardMaterial>();
  const shells = new Set<THREE.MeshStandardMaterial>();
  const textures = new Set<THREE.Texture>();
  const parts: { id: PartId; group: THREE.Group; offset: THREE.Vector3; base: THREE.Vector3 }[] = [];
  const updates: ((angle: number) => void)[] = [];
  const clip = new THREE.Plane(vec(-1, 0, 0), 0);
  function mat(colour: string, metalness: number, roughness: number, shell = false) {
    const value = new THREE.MeshStandardMaterial({ color: colour, metalness, roughness, side: THREE.DoubleSide });
    materials.add(value); if (shell) shells.add(value); return value;
  }
  const iron = mat('#3d464c', .65, .72, true);
  const grain = new Uint8Array(64 * 64);
  for (let i = 0; i < grain.length; i++) grain[i] = 100 + ((i * 137 + (i >> 3) * 71) % 130);
  const castingTexture = new THREE.DataTexture(grain, 64, 64, THREE.RedFormat);
  castingTexture.wrapS = castingTexture.wrapT = THREE.RepeatWrapping;
  castingTexture.repeat.set(5, 5); castingTexture.needsUpdate = true; textures.add(castingTexture);
  iron.bumpMap = castingTexture; iron.bumpScale = .018;
  const aluminium = mat('#a4aeb4', .78, .32, true);
  const steel = mat('#a8b4bd', .88, .24);
  const dark = mat('#242a31', .55, .56);
  const brass = mat('#be9753', .78, .33);
  const copper = mat('#a9633e', .82, .34);
  const porcelain = mat('#d6d0bf', .08, .5);
  const rubber = mat('#111923', .12, .82);
  const exhaustMetal = mat(config.headerType === 'cast' ? '#625c57' : '#9b8170', .8, .4);
  const blue = mat('#3c709c', .55, .4);
  const red = mat('#8c4140', .55, .42);
  const paint = mat(appearance.colour, .48, .34, true);
  const gasket = mat('#171b21', .2, .8, true);
  const glow = mat('#f39b43', .05, .45); glow.emissive.set('#ff6d16'); glow.emissiveIntensity = .7;
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0) {
    geometries.add(geometry);
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); parent.add(item); return item;
  }
  function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, rounded = false) {
    return mesh(parent, rounded ? new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * .12) : new THREE.BoxGeometry(w, h, d), material, x, y, z);
  }
  function cyl(parent: THREE.Object3D, radius: number, height: number, material: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, axis: 'y' | 'z' | 'x' = 'y', segments = 20) {
    const item = mesh(parent, new THREE.CylinderGeometry(radius, radius, height, segments), material, x, y, z);
    if (axis === 'z') item.rotation.x = Math.PI / 2;
    if (axis === 'x') item.rotation.z = Math.PI / 2;
    return item;
  }
  function ring(parent: THREE.Object3D, radius: number, thickness: number, material: THREE.MeshStandardMaterial, x = 0, y = 0, z = 0, horizontal = true) {
    const item = mesh(parent, new THREE.TorusGeometry(radius, thickness, 6, 24), material, x, y, z);
    if (horizontal) item.rotation.x = Math.PI / 2; return item;
  }
  function pipe(parent: THREE.Object3D, points: number[][], radius: number, material: THREE.MeshStandardMaterial) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => vec(p[0], p[1], p[2])));
    return mesh(parent, new THREE.TubeGeometry(curve, Math.max(10, points.length * 5), radius, 8, false), material);
  }
  function part(id: PartId, angle = 0, offset = vec(0, 0, 0), stationary = false) {
    const group = new THREE.Group(); group.rotation.z = -angle; group.userData.part = id;
    group.userData.stationary = stationary; (stationary ? fixed : body).add(group);
    // Offsets are expressed in the bank's local coordinates.
    offset.applyAxisAngle(vec(0, 0, 1), -angle);
    parts.push({ id, group, offset, base: group.position.clone() }); return group;
  }
  function moving(parent: THREE.Object3D) { const group = new THREE.Group(); group.userData.moving = true; parent.add(group); return group; }
  const b = plan.bore, r = plan.radius, deck = plan.deck;
  const front = -plan.length / 2 - b * .32;
  const rear = plan.length / 2 + b * .25;

  // Crankcase and the bored cylinder banks are separate castings.
  const block = part('block', 0, vec(0, -b * .75, 0));
  if (plan.radial) {
    cyl(block, b * 1.03, plan.length, iron, 0, 0, 0, 'z', 32);
    cyl(block, b * 1.1, b * .14, aluminium, 0, 0, front + b * .2, 'z', 32);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; cyl(block, b * .05, b * .09, steel, Math.sin(a) * b * .96, Math.cos(a) * b * .96, front + b * .09, 'z', 6); }
  } else {
    box(block, b * 1.5, b * .62, plan.length + b * .35, iron, 0, -b * .2, 0, true);
    box(block, b * 1.25, b * .65, plan.length, aluminium, 0, -b * .72, 0, true);
    for (let i = 0; i < 7; i++) box(block, b * 1.28, b * .035, b * .04, iron, 0, -b * .9, (i - 3) * plan.length / 8);
    if (hotBulb) {
      box(block, b * 2.4, b * .22, plan.length + b * .9, dark, 0, -b * 1.15, 0);
      for (const x of [-1, 1]) for (const z of [-1, 1]) cyl(block, b * .09, b * .12, steel, x * b, -b * 1.01, z * plan.length * .5, 'y', 6);
    }
  }
  const crankPart = part('crank', 0, vec(0, 0, 0), plan.rotating);
  crankPart.userData.role = plan.rotating ? 'fixed-crankshaft' : 'crankshaft';
  const shaft = moving(crankPart);
  cyl(shaft, b * .14, plan.length + b * 1.4, steel, 0, 0, 0, 'z');
  if (!plan.rotating) {
    const flywheel = cyl(shaft, hotBulb ? b * .3 : b * .82, hotBulb ? b * .42 : b * .18, dark, 0, 0, rear + b * .25, 'z', 36);
    if (hotBulb) {
      for (const z of [flywheel.position.z, front]) {
        if (z === front) cyl(shaft, b * .3, b * .42, dark, 0, 0, z, 'z');
        ring(shaft, b * 1.2, b * .19, iron, 0, 0, z, false);
        for (let i = 0; i < 3; i++) {
          const spoke = box(shaft, b * .14, b * 2.2, b * .18, dark, 0, 0, z);
          spoke.rotation.z = i * Math.PI / 3;
        }
      }
    } else for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8; cyl(shaft, b * .075, b * .2, brass, Math.sin(a) * b * .58, Math.cos(a) * b * .58, flywheel.position.z, 'z', 6);
    }
    if (!hotBulb) {
      cyl(shaft, b * .43, b * .17, dark, 0, 0, front, 'z', 28);
      ring(shaft, b * .37, b * .027, rubber, 0, 0, front - b * .1, false);
    }
  } else {
    // The propeller hub belongs to the rotating case; the hollow shaft and rear
    // airframe flange stay fixed. There is no automotive flywheel or belt pulley.
    cyl(block, b * .36, b * .32, steel, 0, 0, front - b * .05, 'z', 28);
    const mount = part('block', 0, vec(0, 0, b * .7), true);
    mount.userData.role = 'fixed-engine-mount';
    ring(mount, b * .72, b * .12, dark, 0, 0, rear + b * .38, false);
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6;
      cyl(mount, b * .07, b * .12, steel, Math.sin(a) * b * .72, Math.cos(a) * b * .72, rear + b * .39, 'z', 6);
    }
  }
  updates.push(angle => { shaft.rotation.z = plan.rotating ? 0 : -angle; });

  const bankIds = [...new Set(plan.cylinders.map(c => c.bank))];
  for (const bank of bankIds) {
    const cylinders = plan.cylinders.filter(c => c.bank === bank);
    const angle = cylinders[0].angle;
    const radial = plan.radial;
    const centreZ = radial ? cylinders[0].z : (cylinders[0].z + cylinders[cylinders.length - 1].z) / 2;
    const bankLength = radial ? b * 1.06 : plan.pitch * (cylinders.length - 1) + b * 1.08;
    const bankBlock = part('block', angle, vec(0, -b * .45, 0));
    if (!airCooled) {
      const outline = new THREE.Shape(); const halfW = b * .66, halfL = bankLength / 2;
      outline.moveTo(-halfW, -halfL); outline.lineTo(halfW, -halfL); outline.lineTo(halfW, halfL); outline.lineTo(-halfW, halfL); outline.closePath();
      for (const c of cylinders) { const hole = new THREE.Path(); hole.absarc(0, -(c.z - centreZ), b * .505, 0, TAU, true); outline.holes.push(hole); }
      const height = deck - b * .58;
      const casting = mesh(bankBlock, new THREE.ExtrudeGeometry(outline, { depth: height, bevelEnabled: false, curveSegments: 16 }), iron, 0, b * .58, centreZ);
      casting.rotation.x = -Math.PI / 2;
      for (const side of [-1, 1]) {
        for (const c of cylinders) { box(bankBlock, b * .04, height * .65, b * .12, aluminium, side * b * .675, b * .58 + height * .45, c.z); cyl(bankBlock, b * .09, b * .04, brass, side * b * .69, deck * .55, c.z, 'x'); }
      }
    }
    const head = part('head', angle, vec(0, b * 1.1, 0));
    const cover = part('covers', angle, vec(0, b * 1.9, 0));
    const valveGear = part('valvetrain', angle, vec(0, b * 1.45, 0));
    const intake = part('intake', angle, vec(-b * 1.3, b * .55, 0));
    const fuel = part('fuel', angle, vec(-b * 1.5, b * .75, 0));
    const headers = part('headers', angle, vec(b * 1.25, 0, 0));
    const pistons = part('pistons', angle);
    const mirrorBank = !radial && plan.bankCount > 1 && angle < 0;
    if (mirrorBank) for (const component of [intake, fuel, headers]) component.scale.x = -1;
    const headerReach = config.headerType === 'cast' ? .95 : config.headerType === 'shorty' ? 1.2 : 1.7;
    const collectorX = b * (headerReach + .25);
    const pairedHeaders = config.headerType === 'fourtwoone' && cylinders.length > 2 && !twinScroll;
    if (config.engineCycle === 'two') valveGear.visible = false;
    const coverHeight = config.valvetrainLayout !== 'ohv' ? .42 : appearance.cover === 'classic' ? .25 : .38;
    if (airCooled || hotBulb) {
      for (const c of cylinders) {
        cyl(head, b * .53, b * .33, hotBulb ? iron : aluminium, 0, deck + b * .17, c.z, 'y', 24);
        if (!hotBulb) for (let fin = 0; fin < 4; fin++) ring(head, b * (.6 - fin * .018), b * .026, iron, 0, deck + b * (.05 + fin * .085), c.z);
      // WWI/interwar air-cooled heads carry exposed rocker gear, not a modern
      // painted rectangular valve cover. Small keeper caps remain removable.
        if (!hotBulb) {
          if (radial) cyl(cover, b * .09, b * .12, steel, 0, deck + b * .5, c.z - b * .32);
          else box(cover, b * .82, b * .2, b * .65, aluminium, 0, deck + b * .56, c.z, true);
          cyl(head, b * .07, b * .18, porcelain, -b * .48, deck + b * .22, c.z, 'x');
          cyl(head, b * .045, b * .08, brass, -b * .59, deck + b * .22, c.z, 'x');
        }
      }
    } else {
      box(head, b * 1.35, b * .36, bankLength, aluminium, 0, deck + b * .19, centreZ, true);
      box(head, b * 1.37, b * .035, bankLength + b * .02, gasket, 0, deck, centreZ);
      box(cover, b * 1.25, b * coverHeight, bankLength * .98, paint, 0, deck + b * (.48 + coverHeight / 2), centreZ, true);
      if (appearance.cover === 'ribbed') for (let i = -3; i <= 3; i++) box(cover, b * .045, b * .035, bankLength * .85, aluminium, i * b * .14, deck + b * (.49 + coverHeight), centreZ);
      if (appearance.cover === 'classic') for (const c of cylinders) box(cover, b * .7, b * .12, b * .7, paint, 0, deck + b * .72, c.z, true);
      cyl(cover, b * .15, b * .1, rubber, b * .3, deck + b * (.53 + coverHeight), centreZ - bankLength * .32);
      for (const z of [centreZ - bankLength * .4, centreZ + bankLength * .4]) for (const x of [-.5, .5]) cyl(cover, b * .045, b * .04, steel, x * b, deck + b * (.51 + coverHeight), z, 'y', 6);
    }
    if (!radial && !hotBulb && config.injectionType !== 'carb' && config.injectionType !== 'tbi') cyl(fuel, b * .055, bankLength, brass, -b * .7, deck + b * .47, centreZ, 'z');

    const camXs = config.valvetrainLayout === 'dohc' ? [-b * .29, b * .29] : [0];
    const seats = valveLayout(config);
    const followerHeight = deck + Math.max(0, ...seats.map(seat => b * (.04 + .555 * Math.cos(seat.tilt)))) + b * .06;
    const overheadCamY = followerHeight + b * .065;
    if (config.engineCycle !== 'two' && !config.sleeveValves && !radial) {
      for (const [camIndex, camX] of camXs.entries()) {
        const cam = moving(valveGear);
        const camY = config.valvetrainLayout === 'ohv' ? b * .3 : overheadCamY;
        cam.position.set(camX, camY, centreZ);
        cyl(cam, b * .065, bankLength, steel, 0, 0, 0, 'z');
        for (const c of cylinders) {
          for (const seat of valveLayout(config).filter(seat => camXs.length === 1 || (camIndex === 0) === seat.inlet)) {
            const phase = camLobePhase(config, c.firing, seat.inlet);
            const liftMm = (seat.inlet ? config.valveEvents?.inletLiftMm : config.valveEvents?.exhaustLiftMm) ?? 9;
            const eccentricity = liftMm / 200;
            cyl(cam, b * .065 + eccentricity, b * .1, dark, Math.sin(phase) * eccentricity, Math.cos(phase) * eccentricity, c.z - centreZ + seat.z, 'z', 14);
          }
        }
        updates.push(a => { cam.rotation.z = -a / 2; });
        cyl(valveGear, b * .23, b * .055, dark, camX, camY, centreZ - bankLength / 2 - b * .08, 'z');
      }
      if (!radial && config.camDrive !== 'gear' && config.valvetrainLayout !== 'ohv') {
        pipe(valveGear, [[0, 0, front], [-b * .45, overheadCamY, front], [-b * .2, overheadCamY + b * .23, front], [b * .32, overheadCamY + b * .23, front], [b * .52, overheadCamY, front], [0, 0, front]], b * .025, config.camDrive === 'belt' ? rubber : steel);
      }
    }

    for (const c of cylinders) {
      if (airCooled) {
        const height = deck - b * .7;
        const barrel = mesh(bankBlock, new THREE.CylinderGeometry(b * .52, b * .52, height, 24, 1, true), aluminium, 0, b * .7 + height / 2, c.z);
        barrel.name = 'Cylinder barrel';
        for (let fin = 0; fin < 12; fin++) ring(bankBlock, b * .59, b * .035, iron, 0, b * .78 + fin * height / 12, c.z);
      }
      const piston = moving(pistons); piston.position.z = c.z;
      piston.userData.mechanism = 'piston'; piston.userData.cylinderIndex = c.index;
      cyl(piston, b * .48, plan.pistonHeight, steel);
      for (const y of [.12, .22, .31]) ring(piston, b * .485, b * .012, dark, 0, plan.pistonHeight / 2 - b * y);
      cyl(piston, b * .105, b * 1.01, dark, 0, 0, 0, 'z');
      const rod = moving(pistons); rod.position.z = c.z;
      rod.userData.mechanism = 'conrod'; rod.userData.cylinderIndex = c.index;
      box(rod, b * .13, plan.rod, b * .14, steel);
      box(rod, b * .045, plan.rod * .75, b * .17, dark);
      const smallEnd = ring(rod, b * .12, b * .04, steel, 0, plan.rod / 2, 0, false);
      const bigEnd = ring(rod, b * .19, b * .055, steel, 0, -plan.rod / 2, 0, false);
      smallEnd.name = 'Gudgeon pin'; bigEnd.name = 'Big end';
      const throwPart = part('crank', angle);
      const crankThrow = moving(throwPart); crankThrow.position.z = c.z;
      crankThrow.userData.mechanism = 'crank-throw'; crankThrow.userData.cylinderIndex = c.index;
      if (!radial || c.index === 0 || c.index === 7) {
        cyl(crankThrow, b * .16, b * .3, steel, 0, r, 0, 'z');
        for (const z of [-b * .19, b * .19]) {
          box(crankThrow, b * .32, r + b * .2, b * .1, dark, 0, r / 2, z, true);
          cyl(crankThrow, b * .33, b * .1, dark, 0, -r * .48, z, 'z');
        }
      }
      const combustion = moving(pistons);
      const flame = cyl(combustion, b * .43, b * .08, glow, 0, 0, c.z);
      updates.push(a => {
        const state = cylinderMotion(plan, c, a);
        piston.position.y = state.pistonY;
        rod.position.set(state.pinX / 2, (state.pinY + state.pistonY) / 2, c.z);
        rod.rotation.z = Math.atan2(state.pinX, state.pistonY - state.pinY);
        crankThrow.rotation.z = -(plan.radial ? a - c.angle - (plan.rows === 2 && c.index >= 7 ? Math.PI : 0) : a - c.firing);
        flame.position.y = state.pistonY + plan.pistonHeight / 2 + b * .08;
        combustion.visible = state.cycleAngle < .65;
      });
      if (config.engineCycle !== 'two') {
        if (config.sleeveValves) {
          const sleeve = moving(valveGear);
          mesh(sleeve, new THREE.CylinderGeometry(b * .5, b * .5, b * 1.2, 20, 1, true), brass, 0, 0, c.z);
          updates.push(a => { sleeve.position.y = deck - b * .7 + Math.sin(a / 2 - c.firing / 2) * b * .1; });
        } else {
          for (const seat of valveLayout(config)) {
            const inlet = seat.inlet;
            const valve = moving(valveGear);
            valve.userData.mechanism = 'valve'; valve.userData.cylinderIndex = c.index;
            valve.userData.valveIndex = seat.index; valve.userData.inlet = inlet;
            const x = seat.x - b * .28 * Math.sin(seat.tilt);
            const y = deck + b * .04 + b * .28 * Math.cos(seat.tilt);
            const z = c.z + seat.z;
            valve.position.set(x, y, z); valve.rotation.z = seat.tilt;
            cyl(valve, b * .035, b * .55, steel);
            cyl(valve, seat.radius, b * .035, inlet ? steel : exhaustMetal, 0, -b * .28);
            for (let coil = 0; coil < 4; coil++) ring(valve, b * .08, b * .015, dark, 0, b * (.1 + coil * .045));
            // A finger/bucket sits between an overhead cam and the stem. Keep
            // the shaft above its follower instead of passing through the stem.
            const follower = !radial && config.valvetrainLayout !== 'ohv' ? moving(valveGear) : null;
            const stemX = x - b * .275 * Math.sin(seat.tilt);
            const stemY = y + b * .275 * Math.cos(seat.tilt);
            if (follower) {
              follower.userData.mechanism = 'cam-follower';
              box(follower, b * .32, b * .06, b * .13, steel);
              follower.position.set(stemX, stemY + b * .03, z);
            }
            if (config.valvetrainLayout === 'ohv' && !radial) {
              cyl(valveGear, b * .022, deck - b * .2, steel, (inlet ? -1 : 1) * b * .52, deck / 2, z);
              box(valveGear, b * .4, b * .065, b * .1, steel, (inlet ? -1 : 1) * b * .33, deck + b * .48, z, true);
            }
            updates.push(a => {
              const lift = valveLift(config, cylinderMotion(plan, c, a).cycleAngle, inlet);
              valve.position.x = x + lift * Math.sin(seat.tilt); valve.position.y = y - lift * Math.cos(seat.tilt);
              if (follower) follower.position.set(stemX + lift * Math.sin(seat.tilt), stemY + b * .03 - lift * Math.cos(seat.tilt), z);
            });
          }
          if (radial) {
            const rocker = moving(valveGear); rocker.position.set(0, deck + b * .57, c.z - b * .3);
            box(rocker, b * .7, b * .065, b * .1, steel);
            const pushrod = moving(valveGear); pushrod.position.set(b * .35, deck / 2 + b * .3, c.z - b * .3);
            cyl(pushrod, b * .022, deck - b * .45, steel);
            updates.push(a => {
              const phase = cylinderMotion(plan, c, a).cycleAngle;
              const inletLift = config.valvesPerCylinder > 1 ? valveLift(config, phase, true) : 0;
              const exhaustLift = valveLift(config, phase, false);
              rocker.rotation.z = Math.atan2(exhaustLift - inletLift, b * .55);
              pushrod.position.y = deck / 2 + b * .3 + exhaustLift - inletLift;
            });
          }
        }
      }
      // Individual runners feed a common plenum, or open throttle trumpets.
      const run = config.runnerLength === 'long' ? 1.35 : config.runnerLength === 'short' ? .65 : 1;
      const ix = -b * (1 + run * .55);
      if (plan.rotating && config.valvesPerCylinder === 1) {
        // Monosoupape mixture transfers through cylinder-base ports; there is
        // no Le Rhône-style external inlet pipe or individual carburettor.
        for (const side of [-1, 1]) box(intake, b * .035, b * .13, b * .2, dark, side * b * .51, b * .84, c.z);
      } else if (plan.rotating) {
        pipe(intake, [[-b * .45, deck + b * .18, c.z], [-b * .75, deck * .82, front + b * .05], [-b * .23, b * .9, front + b * .05]], b * .105, copper);
        box(intake, b * .25, b * .22, b * .16, copper, -b * .23, b * .92, front + b * .05, true);
      } else if (!hotBulb) pipe(intake, radial ? [[-b * .55, deck + b * .18, c.z], [-b * .85, deck * .75, c.z + b * .4], [0, b * 1.1, rear + b * .35]] : [[-b * .55, deck + b * .18, c.z], [-b * .9, deck + b * .25, c.z], [ix, deck + b * .62, c.z]], b * .12, aluminium);
      else {
        cyl(intake, b * .16, b * .34, iron, -b * .91, b * .15, c.z, 'x');
        cyl(intake, b * .125, b * .015, dark, -b * 1.09, b * .15, c.z, 'x');
      }
      if (!radial && (config.intakeType === 'itb' || config.airCleaner === 'trumpets')) {
        const trumpet = mesh(intake, new THREE.CylinderGeometry(b * .24, b * .13, b * .28, 20, 1, true), brass, ix, deck + b * .77, c.z);
        trumpet.name = 'Intake trumpet'; ring(intake, b * .24, b * .022, aluminium, ix, deck + b * .91, c.z);
      }
      if (!hotBulb && ['port', 'dual', 'direct'].includes(config.injectionType)) {
        cyl(fuel, b * .065, b * .25, config.injectionType === 'direct' ? brass : blue, config.injectionType === 'direct' ? b * .1 : -b * .7, deck + b * .29, c.z);
        box(fuel, b * .14, b * .09, b * .12, rubber, -b * .7, deck + b * .44, c.z);
        if (config.injectionType === 'dual') cyl(fuel, b * .045, b * .2, brass, b * .12, deck + b * .27, c.z);
      }
      const cast = config.headerType === 'cast';
      const unequal = config.headerType === 'unequal' ? (c.index % 3) * b * .45 : 0;
      const stub = config.applicationType === 'plane' && config.planeExhaust === 'stubs' && config.induction !== 'turbo';
      const pair = Math.floor(cylinders.indexOf(c) / 2);
      const firingRank = [...(radial ? plan.cylinders : cylinders)].sort((a, d) => a.firing - d.firing).findIndex(d => d.index === c.index);
      const scrollLane = firingRank % 2;
      const hz = twinScroll ? centreZ + bankLength * .35 + (scrollLane ? 1 : -1) * b * .18 : stub ? c.z - b * .25 : pairedHeaders ? (cylinders[pair * 2].z + (cylinders[pair * 2 + 1]?.z ?? cylinders[pair * 2].z)) / 2 : centreZ + bankLength * .35;
      if (plan.rotating) {
        // Exhaust opens to free air at each revolving head. A radial collector
        // and tailpipe would become the impossible rotating pipe seen before.
        cyl(headers, b * .14, b * .025, dark, b * .535, deck + b * .18, c.z, 'x');
        const lip = ring(headers, b * .15, b * .018, exhaustMetal, b * .55, deck + b * .18, c.z, false);
        lip.rotation.y = Math.PI / 2; headers.userData.role = 'rotary-open-exhaust-ports';
      } else if (radial && twinScroll) {
        const z = rear + b * .75 + (scrollLane ? 1 : -1) * b * .18;
        const port = [b * 1.3 * Math.cos(angle), b * 1.3 * Math.sin(angle), z];
        pipe(headers, [[b * .58, deck + b * .15, c.z], [b * .85, deck * .7, c.z + b * .4], port], b * .11, exhaustMetal);
        headers.userData.scrollLanes = [{ cylinder: c.index, lane: scrollLane, worldPort: [b * 1.3, 0, z] }];
      } else {
        pipe(headers, radial && !stub ? [[b * .58, deck + b * .15, c.z], [b * .85, deck * .7, c.z + b * .4], [0, b * 1.3, rear + b * .75]] : [[b * .58, deck + b * .15, c.z], [b * headerReach, deck - b * (.15 + unequal), c.z], [collectorX, stub && !twinScroll ? deck - b * .3 : b * .2, hz]], b * (cast ? .13 : .11), exhaustMetal);
        if (twinScroll) {
          const lanes = headers.userData.scrollLanes ?? (headers.userData.scrollLanes = []);
          lanes.push({ cylinder: c.index, lane: scrollLane, localPort: [collectorX, b * .2, hz] });
        }
      }
    }
    if (pairedHeaders) for (let pair = 0; pair < Math.ceil(cylinders.length / 2); pair++) {
      const z = (cylinders[pair * 2].z + (cylinders[pair * 2 + 1]?.z ?? cylinders[pair * 2].z)) / 2;
      pipe(headers, [[collectorX, b * .2, z], [collectorX + b * .4, 0, z], [collectorX, b * .2, centreZ + bankLength * .35]], b * .145, exhaustMetal);
    }
    if (!radial && !hotBulb && config.intakeType !== 'itb' && config.airCleaner !== 'trumpets') {
      box(intake, b * .7, b * .65, bankLength, aluminium, -b * 1.6, deck + b * .6, centreZ, true);
      if (config.intakeType === 'variable' || config.intakeType === 'dualrunner') pipe(intake, [[-b * .8, deck + b * .2, centreZ], [-b * 1.1, deck + b * 1.2, centreZ], [-b * 1.8, deck + b * .9, centreZ]], b * .13, aluminium);
    }
    if (!radial && !hotBulb && (config.injectionType === 'carb' || config.injectionType === 'tbi')) {
      box(fuel, b * .5, b * .35, b * .65, brass, -b * 1.6, deck + b * 1.06, centreZ, true);
      cyl(fuel, b * .44, b * .16, config.airCleaner === 'airbox' ? rubber : steel, -b * 1.6, deck + b * 1.33, centreZ);
    }
    if (hotBulb) {
      const bulb = mesh(fuel, new THREE.SphereGeometry(b * .4, 20, 12), exhaustMetal, -b * .85, deck + b * .18, centreZ);
      bulb.name = 'Hot-bulb combustion chamber'; bulb.userData.role = 'hot-bulb';
      cyl(fuel, b * .16, b * .5, iron, -b * .62, deck + b * .18, centreZ, 'x');
      pipe(fuel, [[-b * .88, deck + b * .55, centreZ], [-b * 1.1, deck * .65, centreZ], [-b * .75, b * .35, centreZ]], b * .028, brass);
      cyl(fuel, b * .065, b * .18, brass, -b * .85, deck + b * .6, centreZ);
    }
    if (!radial && config.induction !== 'turbo' && !(config.applicationType === 'plane' && config.planeExhaust === 'stubs')) {
      const exhaust = part('exhaust', angle, vec(b * 1.7, -b * .3, 0));
      if (mirrorBank) exhaust.scale.x = -1;
      const z = centreZ + bankLength * .35;
      pipe(exhaust, [[collectorX, b * .2, z], [b * 2.1, -b * .35, z + b * .4], [b * 2.1, -b * .45, rear + b * 1.2]], b * .16, exhaustMetal);
      for (let s = 0; s < (config.silencerCount ?? (config.exhaustType === 'race' ? 0 : 1)); s++) cyl(exhaust, b * .29, b * .8, steel, b * 2.1, -b * .45, rear + b * (.3 + s), 'z');
      if (config.applicationType === 'boat' && config.marineExhaust !== 'dry') {
        cyl(exhaust, b * .25, b * .9, blue, b * 2.1, -b * .45, rear + b * .8, 'z');
        pipe(exhaust, [[b * 1.8, -b * .7, rear], [b * 2.5, -b * .4, rear], [b * 2.1, -b * .3, rear + b * .7]], b * .07, rubber);
      }
    }
  }

  if (plan.radial) {
    if (!plan.rotating) {
      const intake = part('intake', 0, vec(0, 0, b * 1.3));
      ring(intake, b * 1.1, b * .14, aluminium, 0, 0, rear + b * .35, false);
    }
    const fuel = part('fuel', 0, vec(0, -b, b * 1.4), plan.rotating);
    fuel.userData.role = plan.rotating ? 'fixed-fuel-feed' : 'radial-carburettor';
    if (plan.rotating) {
      cyl(fuel, b * .13, b * .75, brass, 0, 0, rear + b * .7, 'z');
      if (config.valvesPerCylinder > 1) box(fuel, b * .28, b * .35, b * .26, brass, 0, -b * .12, rear + b * .85, true);
      const inlet = mesh(fuel, new THREE.CylinderGeometry(b * .23, b * .13, b * .35, 20, 1, true), steel, 0, 0, rear + b * 1.15);
      inlet.rotation.x = Math.PI / 2;
      cyl(fuel, b * .035, b * .27, brass, b * .18, b * .12, rear + b * .85);
    } else {
      box(fuel, b * .5, b * .4, b * .5, brass, 0, -b * .9, rear + b * .55, true);
      cyl(fuel, b * .36, b * .2, steel, 0, -b * .9, rear + b * .92, 'z');
    }
    if (!plan.rotating && !twinScroll && (config.planeExhaust !== 'stubs' || config.induction === 'turbo')) {
      const exhaust = part('exhaust', 0, vec(0, 0, b * 1.7));
      exhaust.name = 'Radial exhaust collector ring';
      exhaust.userData.role = 'upstream-exhaust-collector';
      ring(exhaust, b * 1.3, b * .16, exhaustMetal, 0, 0, rear + b * .75, false);
      if (config.induction !== 'turbo') pipe(exhaust, [[b * 1.3, 0, rear + b * .75], [b * 1.8, -b * .5, rear + b * .95], [b * 2.5, -b, rear + b * 1.5]], b * .19, exhaustMetal);
    }
    if (!config.sleeveValves && config.engineCycle !== 'two') {
      const gear = part('valvetrain'); gear.userData.role = 'central-cam-ring';
      const camRing = moving(gear);
      ring(camRing, b * .63, b * .055, steel, 0, 0, front + b * .1, false);
      const lobes = plan.rotating ? 5 : Math.max(2, (plan.count / plan.rows - 1) / 2);
      const camRatio = plan.rotating ? -1 / (plan.count + 1) : 1 / Math.max(4, plan.count / plan.rows - 1);
      camRing.userData.mechanism = 'radial-cam-ring'; camRing.userData.lobeCount = lobes; camRing.userData.camRatio = camRatio;
      for (let i = 0; i < lobes; i++) {
        const a = i * TAU / lobes;
        cyl(camRing, b * .08, b * .06, dark, Math.sin(a) * b * .64, Math.cos(a) * b * .64, front + b * .1, 'z', 12);
      }
      // The nine-cylinder Le Rhône cam plates turn at 9/10 case speed in the
      // fixed frame: -1/10 relative to the case gives five lobes x 1/10 = one
      // valve event per two case revolutions, rather than 4.5 events/revolution.
      updates.push(a => { camRing.rotation.z = a * camRatio; });
    }
  }

  buildInductionScene(config, plan, { part, moving, mesh, box, cyl, ring, pipe, materials: { aluminium, steel, iron, dark, brass, rubber, exhaustMetal }, updates, front, rear });

  // Merge stationary geometry by material within each removable assembly.
  // Pistons, rods, cranks and valve mechanisms remain independent transforms.
  function compact(group: THREE.Group) {
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert();
    const buckets = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
    const remove: THREE.Mesh[] = [];
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (let node: THREE.Object3D | null = object; node && node !== group; node = node.parent) if (node.userData.moving) return;
      const material = object.material as THREE.MeshStandardMaterial;
      const geometry = (object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
      // Parametric volutes/rotors do not require texture coordinates, whereas
      // the stock castings have them. Batching still needs matching attributes.
      if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 2), 2));
      if (!buckets.has(material)) buckets.set(material, []); buckets.get(material)!.push(geometry); remove.push(object);
    });
    remove.forEach(object => object.removeFromParent());
    for (const [material, pieces] of buckets) {
      const merged = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose());
      if (!merged) throw new Error('Engine component geometry could not be combined');
      mesh(group, merged, material);
    }
  }
  for (const p of parts) {
    const movingGroups: THREE.Group[] = [];
    p.group.traverse(object => { if (object instanceof THREE.Group && object.userData.moving) movingGroups.push(object); });
    movingGroups.forEach(compact);
    compact(p.group);
  }
  const partMaterials = new Map<PartId, Set<THREE.MeshStandardMaterial>>();
  for (const p of parts) {
    const clones = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
    p.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material as THREE.MeshStandardMaterial;
      if (original === glow) return;
      if (!clones.has(original)) {
        const clone = original.clone(); materials.add(clone);
        if (shells.has(original)) shells.add(clone);
        clones.set(original, clone);
      }
      object.material = clones.get(original)!;
      if (!partMaterials.has(p.id)) partMaterials.set(p.id, new Set());
      partMaterials.get(p.id)!.add(object.material);
    });
  }
  updates.forEach(fn => fn(0));
  const initialBounds = new THREE.Box3().setFromObject(root);
  let previousMode = '';
  let previousSelected: PartId | null | undefined;
  return {
    root, plan, bounds: initialBounds,
    update(angle: number, view: AssemblyView) {
      // Rotating-cylinder engines keep the crank fixed while their case revolves.
      // Use the same forward cycle phase for both architectures. On a rotary
      // the positive case rotation cancels the crank's relative -angle motion,
      // leaving its eccentric fixed without running the valve cycle backwards.
      body.rotation.z = plan.rotating ? angle : 0;
      updates.forEach(fn => fn(angle));
      for (const p of parts) {
        p.group.visible = !view.hidden.has(p.id) && !(p.id === 'valvetrain' && config.engineCycle === 'two');
        p.group.position.copy(p.base).addScaledVector(p.offset, view.mode === 'exploded' ? view.explode : 0);
      }
      clip.normal.set(view.axis === 'x' ? -1 : 0, 0, view.axis === 'z' ? -1 : 0);
      const min = initialBounds.min[view.axis], max = initialBounds.max[view.axis];
      clip.constant = min + (max - min) * view.cut;
      if (previousMode !== view.mode) {
        shells.forEach(m => { m.clippingPlanes = view.mode === 'cutaway' ? [clip] : []; m.needsUpdate = true; });
        previousMode = view.mode;
      }
      if (previousSelected !== view.selected) {
        for (const [id, values] of partMaterials) values.forEach(m => {
          m.emissive.set(id === view.selected ? '#244f69' : '#000000');
          m.emissiveIntensity = id === view.selected ? .65 : 0;
        });
        previousSelected = view.selected;
      }
    },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); },
  };
}
