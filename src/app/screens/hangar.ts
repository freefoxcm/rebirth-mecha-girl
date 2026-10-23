import * as THREE from 'three';
import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { GirlId, GirlSpec } from '../../data/types';
import { GIRLS, GIRL_ORDER } from '../../data/girls';
import { UPGRADES, type UpgradeId } from '../../data/config';
import { assetUrl } from '../../core/assets';
import { formatNumber } from '../../core/math';
import { button, div, icon } from '../../ui/dom';
import { buildGirlJet, type JetVisual } from '../../render/jets';

const STAGE_NAMES = ['人形锁定', '翼板解锁', '前倾收纳', '机身成形', '飞行面锁定', '战机完成'];

function labelTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = '700 120px Bahnschrift, Arial Narrow, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(242, 176, 30, 0.55)';
  ctx.fillText(text, 512, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HangarScreen extends BaseScreen {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private jet: JetVisual | null = null;
  private ring!: THREE.Mesh;
  private stageGroup!: THREE.Group;
  private girl!: GirlSpec;
  private from: 'title' | 'hub' = 'hub';
  private rosterHost!: HTMLDivElement;
  private detailHost!: HTMLDivElement;
  private stageLabel!: HTMLDivElement;
  private alloyNode: HTMLElement | null = null;
  private time = 0;
  private lastAspect = 0;

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('hangar-screen');
    this.app.exposure = 1.12;
    this.from = params?.from === 'title' ? 'title' : 'hub';
    this.girl = GIRLS[this.app.save.selectedGirl];
    const bgGirl = this.girl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05080c);
    this.scene.fog = new THREE.FogExp2(0x05080c, 0.022);
    if (this.app.viewport) this.scene.environment = this.app.viewport.environment;

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 120);
    this.camera.position.set(9, 8.6, 24);
    this.camera.lookAt(0, 2.4, 0);

    this.buildSet();

    const top = div('topbar');
    const back = button(`${icon('back', 14)} ${this.from === 'title' ? '返回标题' : '返回母舰'}`, () => {
      this.go(this.from);
    }, 'bare', 'hangar-back');
    const brand = div('topbar-brand');
    brand.innerHTML = `<span class="brand-mark"></span><span class="brand-name">机库</span><i>/</i><span>HANGAR BAY 07</span>`;
    const right = div('topbar-right');
    right.innerHTML = `
      <span class="hangar-alloy">${icon('alloy', 13)} <b>${formatNumber(this.app.save.data.economy.alloy)}</b></span>
      <span class="hangar-status"><i></i> 灵契稳定</span>`;
    this.alloyNode = right.querySelector('.hangar-alloy b') as HTMLElement;
    top.append(back, brand, right);

    this.rosterHost = div('hangar-roster');
    const rosterHead = div('roster-head');
    rosterHead.innerHTML = `<span class="kicker">AIRFRAME ROSTER</span><strong>五系机娘</strong><small>${this.app.save.data.unlocks.girls.length} / 5 LINKED</small>`;
    this.rosterHost.appendChild(rosterHead);
    GIRL_ORDER.forEach((id) => this.rosterHost.appendChild(this.rosterItem(id)));
    const rosterFoot = div('roster-foot');
    const deformBtn = button(`${icon('play', 13)} 六段变形演示`, () => this.openTransform(), 'ghost', 'deform-btn');
    rosterFoot.appendChild(deformBtn);
    this.rosterHost.appendChild(rosterFoot);

    this.detailHost = div('hangar-detail');
    const stageFrame = div('hangar-stage-frame');
    stageFrame.innerHTML = `
      <span class="hs-corner tl"></span><span class="hs-corner tr"></span>
      <span class="hs-corner bl"></span><span class="hs-corner br"></span>`;
    this.stageLabel = div('hangar-stage-label');
    this.stageLabel.innerHTML = `
      <span class="kicker">HOLOGRAPHIC DISPLAY / ${bgGirl.en}</span>
      <b>${bgGirl.name}</b>
      <small>${bgGirl.role}</small>`;

    const bottom = div('hangar-bottom');
    bottom.innerHTML = `
      <div class="hangar-hint">${icon('info', 12)} 点击机体切换 · 升级后立即生效 · 灵契同步 100%</div>
      <div class="hangar-serial">QIXIA CV-07 / BAY 07 / ${bgGirl.en}</div>`;

    this.root.append(top, this.rosterHost, stageFrame, this.stageLabel, this.detailHost, bottom);
    this.renderDetail();
    this.buildJetFor(this.girl.id);

    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape') this.go(this.from);
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const dir = e.code === 'ArrowRight' ? 1 : -1;
        const unlocked = GIRL_ORDER.filter((id) => this.app.save.isGirlUnlocked(id));
        const current = unlocked.indexOf(this.girl.id);
        const next = unlocked[(current + dir + unlocked.length) % unlocked.length];
        this.selectGirl(next);
      }
    });
    this.app.audio.startMusic('menu');
  }

  private buildSet(): void {
    const scene = this.scene;

    const hemi = new THREE.HemisphereLight(0x8fb4c8, 0x1a1612, 0.55);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffcf96, 2.6);
    key.position.set(9, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0008;
    scene.add(key);

    const rim = new THREE.PointLight(0x4fd8e8, 45, 30, 2);
    rim.position.set(-8, 5, -4);
    scene.add(rim);
    const warm = new THREE.PointLight(0xff9a4a, 32, 26, 2);
    warm.position.set(7, 4, -6);
    scene.add(warm);

    // 机库圆筒
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a1016, roughness: 0.7, metalness: 0.4, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 26, 36, 1, true), wallMat);
    wall.position.y = 12;
    scene.add(wall);

    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1b252f, roughness: 0.5, metalness: 0.7 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 24, 0.5), beamMat);
      beam.position.set(Math.cos(a) * 28, 12, Math.sin(a) * 28);
      scene.add(beam);
      if (i % 2 === 0) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 8, 0.08),
          new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0x5fd8e8 : 0xf2b01e, toneMapped: false }),
        );
        strip.position.set(Math.cos(a) * 27.4, 13, Math.sin(a) * 27.4);
        scene.add(strip);
      }
    }

    // 后方舱壁与舱门灯带
    const wallMat2 = new THREE.MeshStandardMaterial({ color: 0x0a1118, roughness: 0.78, metalness: 0.25, side: THREE.DoubleSide });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(58, 22), wallMat2);
    backWall.position.set(0, 9, -25);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const frameMat = new THREE.MeshBasicMaterial({ color: 0x5fd8e8, transparent: true, opacity: 0.55, toneMapped: false });
    for (const x of [-10, 10]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 16, 0.12), frameMat);
      strip.position.set(x, 8, -24.8);
      scene.add(strip);
    }
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(20.1, 0.12, 0.12), frameMat);
    topStrip.position.set(0, 16, -24.8);
    scene.add(topStrip);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.25),
      new THREE.MeshBasicMaterial({ map: labelTexture('HANGAR 07'), transparent: true, depthWrite: false, toneMapped: false }),
    );
    label.position.set(0, 10.2, -24.7);
    scene.add(label);

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x1a222a, roughness: 0.6, metalness: 0.35 });
    for (const [x, z, s] of [
      [-15, -4, 1.4],
      [-17.5, -6, 1.0],
      [15, -7, 1.2],
      [17, -3, 0.9],
    ]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 1.3, s * 2), crateMat);
      crate.position.set(x, s * 0.65, z);
      crate.castShadow = true;
      crate.receiveShadow = true;
      scene.add(crate);
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(s * 0.8, 0.04, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xf2b01e, toneMapped: false }),
      );
      lamp.position.set(x, s * 1.0, z + s);
      scene.add(lamp);
    }

    // 地面
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 0.55, metalness: 0.35 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(70, 35, 0x1c3a44, 0x10232a);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    grid.position.y = 0.01;
    scene.add(grid);

    // 停机圆台
    const padMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.4, metalness: 0.65 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9.4, 9.8, 0.35, 64), padMat);
    pad.position.y = 0.18;
    pad.receiveShadow = true;
    scene.add(pad);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(9.0, 0.06, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xf2b01e, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.39;
    scene.add(this.ring);

    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(10.6, 0.025, 6, 96),
      new THREE.MeshBasicMaterial({ color: 0x5fd8e8, transparent: true, opacity: 0.35, toneMapped: false }),
    );
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.4;
    scene.add(ring2);

    // 背景警示条
    for (let i = 0; i < 2; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.06, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xf2b01e, transparent: true, opacity: 0.35, toneMapped: false }),
      );
      bar.position.set(0, 0.44, i === 0 ? -12 : 12);
      scene.add(bar);
    }

    this.stageGroup = new THREE.Group();
    scene.add(this.stageGroup);
  }

  private buildJetFor(id: GirlId): void {
    if (this.jet) {
      this.stageGroup.remove(this.jet.group);
      this.jet.dispose();
      this.jet = null;
    }
    const girl = GIRLS[id];
    const jet = buildGirlJet(girl.jet, girl.palette);
    jet.setGear(true);
    jet.setThrottle(0.18);
    jet.group.scale.setScalar(0.74);
    jet.group.position.set(0, 1.55, 0);
    jet.group.rotation.y = 0.86;
    jet.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.stageGroup.add(jet.group);
    this.jet = jet;
  }

  private rosterItem(id: GirlId): HTMLButtonElement {
    const girl = GIRLS[id];
    const unlocked = this.app.save.isGirlUnlocked(id);
    const selected = id === this.girl.id;
    const trust = this.app.save.getTrust(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `roster-item ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`;
    btn.innerHTML = `
      <span class="roster-face" style="background-image:url('${assetUrl(girl.art.face)}')"></span>
      <span class="roster-body">
        <span class="roster-name">${girl.name}<small>${girl.en}</small></span>
        <span class="roster-role">${girl.role}</span>
        <span class="roster-trust">${[0, 1, 2].map((i) => `<i class="${i < trust ? 'on' : ''}"></i>`).join('')}</span>
      </span>
      <span class="roster-lock">${unlocked ? (selected ? '当前' : '') : icon('lock', 14)}</span>`;
    btn.addEventListener('click', () => {
      if (!unlocked) {
        this.app.toast(`通关「${girl.unlockAfter ? '第' + (girl.unlockAfter === 'm1' ? '一' : girl.unlockAfter === 'm2' ? '二' : '三') + '话' : '序章'}」后解锁`, 'warn');
        this.app.audio.play('back');
        return;
      }
      this.selectGirl(id);
    });
    return btn;
  }

  private selectGirl(id: GirlId): void {
    if (!this.app.save.isGirlUnlocked(id) || this.girl.id === id) return;
    this.girl = GIRLS[id];
    this.app.audio.play('ui');
    this.buildJetFor(id);
    this.renderRoster();
    this.renderDetail();
    this.stageLabel.innerHTML = `
      <span class="kicker">HOLOGRAPHIC DISPLAY / ${this.girl.en}</span>
      <b>${this.girl.name}</b>
      <small>${this.girl.role}</small>`;
  }

  private renderRoster(): void {
    const nodes = this.rosterHost.querySelectorAll('.roster-item');
    nodes.forEach((node) => node.remove());
    GIRL_ORDER.forEach((id) => this.rosterHost.appendChild(this.rosterItem(id)));
    // 把按钮插到头部之后
    const items = [...this.rosterHost.querySelectorAll('.roster-item')];
    const head = this.rosterHost.querySelector('.roster-head');
    if (head) items.forEach((item) => head.insertAdjacentElement('afterend', item));
  }

  private renderDetail(): void {
    const girl = this.girl;
    const trust = this.app.save.getTrust(girl.id);
    const trustLine = girl.trustLines[Math.min(2, trust)];
    const isSelected = this.app.save.selectedGirl === girl.id;
    this.detailHost.innerHTML = '';

    const head = div('detail-head');
    head.innerHTML = `
      <div class="detail-kicker">${girl.en} / ${girl.role}</div>
      <h2>${girl.name}</h2>
      <p>${girl.bio}</p>`;
    this.detailHost.appendChild(head);

    const quote = div('detail-quote');
    quote.innerHTML = `
      <span class="quote-mark">“</span>
      <p>${trustLine}</p>
      <span class="quote-trust">信赖 ${trust} / 3 ${[0, 1, 2].map((i) => `<i class="${i < trust ? 'on' : ''}"></i>`).join('')}</span>`;
    this.detailHost.appendChild(quote);

    const special = div('detail-special');
    special.innerHTML = `
      <span class="kicker">SPECIAL / E</span>
      <b>${girl.special.name}</b>
      <p>${girl.special.desc}</p>
      <small>冷却 ${this.app.save.getLoadoutStats(girl.id).specialCooldown.toFixed(0)}s · ${girl.special.quote}</small>`;
    this.detailHost.appendChild(special);

    const stats = div('detail-stats');
    const st = this.app.save.getLoadoutStats(girl.id);
    stats.innerHTML = `
      ${this.statBar('装甲', st.maxHp, 150)}
      ${this.statBar('极速', st.speed, 200)}
      ${this.statBar('转向', st.turn, 82)}
      ${this.statBar('火力', st.gunDamage, 1.35)}`;
    this.detailHost.appendChild(stats);

    const upgrades = div('detail-upgrades');
    upgrades.innerHTML = `<div class="upgrade-head"><span class="kicker">UPGRADES</span><span>合金 ${formatNumber(this.app.save.data.economy.alloy)}</span></div>`;
    (Object.keys(UPGRADES) as UpgradeId[]).forEach((key) => {
      const def = UPGRADES[key];
      const level = this.app.save.upgradeLevel(key);
      const cost = this.app.save.upgradeCost(key);
      const row = div('upgrade-row');
      const info = div('upgrade-info');
      info.innerHTML = `<b>${def.name}</b><small>${def.desc}</small>`;
      const side = div('upgrade-side');
      const pips = div('upgrade-pips');
      pips.innerHTML = [0, 1, 2].map((i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
      const buy = button(
        cost === null ? 'MAX' : `${icon('alloy', 10)} ${cost}`,
        () => {
          if (this.app.save.buyUpgrade(key)) {
            this.app.audio.play('confirm');
            this.app.toast(`${def.name} 已强化`);
            this.renderDetail();
          } else {
            this.app.audio.play('back');
            this.app.toast('合金不足', 'warn');
          }
        },
        cost === null ? 'bare' : 'ghost',
        'upgrade-buy',
      );
      buy.disabled = cost === null || this.app.save.data.economy.alloy < cost;
      side.append(pips, buy);
      row.append(info, side);
      upgrades.appendChild(row);
    });
    this.detailHost.appendChild(upgrades);
    if (this.alloyNode) this.alloyNode.textContent = formatNumber(this.app.save.data.economy.alloy);

    const actions = div('detail-actions');
    const select = button(isSelected ? `${icon('check', 15)} 当前出击机体` : '设为出击机体', () => {
      if (isSelected) return;
      this.app.save.selectGirl(girl.id);
      this.app.audio.play('confirm');
      this.app.toast(`${girl.name} 已设为出击机体`);
      this.renderRoster();
      this.renderDetail();
      this.stageLabel.innerHTML = `
        <span class="kicker">HOLOGRAPHIC DISPLAY / ${girl.en}</span>
        <b>${girl.name}</b>
        <small>${girl.role}</small>`;
    }, isSelected ? 'ghost' : 'primary', 'detail-select');
    select.disabled = isSelected;
    actions.appendChild(select);
    this.detailHost.appendChild(actions);
  }

  private statBar(label: string, value: number, max: number): string {
    const pct = Math.max(5, Math.min(100, (value / max) * 100));
    return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${Math.round(value)}</b></div>`;
  }

  private openTransform(): void {
    const girl = this.girl;
    let index = 0;
    let timer = 0;
    const backdrop = div('modal-backdrop transform-modal');
    const panel = div('transform-panel panel');
    const img = div('transform-img');
    const caption = div('transform-caption');
    const dots = div('transform-dots');
    const controls = div('transform-controls');
    const update = () => {
      img.style.backgroundImage = `url("${assetUrl(girl.art.stages[index])}")`;
      caption.innerHTML = `<span>STAGE ${String(index + 1).padStart(2, '0')} / 06</span><b>${STAGE_NAMES[index]}</b>`;
      dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === index));
    };
    dots.innerHTML = STAGE_NAMES.map(() => '<i></i>').join('');
    const prev = button('上一段', () => {
      index = (index + 5) % 6;
      update();
    }, 'ghost');
    const next = button('下一段', () => {
      index = (index + 1) % 6;
      update();
    }, 'ghost');
    const auto = button('自动播放', () => {
      if (timer) {
        window.clearInterval(timer);
        timer = 0;
        auto.textContent = '自动播放';
      } else {
        auto.textContent = '停止播放';
        timer = window.setInterval(() => {
          index = (index + 1) % 6;
          update();
        }, 1300);
      }
    }, 'ghost');
    const close = button('关闭', () => {
      if (timer) window.clearInterval(timer);
      backdrop.remove();
    }, 'primary');
    controls.append(prev, next, auto, close);
    const title = div('transform-title');
    title.innerHTML = `<span class="kicker">TRANSFORMATION SEQUENCE</span><b>${girl.name} · 人形 ⇄ 战机</b>`;
    panel.append(title, img, caption, dots, controls);
    backdrop.appendChild(panel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (timer) window.clearInterval(timer);
        backdrop.remove();
      }
    });
    this.root.appendChild(backdrop);
    update();
    this.addCleanup(() => {
      if (timer) window.clearInterval(timer);
      backdrop.remove();
    });
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.jet) return;
    this.jet.group.rotation.y += dt * 0.1;
    this.jet.group.position.y = 1.55 + Math.sin(this.time * 0.9) * 0.025;
    this.jet.inner.rotation.z = Math.sin(this.time * 0.6) * 0.015;
    this.ring.rotation.z += dt * 0.05;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect !== this.lastAspect) {
      this.lastAspect = aspect;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const px = this.app.input.pointerNdc.x;
    const py = this.app.input.pointerNdc.y;
    this.camera.position.x += (9 + px * 1.2 - this.camera.position.x) * 0.03;
    this.camera.position.y += (8.6 - py * 0.6 - this.camera.position.y) * 0.03;
    this.camera.lookAt(0, 2.4, 0);
  }

  backdrop(): { scene: THREE.Scene; camera: THREE.Camera } {
    return { scene: this.scene, camera: this.camera };
  }

  exit(): void {
    super.exit();
    if (this.jet) {
      this.stageGroup.remove(this.jet.group);
      this.jet.dispose();
      this.jet = null;
    }
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.scene.clear();
  }
}
