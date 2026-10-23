import * as THREE from 'three';

/** 生成一张简单的等距天空环境贴图，让金属材质有可读的反光。 */
export function createEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#7fa7c6');
  sky.addColorStop(0.42, '#d9e4e8');
  sky.addColorStop(0.5, '#f6d2a2');
  sky.addColorStop(0.58, '#6b5a4a');
  sky.addColorStop(1, '#171614');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  const sun = ctx.createRadialGradient(760, 236, 0, 760, 236, 90);
  sun.addColorStop(0, 'rgba(255,255,240,1)');
  sun.addColorStop(0.18, 'rgba(255,225,170,0.9)');
  sun.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(600, 80, 320, 320);

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 18; i++) {
    const y = 30 + Math.random() * 180;
    const x = Math.random() * 1024;
    const w = 60 + Math.random() * 220;
    const h = 10 + Math.random() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w, y - h, w * 2, h * 2);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export interface JetVisual {
  /** 外层：只负责航向（yaw）。 */
  readonly group: THREE.Group;
  /** 内层：负责横滚 / 俯仰，避免欧拉顺序互相干扰。 */
  readonly inner: THREE.Group;
  readonly flames: THREE.Mesh[];
  readonly glowDiscs: THREE.Mesh[];
  readonly navLights: THREE.Mesh[];
  setThrottle(value: number): void;
  setGear(value: boolean): void;
  setDamage(value: number): void;
  dispose(): void;
}

interface Materials {
  base: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  flame: THREE.MeshBasicMaterial;
  metal: THREE.MeshStandardMaterial;
}

export interface JetPalette {
  base: number;
  secondary: number;
  accent: number;
  glow: number;
  dark: number;
}

function makeMaterials(p: JetPalette): Materials {
  const base = new THREE.MeshStandardMaterial({
    color: p.base,
    metalness: 0.52,
    roughness: 0.38,
    side: THREE.DoubleSide,
  });
  const secondary = new THREE.MeshStandardMaterial({
    color: p.secondary,
    metalness: 0.5,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: p.accent,
    metalness: 0.58,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x14181e,
    metalness: 0.78,
    roughness: 0.34,
    side: THREE.DoubleSide,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: 0x8d949c,
    metalness: 0.92,
    roughness: 0.24,
    side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0a121a,
    metalness: 0.94,
    roughness: 0.08,
    envMapIntensity: 1.6,
  });
  const glow = new THREE.MeshBasicMaterial({
    color: p.glow,
    toneMapped: false,
    transparent: true,
    opacity: 0.9,
  });
  const flame = new THREE.MeshBasicMaterial({
    color: p.glow,
    toneMapped: false,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { base, secondary, accent, dark, glass, glow, flame, metal };
}

/** 复制一份材质，避免角色之间共享导致 dispose 互相影响。 */
function cloneMaterials(m: Materials): Materials {
  return {
    base: m.base.clone(),
    secondary: m.secondary.clone(),
    accent: m.accent.clone(),
    dark: m.dark.clone(),
    glass: m.glass.clone(),
    metal: m.metal.clone(),
    glow: m.glow.clone(),
    flame: m.flame.clone(),
  };
}

const matCache = new Map<string, Materials>();

function getMaterials(p: JetPalette): Materials {
  const key = [p.base, p.secondary, p.accent, p.glow, p.dark].join('-');
  let mats = matCache.get(key);
  if (!mats) {
    mats = makeMaterials(p);
    matCache.set(key, mats);
  }
  return cloneMaterials(mats);
}

function wingHalf(
  sign: number,
  rootX: number,
  tipX: number,
  rootLE: number,
  rootTE: number,
  tipLE: number,
  tipTE: number,
  thickness: number,
  material: THREE.Material,
  y: number,
  dihedral: number,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(sign * rootX, rootLE);
  shape.lineTo(sign * tipX, tipLE);
  shape.lineTo(sign * tipX, tipTE);
  shape.lineTo(sign * rootX, rootTE);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thickness / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.rotation.z = sign * dihedral;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function plateYZ(points: Array<[number, number]>, thickness: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => {
    if (i === 0) shape.moveTo(-z, y);
    else shape.lineTo(-z, y);
  });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  geo.rotateY(Math.PI / 2);
  geo.translate(-thickness / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function loftFuselage(length: number, halfWidth: number, material: THREE.Material): THREE.Mesh {
  const sections = [
    { t: -0.5, w: 0.035, h: 0.03 },
    { t: -0.47, w: 0.16, h: 0.09 },
    { t: -0.41, w: 0.34, h: 0.16 },
    { t: -0.32, w: 0.55, h: 0.24 },
    { t: -0.2, w: 0.76, h: 0.32 },
    { t: -0.06, w: 0.94, h: 0.39 },
    { t: 0.08, w: 1.0, h: 0.42 },
    { t: 0.22, w: 0.96, h: 0.4 },
    { t: 0.34, w: 0.82, h: 0.34 },
    { t: 0.44, w: 0.6, h: 0.26 },
    { t: 0.5, w: 0.38, h: 0.18 },
  ];
  const radial = 12;
  const verts: number[] = [];
  const indices: number[] = [];
  const heightScale = halfWidth * 1.9;
  sections.forEach((s) => {
    for (let i = 0; i < radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const x = Math.cos(a) * s.w * halfWidth;
      const y = Math.sin(a) * s.h * heightScale + halfWidth * 0.16;
      verts.push(x, y, s.t * length);
    }
  });
  for (let s = 0; s < sections.length - 1; s++) {
    for (let i = 0; i < radial; i++) {
      const a = s * radial + i;
      const b = s * radial + ((i + 1) % radial);
      const c = (s + 1) * radial + i;
      const d = (s + 1) * radial + ((i + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function canopy(width: number, length: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(width * 0.55, width * 0.28, length * 0.13);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function accentStrip(from: THREE.Vector3, to: THREE.Vector3, width: number, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.BoxGeometry(len, width, width * 0.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.rotation.y = -Math.atan2(dir.z, dir.x);
  return mesh;
}

function makeJetMesh(
  length: number,
  span: number,
  width: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  canards: boolean,
  twinTail: boolean,
  tailCant: number,
  tailHeight: number,
  engines: 1 | 2,
  engineSpacing: number,
  dihedral: number,
  mats: Materials,
): {
  root: THREE.Group;
  flames: THREE.Mesh[];
  glowDiscs: THREE.Mesh[];
  navLights: THREE.Mesh[];
  gear: THREE.Group;
} {
  const root = new THREE.Group();
  const halfW = width * 0.5;
  const fuse = loftFuselage(length, halfW, mats.base);
  root.add(fuse);

  // 机背脊线 / 涂装条
  const spine = new THREE.Mesh(new THREE.BoxGeometry(width * 0.06, 0.05, length * 0.62), mats.accent);
  spine.position.set(0, halfW * 0.94, -length * 0.02);
  root.add(spine);

  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(width * 0.34, 0.035, length * 0.3), mats.secondary);
  dorsal.position.set(0, halfW * 0.88, length * 0.02);
  root.add(dorsal);

  // 座舱
  const glass = canopy(width, length, mats.glass);
  glass.position.set(0, halfW * 0.78, -length * 0.18);
  root.add(glass);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(width * 0.3, 0.035, 4, 20), mats.metal);
  canopyFrame.rotation.x = Math.PI / 2;
  canopyFrame.position.set(0, halfW * 0.75, -length * 0.205);
  root.add(canopyFrame);

  // 进气口
  for (const s of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(width * 0.18, width * 0.16, length * 0.16), mats.dark);
    intake.position.set(s * halfW * 0.82, -halfW * 0.04, -length * 0.02);
    root.add(intake);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.04, width * 0.17, length * 0.16), mats.accent);
    lip.position.set(s * halfW * 0.92, -halfW * 0.04, -length * 0.02);
    root.add(lip);
  }

  // 主翼
  const wingY = -halfW * 0.05;
  const rootLE = -length * 0.1;
  const tipLE = rootLE + sweep * (span / 2) * 0.82 + length * 0.02;
  const rootTE = rootLE + rootChord * (length / 20);
  const tipTE = tipLE + tipChord * (length / 20);
  for (const s of [-1, 1]) {
    const wing = wingHalf(
      s,
      halfW * 0.92,
      span / 2,
      rootLE,
      rootTE,
      tipLE,
      tipTE,
      Math.max(0.16, width * 0.09),
      mats.base,
      wingY,
      dihedral,
    );
    root.add(wing);

    // 翼面分色：青瓷绿 / 朱红 / 冷蓝，让俯视轮廓有层次
    const panel = wingHalf(
      s,
      halfW * 1.02,
      span * 0.47,
      rootLE + length * 0.055,
      rootTE - length * 0.03,
      tipLE + length * 0.02,
      tipTE - length * 0.012,
      0.04,
      mats.secondary,
      wingY + width * 0.045,
      dihedral,
    );
    root.add(panel);

    // 前缘高亮线
    const line = accentStrip(
      new THREE.Vector3(s * halfW * 0.92, wingY + width * 0.11, rootLE),
      new THREE.Vector3(s * (span / 2 - 0.05), wingY + width * 0.11, tipLE),
      Math.max(0.05, width * 0.03),
      mats.accent,
    );
    root.add(line);

    // 翼尖挂舱
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(width * 0.07, span * 0.12, 4, 8), mats.secondary);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(s * (span / 2 - 0.2), wingY, tipLE + tipChord * 0.4);
    root.add(pod);

    // 导航灯
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(width * 0.04, 8, 6),
      s < 0 ? new THREE.MeshBasicMaterial({ color: 0xff5046, toneMapped: false }) : new THREE.MeshBasicMaterial({ color: 0x62ff9b, toneMapped: false }),
    );
    nav.position.set(s * (span / 2 - 0.05), wingY + 0.02, tipLE + tipChord * 0.45);
    root.add(nav);
  }

  // 鸭翼
  if (canards) {
    const canardRootLE = -length * 0.3;
    const canardRootTE = canardRootLE + rootChord * 0.24;
    const canardTipLE = canardRootLE + length * 0.055;
    const canardTipTE = canardTipLE + tipChord * 0.32;
    for (const s of [-1, 1]) {
      const c = wingHalf(s, halfW * 0.7, span * 0.28, canardRootLE, canardRootTE, canardTipLE, canardTipTE, 0.12, mats.secondary, halfW * 0.32, 0);
      root.add(c);
      const cl = accentStrip(
        new THREE.Vector3(s * halfW * 0.7, halfW * 0.38, canardRootLE),
        new THREE.Vector3(s * span * 0.28, halfW * 0.38, canardTipLE),
        0.06,
        mats.accent,
      );
      root.add(cl);
    }
  }

  // 垂尾
  const tailRootLE = length * 0.24;
  const tailRootTE = tailRootLE + length * 0.2;
  const tailTipLE = tailRootLE + length * 0.11;
  const tailTipTE = tailTipLE + length * 0.075;
  const tailH = tailHeight * 1.12;
  const makeTail = (offset: number, cant: number): THREE.Mesh => {
    const fin = plateYZ(
      [
        [tailRootLE, 0],
        [tailRootTE, 0],
        [tailTipTE, tailH],
        [tailTipLE, tailH],
      ],
      width * 0.09,
      mats.secondary,
    );
    fin.position.set(offset, halfW * 0.22, 0);
    fin.rotation.z = cant;
    return fin;
  };
  if (twinTail) {
    root.add(makeTail(-halfW * 0.8, tailCant));
    root.add(makeTail(halfW * 0.8, -tailCant));
  } else {
    root.add(makeTail(0, 0));
    const tip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.035, 0.5, length * 0.06), mats.accent);
    tip.position.set(0, halfW * 0.22 + tailH * 0.88, 0);
    root.add(tip);
  }

  // 发动机与尾焰
  const flames: THREE.Mesh[] = [];
  const glowDiscs: THREE.Mesh[] = [];
  const engineZ = length * 0.38;
  const nozzleZ = length * 0.5;
  const count = engines;
  for (let i = 0; i < count; i++) {
    const ex = count === 2 ? (i === 0 ? -engineSpacing / 2 : engineSpacing / 2) : 0;
    const r = count === 2 ? width * 0.2 : width * 0.3;
    const nacelle = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.05, r * 0.86, length * 0.14, 14, 1, true),
      mats.dark,
    );
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(ex, halfW * 0.06, engineZ + length * 0.035);
    nacelle.castShadow = true;
    root.add(nacelle);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, width * 0.02, 6, 18), mats.metal);
    ring.position.set(ex, halfW * 0.06, nozzleZ);
    root.add(ring);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 18), mats.glow);
    disc.position.set(ex, halfW * 0.06, nozzleZ + 0.01);
    disc.material = mats.glow;
    root.add(disc);
    glowDiscs.push(disc);

    const flameGeo = new THREE.ConeGeometry(r * 0.55, 2.4, 12, 1, true);
    flameGeo.rotateX(Math.PI / 2);
    const flame = new THREE.Mesh(flameGeo, mats.flame);
    flame.position.set(ex, halfW * 0.06, nozzleZ + 1.2);
    root.add(flame);
    flames.push(flame);
  }

  // 机腹导弹
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.6), mats.dark);
      const mx = s * span * (0.22 + i * 0.12);
      const mz = length * 0.06 + i * 0.55;
      pylon.position.set(mx, -halfW * 0.24, mz);
      root.add(pylon);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.15, 8), mats.secondary);
      body.rotation.x = Math.PI / 2;
      body.position.set(mx, -halfW * 0.33, mz);
      root.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 8), mats.accent);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(mx, -halfW * 0.33, mz - 0.7);
      root.add(tip);
    }
  }

  // 起落架（机库展示时可见）
  const gear = new THREE.Group();
  const strutMat = mats.metal;
  const wheelMat = mats.dark;
  const addGear = (x: number, z: number) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), strutMat);
    strut.position.set(x, -halfW * 0.55, z);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -halfW * 0.55 - 0.6, z);
    gear.add(wheel);
  };
  addGear(0, -length * 0.28);
  addGear(-span * 0.16, length * 0.02);
  addGear(span * 0.16, length * 0.02);
  gear.visible = false;
  root.add(gear);

  // 机头空速管
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), mats.metal);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, 0, -length * 0.5 - 0.5);
  root.add(pitot);

  return { root, flames, glowDiscs, navLights: [], gear };
}

export function buildJet(
  length: number,
  span: number,
  width: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  canards: boolean,
  twinTail: boolean,
  tailCant: number,
  tailHeight: number,
  engines: 1 | 2,
  engineSpacing: number,
  dihedral: number,
  palette: JetPalette,
): JetVisual {
  const mats = getMaterials(palette);
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const built = makeJetMesh(
    length,
    span,
    width,
    rootChord,
    tipChord,
    sweep,
    canards,
    twinTail,
    tailCant,
    tailHeight,
    engines,
    engineSpacing,
    dihedral,
    mats,
  );
  inner.add(built.root);

  const setThrottle = (value: number) => {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    for (const f of built.flames) {
      f.scale.set(0.8 + v * 0.45, 0.7 + v * 0.9, 0.8 + v * 0.45);
      (f.material as THREE.MeshBasicMaterial).opacity = 0.18 + v * 0.55;
    }
    for (const d of built.glowDiscs) {
      (d.material as THREE.MeshBasicMaterial).opacity = 0.6 + v * 0.4;
    }
  };
  setThrottle(0.55);

  return {
    group,
    inner,
    flames: built.flames,
    glowDiscs: built.glowDiscs,
    navLights: built.navLights,
    setThrottle,
    setGear: (visible: boolean) => {
      built.gear.visible = visible;
    },
    setDamage: (value: number) => {
      const v = THREE.MathUtils.clamp(value, 0, 1);
      mats.base.color.lerp(new THREE.Color(0x2a1f1c), v * 0.55);
      mats.base.emissive.setHex(0x1a0503);
      mats.base.emissiveIntensity = v * 0.4;
    },
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
        }
      });
      Object.values(mats).forEach((m) => m.dispose());
    },
  };
}

export function buildGirlJet(girl: {
  length: number;
  span: number;
  fuselageWidth: number;
  wingRootChord: number;
  wingTipChord: number;
  wingSweep: number;
  canards: boolean;
  twinTail: boolean;
  tailCant: number;
  tailHeight: number;
  engines: 1 | 2;
  engineSpacing: number;
  dihedral: number;
}, palette: JetPalette): JetVisual {
  return buildJet(
    girl.length,
    girl.span,
    girl.fuselageWidth,
    girl.wingRootChord,
    girl.wingTipChord,
    girl.wingSweep,
    girl.canards,
    girl.twinTail,
    girl.tailCant,
    girl.tailHeight,
    girl.engines,
    girl.engineSpacing,
    girl.dihedral,
    palette,
  );
}

/** 敌机 / 无人机 / 炮艇的低模。 */
export function buildEnemyJet(kind: 'jet' | 'drone' | 'gunship', accent = 0xff4a3d): THREE.Group {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x242a31, metalness: 0.6, roughness: 0.45 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3d454f, metalness: 0.55, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });

  if (kind === 'drone') {
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), mid);
    body.scale.set(1, 0.5, 1.6);
    group.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.12, 1.6), dark);
    group.add(wing);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), glow);
    eye.position.set(0, 0, -1.4);
    group.add(eye);
    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 1.1, 8), dark);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(s * 2.2, 0, 0.3);
      group.add(pod);
    }
  } else if (kind === 'gunship') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 7.5), mid);
    group.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.8, 6), dark);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -5;
    group.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(13, 0.18, 3.2), dark);
    wing.position.z = 0.4;
    group.add(wing);
    for (const s of [-1, 1]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 2.2, 10), dark);
      eng.rotation.x = Math.PI / 2;
      eng.position.set(s * 2.2, 0.2, 2.8);
      group.add(eng);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), glow);
      disc.position.set(s * 2.2, 0.2, 3.92);
      group.add(disc);
    }
  } else {
    // 普通敌机：简化三角翼
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.7, 7.5, 8), mid);
    body.rotation.x = -Math.PI / 2;
    group.add(body);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(-0.4, -2.4);
    wingShape.lineTo(-4.6, 2.2);
    wingShape.lineTo(-1.2, 2.8);
    wingShape.lineTo(0, 1.4);
    wingShape.lineTo(1.2, 2.8);
    wingShape.lineTo(4.6, 2.2);
    wingShape.lineTo(0.4, -2.4);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.16, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, dark);
    group.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 1.5), dark);
    tail.position.set(0, 0.9, 2.6);
    group.add(tail);
    const canard = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 1.1), dark);
    canard.position.z = -2.2;
    group.add(canard);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), glow);
    eye.position.set(0, 0.45, -1.2);
    group.add(eye);
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}
