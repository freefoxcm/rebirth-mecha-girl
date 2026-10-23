import type { GirlId } from './types';

/** 机体站位：z 从机头(-)到机尾(+)，w/top/bottom 为绝对模型单位。 */
export interface JetStation {
  z: number;
  w: number;
  top: number;
  bottom: number;
}

export interface JetWingPlan {
  rootX: number;
  tipX: number;
  rootLE: number;
  rootTE: number;
  tipLE: number;
  tipTE: number;
  midX?: number;
  midLE?: number;
  midTE?: number;
  thickness: number;
  dihedral: number;
  y: number;
}

export interface JetTailPlan {
  twin: boolean;
  offset: number;
  cant: number;
  rootLE: number;
  rootTE: number;
  tipLE: number;
  tipTE: number;
  height: number;
  thickness: number;
}

export interface JetIntakePlan {
  count: 1 | 2;
  z: number;
  x: number;
  w: number;
  h: number;
  length: number;
  style: 'dsi' | 'caret' | 'box';
}

export interface JetNozzlePlan {
  count: 1 | 2;
  x: number;
  z: number;
  radius: number;
  style: 'round' | 'rect' | 'tvc';
}

export interface JetCanopyPlan {
  z: number;
  length: number;
  width: number;
  height: number;
}

/**
 * 按 `reference_resources/<id>/02_战机三视图.png` 手工量取的外形基准。
 * 任务内按 0.92 缩放以保持当前判定/视野，机库按 1.0 展示。
 */
export interface JetBlueprint {
  id: GirlId;
  length: number;
  span: number;
  height: number;
  stations: JetStation[];
  wing: JetWingPlan;
  lerx?: JetWingPlan;
  canards?: JetWingPlan;
  tail: JetTailPlan;
  intakes: JetIntakePlan;
  nozzles: JetNozzlePlan;
  canopy: JetCanopyPlan;
  number: string;
  motif: 'cloud' | 'stripe' | 'ew' | 'star' | 'frost';
  panelColor: number;
  secondaryPanels: number;
}

export const JET_BLUEPRINTS: Record<GirlId, JetBlueprint> = {
  qingluan: {
    id: 'qingluan',
    length: 20.5,
    span: 13.2,
    height: 4.3,
    stations: [
      { z: -10.25, w: 0.06, top: 0.07, bottom: -0.07 },
      { z: -9.7, w: 0.3, top: 0.2, bottom: -0.18 },
      { z: -9.0, w: 0.58, top: 0.36, bottom: -0.32 },
      { z: -8.0, w: 0.9, top: 0.55, bottom: -0.47 },
      { z: -6.6, w: 1.22, top: 0.73, bottom: -0.6 },
      { z: -5.0, w: 1.5, top: 0.86, bottom: -0.68 },
      { z: -3.2, w: 1.7, top: 0.94, bottom: -0.74 },
      { z: -1.4, w: 1.8, top: 0.98, bottom: -0.78 },
      { z: 0.6, w: 1.78, top: 0.9, bottom: -0.75 },
      { z: 2.8, w: 1.64, top: 0.76, bottom: -0.65 },
      { z: 5.0, w: 1.42, top: 0.6, bottom: -0.54 },
      { z: 7.2, w: 1.15, top: 0.44, bottom: -0.42 },
      { z: 9.2, w: 0.86, top: 0.3, bottom: -0.3 },
      { z: 10.25, w: 0.52, top: 0.17, bottom: -0.18 },
    ],
    wing: { rootX: 1.62, midX: 4.35, tipX: 6.6, rootLE: -2.4, midLE: 0.55, tipLE: 2.7, rootTE: 4.9, midTE: 5.18, tipTE: 5.35, thickness: 0.34, dihedral: 0.035, y: -0.08 },
    lerx: { rootX: 0.58, tipX: 1.62, rootLE: -7.6, rootTE: -4.4, tipLE: -2.4, tipTE: 0.6, thickness: 0.12, dihedral: 0.02, y: 0.03 },
    canards: { rootX: 0.75, tipX: 3.9, rootLE: -7.4, rootTE: -5.5, tipLE: -6.8, tipTE: -6.0, thickness: 0.12, dihedral: 0.08, y: 0.38 },
    tail: { twin: true, offset: 1.45, cant: 0.42, rootLE: 6.0, rootTE: 9.1, tipLE: 7.8, tipTE: 9.2, height: 2.5, thickness: 0.26 },
    intakes: { count: 2, z: -4.15, x: 1.25, w: 0.72, h: 0.68, length: 2.8, style: 'dsi' },
    nozzles: { count: 2, x: 0.76, z: 9.75, radius: 0.55, style: 'round' },
    canopy: { z: -2.7, length: 2.6, width: 0.82, height: 0.52 },
    number: 'QL-01',
    motif: 'cloud',
    panelColor: 0x6f7f70,
    secondaryPanels: 0x8ea992,
  },
  akari: {
    id: 'akari',
    length: 17.2,
    span: 12.1,
    height: 3.9,
    stations: [
      { z: -8.6, w: 0.06, top: 0.08, bottom: -0.08 },
      { z: -8.1, w: 0.3, top: 0.22, bottom: -0.2 },
      { z: -7.5, w: 0.56, top: 0.38, bottom: -0.34 },
      { z: -6.6, w: 0.86, top: 0.56, bottom: -0.48 },
      { z: -5.4, w: 1.15, top: 0.72, bottom: -0.6 },
      { z: -4.0, w: 1.4, top: 0.84, bottom: -0.68 },
      { z: -2.3, w: 1.6, top: 0.9, bottom: -0.72 },
      { z: -0.5, w: 1.68, top: 0.94, bottom: -0.74 },
      { z: 1.5, w: 1.62, top: 0.86, bottom: -0.7 },
      { z: 3.5, w: 1.48, top: 0.72, bottom: -0.6 },
      { z: 5.4, w: 1.26, top: 0.55, bottom: -0.5 },
      { z: 7.0, w: 1.0, top: 0.4, bottom: -0.38 },
      { z: 8.6, w: 0.58, top: 0.2, bottom: -0.2 },
    ],
    wing: { rootX: 1.52, midX: 3.9, tipX: 6.05, rootLE: -1.9, midLE: 0.2, tipLE: 1.5, rootTE: 4.5, midTE: 4.82, tipTE: 5.05, thickness: 0.3, dihedral: 0.025, y: -0.06 },
    lerx: { rootX: 0.6, tipX: 1.52, rootLE: -6.5, rootTE: -3.8, tipLE: -1.9, tipTE: 0.5, thickness: 0.1, dihedral: 0.02, y: 0.03 },
    tail: { twin: false, offset: 0, cant: 0, rootLE: 5.0, rootTE: 7.6, tipLE: 6.6, tipTE: 7.85, height: 2.55, thickness: 0.24 },
    intakes: { count: 1, z: -3.2, x: 0, w: 1.5, h: 0.72, length: 2.3, style: 'box' },
    nozzles: { count: 1, x: 0, z: 8.2, radius: 0.82, style: 'round' },
    canopy: { z: -3.1, length: 2.45, width: 0.84, height: 0.58 },
    number: '02',
    motif: 'stripe',
    panelColor: 0x8a8f93,
    secondaryPanels: 0xd23b32,
  },
  haneul: {
    id: 'haneul',
    length: 21,
    span: 15.0,
    height: 5.3,
    stations: [
      { z: -10.5, w: 0.06, top: 0.08, bottom: -0.08 },
      { z: -9.9, w: 0.34, top: 0.24, bottom: -0.22 },
      { z: -9.1, w: 0.68, top: 0.44, bottom: -0.38 },
      { z: -8.0, w: 1.04, top: 0.62, bottom: -0.52 },
      { z: -6.5, w: 1.38, top: 0.8, bottom: -0.64 },
      { z: -4.8, w: 1.66, top: 0.94, bottom: -0.74 },
      { z: -3.0, w: 1.86, top: 1.02, bottom: -0.8 },
      { z: -1.0, w: 1.94, top: 1.04, bottom: -0.84 },
      { z: 1.0, w: 1.9, top: 0.96, bottom: -0.8 },
      { z: 3.2, w: 1.76, top: 0.82, bottom: -0.7 },
      { z: 5.2, w: 1.56, top: 0.64, bottom: -0.58 },
      { z: 7.2, w: 1.3, top: 0.48, bottom: -0.46 },
      { z: 9.2, w: 0.92, top: 0.3, bottom: -0.3 },
      { z: 10.5, w: 0.5, top: 0.16, bottom: -0.18 },
    ],
    wing: { rootX: 1.75, midX: 4.9, tipX: 7.5, rootLE: -1.8, midLE: 0.85, tipLE: 2.7, rootTE: 5.2, midTE: 5.68, tipTE: 5.9, thickness: 0.36, dihedral: 0.03, y: -0.07 },
    lerx: { rootX: 0.7, tipX: 1.75, rootLE: -7.8, rootTE: -4.6, tipLE: -1.8, tipTE: 0.8, thickness: 0.13, dihedral: 0.02, y: 0.04 },
    tail: { twin: true, offset: 1.55, cant: 0.42, rootLE: 6.2, rootTE: 9.4, tipLE: 7.9, tipTE: 9.55, height: 2.65, thickness: 0.28 },
    intakes: { count: 2, z: -4.0, x: 1.32, w: 0.7, h: 0.76, length: 3.0, style: 'caret' },
    nozzles: { count: 2, x: 0.92, z: 10.0, radius: 0.6, style: 'round' },
    canopy: { z: -2.5, length: 2.7, width: 0.88, height: 0.58 },
    number: '21',
    motif: 'ew',
    panelColor: 0x6d7b8f,
    secondaryPanels: 0x2fb6d9,
  },
  astra: {
    id: 'astra',
    length: 16.5,
    span: 11.4,
    height: 3.5,
    stations: [
      { z: -8.25, w: 0.05, top: 0.07, bottom: -0.07 },
      { z: -7.8, w: 0.3, top: 0.24, bottom: -0.2 },
      { z: -7.2, w: 0.6, top: 0.42, bottom: -0.34 },
      { z: -6.3, w: 0.92, top: 0.6, bottom: -0.48 },
      { z: -5.1, w: 1.24, top: 0.76, bottom: -0.58 },
      { z: -3.8, w: 1.5, top: 0.88, bottom: -0.66 },
      { z: -2.1, w: 1.66, top: 0.94, bottom: -0.7 },
      { z: -0.3, w: 1.7, top: 0.96, bottom: -0.72 },
      { z: 1.7, w: 1.62, top: 0.86, bottom: -0.66 },
      { z: 3.6, w: 1.46, top: 0.7, bottom: -0.56 },
      { z: 5.4, w: 1.2, top: 0.54, bottom: -0.46 },
      { z: 7.0, w: 0.88, top: 0.36, bottom: -0.34 },
      { z: 8.25, w: 0.48, top: 0.18, bottom: -0.18 },
    ],
    wing: { rootX: 1.55, midX: 3.7, tipX: 5.7, rootLE: -1.4, midLE: 0.45, tipLE: 1.9, rootTE: 4.0, midTE: 4.38, tipTE: 4.55, thickness: 0.28, dihedral: 0.02, y: -0.06 },
    lerx: { rootX: 0.62, tipX: 1.55, rootLE: -6.4, rootTE: -3.4, tipLE: -1.4, tipTE: 0.4, thickness: 0.11, dihedral: 0.02, y: 0.03 },
    tail: { twin: true, offset: 1.12, cant: 0.38, rootLE: 4.8, rootTE: 7.7, tipLE: 6.5, tipTE: 7.85, height: 2.25, thickness: 0.24 },
    intakes: { count: 2, z: -2.9, x: 1.0, w: 0.52, h: 0.62, length: 2.45, style: 'dsi' },
    nozzles: { count: 1, x: 0, z: 7.9, radius: 0.8, style: 'round' },
    canopy: { z: -2.6, length: 2.35, width: 0.84, height: 0.56 },
    number: '35',
    motif: 'star',
    panelColor: 0x59616b,
    secondaryPanels: 0x2d5ca8,
  },
  snega: {
    id: 'snega',
    length: 22,
    span: 16.0,
    height: 4.6,
    stations: [
      { z: -11, w: 0.06, top: 0.08, bottom: -0.08 },
      { z: -10.3, w: 0.36, top: 0.25, bottom: -0.22 },
      { z: -9.4, w: 0.72, top: 0.45, bottom: -0.38 },
      { z: -8.2, w: 1.14, top: 0.66, bottom: -0.54 },
      { z: -6.6, w: 1.56, top: 0.86, bottom: -0.68 },
      { z: -4.8, w: 1.9, top: 1.0, bottom: -0.78 },
      { z: -2.8, w: 2.08, top: 1.06, bottom: -0.84 },
      { z: -0.8, w: 2.12, top: 1.04, bottom: -0.86 },
      { z: 1.4, w: 2.04, top: 0.94, bottom: -0.8 },
      { z: 3.6, w: 1.88, top: 0.8, bottom: -0.7 },
      { z: 5.8, w: 1.66, top: 0.64, bottom: -0.58 },
      { z: 8.0, w: 1.36, top: 0.48, bottom: -0.46 },
      { z: 9.9, w: 0.96, top: 0.3, bottom: -0.3 },
      { z: 11, w: 0.52, top: 0.16, bottom: -0.18 },
    ],
    wing: { rootX: 1.95, midX: 5.2, tipX: 8.0, rootLE: -1.6, midLE: 1.1, tipLE: 2.8, rootTE: 5.5, midTE: 6.0, tipTE: 6.25, thickness: 0.4, dihedral: 0.018, y: -0.08 },
    lerx: { rootX: 0.8, tipX: 1.95, rootLE: -8.2, rootTE: -4.8, tipLE: -1.6, tipTE: 0.9, thickness: 0.15, dihedral: 0.02, y: 0.04 },
    tail: { twin: true, offset: 1.75, cant: 0.42, rootLE: 6.4, rootTE: 10.0, tipLE: 8.4, tipTE: 10.2, height: 2.8, thickness: 0.3 },
    intakes: { count: 2, z: -4.4, x: 1.55, w: 0.78, h: 0.82, length: 3.1, style: 'caret' },
    nozzles: { count: 2, x: 1.0, z: 10.7, radius: 0.68, style: 'tvc' },
    canopy: { z: -2.3, length: 2.85, width: 0.9, height: 0.62 },
    number: '57',
    motif: 'frost',
    panelColor: 0x7c8794,
    secondaryPanels: 0x2d3f5c,
  },
};
