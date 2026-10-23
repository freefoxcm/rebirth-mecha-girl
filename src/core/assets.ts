const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

/** 把 public 下的相对路径变成 base-aware 的 URL（dev: /assets，构建: ./assets）。 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export function loadImage(path: string): Promise<HTMLImageElement> {
  const key = assetUrl(path);
  const cached = cache.get(key);
  if (cached && cached.complete) return Promise.resolve(cached);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const img = new Image();
  img.decoding = 'async';
  img.src = key;
  const p = new Promise<HTMLImageElement>((resolve) => {
    const done = () => resolve(img);
    img.onload = done;
    img.onerror = () => {
      console.warn(`[assets] 图片加载失败: ${key}`);
      resolve(img);
    };
    if (img.complete) done();
  }).then((loaded) => {
    cache.set(key, loaded);
    pending.delete(key);
    return loaded;
  });
  pending.set(key, p);
  return p;
}

export function getImage(path: string): HTMLImageElement | undefined {
  return cache.get(assetUrl(path));
}

export async function preloadImages(
  paths: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  let loaded = 0;
  const total = paths.length;
  onProgress?.(0, total);
  const queue = [...paths];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const path = queue.shift();
      if (!path) break;
      await loadImage(path);
      loaded++;
      onProgress?.(loaded, total);
    }
  });
  await Promise.all(workers);
}

/** 让浏览器提前拿到 CSS 背景图，避免第一次切屏闪烁。 */
export function preloadCssImages(paths: string[]): void {
  for (const p of paths) {
    const img = new Image();
    img.src = assetUrl(p);
  }
}
