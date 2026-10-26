import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import modelManifestRaw from '../data/jet-models.json';
import { assetUrl } from '../core/assets';
import { JET_BLUEPRINTS } from '../data/jet-blueprints';
import type { GirlId, GirlSpec } from '../data/types';
import type { JetVisual } from './jets';

export type JetLod = 'showcase' | 'game';

interface ManifestLod {
  path: string;
  triangles: number;
  meshes: number;
  bytes: number;
  draco: boolean;
  materials: string[];
}

interface ManifestEffect {
  x: number;
  y: number;
  z: number;
  radius: number;
  length?: number;
  color?: string;
}

interface ManifestGirl {
  id: GirlId;
  name: string;
  number: string;
  length: number;
  span: number;
  height: number;
  showcase: ManifestLod;
  game: ManifestLod;
  effects: {
    flames: ManifestEffect[];
    glows: ManifestEffect[];
    navs: ManifestEffect[];
    gearNode: string | null;
  };
}

interface JetModelManifest {
  version: number;
  blender: string;
  girls: Partial<Record<GirlId, ManifestGirl>>;
}

const MANIFEST = modelManifestRaw as unknown as JetModelManifest;
const MODEL_IDS: GirlId[] = ['qingluan', 'akari', 'haneul', 'astra', 'snega'];

export interface JetModelStatus {
  id: GirlId;
  lod: JetLod;
  ready: boolean;
  source: 'glb';
  triangles: number;
  meshes: number;
  bytes: number;
}

const sourceCache = new Map<string, Promise<THREE.Group | null>>();
const loaded = new Map<string, THREE.Group>();
const errorLog: Array<{ key: string; message: string }> = [];
let loader: GLTFLoader | null = null;
let forceMode: 'auto' | 'procedural' | 'glb' | null = null;

function mode(): 'auto' | 'procedural' | 'glb' {
  if (forceMode) return forceMode;
  if (typeof window === 'undefined') return 'auto';
  const value = new URLSearchParams(window.location.search).get('jets');
  forceMode = value === 'procedural' || value === 'glb' ? value : 'auto';
  return forceMode;
}

export function useProceduralJets(): boolean {
  return mode() === 'procedural';
}

function getLoader(): GLTFLoader {
  if (loader) return loader;
  const l = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(assetUrl('assets/draco/'));
  draco.setDecoderConfig({ type: 'wasm' });
  l.setDRACOLoader(draco);
  loader = l;
  return l;
}

function key(id: GirlId, lod: JetLod): string {
  return `${id}:${lod}`;
}

function meta(id: GirlId, lod: JetLod): ManifestGirl | null {
  const g = MANIFEST.girls[id];
  return g ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} 超时`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

async function loadModel(id: GirlId, lod: JetLod): Promise<THREE.Group | null> {
  const g = meta(id, lod);
  if (!g) return null;
  const cacheKey = key(id, lod);
  const existing = loaded.get(cacheKey);
  if (existing) return existing;
  const inflight = sourceCache.get(cacheKey);
  if (inflight) return inflight;
  const url = assetUrl(g[lod].path);
  const promise = withTimeout(getLoader().loadAsync(url), 20000, `战机模型 ${cacheKey}`)
    .then((gltf) => {
      const root = gltf.scene;
      root.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      loaded.set(cacheKey, root);
      sourceCache.delete(cacheKey);
      return root;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      errorLog.push({ key: cacheKey, message });
      console.warn(`[jet-assets] 加载失败 ${cacheKey}: ${message}`);
      sourceCache.delete(cacheKey);
      return null;
    });
  sourceCache.set(cacheKey, promise);
  return promise;
}

/** 启动时预载五台任务低模；单台失败不阻塞启动。 */
export async function preloadGameJetModels(
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  if (mode() === 'procedural') {
    onProgress?.(1, 1);
    return;
  }
  const jobs = MODEL_IDS.map((id) => loadModel(id, 'game'));
  let done = 0;
  onProgress?.(0, jobs.length);
  await Promise.all(
    jobs.map((job) =>
      job.finally(() => {
        done++;
        onProgress?.(done, jobs.length);
      }),
    ),
  );
}

/** 机库高模按需加载。 */
export async function loadShowcaseJetModel(id: GirlId): Promise<boolean> {
  if (mode() === 'procedural') return false;
  const model = await loadModel(id, 'showcase');
  return Boolean(model);
}

export function isJetModelReady(id: GirlId, lod: JetLod): boolean {
  return loaded.has(key(id, lod));
}

export function getJetStatus(): JetModelStatus[] {
  const status: JetModelStatus[] = [];
  for (const id of MODEL_IDS) {
    for (const lod of ['showcase', 'game'] as JetLod[]) {
      const g = meta(id, lod);
      if (!g) continue;
      status.push({
        id,
        lod,
        ready: loaded.has(key(id, lod)),
        source: 'glb',
        triangles: g[lod].triangles,
        meshes: g[lod].meshes,
        bytes: g[lod].bytes,
      });
    }
  }
  return status;
}

export function getJetModelErrors(): Array<{ key: string; message: string }> {
  return [...errorLog];
}

const FLAME_OPACITY = 0.4;

interface BuiltModelJet {
  visual: JetVisual;
}

/** 从缓存的 GLB 克隆出一份可独立 dispose 的 JetVisual。 */
export function buildModelJetVisual(
  girl: GirlSpec,
  lod: JetLod,
): JetVisual | null {
  if (mode() === 'procedural') return null;
  const g = meta(girl.id, lod);
  if (!g) return null;
  const cached = loaded.get(key(girl.id, lod));
  if (!cached) return null;
  const blueprint = JET_BLUEPRINTS[girl.id];
  const alignScale = blueprint.length / Math.max(0.001, g.length);

  const group = new THREE.Group();
  group.name = `Jet_${girl.id}`;
  const inner = new THREE.Group();
  group.add(inner);
  const align = new THREE.Group();
  align.name = 'JetAlign';
  align.scale.setScalar(alignScale);
  inner.add(align);

  const root = cached.clone(true);
  // Refresh geometry/material ownership so this instance can be disposed freely.
  const paintMaterials: THREE.MeshStandardMaterial[] = [];
  const baseColors = new Map<THREE.Material, THREE.Color>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
    // Thin raised panel lines should not cast shadows; otherwise they read as
    // dashed black wires on the fuselage in the hangar lighting.
    const isPanelLine = sourceMaterials.some((m) => m.name === 'Panel_Line');
    node.castShadow = !isPanelLine;
    node.receiveShadow = !isPanelLine;
    node.geometry = node.geometry.clone();
    const materials = sourceMaterials;
    const cloned = materials.map((material) => {
      const copy = material.clone();
      const std = copy as THREE.MeshStandardMaterial;
      if (std.name === 'Paint_Base' || std.name === 'Paint_Secondary') {
        paintMaterials.push(std);
        baseColors.set(std, std.color.clone());
      }
      if (copy.transparent) {
        copy.depthWrite = false;
      }
      return copy;
    });
    node.material = Array.isArray(node.material) ? cloned : cloned[0];
  });

  // GLTF export convention: nose along -Z. Guard against a mirrored export.
  root.updateMatrixWorld(true);
  const noseNode = root.getObjectByName('REF_NOSE');
  if (noseNode) {
    const nose = noseNode.getWorldPosition(new THREE.Vector3());
    if (nose.z > 0) {
      align.rotation.y = Math.PI;
      console.warn(`[jet-assets] ${girl.id}: 机头朝 +Z，已自动翻转`);
    }
  }
  align.add(root);

  const flames: THREE.Mesh[] = [];
  const glowDiscs: THREE.Mesh[] = [];
  const navLights: THREE.Mesh[] = [];
  const fx = new THREE.Group();
  fx.name = 'JetFX';
  align.add(fx);

  const glowColor = new THREE.Color(girl.palette.glow);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    toneMapped: false,
    transparent: true,
    opacity: FLAME_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    toneMapped: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (const anchor of g.effects.flames) {
    const length = anchor.length ?? anchor.radius * 4.6;
    const radius = anchor.radius * 0.55;
    const geo = new THREE.ConeGeometry(radius, length, 14, 1, true);
    geo.rotateX(Math.PI / 2);
    const flame = new THREE.Mesh(geo, flameMaterial);
    flame.name = 'FX_Flame';
    flame.position.set(anchor.x, anchor.y, anchor.z + length * 0.5);
    flame.renderOrder = 2;
    fx.add(flame);
    flames.push(flame);
  }
  for (const anchor of g.effects.glows) {
    const geo = new THREE.CircleGeometry(anchor.radius * 0.72, 24);
    const disc = new THREE.Mesh(geo, glowMaterial);
    disc.name = 'FX_Glow';
    disc.position.set(anchor.x, anchor.y, anchor.z + 0.02);
    fx.add(disc);
    glowDiscs.push(disc);
  }
  for (const anchor of g.effects.navs) {
    const color = anchor.color === 'red' ? 0xff5046 : anchor.color === 'green' ? 0x62ff9b : 0xffd479;
    const geo = new THREE.SphereGeometry(Math.max(0.045, anchor.radius ?? 0.06), 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const light = new THREE.Mesh(geo, mat);
    light.name = 'FX_Nav';
    light.position.set(anchor.x, anchor.y, anchor.z);
    fx.add(light);
    navLights.push(light);
  }

  const gear = g.effects.gearNode ? root.getObjectByName(g.effects.gearNode) : null;
  if (gear) gear.visible = false;

  const setThrottle = (value: number) => {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    for (const flame of flames) {
      flame.scale.set(0.82 + v * 0.45, 0.72 + v * 0.9, 0.82 + v * 0.45);
      (flame.material as THREE.MeshBasicMaterial).opacity = 0.18 + v * 0.55;
    }
    for (const disc of glowDiscs) {
      (disc.material as THREE.MeshBasicMaterial).opacity = 0.6 + v * 0.4;
    }
  };
  setThrottle(0.55);

  const setDamage = (value: number) => {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    for (const material of paintMaterials) {
      const base = baseColors.get(material);
      if (!base) continue;
      material.color.copy(base).lerp(new THREE.Color(0x2a1f1c), v * 0.55);
      material.emissive.setHex(0x1a0503);
      material.emissiveIntensity = v * 0.4;
    }
    void FLAME_OPACITY;
  };

  const visual: JetVisual = {
    group,
    inner,
    flames,
    glowDiscs,
    navLights,
    setThrottle,
    setGear: (visible: boolean) => {
      if (gear) gear.visible = visible;
    },
    setDamage,
    dispose: () => {
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const material = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      });
      flameMaterial.dispose();
      glowMaterial.dispose();
    },
  };
  return visual;
}

/** 测试/调试用：清空缓存。 */
export function clearJetModelCache(): void {
  sourceCache.clear();
  loaded.clear();
  errorLog.length = 0;
}

export type { BuiltModelJet };
