import * as THREE from 'three';
import type { TimeOfDay } from '../data/types';

interface Preset {
  zenith: number;
  horizon: number;
  sun: number;
  sunDir: THREE.Vector3;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogDensity: number;
  exposure: number;
  lightColor: number;
  cloudOpacity: number;
}

const PRESETS: Record<TimeOfDay, Preset> = {
  golden: {
    zenith: 0x23536f,
    horizon: 0xf2b783,
    sun: 0xffd28a,
    sunDir: new THREE.Vector3(-0.62, 0.33, 0.55).normalize(),
    sunIntensity: 3.7,
    hemiSky: 0xb6d0de,
    hemiGround: 0x8a6a4c,
    hemiIntensity: 1.05,
    fog: 0xdcb58c,
    fogDensity: 0.00017,
    exposure: 1.22,
    lightColor: 0xffce8c,
    cloudOpacity: 0.44,
  },
  blue: {
    zenith: 0x081226,
    horizon: 0x35527a,
    sun: 0x9fc8ff,
    sunDir: new THREE.Vector3(0.5, 0.22, 0.5).normalize(),
    sunIntensity: 2.3,
    hemiSky: 0x6a8aa8,
    hemiGround: 0x18222c,
    hemiIntensity: 0.9,
    fog: 0x22384f,
    fogDensity: 0.00022,
    exposure: 1.24,
    lightColor: 0xc0d8f0,
    cloudOpacity: 0.3,
  },
  dusk: {
    zenith: 0x231b33,
    horizon: 0xd06a45,
    sun: 0xff9a55,
    sunDir: new THREE.Vector3(0.55, 0.24, 0.5).normalize(),
    sunIntensity: 2.9,
    hemiSky: 0x8a7088,
    hemiGround: 0x30262c,
    hemiIntensity: 0.82,
    fog: 0x5a4450,
    fogDensity: 0.0002,
    exposure: 1.16,
    lightColor: 0xffa470,
    cloudOpacity: 0.4,
  },
  storm: {
    zenith: 0x0c1319,
    horizon: 0x394a54,
    sun: 0xa9bcc4,
    sunDir: new THREE.Vector3(-0.35, 0.4, 0.45).normalize(),
    sunIntensity: 1.9,
    hemiSky: 0x667880,
    hemiGround: 0x161d22,
    hemiIntensity: 0.72,
    fog: 0x263238,
    fogDensity: 0.00034,
    exposure: 1.08,
    lightColor: 0xb8c8d0,
    cloudOpacity: 0.55,
  },
};

function sunTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,246,1)');
  g.addColorStop(0.12, 'rgba(255,244,208,0.95)');
  g.addColorStop(0.35, 'rgba(255,206,140,0.38)');
  g.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 26; i++) {
    const x = 90 + rand() * 332;
    const y = 90 + rand() * 80;
    const r = 26 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.05 + rand() * 0.12;
    g.addColorStop(0, `rgba(255,246,232,${alpha})`);
    g.addColorStop(0.55, `rgba(255,236,214,${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(255,230,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 天空、太阳、云、雾和主光的统一环境，切换关卡时段只改参数。 */
export class WorldEnvironment {
  readonly scene: THREE.Scene;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly sunTarget: THREE.Object3D;
  private readonly sky: THREE.Mesh;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sunSprite: THREE.Sprite;
  private readonly clouds: THREE.Sprite[] = [];
  private preset: Preset;
  private time = 0;

  constructor(scene: THREE.Scene, timeOfDay: TimeOfDay = 'golden') {
    this.scene = scene;
    this.preset = PRESETS[timeOfDay];

    const geo = new THREE.SphereGeometry(4600, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(this.preset.zenith) },
        uHorizon: { value: new THREE.Color(this.preset.horizon) },
        uSunColor: { value: new THREE.Color(this.preset.sun) },
        uSunDir: { value: this.preset.sunDir.clone() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld);
          float h = clamp(dir.y, -1.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.04, 0.62, h));
          float d = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(d, 240.0) * 1.8;
          col += uSunColor * pow(d, 7.0) * 0.17;
          float haze = exp(-abs(h) * 7.0);
          col = mix(col, uHorizon, haze * 0.32);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -20;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const sunMat = new THREE.SpriteMaterial({
      map: sunTexture(),
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.95,
      fog: false,
    });
    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.scale.setScalar(420);
    this.sunSprite.position.copy(this.preset.sunDir).multiplyScalar(3800);
    scene.add(this.sunSprite);

    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTexture(1234 + i * 977),
        transparent: true,
        depthWrite: false,
        opacity: this.preset.cloudOpacity,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      const angle = (i / 16) * Math.PI * 2 + (i % 3) * 0.17;
      const radius = 2100 + (i % 5) * 340;
      sprite.position.set(Math.cos(angle) * radius, 330 + (i % 7) * 105, Math.sin(angle) * radius);
      sprite.scale.set(900 + (i % 4) * 260, 300 + (i % 3) * 110, 1);
      sprite.userData.drift = 0.6 + (i % 4) * 0.25;
      sprite.userData.angle = angle;
      sprite.userData.radius = radius;
      sprite.userData.y = sprite.position.y;
      this.clouds.push(sprite);
      scene.add(sprite);
    }

    this.scene.fog = new THREE.FogExp2(this.preset.fog, this.preset.fogDensity);

    this.hemi = new THREE.HemisphereLight(this.preset.hemiSky, this.preset.hemiGround, this.preset.hemiIntensity);
    scene.add(this.hemi);
    scene.add(new THREE.AmbientLight(0xffe2c4, 0.55));

    this.sun = new THREE.DirectionalLight(this.preset.lightColor, this.preset.sunIntensity);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -320;
    cam.right = 320;
    cam.top = 320;
    cam.bottom = -320;
    cam.near = 20;
    cam.far = 1400;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.55;
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;
    this.applyPreset(timeOfDay);
  }

  applyPreset(timeOfDay: TimeOfDay): void {
    const p = PRESETS[timeOfDay];
    this.preset = p;
    this.skyMat.uniforms.uZenith.value.setHex(p.zenith);
    this.skyMat.uniforms.uHorizon.value.setHex(p.horizon);
    this.skyMat.uniforms.uSunColor.value.setHex(p.sun);
    this.skyMat.uniforms.uSunDir.value.copy(p.sunDir);
    this.sun.color.setHex(p.lightColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    (this.scene.fog as THREE.FogExp2).color.setHex(p.fog);
    (this.scene.fog as THREE.FogExp2).density = p.fogDensity;
    this.sunSprite.position.copy(p.sunDir).multiplyScalar(3800);
    for (const c of this.clouds) (c.material as THREE.SpriteMaterial).opacity = p.cloudOpacity;
    this.rendererExposure = p.exposure;
  }

  private rendererExposure = 1.05;

  get exposure(): number {
    return this.rendererExposure;
  }

  /** 主光跟随玩家，保证近景始终有阴影。 */
  focus(x: number, z: number): void {
    this.sunTarget.position.set(x, 0, z);
    this.sun.position
      .set(x + this.preset.sunDir.x * 620, this.preset.sunDir.y * 620, z + this.preset.sunDir.z * 620);
  }

  update(dt: number): void {
    this.time += dt;
    for (const c of this.clouds) {
      const a = (c.userData.angle as number) + this.time * 0.004 * (c.userData.drift as number);
      const r = c.userData.radius as number;
      c.position.x = Math.cos(a) * r;
      c.position.z = Math.sin(a) * r;
      c.position.y = (c.userData.y as number) + Math.sin(this.time * 0.15 + a * 3) * 6;
    }
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    (this.sunSprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.sunSprite.material as THREE.SpriteMaterial).dispose();
    for (const c of this.clouds) {
      (c.material as THREE.SpriteMaterial).map?.dispose();
      (c.material as THREE.SpriteMaterial).dispose();
    }
  }
}
