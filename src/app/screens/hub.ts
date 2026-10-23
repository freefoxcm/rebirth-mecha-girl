import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { GirlSpec, MissionId } from '../../data/types';
import { GIRLS } from '../../data/girls';
import { MISSIONS, MISSION_ORDER } from '../../data/missions';
import { MEDAL_RULES } from '../../data/config';
import { assetUrl } from '../../core/assets';
import { formatNumber } from '../../core/math';
import { button, div, icon } from '../../ui/dom';

const NODE_POS: Record<MissionId, { x: number; y: number; label: string }> = {
  m1: { x: 206, y: 320, label: '西收费站' },
  m2: { x: 646, y: 442, label: '港湾' },
  m3: { x: 592, y: 186, label: '金融区' },
  m4: { x: 760, y: 524, label: '天枢空域' },
};

export class HubScreen extends BaseScreen {
  private selected = 0;
  private mapHost!: HTMLDivElement;
  private listHost!: HTMLDivElement;
  private previewHost!: HTMLDivElement;
  private readoutHost!: HTMLDivElement;
  private launchBtn!: HTMLButtonElement;
  private girl: GirlSpec;

  constructor(app: App) {
    super(app);
    this.girl = GIRLS[this.app.save.selectedGirl];
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('hub-screen');
    const next = typeof params?.mission === 'string' ? (params.mission as MissionId) : this.app.save.getNextMission();
    const nextIndex = Math.max(0, MISSION_ORDER.indexOf(next));
    this.selected = this.app.save.isMissionUnlocked(next) ? nextIndex : this.firstUnlockedIndex();

    const bg = div('hub-bg');
    bg.innerHTML = `<div class="hub-grid"></div><div class="hub-glow"></div><div class="hub-noize"></div>`;

    const top = div('topbar');
    const brand = div('topbar-brand');
    brand.innerHTML = `<span class="brand-mark"></span><span class="brand-name">栖霞号</span><i>/</i><span>OPERATIONS</span>`;
    const mid = div('topbar-mid');
    mid.innerHTML = `<span>天穹历 073</span><i></i><span>临港战区</span><i></i><span>${this.app.save.data.progress.completed.length} / ${MISSION_ORDER.length} 作战完成</span>`;
    const right = div('topbar-right');
    const alloy = button(`${icon('alloy', 14)}<b>${formatNumber(this.app.save.data.economy.alloy)}</b>`, () => {
      this.go('hangar', { from: 'hub' });
    }, 'bare', 'alloy-chip');
    alloy.setAttribute('data-silent', 'true');
    const pilot = button(
      `<span class="mini-face" style="background-image:url('${assetUrl(this.girl.art.face)}')"></span><span>${this.girl.name}</span>`,
      () => this.go('hangar', { from: 'hub' }),
      'bare',
      'pilot-chip',
    );
    pilot.setAttribute('data-silent', 'true');
    right.append(alloy, pilot);
    top.append(brand, mid, right);

    const main = div('hub-main');

    const mapPanel = div('map-panel panel');
    const mapHead = div('map-head');
    mapHead.innerHTML = `
      <div><span class="kicker">TACTICAL MAP</span><strong>临港战区 · 空域态势</strong></div>
      <div class="map-coords">31°14'N / 121°29'E<br>ALT 8,000 · WIND 12KT</div>`;
    this.mapHost = div('map-stage');
    const mapFoot = div('map-foot');
    this.readoutHost = div('map-readout');
    mapFoot.append(this.readoutHost, div('map-legend', `
      <span><i class="lg lg-active"></i>当前</span>
      <span><i class="lg lg-done"></i>已通关</span>
      <span><i class="lg lg-lock"></i>锁定</span>`));
    mapPanel.append(mapHead, this.mapHost, mapFoot);

    const missionPanel = div('mission-panel panel');
    const listHead = div('panel-title');
    listHead.innerHTML = `<div><span class="kicker">SORTIE LIST</span><strong>作战列表</strong></div><span class="panel-count">04</span>`;
    this.listHost = div('mission-list');
    this.previewHost = div('mission-preview');
    const launchBar = div('launch-bar');
    this.launchBtn = button(`${icon('play', 16)} 出击`, () => this.launch(), 'primary', 'launch-btn');
    launchBar.innerHTML = `<div class="launch-note"><span>ENTER</span> 确认出击 · <span>↑↓</span> 选择</div>`;
    launchBar.appendChild(this.launchBtn);
    missionPanel.append(listHead, this.listHost, this.previewHost, launchBar);

    main.append(mapPanel, missionPanel);

    const footer = div('hub-footer');
    const girlCard = div('girl-card');
    this.renderGirlCard(girlCard);
    const nav = div('hub-nav');
    nav.append(
      this.navButton('机库', 'hangar', () => this.go('hangar', { from: 'hub' })),
      this.navButton('档案', 'codex', () => this.go('codex', { from: 'hub' })),
      this.navButton('设置', 'settings', () => this.go('settings', { from: 'hub' })),
    );
    const back = button(`${icon('back', 14)} 返回标题`, () => this.go('title'), 'bare', 'back-title');
    back.setAttribute('data-silent', 'true');
    footer.append(girlCard, nav, back);

    this.root.append(bg, top, main, footer);
    this.renderAll();
    this.bindKeys();
    this.app.audio.startMusic('menu');
  }

  private firstUnlockedIndex(): number {
    for (let i = 0; i < MISSION_ORDER.length; i++) {
      if (this.app.save.isMissionUnlocked(MISSION_ORDER[i])) return i;
    }
    return 0;
  }

  private renderAll(): void {
    this.renderMap();
    this.renderList();
    this.renderPreview();
    this.renderReadout();
    this.launchBtn.disabled = !this.app.save.isMissionUnlocked(MISSION_ORDER[this.selected]);
  }

  private renderMap(): void {
    const selectedId = MISSION_ORDER[this.selected];
    const nodes = MISSION_ORDER.map((id, i) => {
      const pos = NODE_POS[id];
      const locked = !this.app.save.isMissionUnlocked(id);
      const done = this.app.save.isMissionCompleted(id);
      const selected = i === this.selected;
      const cls = `map-node ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''} ${selected ? 'is-selected' : ''}`;
      return `
        <g class="${cls}" transform="translate(${pos.x} ${pos.y})">
          ${selected ? '<circle class="node-ring" r="30"></circle><circle class="node-ring node-ring-2" r="42"></circle>' : ''}
          <circle class="node-dot" r="7"></circle>
          <text class="node-index" x="0" y="3.5" text-anchor="middle">${String(i + 1).padStart(2, '0')}</text>
          <text class="node-label" x="18" y="-12">${pos.label}</text>
          <text class="node-state" x="18" y="6">${locked ? 'LOCKED' : done ? 'CLEARED' : 'READY'}</text>
        </g>`;
    }).join('');

    const routes = MISSION_ORDER.slice(0, -1)
      .map((id, i) => {
        const a = NODE_POS[id];
        const b = NODE_POS[MISSION_ORDER[i + 1]];
        return `<line class="route-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
      })
      .join('');

    this.mapHost.innerHTML = `
      <svg class="tac-map" viewBox="0 0 900 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(120,180,200,.11)" stroke-width=".6"/>
          </pattern>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#0d1720"/>
            <stop offset="1" stop-color="#0a1118"/>
          </linearGradient>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#071019"/>
            <stop offset="1" stop-color="#040a10"/>
          </linearGradient>
          <radialGradient id="radar" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="rgba(95,216,232,.22)"/>
            <stop offset="1" stop-color="rgba(95,216,232,0)"/>
          </radialGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect width="900" height="620" fill="url(#land)"/>
        <rect width="900" height="620" fill="url(#grid)"/>
        <path class="coast" d="M 900 0 L 900 620 L 250 620 C 330 560 300 520 380 486 C 470 448 430 396 520 362 C 600 332 560 262 646 238 C 730 214 690 128 780 100 C 830 84 860 40 900 22 Z" fill="url(#sea)"/>
        <path class="coast-line" d="M 900 0 L 900 620 L 250 620 C 330 560 300 520 380 486 C 470 448 430 396 520 362 C 600 332 560 262 646 238 C 730 214 690 128 780 100 C 830 84 860 40 900 22 Z"/>
        <g class="contours">
          <path d="M 60 120 C 170 90 260 150 300 240 C 340 330 270 430 160 470"/>
          <path d="M 120 70 C 240 40 340 120 380 220 C 420 320 360 400 250 450"/>
          <path d="M 450 80 C 560 50 650 110 690 200"/>
          <path d="M 300 540 C 420 500 520 540 600 580"/>
        </g>
        <g class="map-roads">
          <path d="M 60 340 L 820 340"/>
          <path d="M 180 80 L 180 580"/>
          <path d="M 420 40 L 420 560"/>
          <path d="M 680 60 L 680 600"/>
          <path d="M 80 480 L 760 480"/>
          <circle cx="206" cy="320" r="52" class="zone"/>
          <circle cx="646" cy="442" r="60" class="zone"/>
          <circle cx="592" cy="186" r="56" class="zone"/>
          <circle cx="760" cy="524" r="48" class="zone threat"/>
        </g>
        <g class="radar-sweep">
          <circle cx="450" cy="330" r="150" fill="url(#radar)"/>
          <line x1="450" y1="330" x2="450" y2="180"/>
        </g>
        ${routes}
        <g class="map-nodes">${nodes}</g>
        <g class="map-labels">
          <text x="86" y="300">WEST TOLL</text>
          <text x="596" y="472">HARBOR</text>
          <text x="540" y="148">DOWNTOWN</text>
          <text x="706" y="556">SKY CORE</text>
        </g>
      </svg>
      <div class="map-scanline"></div>
      <div class="map-corner map-corner-tl"></div>
      <div class="map-corner map-corner-br"></div>`;
  }

  private renderList(): void {
    this.listHost.innerHTML = '';
    MISSION_ORDER.forEach((id, i) => {
      const m = MISSIONS[id];
      const locked = !this.app.save.isMissionUnlocked(id);
      const done = this.app.save.isMissionCompleted(id);
      const selected = i === this.selected;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `mission-card ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''} ${selected ? 'is-selected' : ''}`;
      card.disabled = locked;
      card.innerHTML = `
        <span class="mc-index">${String(i + 1).padStart(2, '0')}</span>
        <span class="mc-body">
          <span class="mc-chapter">${m.chapter}${locked ? ' · LOCKED' : ''}</span>
          <strong>${m.title}</strong>
          <span class="mc-sub">${m.subtitle}</span>
        </span>
        <span class="mc-side">
          <span class="mc-threat">${locked ? icon('lock', 13) + ' 未解锁' : m.threat}</span>
          <span class="mc-rank">${done ? this.app.save.getRank(id) : locked ? '—' : '待战'}</span>
        </span>`;
      card.addEventListener('click', () => {
        this.selected = i;
        this.app.audio.play('ui');
        this.renderAll();
      });
      card.addEventListener('dblclick', () => {
        if (!locked) this.launch();
      });
      this.listHost.appendChild(card);
    });
  }

  private renderPreview(): void {
    const m = MISSIONS[MISSION_ORDER[this.selected]];
    const required = m.objectives.filter((o) => !o.optional).length;
    const optional = m.objectives.filter((o) => o.optional).length;
    this.previewHost.innerHTML = `
      <div class="mp-head"><span>MISSION BRIEF</span><span>${required} 主要 / ${optional} 可选</span></div>
      <div class="mp-objectives">
        ${m.objectives
          .map(
            (o) => `<div class="${o.optional ? 'is-opt' : ''}">
              <i></i><span>${o.label}${o.optional ? '（可选）' : ''}</span><b>${o.count}</b>
            </div>`,
          )
          .join('')}
      </div>
      <div class="mp-foot"><span>${icon('medal', 12)} 勋章</span><b>${MEDAL_RULES.map((r) => r.name).join(' · ')}</b></div>`;
  }

  private renderReadout(): void {
    const m = MISSIONS[MISSION_ORDER[this.selected]];
    const done = this.app.save.isMissionCompleted(m.id);
    const locked = !this.app.save.isMissionUnlocked(m.id);
    this.readoutHost.innerHTML = `
      <div class="readout-kicker">${m.chapter} · ${m.district.toUpperCase()}</div>
      <div class="readout-title">${m.title}</div>
      <div class="readout-meta">
        <span>${m.duration}</span><i></i><span>${m.threat}</span><i></i><span>${done ? '已通关 ' + this.app.save.getRank(m.id) : locked ? '权限不足' : '可出击'}</span>
      </div>`;
  }

  private renderGirlCard(host: HTMLElement): void {
    const girl = this.girl;
    const trust = this.app.save.getTrust(girl.id);
    host.innerHTML = `
      <div class="girl-card-face" style="background-image:url('${assetUrl(girl.art.face)}')"></div>
      <div class="girl-card-body">
        <div class="girl-card-kicker">LINK / ${girl.en}</div>
        <div class="girl-card-name">${girl.name}<small>${girl.role}</small></div>
        <div class="girl-card-line">
          <span>灵契同步</span><b>100%</b>
          <span class="trust-pips">${[0, 1, 2].map((i) => `<i class="${i < trust ? 'on' : ''}"></i>`).join('')}</span>
        </div>
      </div>`;
    host.addEventListener('click', () => this.go('hangar', { from: 'hub' }));
  }

  private navButton(label: string, iconName: 'hangar' | 'codex' | 'settings', action: () => void): HTMLButtonElement {
    const b = button(`${icon(iconName, 18)}<span>${label}</span>`, action, 'bare', 'hub-nav-btn');
    b.setAttribute('data-silent', 'true');
    return b;
  }

  private bindKeys(): void {
    this.onWindow('keydown', (e) => {
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        const dir = e.code === 'ArrowDown' ? 1 : -1;
        let next = this.selected;
        for (let step = 0; step < MISSION_ORDER.length; step++) {
          next = (next + dir + MISSION_ORDER.length) % MISSION_ORDER.length;
          if (this.app.save.isMissionUnlocked(MISSION_ORDER[next])) break;
        }
        this.selected = next;
        this.app.audio.play('ui');
        this.renderAll();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        this.launch();
      } else if (e.code === 'KeyH') {
        this.go('hangar', { from: 'hub' });
      } else if (e.code === 'KeyC') {
        this.go('codex', { from: 'hub' });
      } else if (e.code === 'Escape') {
        this.go('title');
      }
    });
  }

  private launch(): void {
    const id = MISSION_ORDER[this.selected];
    if (!this.app.save.isMissionUnlocked(id)) {
      this.app.toast('该作战尚未解锁', 'warn');
      this.app.audio.play('back');
      return;
    }
    this.app.audio.play('confirm');
    this.go('briefing', { missionId: id });
  }
}
