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
  private readonly dummy = new THREE.Object3D();
  private readonly softTex: THREE.CanvasTexture;
  private tracerCursor = 0;
  private fireCursor = 0;
  private smokeCursor = 0;

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
    const firePos = new Float32Array(260 * 3);
    const fireCol = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
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
        size: 4.2,
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
    const smokePos = new Float32Array(180 * 3);
    const smokeCol = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
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
        size: 8,
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
        new THREE.RingGeometry(0.86, 1, 48),
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

  explosion(pos: THREE.Vector3, scale = 1, color = 0xffa040): void {
    const count = Math.round(18 + scale * 12);
    for (let i = 0; i < count; i++) {
      const p = this.fireData[this.fireCursor++ % this.fireData.length];
      p.active = true;
      p.life = 0.45 + Math.random() * 0.55;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8));
      p.vel.set((Math.random() - 0.5) * 120, (Math.random() - 0.2) * 80, (Math.random() - 0.5) * 120).multiplyScalar(scale * 0.8);
      p.gravity = -25;
      p.drag = 0.9;
      p.color.setHex(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
    }
    for (let i = 0; i < 8; i++) {
      const p = this.smokeData[this.smokeCursor++ % this.smokeData.length];
      p.active = true;
      p.life = 0.8 + Math.random() * 1.0;
      p.maxLife = p.life;
      p.pos.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
      p.vel.set((Math.random() - 0.5) * 30, 8 + Math.random() * 16, (Math.random() - 0.5) * 30).multiplyScalar(scale);
      p.drag = 0.86;
      p.color.setHex(0x3a3a3a);
    }
    this.shockwave(pos, 22 * scale, color);
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
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
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
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
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
    this.group.clear();
  }
}
