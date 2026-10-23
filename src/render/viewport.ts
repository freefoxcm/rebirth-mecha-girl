import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { QUALITY_PRESETS } from '../data/config';
import type { QualityLevel } from '../data/types';
import { createEnvironmentMap } from './jets';

const finalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.85 },
    uGrain: { value: 0.7 },
    uSpeed: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uSpeed;
    uniform float uDamage;
    uniform float uFlash;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float radius = length(centered);
      float ca = (uSpeed * 0.0035 + uDamage * 0.0045) * radius;
      vec3 color;
      color.r = texture2D(tDiffuse, uv + centered * ca).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - centered * ca).b;

      float vig = smoothstep(0.92, 0.22, radius);
      color *= mix(1.0, vig, uVignette);

      float grain = hash(uv * uResolution + fract(uTime) * 91.7) - 0.5;
      color += grain * 0.055 * uGrain;

      float edge = smoothstep(0.16, 0.72, radius);
      color = mix(color, vec3(0.58, 0.03, 0.02), edge * clamp(uDamage, 0.0, 1.0) * 0.55);
      color = mix(color, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly camera: THREE.PerspectiveCamera;
  readonly finalPass: ShaderPass;
  readonly environment: THREE.Texture;
  private readonly bloom: UnrealBloomPass;
  private readonly renderPass: RenderPass;
  private quality: QualityLevel = 'high';
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0a0f15, 1);
    this.renderer.info.autoReset = false;
    this.environment = createEnvironmentMap(this.renderer);

    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 1, 6000);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1600, 900), 0.52, 0.4, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finalPass = new ShaderPass(finalShader);
    this.composer.addPass(this.finalPass);

    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    this.setQuality('high');
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const preset = QUALITY_PRESETS[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.dpr));
    this.renderer.shadowMap.enabled = preset.shadow;
    this.bloom.enabled = preset.bloom;
    this.bloom.strength = quality === 'high' ? 0.55 : 0.3;
    this.finalPass.uniforms.uGrain.value = preset.grain;
    this.resize();
  }

  get qualityLevel(): QualityLevel {
    return this.quality;
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.finalPass.uniforms.uResolution.value.set(size.x, size.y);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.finalPass.uniforms.uTime.value = time;
    this.renderer.info.reset();
    this.composer.render();
  }

  setEffects(speed: number, damage: number, flash = 0): void {
    this.finalPass.uniforms.uSpeed.value = speed;
    this.finalPass.uniforms.uDamage.value = damage;
    this.finalPass.uniforms.uFlash.value = flash;
  }

  get stats(): { calls: number; triangles: number } {
    const info = this.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles };
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.composer.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
