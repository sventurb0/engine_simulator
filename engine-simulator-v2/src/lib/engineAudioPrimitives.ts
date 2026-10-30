export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothStep = (x: number, e0: number, e1: number) => {
  const t = clamp((x - e0) / Math.max(e1 - e0, 1), 0, 1);
  return t * t * (3 - 2 * t);
};

export const engineLayouts: Record<string, { label: string; cylinders: number; firingFactor: number; pulseSpread: number; pulseDepth: number }> = {
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
