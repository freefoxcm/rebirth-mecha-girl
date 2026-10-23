import * as THREE from 'three';

interface TracerData {
  active: boolean;
  life: number;
  maxLife: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface ParticleData {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
}

interface RingData {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  radius: number;
}

interface FlashData {
  sprite: THREE.Sprite;
  life: number;
  maxLife: number;
  size: number;
}

interface FireballData {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface DebrisData {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

interface SparkData {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface ExplosionOptions {
  surface?: 'air' | 'ground' | 'water';
  variant?: 'small' | 'jet' | 'big' | 'boss';
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

function softCircleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 曳光弹、爆炸、烟、冲击波。全部池化，避免战斗中分配。 */
export class Effects {
  readonly group = new THREE.Group();
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly tracerData: TracerData[] = [];
  private readonly firePoints: THREE.Points;
  private readonly smokePoints: THREE.Points;
  private readonly fireData: ParticleData[] = [];
  private readonly smokeData: ParticleData[] = [];
  private readonly rings: RingData[] = [];
  private readonly flashes: FlashData[] = [];
  private readonly fireballs: FireballData[] = [];
  private readonly debrisMesh: THREE.InstancedMesh;
  private readonly debris: DebrisData[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparks: SparkData[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly softTex: THREE.CanvasTexture;
  private tracerCursor = 0;
  private fireCursor = 0;
  private smokeCursor = 0;
  private flashCursor = 0;
  private fireballCursor = 0;
  private debrisCursor = 0;
  private sparkCursor = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'effects';
    scene.add(this.group);

    const tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, 160);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 160; i++) {
      this.tracerData.push({ active: false, life: 0, maxLife: 0.12, from: new THREE.Vector3(), to: new THREE.Vector3() });
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.tracerMesh.setMatrixAt(i, this.dummy.matrix);
      this.tracerMesh.setColorAt(i, new THREE.Color(0x9fe3ff));
    }
    this.group.add(this.tracerMesh);

    this.softTex = softCircleTexture();

    const fireGeo = new THREE.BufferGeometry();
    const firePos = new Float32Array(520 * 3);
    const fireCol = new Float32Array(520 * 3);
    for (let i = 0; i < 520; i++) {
      firePos[i * 3 + 1] = -1000;
      this.fireData.push({
        active: false,
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        color: new THREE.Color(0xffa040),
        gravity: 0,
        drag: 0.9,
      });
    }
    fireGeo.setAttribute('position', new THREE.BufferAttribute(firePos, 3));
    fireGeo.setAttribute('color', new THREE.BufferAttribute(fireCol, 3));
    this.firePoints = new THREE.Points(
      fireGeo,
      new THREE.PointsMaterial({
        size: 9.5,
        map: this.softTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.firePoints.frustumCulled = false;
    this.group.add(this.firePoints);

    const smokeGeo = new THREE.BufferGeometry();
    const smokePos = new Float32Array(320 * 3);
    const smokeCol = new Float32Array(320 * 3);
    for (let i = 0; i < 320; i++) {
      smokePos[i * 3 + 1] = -1000;
      this.smokeData.push({
        active: false,
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        color: new THREE.Color(0x333333),
        gravity: -1.5,
        drag: 0.82,
      });
    }
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
    smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeCol, 3));
    this.smokePoints = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({
        size: 12,
        map: this.softTex,
        vertexColors: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.smokePoints.frustumCulled = false;
    this.group.add(this.smokePoints);

    for (let i = 0; i < 10; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.975, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffc060,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.group.add(ring);
      this.rings.push({ mesh: ring, life: 0, maxLife: 0.5, radius: 1 });
    }

    // 核心闪光：大爆炸的“白心”
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.softTex,
        color: 0xfff0c8,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0);
      sprite.visible = false;
      this.group.add(sprite);
      this.flashes.push({ sprite, life: 0, maxLife: 0.16, size: 1 });
    }

    // 低模火球：给爆炸一个实体核心
    const ballGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff5a1e,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(ballGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.fireballs.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.5, size: 1 });
    }

    const debrisGeo = new THREE.BoxGeometry(0.55, 0.22, 1.1);
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.72, metalness: 0.55 });
    this.debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, 90);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.debrisMesh);
    for (let i = 0; i < 90; i++) {
      this.debris.push({
        active: false,
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        scale: 1,
      });
      this.hideInstance(this.debrisMesh, i);
    }

    const sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 1.6);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffc060,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, 160);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.sparkMesh);
    for (let i = 0; i < 160; i++) {
      this.sparks.push({ active: false, pos: new THREE.Vector3(0, -1000, 0), vel: new THREE.Vector3(), life: 0, maxLife: 0.3 });
      this.hideInstance(this.sparkMesh, i);
    }
  }

  private hideInstance(mesh: THREE.InstancedMesh, slot: number): void {
    this.dummy.position.set(0, -1000, 0);
    this.dummy.scale.setScalar(0.001);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(slot, this.dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0x9fe3ff, life = 0.11): void {
    const i = this.tracerCursor++ % this.tracerData.length;
    const d = this.tracerData[i];
    d.active = true;
    d.life = life;
    d.maxLife = life;
    d.from.copy(from);
    d.to.copy(to);
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = Math.max(0.1, dir.length());
    this.dummy.position.copy(from).addScaledVector(dir, 0.5);
    this.dummy.quaternion.setFromUnitVectors(Z_AXIS, dir.normalize());
    this.dummy.scale.set(0.7, 0.7, len);
    this.dummy.updateMatrix();
    this.tracerMesh.setMatrixAt(i, this.dummy.matrix);
    this.tracerMesh.setColorAt(i, new THREE.Color(color));
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;
  }

  private spawnFlash(pos: THREE.Vector3, size: number, life: number, color: number): void {
    const f = this.flashes[this.flashCursor++ % this.flashes.length];
    f.life = life;
    f.maxLife = life;
    f.size = size;
    f.sprite.visible = true;
    f.sprite.position.copy(pos);
    f.sprite.scale.setScalar(size * 0.25);
    (f.sprite.material as THREE.SpriteMaterial).color.setHex(color);
    (f.sprite.material as THREE.SpriteMaterial).opacity = 0.9;
  }

  private spawnDebris(pos: THREE.Vector3, scale: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const d = this.debris[this.debrisCursor++ % this.debris.length];
      d.active = true;
      d.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10));
      d.vel.set((Math.random() - 0.5) * 95, 15 + Math.random() * 55, (Math.random() - 0.5) * 95).multiplyScalar(scale);
      d.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.rotVel.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      d.life = 0.8 + Math.random() * 0.8;
      d.maxLife = d.life;
      d.scale = (0.4 + Math.random() * 0.7) * Math.max(0.6, scale * 0.7);
    }
    void color;
  }

  private spawnSparks(pos: THREE.Vector3, scale: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkCursor++ % this.sparks.length];
      s.active = true;
      s.pos.copy(pos);
      s.vel.set((Math.random() - 0.5) * 220, (Math.random() - 0.1) * 160, (Math.random() - 0.5) * 220).multiplyScalar(scale);
      s.life = 0.18 + Math.random() * 0.32;
      s.maxLife = s.life;
    }
    void color;
  }

  explosion(pos: THREE.Vector3, scale = 1, color = 0xffa040, options: ExplosionOptions = {}): void {
    const surface = options.surface ?? 'air';
    const water = surface === 'water';
    const ground = surface === 'ground';
    const count = Math.round((water ? 0 : 24 + scale * 20) * (ground ? 0.65 : 1));
    for (let i = 0; i < count; i++) {
      const p = this.fireData[this.fireCursor++ % this.fireData.length];
      p.active = true;
      p.life = 0.45 + Math.random() * 0.55;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8));
      p.vel.set((Math.random() - 0.5) * 120, (Math.random() - 0.2) * 80, (Math.random() - 0.5) * 120).multiplyScalar(scale * (ground ? 0.55 : 0.8));
      p.gravity = -25;
      p.drag = 0.9;
      p.color.setHex(water ? 0xc8efff : color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
    }
    const smokeCount = Math.round((8 + scale * 5) * (water ? 1.5 : 1));
    for (let i = 0; i < smokeCount; i++) {
      const p = this.smokeData[this.smokeCursor++ % this.smokeData.length];
      p.active = true;
      p.life = 0.8 + Math.random() * 1.0;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
      p.vel.set((Math.random() - 0.5) * 30, 8 + Math.random() * 16, (Math.random() - 0.5) * 30).multiplyScalar(scale);
      p.drag = 0.86;
      p.color.setHex(water ? 0x9abac8 : ground ? 0x6b5c4a : 0x333536);
    }

    // 高亮核心和大火球
    this.spawnFlash(pos, (water ? 7 : 8) * scale, 0.1 + Math.min(0.05, scale * 0.015), water ? 0xd8f4ff : 0xfff2cf);
    if (!water) {
      const balls = Math.min(6, 2 + Math.floor(scale * 1.4));
      for (let i = 0; i < balls; i++) {
        const f = this.fireballs[this.fireballCursor++ % this.fireballs.length];
        f.life = 0.32 + Math.random() * 0.3;
        f.maxLife = f.life;
        f.size = (2.2 + Math.random() * 1.0) * scale;
        f.mesh.visible = true;
        f.mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10));
        f.vel.set((Math.random() - 0.5) * 38, 12 + Math.random() * 24, (Math.random() - 0.5) * 38);
        f.mesh.scale.setScalar(f.size * 0.4);
        (f.mesh.material as THREE.MeshBasicMaterial).color.setHex(i === 0 ? 0xffd27a : i === 1 ? 0xff8a32 : 0xd94822);
        (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.36;
      }
    }

    const debrisCount = water ? 0 : ground ? Math.round(2 * scale) : Math.round(3 + scale * 1.2);
    this.spawnDebris(pos, scale, debrisCount, 0x444444);
    this.spawnSparks(pos, scale, water ? 4 : Math.round(8 + scale * 2), color);
    this.shockwave(pos, 11 * scale, water ? 0xbfe8ff : color);
    if (scale > 2.4) this.shockwave(pos, 15 * scale, 0xffd080);
  }

  muzzle(pos: THREE.Vector3, size = 1.6, color = 0xffe0a0): void {
    this.spawnFlash(pos, size, 0.07, color);
  }

  trail(pos: THREE.Vector3, color = 0x4a4a4a): void {
    this.smoke(pos, color, 1);
  }

  hit(pos: THREE.Vector3, color = 0xffd080): void {
    for (let i = 0; i < 5; i++) {
      const p = this.fireData[this.fireCursor++ % this.fireData.length];
      p.active = true;
      p.life = 0.18 + Math.random() * 0.14;
      p.maxLife = p.life;
      p.pos.copy(pos);
      p.vel.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
      p.gravity = 0;
      p.drag = 0.85;
      p.color.setHex(color);
    }
    this.spawnSparks(pos, 0.35, 4, color);
  }

  smoke(pos: THREE.Vector3, color = 0x333333, count = 1): void {
    for (let i = 0; i < count; i++) {
      const p = this.smokeData[this.smokeCursor++ % this.smokeData.length];
      p.active = true;
      p.life = 0.9 + Math.random() * 0.8;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3));
      p.vel.set((Math.random() - 0.5) * 10, 4 + Math.random() * 8, (Math.random() - 0.5) * 10);
      p.drag = 0.9;
      p.color.setHex(color);
    }
  }

  shockwave(pos: THREE.Vector3, radius: number, color = 0xffc060): void {
    const ring = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    ring.life = 0.55;
    ring.maxLife = 0.55;
    ring.radius = radius;
    ring.mesh.visible = true;
    ring.mesh.position.copy(pos);
    ring.mesh.scale.setScalar(radius * 0.15);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42;
  }

  update(dt: number): void {
    // 曳光弹生命周期
    let tracerDirty = false;
    for (let i = 0; i < this.tracerData.length; i++) {
      const d = this.tracerData[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        this.dummy.position.set(0, -1000, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.tracerMesh.setMatrixAt(i, this.dummy.matrix);
        tracerDirty = true;
      }
    }
    if (tracerDirty) this.tracerMesh.instanceMatrix.needsUpdate = true;

    // 核心闪光
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life) / f.maxLife;
      f.sprite.visible = f.life > 0;
      f.sprite.scale.setScalar(f.size * (0.45 + (1 - k) * 1.1));
      (f.sprite.material as THREE.SpriteMaterial).opacity = 0.9 * k;
      if (f.life <= 0) f.sprite.visible = false;
    }

    // 火球
    for (const f of this.fireballs) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life) / f.maxLife;
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }
      f.vel.multiplyScalar(Math.pow(0.92, dt * 60));
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.scale.setScalar(f.size * (0.5 + (1 - k) * 1.35));
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.34 * k;
    }

    // 金属碎片
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        this.hideInstance(this.debrisMesh, i);
        continue;
      }
      d.vel.y -= 65 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.rot.x += d.rotVel.x * dt;
      d.rot.y += d.rotVel.y * dt;
      d.rot.z += d.rotVel.z * dt;
      this.dummy.position.copy(d.pos);
      this.dummy.rotation.copy(d.rot);
      this.dummy.scale.setScalar(d.scale * Math.max(0.25, Math.min(1, d.life / d.maxLife)));
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;

    // 火星
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        this.hideInstance(this.sparkMesh, i);
        continue;
      }
      s.vel.y -= 120 * dt;
      s.pos.addScaledVector(s.vel, dt);
      const speed = s.vel.length();
      this.dummy.position.copy(s.pos);
      if (speed > 0.01) this.dummy.quaternion.setFromUnitVectors(Z_AXIS, s.vel.clone().normalize());
      this.dummy.scale.set(1, 1, Math.max(0.4, speed * 0.012));
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;

    // 火粒子
    const fpos = this.firePoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fcol = this.firePoints.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.fireData.length; i++) {
      const p = this.fireData[i];
      if (!p.active) {
        fpos.setY(i, -1000);
        fcol.setXYZ(i, 0, 0, 0);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        fpos.setY(i, -1000);
        fcol.setXYZ(i, 0, 0, 0);
        continue;
      }
      const k = p.life / p.maxLife;
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
      fpos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      fcol.setXYZ(i, p.color.r * k, p.color.g * k, p.color.b * k);
    }
    fpos.needsUpdate = true;
    fcol.needsUpdate = true;

    // 烟粒子
    const spos = this.smokePoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const scol = this.smokePoints.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.smokeData.length; i++) {
      const p = this.smokeData[i];
      if (!p.active) {
        spos.setY(i, -1000);
        scol.setXYZ(i, 0, 0, 0);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        spos.setY(i, -1000);
        scol.setXYZ(i, 0, 0, 0);
        continue;
      }
      const k = Math.min(1, p.life / p.maxLife);
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
      spos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      const gray = 0.18 * k;
      scol.setXYZ(i, gray, gray * 0.96, gray * 0.9);
    }
    spos.needsUpdate = true;
    scol.needsUpdate = true;

    // 冲击波
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - Math.max(0, r.life) / r.maxLife;
      const s = r.radius * (0.15 + t * 1.2);
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - t);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  dispose(): void {
    this.tracerMesh.geometry.dispose();
    (this.tracerMesh.material as THREE.Material).dispose();
    this.firePoints.geometry.dispose();
    (this.firePoints.material as THREE.Material).dispose();
    this.smokePoints.geometry.dispose();
    (this.smokePoints.material as THREE.Material).dispose();
    this.softTex.dispose();
    for (const r of this.rings) {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    for (const f of this.flashes) {
      (f.sprite.material as THREE.SpriteMaterial).dispose();
    }
    let fireballGeo: THREE.BufferGeometry | null = null;
    for (const f of this.fireballs) {
      if (!fireballGeo) fireballGeo = f.mesh.geometry;
      (f.mesh.material as THREE.Material).dispose();
      f.mesh.removeFromParent();
    }
    fireballGeo?.dispose();
    this.debrisMesh.geometry.dispose();
    (this.debrisMesh.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.group.clear();
  }
}
