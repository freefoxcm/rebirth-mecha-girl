import { formatNumber } from '../core/math';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function div(className?: string, html?: string): HTMLDivElement {
  const node = el('div', className);
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setWidth(node: HTMLElement, ratio: number): void {
  const pct = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  if (node.style.width !== pct) node.style.width = pct;
}

export type ButtonTone = 'primary' | 'ghost' | 'danger' | 'bare';

export function button(
  label: string,
  onClick: (ev: MouseEvent) => void,
  tone: ButtonTone = 'ghost',
  className = '',
): HTMLButtonElement {
  const btn = el('button', `btn btn-${tone} ${className}`.trim());
  btn.type = 'button';
  btn.innerHTML = `<span>${label}</span>`;
  btn.addEventListener('click', onClick);
  return btn;
}

export function icon(name: IconName, size = 18): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

export type IconName =
  | 'alloy'
  | 'medal'
  | 'lock'
  | 'chevron'
  | 'arrow'
  | 'crosshair'
  | 'warning'
  | 'check'
  | 'play'
  | 'settings'
  | 'hangar'
  | 'codex'
  | 'back'
  | 'sound'
  | 'pause'
  | 'close'
  | 'target'
  | 'missile'
  | 'gauge'
  | 'info'
  | 'star';

const ICONS: Record<IconName, string> = {
  alloy: '<path d="M12 3l7 4v10l-7 4-7-4V7l7-4z"/><path d="M12 8l3 2v4l-3 2-3-2v-4l3-2z"/>',
  medal: '<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  arrow: '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  warning: '<path d="M12 3l9 17H3L12 3z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  play: '<path d="M8 5l11 7-11 7V5z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  hangar: '<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  codex: '<path d="M4 4h10a3 3 0 013 3v13H7a3 3 0 01-3-3V4z"/><path d="M17 7h3v13H7"/>',
  back: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9a4 4 0 010 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  missile: '<path d="M14 4l6 6-9 9H5v-6l9-9z"/><path d="M14 4l2 2M5 19l-2 2"/>',
  gauge: '<path d="M4 18a8 8 0 1116 0"/><path d="M12 18l4-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
};

export function alloyLabel(amount: number): string {
  return `${icon('alloy', 14)}<span>${formatNumber(amount)}</span>`;
}

export function segmentedBar(
  label: string,
  value: number,
  segments: number,
  tone: 'hp' | 'heat' | 'over' | 'ammo' = 'hp',
): HTMLDivElement {
  const wrap = div(`seg seg-${tone}`);
  const head = div('seg-head');
  head.innerHTML = `<span>${label}</span><span class="seg-value">${Math.round(value * 100)}%</span>`;
  const track = div('seg-track');
  for (let i = 0; i < segments; i++) {
    const cell = div('seg-cell');
    cell.style.setProperty('--i', String(i));
    track.appendChild(cell);
  }
  const fill = div('seg-fill');
  fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
  track.appendChild(fill);
  wrap.append(head, track);
  return wrap;
}

export function keyHint(key: string, label: string): string {
  return `<span class="key-hint"><kbd>${key}</kbd>${label}</span>`;
}

export interface MenuItem {
  label: string;
  hint?: string;
  action: () => void;
  disabled?: boolean;
  icon?: IconName;
}

/** 键盘可导航的纵向菜单。 */
export function menu(items: MenuItem[], className = 'menu'): HTMLDivElement {
  const root = div(className);
  const buttons: HTMLButtonElement[] = [];
  let index = Math.max(0, items.findIndex((i) => !i.disabled));
  const render = () => {
    buttons.forEach((b, i) => b.classList.toggle('is-active', i === index));
  };
  items.forEach((item, i) => {
    const btn = el('button', 'menu-item');
    btn.type = 'button';
    btn.disabled = Boolean(item.disabled);
    btn.innerHTML = `
      ${item.icon ? `<span class="menu-icon">${icon(item.icon, 20)}</span>` : '<span class="menu-index">0' + (i + 1) + '</span>'}
      <span class="menu-label">${item.label}</span>
      ${item.hint ? `<span class="menu-hint">${item.hint}</span>` : ''}
      <span class="menu-arrow">${icon('chevron', 16)}</span>`;
    btn.addEventListener('mouseenter', () => {
      if (item.disabled) return;
      index = i;
      render();
    });
    btn.addEventListener('click', () => {
      if (item.disabled) return;
      item.action();
    });
    buttons.push(btn);
    root.appendChild(btn);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'ArrowDown') {
      e.preventDefault();
      do {
        index = (index + 1) % items.length;
      } while (items[index].disabled && index !== 0);
      render();
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      do {
        index = (index - 1 + items.length) % items.length;
      } while (items[index].disabled && index !== 0);
      render();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (document.activeElement?.tagName === 'BUTTON' && root.contains(document.activeElement)) return;
      e.preventDefault();
      items[index].action();
    }
  };
  window.addEventListener('keydown', onKey);
  const destroy = () => window.removeEventListener('keydown', onKey);
  (root as HTMLDivElement & { destroy?: () => void }).destroy = destroy;
  render();
  return root;
}

export function divider(text?: string): HTMLDivElement {
  const d = div('divider');
  if (text) d.innerHTML = `<span>${text}</span>`;
  return d;
}

export function statRow(label: string, value: string, tone?: string): HTMLDivElement {
  const row = div('stat-row');
  const l = div('stat-label', label);
  const v = div(`stat-value ${tone ?? ''}`.trim(), value);
  row.append(l, v);
  return row;
}
