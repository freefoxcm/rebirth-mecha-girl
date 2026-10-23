import * as THREE from 'three';
import { Rng } from '../core/rng';
import { BRANDS } from '../data/brands';

export interface BoxCollider {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

const WORLD = 2400;
const HALF = WORLD / 2;
const BLOCK = 160;
const ROAD = 28;
const CELLS = 15;

function px(v: number): number {
  return ((v + HALF) / WORLD) * 2048;
}

function makeCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  return canvas;
}

function canvasTexture(canvas: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function groundTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas(2048, 2048, (ctx) => {
    ctx.fillStyle = '#1a201f';
    ctx.fillRect(0, 0, 2048, 2048);

    // 街区底色
    for (let ix = 0; ix < CELLS; ix++) {
      for (let iz = 0; iz < CELLS; iz++) {
        const x = -HALF + ix * BLOCK + ROAD / 2;
        const z = -HALF + iz * BLOCK + ROAD / 2;
        const w = BLOCK - ROAD;
        const shade = 26 + ((ix * 7 + iz * 11) % 5) * 3;
        ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 2})`;
        ctx.fillRect(px(x), px(z), (w / WORLD) * 2048, (w / WORLD) * 2048);
      }
    }

    // 公园
    ctx.fillStyle = 'rgba(36, 58, 42, 0.85)';
    const parks: Array<[number, number, number]> = [
      [-620, 320, 130],
      [120, 480, 110],
      [-900, -460, 100],
      [520, 260, 90],
    ];
    for (const [x, z, r] of parks) {
      ctx.beginPath();
      ctx.ellipse(px(x), px(z), (r / WORLD) * 2048, (r / WORLD) * 2048, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 道路
    for (let i = 0; i <= CELLS; i++) {
      const pos = -HALF + i * BLOCK;
      const p = px(pos - ROAD / 2);
      const w = (ROAD / WORLD) * 2048;
      ctx.fillStyle = '#101416';
      ctx.fillRect(p, 0, w, 2048);
      ctx.fillRect(0, p, 2048, w);
      // 人行道
      ctx.fillStyle = 'rgba(110, 120, 118, 0.16)';
      ctx.fillRect(p - 5, 0, 5, 2048);
      ctx.fillRect(p + w, 0, 5, 2048);
      ctx.fillRect(0, p - 5, 2048, 5);
      ctx.fillRect(0, p + w, 2048, 5);
      // 车道线
      ctx.strokeStyle = 'rgba(220, 210, 180, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(p + w / 2, 0);
      ctx.lineTo(p + w / 2, 2048);
      ctx.moveTo(0, p + w / 2);
      ctx.lineTo(2048, p + w / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 海湾水面
    ctx.beginPath();
    ctx.moveTo(px(250), px(1200));
    ctx.lineTo(px(250), px(770));
    ctx.lineTo(px(420), px(730));
    ctx.lineTo(px(760), px(700));
    ctx.lineTo(px(1200), px(640));
    ctx.lineTo(px(1200), px(1200));
    ctx.closePath();
    ctx.fillStyle = '#07161f';
    ctx.fill();
    for (let i = 0; i < 40; i++) {
      const x = 250 + Math.random() * 950;
      const z = 720 + Math.random() * 460;
      ctx.strokeStyle = `rgba(120, 190, 210, ${0.04 + Math.random() * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px(x), px(z));
      ctx.lineTo(px(x + 30 + Math.random() * 50), px(z + 4));
      ctx.stroke();
    }

    // 收费站广场
    ctx.fillStyle = '#14191a';
    ctx.beginPath();
    ctx.ellipse(px(-380), px(0), (150 / WORLD) * 2048, (90 / WORLD) * 2048, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 220, 190, 0.22)';
    ctx.setLineDash([4, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 金融区圆形广场
    ctx.strokeStyle = 'rgba(230, 220, 190, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(430), px(-360), (54 / WORLD) * 2048, 0, Math.PI * 2);
    ctx.stroke();

    // 码头线
    ctx.strokeStyle = 'rgba(180, 170, 140, 0.25)';
    ctx.lineWidth = 2;
    for (const [x, z, w] of [
      [330, 660, 140],
      [520, 620, 180],
      [760, 600, 160],
      [980, 580, 140],
    ]) {
      ctx.strokeRect(px(x), px(z), (w / WORLD) * 2048, (12 / WORLD) * 2048);
    }

    // 噪点
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 2048;
      const y = Math.random() * 2048;
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvasTexture(canvas);
}

function windowTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas(128, 256, (ctx) => {
    ctx.fillStyle = '#c9c3b6';
    ctx.fillRect(0, 0, 128, 256);
    // 楼层横带
    for (let y = 0; y < 256; y += 16) {
      ctx.fillStyle = 'rgba(80, 74, 66, 0.35)';
      ctx.fillRect(0, y, 128, 2);
    }
    // 窗格
    for (let y = 5; y < 250; y += 16) {
      for (let x = 4; x < 124; x += 12) {
        const lit = Math.random() < 0.045;
        ctx.fillStyle = lit ? 'rgba(255, 196, 110, 0.75)' : `rgba(58, 70, 76, ${0.35 + Math.random() * 0.2})`;
        ctx.fillRect(x, y, 7, 8);
      }
    }
    // 立面污渍
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(40, 36, 30, ${Math.random() * 0.06})`;
      ctx.fillRect(Math.random() * 128, Math.random() * 256, 3 + Math.random() * 14, 30 + Math.random() * 120);
    }
  });
  const tex = canvasTexture(canvas);
  return tex;
}

function windowEmissiveTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas(128, 256, (ctx) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 5; y < 250; y += 16) {
      for (let x = 4; x < 124; x += 12) {
        const r = Math.random();
        if (r < 0.11) {
          ctx.fillStyle = `rgba(255, 176, 92, ${0.5 + Math.random() * 0.5})`;
          ctx.fillRect(x, y, 7, 8);
        } else if (r < 0.14) {
          ctx.fillStyle = 'rgba(150, 210, 255, 0.7)';
          ctx.fillRect(x, y, 7, 8);
        }
      }
    }
  });
  return canvasTexture(canvas);
}

function billboardTexture(brand: (typeof BRANDS)[number]): THREE.CanvasTexture {
  const canvas = makeCanvas(512, 192, (ctx) => {
    ctx.fillStyle = brand.bg;
    ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = brand.fg;
    ctx.font = '700 68px "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(brand.title, 256, 84, 470);
    ctx.font = '500 22px Bahnschrift, Arial, sans-serif';
    ctx.globalAlpha = 0.8;
    ctx.fillText(brand.sub, 256, 146, 470);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = brand.fg;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 492, 172);
  });
  return canvasTexture(canvas);
}

function signTexture(text: string): THREE.CanvasTexture {
  const canvas = makeCanvas(1024, 256, (ctx) => {
    ctx.fillStyle = '#e8e1d0';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#111820';
    ctx.fillRect(0, 0, 1024, 18);
    ctx.fillRect(0, 238, 1024, 18);
    ctx.fillStyle = '#0d1520';
    ctx.font = '700 108px "Microsoft YaHei UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 126, 940);
    ctx.fillStyle = '#d7a12a';
    ctx.fillRect(0, 224, 1024, 5);
  });
  return canvasTexture(canvas);
}

/** 共享的临港市：建筑、地标、道具、碰撞体。 */
export class City {
  readonly group = new THREE.Group();
  readonly colliders: BoxCollider[] = [];
  private readonly rng = new Rng(20261023);
  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(quality: 'low' | 'medium' | 'high' = 'high') {
    this.group.name = 'city';
    this.buildGround();
    this.buildBuildings(quality);
    this.buildTollPlaza();
    this.buildDowntown();
    this.buildHarbor();
    this.buildProps(quality);
    this.buildMountains();
  }

  private track<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private mat<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private tex<T extends THREE.Texture>(texture: T): T {
    this.textures.push(texture);
    return texture;
  }

  private buildGround(): void {
    const groundTex = this.tex(groundTexture());
    const mat = this.mat(
      new THREE.MeshStandardMaterial({
        map: groundTex,
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.04,
      }),
    );
    const ground = new THREE.Mesh(this.track(new THREE.PlaneGeometry(WORLD, WORLD)), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private buildBuildings(quality: 'low' | 'medium' | 'high'): void {
    const winTex = this.tex(windowTexture());
    const emissiveTex = this.tex(windowEmissiveTexture());
    const buildingMat = this.mat(
      new THREE.MeshStandardMaterial({
        map: winTex,
        emissiveMap: emissiveTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.75,
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.12,
        vertexColors: false,
      }),
    );
    const roofMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x5c5a4e, roughness: 0.86, metalness: 0.08 }));
    const acMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x4b4f4d, roughness: 0.7, metalness: 0.35 }));

    type B = { x: number; z: number; w: number; d: number; h: number; color: THREE.Color };
    const buildings: B[] = [];
    const roofSlabs: B[] = [];
    const acs: Array<{ x: number; y: number; z: number; s: number }> = [];

    const palette = [0xe1d9c8, 0xcfc6b4, 0xb9b2a2, 0xa9a89f, 0xd8cec0, 0x9fa7a8, 0xc7b9a4, 0x8f9a9e];

    for (let ix = 0; ix < CELLS; ix++) {
      for (let iz = 0; iz < CELLS; iz++) {
        const cx = -HALF + ix * BLOCK + BLOCK / 2;
        const cz = -HALF + iz * BLOCK + BLOCK / 2;
        if (this.isWater(cx, cz)) continue;
        if (Math.hypot(cx + 380, cz) < 175) continue; // 收费站广场
        if (Math.hypot(cx - 430, cz + 360) < 90) continue; // 金融区广场

        const downtown = cx > 260 && cz < -140;
        const harbor = cz > 520 && cx > 180;
        const west = cx < -220;
        let height = downtown ? this.rng.range(48, 155) : harbor ? this.rng.range(10, 30) : west ? this.rng.range(18, 54) : this.rng.range(16, 46);
        if (downtown && this.rng.chance(0.12)) height = this.rng.range(165, 210);
        if (quality === 'low') height *= 0.9;

        const count = this.rng.int(1, 3);
        for (let i = 0; i < count; i++) {
          const w = this.rng.range(downtown ? 26 : 30, downtown ? 58 : 78);
          const d = this.rng.range(downtown ? 26 : 30, downtown ? 58 : 78);
          const x = cx + this.rng.range(-(BLOCK - ROAD - w) / 2, (BLOCK - ROAD - w) / 2);
          const z = cz + this.rng.range(-(BLOCK - ROAD - d) / 2, (BLOCK - ROAD - d) / 2);
          const h = Math.max(9, height * this.rng.range(0.55, 1.05));
          const color = new THREE.Color(palette[Math.floor(this.rng.next() * palette.length)]);
          if (harbor) color.multiplyScalar(0.82);
          buildings.push({ x, z, w, d, h, color });
          roofSlabs.push({ x, z, w, d, h, color });
          const acCount = Math.floor(this.rng.range(0, 4));
          for (let a = 0; a < acCount; a++) {
            acs.push({
              x: x + this.rng.range(-w * 0.3, w * 0.3),
              y: h + 0.65,
              z: z + this.rng.range(-d * 0.3, d * 0.3),
              s: this.rng.range(1.2, 2.8),
            });
          }
          if (h > 86) this.colliders.push({ x, z, w, d, h });
        }
      }
    }

    const box = this.track(new THREE.BoxGeometry(1, 1, 1));
    const instanced = new THREE.InstancedMesh(box, buildingMat, buildings.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    const dummy = new THREE.Object3D();
    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
      instanced.setColorAt(i, b.color);
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    this.group.add(instanced);

    const roofs = new THREE.InstancedMesh(this.track(new THREE.BoxGeometry(1, 1, 1)), roofMat, roofSlabs.length);
    roofs.castShadow = true;
    roofs.receiveShadow = true;
    roofSlabs.forEach((b, i) => {
      dummy.position.set(b.x, b.h + 0.45, b.z);
      dummy.scale.set(b.w * 1.025, 0.9, b.d * 1.025);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
    });
    roofs.instanceMatrix.needsUpdate = true;
    this.group.add(roofs);

    const acMesh = new THREE.InstancedMesh(this.track(new THREE.BoxGeometry(1, 1, 1)), acMat, acs.length);
    acs.forEach((a, i) => {
      dummy.position.set(a.x, a.y, a.z);
      dummy.scale.set(a.s, a.s * 0.55, a.s);
      dummy.updateMatrix();
      acMesh.setMatrixAt(i, dummy.matrix);
    });
    acMesh.instanceMatrix.needsUpdate = true;
    acMesh.castShadow = true;
    this.group.add(acMesh);
  }

  isWater(x: number, z: number): boolean {
    return x > 250 && z > 740 + (x - 250) * -0.12;
  }

  private buildTollPlaza(): void {
    const white = this.mat(new THREE.MeshStandardMaterial({ color: 0x9a968b, roughness: 0.72, metalness: 0.1 }));
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x1b2228, roughness: 0.5, metalness: 0.5 }));
    const amber = this.mat(new THREE.MeshBasicMaterial({ color: 0xf2b01e, toneMapped: false }));

    // 收费站雨棚：平顶 + 横向肋条，俯视下不会形成奇怪的黑筒
    const canopy = new THREE.Mesh(this.track(new THREE.BoxGeometry(180, 1.5, 46)), white);
    canopy.position.set(-380, 20, 0);
    canopy.castShadow = false;
    this.group.add(canopy);
    for (const z of [-23, 23]) {
      const fascia = new THREE.Mesh(this.track(new THREE.BoxGeometry(180, 3.2, 1.2)), dark);
      fascia.position.set(-380, 19.4, z);
      this.group.add(fascia);
    }
    for (let i = -2; i <= 2; i++) {
      const rib = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.2, 0.35, 46)), new THREE.MeshStandardMaterial({ color: 0x8b8a80, roughness: 0.7 }));
      rib.position.set(-380 + i * 34, 20.9, 0);
      this.group.add(rib);
    }
    for (const x of [-460, -380, -300]) {
      for (const z of [-19, 19]) {
        const col = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.4, 20, 2.4)), dark);
        col.position.set(x, 10, z);
        col.castShadow = true;
        this.group.add(col);
      }
    }

    // 收费亭
    for (let i = 0; i < 8; i++) {
      const x = -380 - 56 + i * 16;
      const booth = new THREE.Mesh(this.track(new THREE.BoxGeometry(7, 3.4, 10)), dark);
      booth.position.set(x, 1.7, 0);
      booth.castShadow = true;
      this.group.add(booth);
      const light = new THREE.Mesh(this.track(new THREE.BoxGeometry(6.4, 0.12, 0.3)), amber);
      light.position.set(x, 3.45, -5);
      this.group.add(light);
      const barrier = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.25, 0.25, 9)), white);
      barrier.position.set(x, 4.2, 4);
      this.group.add(barrier);
    }

    // 顶部站名：横跨车道的屋顶灯箱，俯视可读
    const sign = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(44, 0.35, 16)),
      this.mat(new THREE.MeshBasicMaterial({ map: this.tex(signTexture('临港西收费站')), toneMapped: false })),
    );
    sign.position.set(-380, 21.8, 0);
    sign.rotation.y = -Math.PI / 2;
    this.group.add(sign);

    // 车道线与排队车辆
    for (let i = -3; i <= 3; i++) {
      const line = new THREE.Mesh(this.track(new THREE.BoxGeometry(150, 0.06, 0.35)), white);
      line.position.set(-380, 0.22, i * 5.2);
      this.group.add(line);
    }
    const carColors = [0xd9d4c8, 0x8a9095, 0x2f3438, 0x8f3b35, 0x31506b, 0xc6b47a];
    for (let i = 0; i < 10; i++) {
      const car = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(2.4, 1.5, 5)),
        this.mat(new THREE.MeshStandardMaterial({ color: carColors[i % carColors.length], roughness: 0.5, metalness: 0.4 })),
      );
      car.position.set(-460 + i * 17, 0.9, i % 2 === 0 ? -7.5 : 7.5);
      car.castShadow = true;
      this.group.add(car);
    }

    // 两侧龙门架
    for (const x of [-470, -290]) {
      const post = new THREE.Mesh(this.track(new THREE.BoxGeometry(2, 26, 2)), dark);
      post.position.set(x, 13, 0);
      this.group.add(post);
      const beam = new THREE.Mesh(this.track(new THREE.BoxGeometry(180, 1.4, 1.4)), dark);
      beam.position.set(-380, 25, 0);
      this.group.add(beam);
    }
  }

  private buildDowntown(): void {
    const glass = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x41545c, roughness: 0.18, metalness: 0.7, envMapIntensity: 1.2 }),
    );
    const stone = this.mat(new THREE.MeshStandardMaterial({ color: 0xb7ae9c, roughness: 0.7, metalness: 0.1 }));
    const accent = this.mat(new THREE.MeshBasicMaterial({ color: 0x5fd8e8, toneMapped: false }));
    const amber = this.mat(new THREE.MeshBasicMaterial({ color: 0xf2b01e, toneMapped: false }));

    const tower = (x: number, z: number, h: number, r: number) => {
      const geo = this.track(new THREE.CylinderGeometry(r * 0.62, r, h, 4, 1));
      const mesh = new THREE.Mesh(geo, glass);
      mesh.rotation.y = Math.PI / 4;
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.colliders.push({ x, z, w: r * 1.6, d: r * 1.6, h });
      const crown = new THREE.Mesh(this.track(new THREE.BoxGeometry(2, 10, 2)), accent);
      crown.position.set(x, h + 5, z);
      this.group.add(crown);
    };
    tower(430, -360, 188, 24);
    tower(520, -300, 138, 18);
    tower(340, -300, 112, 16);

    const plaza = new THREE.Mesh(this.track(new THREE.TorusGeometry(52, 0.8, 4, 80)), stone);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(430, 0.25, -360);
    this.group.add(plaza);
    const ring = new THREE.Mesh(this.track(new THREE.TorusGeometry(44, 0.3, 4, 80)), amber);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(430, 0.3, -360);
    this.group.add(ring);

    // 单轨
    const rail = new THREE.Mesh(this.track(new THREE.BoxGeometry(700, 1.2, 3.6)), stone);
    rail.position.set(250, 15, -230);
    this.group.add(rail);
    for (let i = 0; i < 10; i++) {
      const col = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.6, 15, 1.6)), stone);
      col.position.set(-80 + i * 72, 7.5, -230);
      col.castShadow = true;
      this.group.add(col);
    }
    const train = new THREE.Mesh(this.track(new THREE.BoxGeometry(58, 3.2, 4.2)), glass);
    train.position.set(120, 17.2, -230);
    this.group.add(train);
  }

  private buildHarbor(): void {
    const waterShape = new THREE.Shape();
    waterShape.moveTo(250, 1200);
    waterShape.lineTo(250, 770);
    waterShape.lineTo(420, 730);
    waterShape.lineTo(760, 700);
    waterShape.lineTo(1200, 640);
    waterShape.lineTo(1200, 1200);
    waterShape.closePath();
    const waterGeo = this.track(new THREE.ShapeGeometry(waterShape));
    waterGeo.rotateX(Math.PI / 2);
    const water = new THREE.Mesh(
      waterGeo,
      this.mat(
        new THREE.MeshStandardMaterial({
          color: 0x102c3d,
          roughness: 0.5,
          metalness: 0.32,
          envMapIntensity: 0.5,
          side: THREE.DoubleSide,
        }),
      ),
    );
    water.position.y = 0.12;
    this.group.add(water);

    const dock = this.mat(new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.85, metalness: 0.15 }));
    const metal = this.mat(new THREE.MeshStandardMaterial({ color: 0x6a6d68, roughness: 0.5, metalness: 0.6 }));
    const yellow = this.mat(new THREE.MeshStandardMaterial({ color: 0xb58a24, roughness: 0.55, metalness: 0.4 }));

    for (const [x, z, w] of [
      [330, 690, 150],
      [520, 650, 170],
      [760, 625, 150],
      [960, 600, 130],
    ]) {
      const pier = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, 2, 26)), dock);
      pier.position.set(x, 1, z);
      pier.receiveShadow = true;
      this.group.add(pier);
    }

    // 集装箱
    const containerGeo = this.track(new THREE.BoxGeometry(1, 1, 1));
    const containerMesh = new THREE.InstancedMesh(
      containerGeo,
      this.mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.25 })),
      72,
    );
    const dummy = new THREE.Object3D();
    const colors = [0xb23a30, 0x2b5d8a, 0x3b7a54, 0xb58a24, 0x8a8f91, 0x6e3b5a];
    for (let i = 0; i < 72; i++) {
      const cx = 480 + this.rng.range(-130, 220);
      const cz = 680 + this.rng.range(-50, 45);
      const stack = this.rng.int(0, 2);
      dummy.position.set(cx, 2 + stack * 2.6, cz + this.rng.range(-10, 10));
      dummy.scale.set(this.rng.range(8, 12), 2.5, this.rng.range(2.6, 3.2));
      dummy.rotation.y = this.rng.chance(0.5) ? 0 : Math.PI / 2;
      dummy.updateMatrix();
      containerMesh.setMatrixAt(i, dummy.matrix);
      containerMesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    }
    containerMesh.instanceMatrix.needsUpdate = true;
    if (containerMesh.instanceColor) containerMesh.instanceColor.needsUpdate = true;
    containerMesh.castShadow = true;
    containerMesh.receiveShadow = true;
    this.group.add(containerMesh);

    // 龙门吊
    for (let i = 0; i < 5; i++) {
      const x = 470 + i * 120;
      const z = 660 - i * 8;
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.2, 32, 2.2)), metal);
        leg.position.set(s * 14, 16, 0);
        leg.castShadow = true;
        g.add(leg);
      }
      const beam = new THREE.Mesh(this.track(new THREE.BoxGeometry(34, 2.2, 2.6)), yellow);
      beam.position.set(0, 32, 0);
      beam.castShadow = true;
      g.add(beam);
      const cab = new THREE.Mesh(this.track(new THREE.BoxGeometry(6, 5, 5)), metal);
      cab.position.set(-8, 28, 0);
      g.add(cab);
      const cable = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.12, 16, 0.12)), metal);
      cable.position.set(-8, 20, 0);
      g.add(cable);
      g.position.set(x, 0, z);
      this.group.add(g);
    }

    // 货轮
    for (const [x, z, rot] of [
      [780, 760, 0.1],
      [980, 720, -0.06],
    ]) {
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(this.track(new THREE.BoxGeometry(34, 9, 120)), new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.6, metalness: 0.35 }));
      hull.position.y = 3;
      hull.castShadow = true;
      ship.add(hull);
      const deck = new THREE.Mesh(this.track(new THREE.BoxGeometry(30, 2, 110)), dock);
      deck.position.y = 8.5;
      ship.add(deck);
      const bridge = new THREE.Mesh(this.track(new THREE.BoxGeometry(14, 18, 16)), new THREE.MeshStandardMaterial({ color: 0xcfc7b4, roughness: 0.6 }));
      bridge.position.set(0, 18, 34);
      ship.add(bridge);
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(this.track(new THREE.BoxGeometry(10, 4, 20)), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 }));
        c.position.set(0, 11.5, -30 + i * 22);
        ship.add(c);
      }
      ship.position.set(x, 0, z);
      ship.rotation.y = rot;
      this.group.add(ship);
    }
  }

  private buildProps(quality: 'low' | 'medium' | 'high'): void {
    const isLow = quality === 'low';
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.3, 0.5, 3.4, 5));
    const leafGeo = this.track(new THREE.IcosahedronGeometry(2.4, 0));
    const trunkMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x4a3d2f, roughness: 0.95 }));
    const leafMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));

    const treeCount = isLow ? 80 : 210;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, treeCount);
    const dummy = new THREE.Object3D();
    const leafColors = [0x3c5a3b, 0x49683f, 0x2f4a35, 0x5b6b45];
    for (let i = 0; i < treeCount; i++) {
      const roadIndex = this.rng.int(0, CELLS - 1);
      const along = this.rng.range(-HALF + 20, HALF - 20);
      const side = this.rng.chance(0.5) ? -1 : 1;
      const base = -HALF + roadIndex * BLOCK + ROAD / 2 + side * (ROAD / 2 + 10);
      const x = this.rng.chance(0.5) ? base : along;
      const z = this.rng.chance(0.5) ? base : along;
      if (this.isWater(x, z)) continue;
      const s = this.rng.range(0.8, 1.3);
      dummy.position.set(x, 1.7 * s, z);
      dummy.scale.setScalar(s);
      dummy.rotation.y = this.rng.range(0, Math.PI * 2);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 4.1 * s, z);
      dummy.scale.set(s, s * 0.9, s);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(i, new THREE.Color(leafColors[i % leafColors.length]));
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    trunks.castShadow = true;
    leaves.castShadow = true;
    this.group.add(trunks, leaves);

    // 车辆
    const carCount = isLow ? 70 : 180;
    const carGeo = this.track(new THREE.BoxGeometry(1, 1, 1));
    const carMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.5 }));
    const cars = new THREE.InstancedMesh(carGeo, carMat, carCount);
    const carColors = [0xd8d4ca, 0x8a9095, 0x2f3438, 0x8f3b35, 0x31506b, 0xc6b47a, 0x5a5f63];
    for (let i = 0; i < carCount; i++) {
      const roadIndex = this.rng.int(0, CELLS);
      const along = this.rng.range(-HALF, HALF);
      const base = -HALF + roadIndex * BLOCK;
      const horizontal = this.rng.chance(0.5);
      const lane = this.rng.range(-8, 8);
      const x = horizontal ? along : base + lane;
      const z = horizontal ? base + lane : along;
      if (this.isWater(x, z)) continue;
      dummy.position.set(x, 0.75, z);
      dummy.scale.set(2.1, 1.3, 4.6);
      dummy.rotation.set(0, horizontal ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
      cars.setColorAt(i, new THREE.Color(carColors[i % carColors.length]));
    }
    cars.instanceMatrix.needsUpdate = true;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    cars.castShadow = true;
    this.group.add(cars);

    // 屋顶广告牌（平放，便于俯视阅读）
    const signs: Array<[number, number, number, number]> = [
      [-520, 32, 18, 0.1],
      [-300, 30, 24, -0.12],
      [90, 36, 22, 0.05],
      [640, 34, 28, -0.08],
      [820, 24, 18, 0.16],
      [410, -210, 46, 0.02],
    ];
    signs.forEach(([x, z, y, rot], i) => {
      const brand = BRANDS[i % BRANDS.length];
      const geo = this.track(new THREE.PlaneGeometry(42, 15.75));
      const mesh = new THREE.Mesh(
        geo,
        this.mat(new THREE.MeshBasicMaterial({ map: this.tex(billboardTexture(brand)), toneMapped: false, side: THREE.DoubleSide })),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.y = rot + Math.PI / 2;
      mesh.position.set(x, y, z);
      this.group.add(mesh);
      const frame = new THREE.Mesh(this.track(new THREE.BoxGeometry(44, 0.4, 17.75)), this.mat(new THREE.MeshStandardMaterial({ color: 0x14181b })));
      frame.position.set(x, y - 0.3, z);
      frame.rotation.y = rot + Math.PI / 2;
      this.group.add(frame);
    });

    // 路灯
    if (!isLow) {
      const poleGeo = this.track(new THREE.CylinderGeometry(0.12, 0.18, 7, 4));
      const poleMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.6, metalness: 0.6 }));
      const lampGeo = this.track(new THREE.BoxGeometry(1.4, 0.18, 0.5));
      const lampMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffc06a, toneMapped: false }));
      const count = 90;
      const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
      const lamps = new THREE.InstancedMesh(lampGeo, lampMat, count);
      for (let i = 0; i < count; i++) {
        const horizontal = this.rng.chance(0.5);
        const along = this.rng.range(-HALF, HALF);
        const base = -HALF + this.rng.int(0, CELLS) * BLOCK;
        const side = this.rng.chance(0.5) ? 1 : -1;
        const x = horizontal ? along : base + side * (ROAD / 2 + 3);
        const z = horizontal ? base + side * (ROAD / 2 + 3) : along;
        dummy.position.set(x, 3.5, z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 7, z);
        dummy.updateMatrix();
        lamps.setMatrixAt(i, dummy.matrix);
      }
      poles.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
      this.group.add(poles, lamps);
    }
  }

  private buildMountains(): void {
    const geo = this.track(new THREE.ConeGeometry(1, 1, 5));
    const mat = this.mat(new THREE.MeshStandardMaterial({ color: 0x2e3a3d, roughness: 0.95, metalness: 0.02 }));
    const count = 22;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng.range(-0.12, 0.12);
      const r = this.rng.range(1500, 2100);
      const h = this.rng.range(120, 340);
      dummy.position.set(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r);
      dummy.scale.set(this.rng.range(240, 480), h, this.rng.range(240, 480));
      dummy.rotation.y = this.rng.range(0, Math.PI);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  /** 为地面目标找一圈可用位置（避开水面）。 */
  groundPoints(cx: number, cz: number, radius: number, count: number, seed = 1): Array<{ x: number; z: number }> {
    const rng = new Rng(seed);
    const points: Array<{ x: number; z: number }> = [];
    let guard = 0;
    while (points.length < count && guard++ < count * 40) {
      const a = rng.range(0, Math.PI * 2);
      const r = radius * Math.sqrt(rng.next());
      let x = cx + Math.cos(a) * r;
      let z = cz + Math.sin(a) * r;
      if (this.isWater(x, z)) continue;
      // 贴到最近的道路中心线，避免地面单位生在楼里
      const roadX = Math.round((x + HALF) / BLOCK) * BLOCK - HALF;
      const roadZ = Math.round((z + HALF) / BLOCK) * BLOCK - HALF;
      if (Math.abs(x - roadX) < Math.abs(z - roadZ)) x = roadX;
      else z = roadZ;
      x = Math.max(-HALF + 30, Math.min(HALF - 30, x));
      z = Math.max(-HALF + 30, Math.min(HALF - 30, z));
      points.push({ x, z });
    }
    return points;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry.dispose();
    });
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.group.clear();
  }
}
