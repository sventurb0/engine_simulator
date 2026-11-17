export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothStep = (x: number, e0: number, e1: number) => {
  const t = clamp((x - e0) / Math.max(e1 - e0, 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};

export const engineLayouts: Record<string, { label: string; cylinders: number; firingFactor: number; pulseSpread: number; pulseDepth: number }> = {
  single: {label:"Single cylinder",cylinders:1,firingFactor:.5,pulseSpread:.1,pulseDepth:1.2},
  i2: {label:"Inline twin",cylinders:2,firingFactor:1,pulseSpread:.1,pulseDepth:1.1},
  flat2: {label:"Flat twin",cylinders:2,firingFactor:1,pulseSpread:.03,pulseDepth:1},
  radial5: {label:"Radial 5",cylinders:5,firingFactor:2.5,pulseSpread:.08,pulseDepth:1.1},
  radial7: {label:"Radial 7",cylinders:7,firingFactor:3.5,pulseSpread:.06,pulseDepth:1.1},
  radial9: {label:"Radial 9",cylinders:9,firingFactor:4.5,pulseSpread:.04,pulseDepth:1.15},
  radial14: {label:"Two-row radial 14",cylinders:14,firingFactor:7,pulseSpread:.04,pulseDepth:1.15},
  rotary9: {label:"Rotating-cylinder rotary 9",cylinders:9,firingFactor:4.5,pulseSpread:.04,pulseDepth:1.1},
  w12: {label:"Three-bank W12",cylinders:12,firingFactor:6,pulseSpread:.04,pulseDepth:1.15},
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

