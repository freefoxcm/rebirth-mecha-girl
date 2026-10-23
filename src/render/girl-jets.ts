import * as THREE from 'three';
import type { GirlSpec, Palette } from '../data/types';
import { JET_BLUEPRINTS, type JetBlueprint, type JetWingPlan } from '../data/jet-blueprints';
import type { JetVisual } from './jets';

export type { JetVisual } from './jets';

interface Mats {
  base: THREE.MeshPhysicalMaterial;
  secondary: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  glow: THREE.MeshBasicMaterial;
  flame: THREE.MeshBasicMaterial;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

function matsFor(p: Palette, high: boolean): Mats {
  const base = new THREE.MeshPhysicalMaterial({
    color: p.base,
    metalness: 0.42,
    roughness: 0.34,
    clearcoat: high ? 0.55 : 0.2,
    clearcoatRoughness: 0.24,
    side: THREE.DoubleSide,
  });
  const secondary = new THREE.MeshStandardMaterial({ color: p.secondary, metalness: 0.44, roughness: 0.42, side: THREE.DoubleSide });
  const accent = new THREE.MeshStandardMaterial({ color: p.accent, metalness: 0.56, roughness: 0.3, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11161c, metalness: 0.76, roughness: 0.32, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.92, roughness: 0.24, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x07131d,
    metalness: 0.6,
    roughness: 0.06,
    clearcoat: 1,
    envMapIntensity: 2.1,
    transparent: true,
    opacity: 0.94,
  });
  const glow = new THREE.MeshBasicMaterial({ color: p.glow, toneMapped: false, transparent: true, opacity: 0.9 });
  const flame = new THREE.MeshBasicMaterial({
    color: p.glow,
    toneMapped: false,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { base, secondary, accent, dark, metal, glass, glow, flame };
}

function ringShape() {
  return [
    [0, 1],
    [0.34, 0.82],
    [0.62, 0.52],
    [0.86, 0.2],
    [1, 0],
    [0.86, -0.2],
    [0.62, -0.5],
    [0.34, -0.8],
    [0, -1],
    [-0.34, -0.8],
    [-0.62, -0.5],
    [-0.86, -0.2],
    [-1, 0],
    [-0.86, 0.2],
    [-0.62, 0.52],
    [-0.34, 0.82],
  ];
}

function fuselage(blueprint: JetBlueprint, material: THREE.Material, high: boolean): THREE.Mesh {
  const ring = ringShape();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  blueprint.stations.forEach((s, si) => {
    for (let i = 0; i < ring.length; i++) {
      const [sx, sy] = ring[i];
      positions.push(sx * s.w, sy * (sy >= 0 ? s.top : s.bottom), s.z);
      uvs.push(i / ring.length, si / (blueprint.stations.length - 1));
    }
  });
  for (let s = 0; s < blueprint.stations.length - 1; s++) {
    for (let i = 0; i < ring.length; i++) {
      const a = s * ring.length + i;
      const b = s * ring.length + ((i + 1) % ring.length);
      const c = (s + 1) * ring.length + i;
      const d = (s + 1) * ring.length + ((i + 1) % ring.length);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wingShape(plan: JetWingPlan, sign: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(sign * plan.rootX, plan.rootLE);
  if (plan.midX !== undefined && plan.midLE !== undefined) {
    s.lineTo(sign * plan.midX, plan.midLE);
  }
  s.lineTo(sign * plan.tipX, plan.tipLE);
  s.lineTo(sign * plan.tipX, plan.tipTE);
  if (plan.midX !== undefined && plan.midTE !== undefined) {
    s.lineTo(sign * plan.midX, plan.midTE);
  }
  s.lineTo(sign * plan.rootX, plan.rootTE);
  s.closePath();
  return s;
}

function wingGeometry(plan: JetWingPlan, sign: number, high: boolean): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(wingShape(plan, sign), {
    depth: plan.thickness,
    bevelEnabled: high,
    bevelSize: high ? 0.055 : 0,
    bevelThickness: high ? 0.035 : 0,
    bevelSegments: 1,
    steps: 1,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, plan.thickness / 2, 0);
  return geo;
}

function addWing(
  root: THREE.Group,
  plan: JetWingPlan,
  sign: number,
  material: THREE.Material,
  accent: THREE.Material,
  panelMat: THREE.Material,
  high: boolean,
): void {
  const mesh = new THREE.Mesh(wingGeometry(plan, sign, high), material);
  mesh.position.y = plan.y;
  mesh.rotation.z = sign * plan.dihedral;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);

  // 后缘分色面板：用独立几何保证俯视有清晰色块，细节面板线仍在贴图里
  const chordRoot = Math.max(0.4, plan.rootTE - plan.rootLE);
  const chordTip = Math.max(0.25, plan.tipTE - plan.tipLE);
  const panelPlan: JetWingPlan = {
    ...plan,
    rootLE: plan.rootTE - chordRoot * 0.24,
    tipLE: plan.tipTE - chordTip * 0.3,
    thickness: 0.035,
    y: plan.y + plan.thickness + 0.012,
  };
  if (plan.midX !== undefined && plan.midLE !== undefined && plan.midTE !== undefined) {
    panelPlan.midLE = plan.midTE - (plan.midTE - plan.midLE) * 0.24;
  }
  const panel = new THREE.Mesh(wingGeometry(panelPlan, sign, false), panelMat);
  panel.position.y = panelPlan.y;
  panel.rotation.z = sign * plan.dihedral;
  root.add(panel);

  void accent;
}

function tailGeometry(plan: JetBlueprint['tail'], high: boolean): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-plan.rootLE, 0);
  shape.lineTo(-plan.rootTE, 0);
  shape.lineTo(-plan.tipTE, plan.height);
  shape.lineTo(-plan.tipLE, plan.height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: plan.thickness,
    bevelEnabled: high,
    bevelSize: high ? 0.035 : 0,
    bevelThickness: high ? 0.025 : 0,
    bevelSegments: 1,
    steps: 1,
  });
  geo.rotateY(Math.PI / 2);
  geo.translate(-plan.thickness / 2, 0, 0);
  return geo;
}

function addTail(root: THREE.Group, plan: JetBlueprint['tail'], sign: number, material: THREE.Material, high: boolean): THREE.Mesh {
  const mesh = new THREE.Mesh(tailGeometry(plan, high), material);
  mesh.position.set(sign * (plan.twin ? plan.offset : 0), 0.22, 0);
  mesh.rotation.z = -sign * plan.cant;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

function addIntake(root: THREE.Group, plan: JetBlueprint['intakes'], sign: number, mats: Mats, high: boolean): void {
  const g = new THREE.Group();
  const inner = new THREE.Mesh(new THREE.BoxGeometry(plan.w, plan.h, plan.length), mats.dark);
  inner.position.z = plan.length * 0.5;
  inner.castShadow = true;
  g.add(inner);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(plan.w + 0.1, plan.h + 0.1, 0.18), mats.accent);
  lip.position.z = -0.03;
  g.add(lip);
  if (plan.style === 'dsi') {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(plan.w * 0.65, 12, 8), mats.secondary);
    bump.scale.set(1, 0.6, 0.6);
    bump.position.set(0, 0, 0.55);
    g.add(bump);
  } else if (plan.style === 'caret') {
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(plan.w * 0.75, plan.h * 0.18, plan.length * 0.5), mats.metal);
    wedge.position.set(0, plan.h * 0.28, plan.length * 0.2);
    wedge.rotation.x = 0.15;
    g.add(wedge);
  }
  if (high) {
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(plan.w * 0.9, 0.04, plan.length * 0.55), mats.metal);
    splitter.position.set(0, -plan.h * 0.55, plan.length * 0.1);
    g.add(splitter);
  }
  g.position.set(sign * plan.x, -0.28, plan.z);
  root.add(g);
}

function addNozzle(
  root: THREE.Group,
  plan: JetBlueprint['nozzles'],
  sign: number,
  mats: Mats,
  high: boolean,
  flames: THREE.Mesh[],
  glowDiscs: THREE.Mesh[],
): void {
  const g = new THREE.Group();
  const r = plan.radius;
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 0.88, 1.5, high ? 16 : 10, 1, true), mats.dark);
  nacelle.rotation.x = Math.PI / 2;
  nacelle.position.z = plan.z - 0.7;
  nacelle.castShadow = true;
  g.add(nacelle);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.1, 6, high ? 22 : 12), mats.metal);
  ring.position.z = plan.z;
  g.add(ring);
  // 喷口花瓣
  const petals = high ? 10 : 7;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, r * 0.12, r * 0.7), mats.metal);
    petal.position.set(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, plan.z + r * 0.05);
    petal.rotation.z = a;
    if (plan.style === 'tvc') petal.rotation.x = 0.18;
    g.add(petal);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, high ? 20 : 12), mats.glow);
  disc.position.z = plan.z + r * 0.08;
  g.add(disc);
  glowDiscs.push(disc);
  const flameGeo = new THREE.ConeGeometry(r * 0.55, 2.8, high ? 14 : 8, 1, true);
  flameGeo.rotateX(Math.PI / 2);
  const flame = new THREE.Mesh(flameGeo, mats.flame);
  flame.position.z = plan.z + r * 0.1 + 1.4;
  g.add(flame);
  flames.push(flame);
  g.position.set(sign * plan.x, 0.04, 0);
  root.add(g);
}

function addCanopy(root: THREE.Group, plan: JetBlueprint['canopy'], mats: Mats, high: boolean): void {
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, high ? 22 : 12, high ? 12 : 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.glass);
  glass.scale.set(plan.width * 0.55, plan.height, plan.length * 0.5);
  glass.position.set(0, 0.72, plan.z);
  glass.rotation.x = -0.06;
  root.add(glass);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(plan.width * 0.56, 0.035, 5, high ? 24 : 12), mats.metal);
  frame.rotation.x = Math.PI / 2;
  frame.position.set(0, 0.72, plan.z + plan.length * 0.1);
  root.add(frame);
  if (high) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(plan.width * 0.32, 0.34, plan.length * 0.3), mats.dark);
    seat.position.set(0, 0.56, plan.z + 0.22);
    root.add(seat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(plan.width * 0.12, 10, 8), mats.dark);
    head.position.set(0, 0.78, plan.z + 0.35);
    root.add(head);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, plan.length * 0.65), mats.accent);
    rail.position.set(0, 0.68, plan.z);
    root.add(rail);
  }
}

function addGear(root: THREE.Group, blueprint: JetBlueprint, mats: Mats): THREE.Group {
  const gear = new THREE.Group();
  gear.visible = false;
  const add = (x: number, z: number) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), mats.metal);
    strut.position.set(x, -0.45, z);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), mats.dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -1.18, z);
    gear.add(wheel);
  };
  add(0, blueprint.canopy.z - 1.5);
  add(-blueprint.span * 0.16, 0.6);
  add(blueprint.span * 0.16, 0.6);
  root.add(gear);
  return gear;
}

function addPylons(root: THREE.Group, blueprint: JetBlueprint, mats: Mats): void {
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const x = sign * (blueprint.wing.rootX + (blueprint.wing.tipX - blueprint.wing.rootX) * (0.35 + i * 0.25));
      const z = -0.2 + i * 1.3;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.75), mats.dark);
      pylon.position.set(x, -0.25, z);
      root.add(pylon);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.35, 8), mats.secondary);
      body.rotation.x = Math.PI / 2;
      body.position.set(x, -0.4, z);
      root.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), mats.accent);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(x, -0.4, z - 0.82);
      root.add(tip);
    }
  }
}

function addSensors(root: THREE.Group, blueprint: JetBlueprint, mats: Mats, navLights: THREE.Mesh[]): void {
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), mats.metal);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, 0.02, -blueprint.length * 0.5 - 0.55);
  root.add(pitot);
  const irst = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), mats.dark);
  irst.position.set(0, -0.12, -blueprint.length * 0.32);
  root.add(irst);
  const irstEye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mats.glow);
  irstEye.position.set(0, -0.15, -blueprint.length * 0.34);
  root.add(irstEye);
  for (const sign of [-1, 1]) {
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.45, 0.8), mats.dark);
    antenna.position.set(sign * 0.7, 0.72, 1.4);
    antenna.rotation.z = sign * 0.18;
    root.add(antenna);
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: sign < 0 ? 0xff5046 : 0x62ff9b, toneMapped: false }),
    );
    nav.position.set(sign * blueprint.span * 0.5, 0.02, blueprint.wing.tipLE + 0.12);
    root.add(nav);
    navLights.push(nav);
  }
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function panelLines(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(18,23,28,${strength})`;
  for (let y = 22; y < h; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (y % 3) * 2);
    ctx.stroke();
  }
  for (let x = 28; x < w; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (x % 5) * 2, h);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(20,24,28,${strength * 0.9})`;
  for (let i = 0; i < 150; i++) {
    ctx.beginPath();
    ctx.arc((i * 137) % w, (i * 73) % h, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 油污/流痕
  ctx.fillStyle = `rgba(20,22,20,${0.05 * strength})`;
  for (let i = 0; i < 22; i++) {
    ctx.fillRect((i * 173) % w, 0, 2 + (i % 4) * 2, h);
  }
}

/** 机翼专用涂装：底色 + 分色块 + 编号 + 纹样 + 面板线。 */
function wingLivery(blueprint: JetBlueprint, palette: Palette, high: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = high ? 1024 : 512;
  c.height = high ? 512 : 256;
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex(palette.base);
  ctx.fillRect(0, 0, w, h);
  // 后缘分色块
  ctx.fillStyle = hex(palette.secondary);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.64);
  ctx.lineTo(w, h * 0.55);
  ctx.lineTo(w, h * 0.92);
  ctx.lineTo(0, h * 0.82);
  ctx.closePath();
  ctx.fill();
  // 前缘高亮
  ctx.fillStyle = hex(palette.accent);
  ctx.fillRect(0, 0, w, high ? 7 : 4);
  // 专属色带/纹样
  if (blueprint.motif === 'stripe') {
    ctx.fillStyle = 'rgba(210,59,50,0.95)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    ctx.lineTo(w, h * 0.2);
    ctx.lineTo(w, h * 0.34);
    ctx.lineTo(0, h * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(43,63,102,0.92)';
    ctx.fillRect(0, h * 0.04, w, h * 0.08);
  } else if (blueprint.motif === 'cloud') {
    ctx.strokeStyle = 'rgba(216,180,106,0.95)';
    ctx.lineWidth = high ? 5 : 3;
    for (let i = 0; i < 6; i++) {
      const x = 120 + i * 150;
      const y = 150 + (i % 3) * 70;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 3.1; a += 0.16) {
        const r = 8 + a * 4.5;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.6;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  } else if (blueprint.motif === 'ew') {
    ctx.strokeStyle = 'rgba(87,216,255,0.9)';
    ctx.lineWidth = high ? 4 : 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(70, h * 0.28 + i * h * 0.12);
      ctx.lineTo(w - 60, h * 0.22 + i * h * 0.12);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(47,182,217,0.2)';
    ctx.fillRect(0, h * 0.2, w, h * 0.55);
  } else if (blueprint.motif === 'star') {
    ctx.fillStyle = 'rgba(45,92,168,0.92)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? h * 0.3 : h * 0.12;
      const px = w * 0.5 + Math.cos(a) * r;
      const py = h * 0.5 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(45,63,92,0.55)';
    for (let i = 0; i < 12; i++) {
      const x = (i * 97) % w;
      const y = h * 0.15 + ((i * 59) % (h * 0.7));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 140, y + 26);
      ctx.lineTo(x + 95, y + 90);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(159,239,255,0.55)';
    ctx.lineWidth = high ? 3 : 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, h * 0.78 + i * 14);
      ctx.lineTo(w, h * 0.74 + i * 14);
      ctx.stroke();
    }
  }
  if (high) {
    ctx.fillStyle = 'rgba(237,230,214,0.8)';
    ctx.font = '600 64px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(blueprint.number, w - 70, h * 0.42);
    panelLines(ctx, w, h, 0.6);
  } else {
    panelLines(ctx, w, h, 0.3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 机身/垂尾的底色与面板。 */
function bodyLivery(blueprint: JetBlueprint, palette: Palette, kind: 'fuse' | 'tail', high: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = high ? 512 : 256;
  c.height = high ? 512 : 256;
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex(palette.base);
  ctx.fillRect(0, 0, w, h);
  if (kind === 'fuse') {
    ctx.fillStyle = hex(palette.secondary);
    ctx.fillRect(0, 0, w, h * 0.18);
    ctx.fillStyle = hex(palette.accent);
    ctx.fillRect(0, h * 0.18, w, 5);
    panelLines(ctx, w, h, high ? 0.45 : 0.22);
  } else {
    ctx.fillStyle = hex(palette.secondary);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(237,230,214,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = 'rgba(237,230,214,0.95)';
    ctx.font = '600 62px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(blueprint.number, w / 2, h * 0.5);
    ctx.font = '500 18px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText('QIXIA / CV-07', w / 2, h * 0.64);
    panelLines(ctx, w, h, high ? 0.5 : 0.25);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function tailDecalTexture(blueprint: JetBlueprint): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(237,230,214,0.95)';
  ctx.font = '600 78px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(blueprint.number, 128, 120);
  ctx.font = '500 22px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(237,230,214,0.7)';
  ctx.fillText('QIXIA / CV-07', 128, 162);
  ctx.strokeStyle = 'rgba(237,230,214,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 220, 220);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildGirlJet(girl: GirlSpec, options: { lod?: 'hangar' | 'game' } = {}): JetVisual {
  const blueprint = JET_BLUEPRINTS[girl.id];
  const high = (options.lod ?? 'hangar') === 'hangar';
  const mats = matsFor(girl.palette, high);
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  const root = new THREE.Group();
  inner.add(root);

  const flames: THREE.Mesh[] = [];
  const glowDiscs: THREE.Mesh[] = [];
  const navLights: THREE.Mesh[] = [];

  const wingTex = wingLivery(blueprint, girl.palette, high);
  const fuseTex = bodyLivery(blueprint, girl.palette, 'fuse', high);
  const tailTex = bodyLivery(blueprint, girl.palette, 'tail', high);
  const wingMat = mats.base.clone();
  wingMat.map = wingTex;
  wingMat.color.setHex(0xffffff);
  wingMat.needsUpdate = true;
  const fuseMat = mats.base.clone();
  fuseMat.map = fuseTex;
  fuseMat.color.setHex(0xffffff);
  fuseMat.needsUpdate = true;
  const tailMat = mats.secondary.clone();
  tailMat.map = tailTex;
  tailMat.color.setHex(0xffffff);
  tailMat.needsUpdate = true;

  root.add(fuselage(blueprint, fuseMat, high));

  // 机背脊线 / 脊背分色
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.05, blueprint.length * 0.58), mats.accent);
  spine.position.set(0, 0.86, -0.2);
  root.add(spine);
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, blueprint.length * 0.3), mats.secondary);
  dorsal.position.set(0, 0.82, 0.4);
  root.add(dorsal);

  for (const sign of [-1, 1]) {
    addWing(root, blueprint.wing, sign, wingMat, mats.accent, mats.secondary, high);
    if (blueprint.lerx) addWing(root, blueprint.lerx, sign, wingMat, mats.accent, mats.secondary, high);
    if (blueprint.canards) addWing(root, blueprint.canards, sign, wingMat, mats.accent, mats.secondary, high);
    if (blueprint.tail.twin || sign > 0) addTail(root, blueprint.tail, sign, tailMat, high);
    if (blueprint.nozzles.count === 2) addNozzle(root, blueprint.nozzles, sign, mats, high, flames, glowDiscs);
  }
  if (blueprint.nozzles.count === 1) addNozzle(root, blueprint.nozzles, 1, mats, high, flames, glowDiscs);

  addCanopy(root, blueprint.canopy, mats, high);

  for (let i = 0; i < blueprint.intakes.count; i++) {
    const x = blueprint.intakes.count === 2 ? i === 0 ? -blueprint.intakes.x : blueprint.intakes.x : 0;
    addIntake(root, blueprint.intakes, x < 0 ? -1 : 1, mats, high);
  }

  if (high) {
    addSensors(root, blueprint, mats, navLights);
    addPylons(root, blueprint, mats);
    const tailTex = tailDecalTexture(blueprint);
    const tailZ = (blueprint.tail.rootLE + blueprint.tail.tipTE) * 0.5;
    for (const sign of [-1, 1]) {
      if (!blueprint.tail.twin && sign < 0) continue;
      const decalY = 1.25;
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(1.0, 0.72),
        new THREE.MeshBasicMaterial({ map: tailTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      decal.position.set(
        sign * ((blueprint.tail.twin ? blueprint.tail.offset : 0) + Math.sin(blueprint.tail.cant) * decalY + blueprint.tail.thickness * 0.62 + 0.03),
        decalY + 0.2,
        tailZ,
      );
      decal.rotation.y = sign * Math.PI / 2;
      decal.rotation.z = -sign * (blueprint.tail.twin ? blueprint.tail.cant : 0);
      root.add(decal);
    }
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  const gear = high ? addGear(root, blueprint, mats) : new THREE.Group();

  const baseColor = new THREE.Color(girl.palette.base);
  const paintMats: THREE.MeshStandardMaterial[] = [wingMat, fuseMat, tailMat];
  const setThrottle = (value: number) => {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    for (const f of flames) {
      f.scale.set(0.8 + v * 0.45, 0.7 + v * 0.9, 0.8 + v * 0.45);
      (f.material as THREE.MeshBasicMaterial).opacity = 0.18 + v * 0.55;
    }
    for (const d of glowDiscs) {
      (d.material as THREE.MeshBasicMaterial).opacity = 0.6 + v * 0.4;
    }
  };
  setThrottle(0.55);

  return {
    group,
    inner,
    flames,
    glowDiscs,
    navLights,
    setThrottle,
    setGear: (visible: boolean) => {
      gear.visible = visible;
    },
    setDamage: (value: number) => {
      const v = THREE.MathUtils.clamp(value, 0, 1);
      for (const mat of paintMats) {
        mat.color.copy(baseColor).lerp(new THREE.Color(0x2a1f1c), v * 0.55);
        mat.emissive.setHex(0x1a0503);
        mat.emissiveIntensity = v * 0.4;
      }
      mats.base.color.copy(baseColor).lerp(new THREE.Color(0x2a1f1c), v * 0.55);
    },
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
          const map = (obj.material as THREE.MeshBasicMaterial).map;
          if (map) map.dispose();
        }
      });
      Object.values(mats).forEach((m) => m.dispose());
    },
  };
}

/** 兼容旧的机库调用方式。 */
export function buildGirlJetLegacy(girl: GirlSpec): JetVisual {
  return buildGirlJet(girl, { lod: 'hangar' });
}

export { Z_AXIS };
