import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = root + 'node_modules/.cache/assembly-check.mjs';
await fs.mkdir(root + 'node_modules/.cache', { recursive: true });
const app = await fs.readFile(root + 'src/EngineSimulatorV2.tsx', 'utf8');
await build({ stdin: { contents: app + '\nexport { presets, configForPreset, defaultConfig };\nexport { planAssembly, cylinderMotion, valveLift, TAU } from "./lib/engineAssembly";\nexport { createEngineAssembly } from "./lib/engineAssemblyScene";', resolveDir: root + 'src', loader: 'tsx' }, tsconfig: root + 'tsconfig.app.json', bundle: true, platform: 'node', format: 'esm', loader: { '.css': 'empty' }, outfile: out });
const { presets, configForPreset, defaultConfig, planAssembly, cylinderMotion, valveLift, TAU, createEngineAssembly } = await import(pathToFileURL(out).href);
let cylinderChecks = 0, sceneChecks = 0, maxTriangles = 0, maxDraws = 0;
try {
  for (const preset of presets) {
    const config = configForPreset(preset), plan = planAssembly(config);
    assert.equal(plan.cylinders.length, plan.count, preset.name);
    assert.equal(new Set(plan.cylinders.map(c => c.index)).size, plan.count);
    for (const c of plan.cylinders) {
      for (let step = 0; step <= 96; step++) {
        const angle = step / 96 * TAU * 2;
        const m = cylinderMotion(plan, c, angle);
        Object.values(m).forEach(v => assert.ok(Number.isFinite(v), preset.name));
        assert.ok(Math.abs(Math.hypot(m.pinX, m.pistonY - m.pinY) - plan.rod) < 1e-9, preset.name + ' rod length');
        assert.ok(m.pistonY >= plan.rod - plan.radius - 1e-9 && m.pistonY <= plan.rod + plan.radius + 1e-9, preset.name + ' stroke envelope');
        for (const intake of [true, false]) { const lift = valveLift(config, m.cycleAngle, intake); assert.ok(lift >= 0 && lift < .2, preset.name + ' valve lift'); }
        cylinderChecks++;
      }
    }
    if (config.engineCycle !== 'two') for (const c of plan.cylinders) {
      assert.ok(Math.abs(cylinderMotion(plan, c, c.firing).pistonY - plan.rod - plan.radius) < 1e-9, 'Ignition at TDC');
    }
    const present = new Set(plan.parts.map(p => p.id));
    assert.equal(present.has('induction'), config.induction !== 'na');
    assert.equal(present.has('intercooler'), config.induction !== 'na' && config.intercoolerType !== 'none');
    assert.equal(present.has('valvetrain'), config.engineCycle !== 'two');
  }
  const representative = [...new Map(presets.map(p => [p.config.engineLayout, configForPreset(p)])).values()];
  const variants = [
    ...['ohv', 'sohc', 'dohc'].map(valvetrainLayout => ({ ...defaultConfig, valvetrainLayout })),
    ...['na', 'turbo', 'supercharger'].map(induction => ({ ...defaultConfig, induction })),
    ...['carb', 'tbi', 'port', 'direct', 'dual'].map(injectionType => ({ ...defaultConfig, injectionType })),
    ...['none', 'sidemount', 'small_fmic', 'large_fmic', 'water_air'].map(intercoolerType => ({ ...defaultConfig, induction: 'turbo', intercoolerType })),
    ...['cast', 'shorty', 'fourtwoone', 'fourone', 'equal', 'unequal'].map(headerType => ({ ...defaultConfig, headerType })),
    ...['roots', 'twinscrew', 'centrifugal'].map(blowerType => ({ ...defaultConfig, induction: 'supercharger', blowerType })),
    { ...defaultConfig, engineLayout: 'radial14', applicationType: 'plane', sleeveValves: true },
    { ...defaultConfig, engineLayout: 'single', applicationType: 'boat', engineCycle: 'two' },
    { ...defaultConfig, engineLayout: 'flat6', intakeType: 'itb', airCleaner: 'trumpets' },
    { ...defaultConfig, turboCount: 4, turboFamily: 'large', icCoreSize: 1 },
  ];
  for (const [i, config] of [...representative, ...variants].entries()) {
    const assembly = createEngineAssembly(config, { colour: '#9b3535', cover: ['ribbed', 'smooth', 'classic'][i % 3] });
    const view = { mode: 'assembled', cut: .5, axis: 'x', explode: .7, hidden: new Set(), selected: null };
    for (const angle of [0, Math.PI / 2, Math.PI, TAU * 2]) {
      assembly.update(angle, view); assembly.root.updateMatrixWorld(true);
      assembly.root.traverse(object => {
        object.matrixWorld.elements.forEach(v => assert.ok(Number.isFinite(v), 'finite transform'));
        if (object.isMesh) for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value), 'finite vertex');
      });
    }
    let triangles = 0, draws = 0;
    assembly.root.traverse(o => { if (o.isMesh) { triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; draws++; } });
    maxTriangles = Math.max(maxTriangles, triangles); maxDraws = Math.max(maxDraws, draws);
    assert.ok(triangles < 250000, config.engineLayout + ' triangle budget');
    assert.ok(draws < 500, config.engineLayout + ' draw budget');
    assembly.update(1, { ...view, mode: 'cutaway', axis: 'z', selected: 'block' });
    assembly.update(1, { ...view, mode: 'exploded', hidden: new Set(['covers']) });
    assembly.root.traverse(o => { if (o.userData.part === 'covers') assert.equal(o.visible, false); });
    assembly.dispose(); sceneChecks++;
  }
  console.log(`PASS: ${presets.length} engine configurations; ${cylinderChecks} cylinder-motion checks; ${sceneChecks} component assemblies; max ${Math.round(maxTriangles)} triangles / ${maxDraws} mesh draws.`);
} finally { await fs.rm(out, { force: true }); }
