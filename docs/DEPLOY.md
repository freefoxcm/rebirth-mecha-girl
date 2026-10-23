# GitHub Pages 部署

## 在线地址

**https://freefoxcm.github.io/rebirth-mecha-girl/**

GitHub Pages 由 GitHub 的 CDN 分发；首次加载约 8 MB 静态资源（角色 WebP + 构建产物），之后会使用浏览器缓存。

## 自动部署

仓库包含 `.github/workflows/deploy.yml`：

- push 到 `master` 或手动 `workflow_dispatch`；
- `npm ci` + `npm run build`；
- 把 `dist` 上传为 Pages artifact，由 `actions/deploy-pages` 发布。

## 本地模拟 Pages 子路径

Vite 使用 `base: './'`，因此不需要写死 `/rebirth-mecha-girl/`。本地验证生产构建：

```bash
npm run build
npm run preview
```

如果要模拟 GitHub Pages 的项目子路径，可以把 `dist` 放进一个名为 `rebirth-mecha-girl/` 的目录，再用任意静态服务器托管该父目录，访问：

```text
http://127.0.0.1:8080/rebirth-mecha-girl/
```

## GitHub 仓库

<https://github.com/freefoxcm/rebirth-mecha-girl>

## 备注

- 原始 `reference_resources` PNG/视频不提交；仓库里是生成后的 WebP 和界面素材。
- 如需 jsDelivr 单文件 CDN，可直接引用仓库里的构建产物或素材，例如：
  `https://cdn.jsdelivr.net/gh/freefoxcm/rebirth-mecha-girl@master/public/assets/girls/qingluan/poster.webp`
  （整站入口请使用 GitHub Pages 地址，而不是 jsDelivr 的 HTML URL。）
