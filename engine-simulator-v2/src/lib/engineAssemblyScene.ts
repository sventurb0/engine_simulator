import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SimConfig } from '../EngineSimulatorV2';
import { cylinderMotion, planAssembly, valveLift, TAU, type PartId } from './engineAssembly';

export type AssemblyAppearance = { colour: string; cover: 'ribbed' | 'smooth' | 'classic' };
export type AssemblyView = { mode: 'assembled' | 'cutaway' | 'exploded'; cut: number; explode: number; axis: 'x' | 'z'; hidden: Set<PartId>; selected: PartId | null };
const up = new THREE.Vector3(0, 1, 0);
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function createEngineAssembly(config: SimConfig, appearance: AssemblyAppearance) {
  const plan = planAssembly(config);
  const root = new THREE.Group();
  root.name = 'Engine assembly';
  const body = new THREE.Group(); root.add(body);
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
  function part(id: PartId, angle = 0, offset = vec(0, 0, 0)) {
    const group = new THREE.Group(); group.rotation.z = -angle; group.userData.part = id; body.add(group);
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
  }
  const crankPart = part('crank');
  const shaft = moving(crankPart);
  cyl(shaft, b * .14, plan.length + b * 1.4, steel, 0, 0, 0, 'z');
  const flywheel = cyl(shaft, b * .82, b * .18, dark, 0, 0, rear + b * .25, 'z', 36);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8; cyl(shaft, b * .075, b * .2, brass, Math.sin(a) * b * .58, Math.cos(a) * b * .58, flywheel.position.z, 'z', 6);
  }
  cyl(shaft, b * .43, b * .17, dark, 0, 0, front, 'z', 28);
  ring(shaft, b * .37, b * .027, rubber, 0, 0, front - b * .1, false);
  updates.push(angle => { shaft.rotation.z = -angle; });

  const bankIds = [...new Set(plan.cylinders.map(c => c.bank))];
  for (const bank of bankIds) {
    const cylinders = plan.cylinders.filter(c => c.bank === bank);
    const angle = cylinders[0].angle;
    const radial = plan.radial;
    const centreZ = radial ? cylinders[0].z : (cylinders[0].z + cylinders[cylinders.length - 1].z) / 2;
    const bankLength = radial ? b * 1.06 : plan.pitch * (cylinders.length - 1) + b * 1.08;
    const bankBlock = part('block', angle, vec(0, -b * .45, 0));
    if (!radial) {
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
    const pairedHeaders = config.headerType === 'fourtwoone' && cylinders.length > 2;
    if (config.engineCycle === 'two') valveGear.visible = false;
    box(head, b * 1.35, b * .36, bankLength, aluminium, 0, deck + b * .19, centreZ, true);
    box(head, b * 1.37, b * .035, bankLength + b * .02, gasket, 0, deck, centreZ);
    const coverHeight = appearance.cover === 'classic' ? .25 : .38;
    box(cover, b * 1.25, b * coverHeight, bankLength * .98, paint, 0, deck + b * (.48 + coverHeight / 2), centreZ, true);
    if (appearance.cover === 'ribbed') for (let i = -3; i <= 3; i++) box(cover, b * .045, b * .035, bankLength * .85, aluminium, i * b * .14, deck + b * (.49 + coverHeight), centreZ);
    if (appearance.cover === 'classic') for (const c of cylinders) box(cover, b * .7, b * .12, b * .7, paint, 0, deck + b * .72, c.z, true);
    cyl(cover, b * .15, b * .1, rubber, b * .3, deck + b * (.53 + coverHeight), centreZ - bankLength * .32);
    for (const z of [centreZ - bankLength * .4, centreZ + bankLength * .4]) for (const x of [-.5, .5]) cyl(cover, b * .045, b * .04, steel, x * b, deck + b * (.51 + coverHeight), z, 'y', 6);
    if (!radial && config.injectionType !== 'carb' && config.injectionType !== 'tbi') cyl(fuel, b * .055, bankLength, brass, -b * .7, deck + b * .47, centreZ, 'z');

    const camXs = config.valvetrainLayout === 'dohc' ? [-b * .29, b * .29] : [0];
    if (config.engineCycle !== 'two' && !config.sleeveValves) {
      for (const [camIndex, camX] of camXs.entries()) {
        const cam = moving(valveGear);
        const camY = config.valvetrainLayout === 'ohv' ? b * .3 : deck + b * .48;
        cam.position.set(camX, camY, centreZ);
        cyl(cam, b * .065, bankLength, steel, 0, 0, 0, 'z');
        for (const c of cylinders) {
          for (let l = 0; l < (camXs.length === 1 ? 2 : 1); l++) {
            const phase = c.firing / 2 + (camIndex || l ? Math.PI * .7 : Math.PI * 1.25);
            cyl(cam, b * .11, b * .1, dark, Math.sin(phase) * b * .045, Math.cos(phase) * b * .045, c.z - centreZ + (l - .5) * b * .22, 'z', 14);
          }
        }
        updates.push(a => { cam.rotation.z = -a / 2; });
        cyl(valveGear, b * .23, b * .055, dark, camX, camY, centreZ - bankLength / 2 - b * .08, 'z');
      }
      if (!radial && config.camDrive !== 'gear' && config.valvetrainLayout !== 'ohv') {
        pipe(valveGear, [[0, 0, front], [-b * .34, deck + b * .3, front], [-b * .2, deck + b * .72, front], [b * .32, deck + b * .7, front], [b * .44, deck + b * .3, front], [0, 0, front]], b * .025, config.camDrive === 'belt' ? rubber : steel);
      }
    }

    for (const c of cylinders) {
      if (radial) {
        const height = deck - b * .7;
        const barrel = mesh(bankBlock, new THREE.CylinderGeometry(b * .52, b * .52, height, 24, 1, true), aluminium, 0, b * .7 + height / 2, c.z);
        barrel.name = 'Cylinder barrel';
        for (let fin = 0; fin < 12; fin++) ring(bankBlock, b * .59, b * .035, iron, 0, b * .78 + fin * height / 12, c.z);
      }
      const piston = moving(pistons); piston.position.z = c.z;
      cyl(piston, b * .48, plan.pistonHeight, steel);
      for (const y of [.12, .22, .31]) ring(piston, b * .485, b * .012, dark, 0, plan.pistonHeight / 2 - b * y);
      cyl(piston, b * .105, b * 1.01, dark, 0, -b * .09, 0, 'z');
      const rod = moving(pistons); rod.position.z = c.z;
      box(rod, b * .13, plan.rod, b * .14, steel);
      box(rod, b * .045, plan.rod * .75, b * .17, dark);
      const smallEnd = ring(rod, b * .12, b * .04, steel, 0, plan.rod / 2, 0, false);
      const bigEnd = ring(rod, b * .19, b * .055, steel, 0, -plan.rod / 2, 0, false);
      smallEnd.name = 'Gudgeon pin'; bigEnd.name = 'Big end';
      const throwPart = part('crank', angle);
      const crankThrow = moving(throwPart); crankThrow.position.z = c.z;
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
          for (let v = 0; v < config.valvesPerCylinder; v++) {
            const inlet = config.valvesPerCylinder > 1 && v < Math.ceil(config.valvesPerCylinder / 2);
            const valve = moving(valveGear);
            const x = (inlet ? -1 : 1) * b * .23;
            const z = c.z + ((v % 2) - .5) * b * .29;
            valve.position.set(x, deck + b * .32, z);
            cyl(valve, b * .035, b * .55, steel);
            cyl(valve, b * .14, b * .035, inlet ? steel : exhaustMetal, 0, -b * .28);
            for (let coil = 0; coil < 4; coil++) ring(valve, b * .08, b * .015, dark, 0, b * (.1 + coil * .045));
            if (config.valvetrainLayout === 'ohv') {
              cyl(valveGear, b * .022, deck - b * .2, steel, (inlet ? -1 : 1) * b * .52, deck / 2, z);
              box(valveGear, b * .4, b * .065, b * .1, steel, (inlet ? -1 : 1) * b * .33, deck + b * .48, z, true);
            }
            updates.push(a => { valve.position.y = deck + b * .32 - valveLift(config, cylinderMotion(plan, c, a).cycleAngle, inlet); });
          }
        }
      }
      // Individual runners feed a common plenum, or open throttle trumpets.
      const run = config.runnerLength === 'long' ? 1.35 : config.runnerLength === 'short' ? .65 : 1;
      const ix = -b * (1 + run * .55);
      pipe(intake, radial ? [[-b * .55, deck + b * .18, c.z], [-b * .85, deck * .75, c.z + b * .4], [0, b * 1.1, rear + b * .35]] : [[-b * .55, deck + b * .18, c.z], [-b * .9, deck + b * .25, c.z], [ix, deck + b * .62, c.z]], b * .12, aluminium);
      if (!radial && (config.intakeType === 'itb' || config.airCleaner === 'trumpets')) {
        const trumpet = mesh(intake, new THREE.CylinderGeometry(b * .24, b * .13, b * .28, 20, 1, true), brass, ix, deck + b * .77, c.z);
        trumpet.name = 'Intake trumpet'; ring(intake, b * .24, b * .022, aluminium, ix, deck + b * .91, c.z);
      }
      if (['port', 'dual', 'direct'].includes(config.injectionType)) {
        cyl(fuel, b * .065, b * .25, config.injectionType === 'direct' ? brass : blue, config.injectionType === 'direct' ? b * .1 : -b * .7, deck + b * .29, c.z);
        box(fuel, b * .14, b * .09, b * .12, rubber, -b * .7, deck + b * .44, c.z);
        if (config.injectionType === 'dual') cyl(fuel, b * .045, b * .2, brass, b * .12, deck + b * .27, c.z);
      }
      const cast = config.headerType === 'cast';
      const unequal = config.headerType === 'unequal' ? (c.index % 3) * b * .45 : 0;
      const stub = config.applicationType === 'plane' && config.planeExhaust === 'stubs';
      const pair = Math.floor(cylinders.indexOf(c) / 2);
      const hz = stub ? c.z - b * .25 : pairedHeaders ? (cylinders[pair * 2].z + (cylinders[pair * 2 + 1]?.z ?? cylinders[pair * 2].z)) / 2 : centreZ + bankLength * .35;
      pipe(headers, radial && !stub ? [[b * .58, deck + b * .15, c.z], [b * .85, deck * .7, c.z + b * .4], [0, b * 1.3, rear + b * .75]] : [[b * .58, deck + b * .15, c.z], [b * headerReach, deck - b * (.15 + unequal), c.z], [collectorX, stub ? deck - b * .3 : b * .2, hz]], b * (cast ? .13 : .11), exhaustMetal);
    }
    if (pairedHeaders) for (let pair = 0; pair < Math.ceil(cylinders.length / 2); pair++) {
      const z = (cylinders[pair * 2].z + (cylinders[pair * 2 + 1]?.z ?? cylinders[pair * 2].z)) / 2;
      pipe(headers, [[collectorX, b * .2, z], [collectorX + b * .4, 0, z], [collectorX, b * .2, centreZ + bankLength * .35]], b * .145, exhaustMetal);
    }
    if (!radial && config.intakeType !== 'itb' && config.airCleaner !== 'trumpets') {
      box(intake, b * .7, b * .65, bankLength, aluminium, -b * 1.6, deck + b * .6, centreZ, true);
      if (config.intakeType === 'variable' || config.intakeType === 'dualrunner') pipe(intake, [[-b * .8, deck + b * .2, centreZ], [-b * 1.1, deck + b * 1.2, centreZ], [-b * 1.8, deck + b * .9, centreZ]], b * .13, aluminium);
    }
    if (!radial && (config.injectionType === 'carb' || config.injectionType === 'tbi')) {
      box(fuel, b * .5, b * .35, b * .65, brass, -b * 1.6, deck + b * 1.06, centreZ, true);
      cyl(fuel, b * .44, b * .16, config.airCleaner === 'airbox' ? rubber : steel, -b * 1.6, deck + b * 1.33, centreZ);
    }
    if (!radial && !(config.applicationType === 'plane' && config.planeExhaust === 'stubs')) {
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
    const intake = part('intake', 0, vec(0, 0, b * 1.3));
    ring(intake, b * 1.1, b * .14, aluminium, 0, 0, rear + b * .35, false);
    const fuel = part('fuel', 0, vec(0, -b, b * 1.4));
    box(fuel, b * .5, b * .4, b * .5, brass, 0, -b * .9, rear + b * .55, true);
    cyl(fuel, b * .36, b * .2, steel, 0, -b * .9, rear + b * .92, 'z');
    if (config.planeExhaust !== 'stubs') {
      const exhaust = part('exhaust', 0, vec(0, 0, b * 1.7));
      ring(exhaust, b * 1.3, b * .16, exhaustMetal, 0, 0, rear + b * .75, false);
      pipe(exhaust, [[b * 1.3, 0, rear + b * .75], [b * 1.8, -b * .5, rear + b * .95], [b * 2.5, -b, rear + b * 1.5]], b * .19, exhaustMetal);
    }
  }

  if (config.induction !== 'na') {
    const induction = part('induction', 0, vec(b * 1.3, b * .6, 0));
    const turbo = config.induction === 'turbo' || config.blowerType === 'centrifugal';
    if (turbo) {
      const count = config.induction === 'turbo' ? Math.max(1, Math.min(4, config.turboCount ?? 1)) : 1;
      const size = config.turboFamily === 'large' ? .6 : config.turboFamily === 'small' ? .38 : .48;
      for (let i = 0; i < count; i++) {
        const x = b * 2.35, y = deck * .48, z = (i - (count - 1) / 2) * b * 1.2;
        ring(induction, b * size, b * .18, aluminium, x, y, z, false);
        ring(induction, b * size * .86, b * .16, exhaustMetal, x, y, z + b * .5, false);
        cyl(induction, b * .22, b * .16, dark, x, y, z - b * .05, 'z');
        const wheel = moving(induction); wheel.position.set(x, y, z - b * .15);
        for (let blade = 0; blade < 8; blade++) {
          const paddle = box(wheel, b * .035, b * .32, b * .07, steel); paddle.rotation.z = blade * TAU / 8; paddle.position.set(Math.sin(blade * TAU / 8) * b * .1, Math.cos(blade * TAU / 8) * b * .1, 0);
        }
        updates.push(a => { wheel.rotation.z = -a * (config.induction === 'supercharger' ? config.superchargerDriveRatio : 8); });
        if (config.intercoolerType === 'none') pipe(induction, [[x, y + b * size, z], [x, deck + b * .8, z - b * .2], [-b * 1.6, deck + b * .6, front + b * .5]], b * .16, blue);
        else if (count > 1) pipe(induction, [[x, y + b * size, z], [x + b * .3, y + b * size, z], [x, y + b * size, 0]], b * .16, blue);
        if (config.induction === 'turbo') pipe(induction, [[b * 1.95, b * .2, z], [x + b * .4, y, z + b * .6], [x, y + b * size, z + b * .5]], b * .12, exhaustMetal);
      }
    } else {
      box(induction, b * 1.4, b * .7, plan.length * .65, aluminium, 0, deck + b * 1.12, 0, true);
      for (let i = 0; i < 7; i++) box(induction, b * 1.42, b * .04, b * .04, dark, 0, deck + b * 1.48, (i - 3) * plan.length / 12);
      for (const x of [-.3, .3]) {
        const rotor = moving(induction); rotor.position.set(x * b, deck + b * 1.13, 0);
        cyl(rotor, b * .24, plan.length * .6, brass, 0, 0, 0, 'z');
        updates.push(a => { rotor.rotation.z = a * config.superchargerDriveRatio * Math.sign(x); });
      }
      pipe(induction, [[0, 0, front], [b * .6, deck * .5, front], [0, deck + b * 1.12, front], [-b * .6, deck * .5, front], [0, 0, front]], b * .045, rubber);
    }
    if (config.intercoolerType !== 'none') {
      const ic = part('intercooler', 0, vec(0, 0, -b * 1.7));
      const water = config.intercoolerType === 'water_air', side = config.intercoolerType === 'sidemount';
      const w = b * (water ? 1.4 : side ? 1.2 : config.intercoolerType === 'large_fmic' ? 3.4 : 2.4) * (.7 + config.icCoreSize * .3);
      const x = side ? -b * 2.5 : 0, y = water ? deck + b * 1.4 : b * .3, z = water ? 0 : front - b * 1.5;
      box(ic, w, b * .9, b * .35, aluminium, x, y, z, true);
      for (let row = 0; row < 12; row++) box(ic, w * .85, b * .022, b * .39, dark, x, y + b * (row / 14 - .39), z);
      for (const direction of [-1, 1]) {
        box(ic, b * .2, b * .95, b * .4, aluminium, x + direction * w / 2, y, z, true);
        const compressorSize = config.turboFamily === 'large' ? .6 : config.turboFamily === 'small' ? .38 : .48;
        const end = direction === -1 ? [-b * 1.6, deck + b * .6, front + b * .5] : turbo ? [b * 2.35, deck * .48 + b * compressorSize, 0] : [0, deck + b * 1.45, 0];
        pipe(ic, [[x + direction * w / 2, y, z], [direction * b * 2.4, y, front - b * .6], end], b * .15, direction === -1 ? blue : red);
      }
    }
  }

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
      body.rotation.z = plan.rotating ? -angle : 0;
      const mechanismAngle = plan.rotating ? -angle : angle;
      updates.forEach(fn => fn(mechanismAngle));
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
