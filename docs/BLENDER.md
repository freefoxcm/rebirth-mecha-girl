# Blender 战机资产管线

版本 0.2.0 · Blender 5.2.3 LTS · Windows x64

五台机娘战机的可编辑源文件、展示级/任务级 GLB 和渲染图都由 `art/blender/` 下的 Python 脚本生成。运行时不再依赖 Blender；Blender 只在重新建模/导出时使用。

## 1. 工具链

- 便携版 Blender 固定为 **5.2.3 LTS**，解压到 `.tools/blender/`（`.gitignore` 已忽略）。
- 首次安装：

```bash
node scripts/setup-blender.mjs
# 或已手动把 zip 放到 .tools/cache/ 后直接运行；也支持 $env:BLENDER 指向任意 blender.exe
```

- 可执行文件：`.tools/blender/blender.exe`。
- glTF 导出、Draco 编码器、Cycles/OptiX 都使用 Blender 自带模块，无额外 Python 包依赖。

## 2. 目录

```
art/blender/
  build_jets.py           # headless：建模、双 LOD、保存 .blend、导出 GLB、写构建摘要
  render_jets.py          # 三视图 / 3/4 效果图渲染
  lib/
    blender_utils.py      # 场景、材质、网格、倒角、合并、导出等工具
    geometry.py           # 机身放样、折线机翼、垂尾、进气、喷口、贴花
    jet_parts.py          # 进气道、喷口、座舱、起落架、面板线、细节、编号
    jet_specs.py          # 五台机的尺寸、站位、平面形状、喷口/进气/座舱数据
    jet_builders.py       # 总装 + 各机涂装
  source/<id>.blend       # 可编辑源文件（含 SHOWCASE/GAME 两套 LOD）
```

生成产物：

```
public/assets/jets/<id>/showcase.glb   # 机库展示级
public/assets/jets/<id>/game.glb       # 任务低模
src/data/jet-models.json               # 游戏读取的 manifest（路径/尺寸/预算/锚点）
docs/screens/jets/*.webp               # 预览、概念对照、游戏内截图
```

## 3. 常用命令

```bash
npm run setup:blender          # 安装/校验便携 Blender
npm run art:jets               # 五台全部重建
npm run art:jets -- --only qingluan
npm run art:jets -- --no-draco # 调试：关闭 Draco
npm run art:render             # 五台渲染（默认 hero/top/side/front）
npm run art:render -- --only akari --samples 96
npm run validate:jets          # GLB 结构/三角面/体积/朝向校验
npm run qa:jets                # 浏览器内机库 + 任务冒烟
```

`art:render` 默认输出到 `artifacts/jets/renders/<id>/`（不提交）；`--publish` 会把 WebP 发布到 `docs/screens/jets/`。

## 4. 坐标与尺寸约定

- Blender：米制；机头朝 **+Y**，上方 **+Z**，X 为右翼；原点在机身中心/重心附近。
- glTF 导出使用 Y-up：游戏内机头朝 **-Z**，机尾 +Z，Y 向上。
- `REF_NOSE` / `REF_TAIL` / `REF_LEFT` / `REF_RIGHT` 空节点写入 GLB，`validate-jets` 与运行时都会检查轴向。
- 游戏按 `JET_BLUEPRINTS[id].length / manifest.length` 归一化，保持原有取景和判定观感。
- 设计尺寸以三视图为准：

| 机 | 全长 | 翼展 | 全高 |
|---|---:|---:|---:|
| 青鸾 QINGLUAN | 21.8 m | 15.2 m | 4.6 m |
| 明璃 AKARI-02 | 18.2 m | 12.6 m | 4.8 m |
| 苍穹 HANEUL-21 | 21.3 m | 15.2 m | 5.8 m |
| 星隼 ASTRA-35 | 15.7 m | 11.0 m | 4.38 m |
| 霜翼 SNEGA-57 | 22.8 m | 16.4 m | 5.1 m |

## 5. LOD 与预算

| 档位 | 用途 | 三角面 | 体积 |
|---|---|---:|---:|
| showcase | 机库高画质 | 约 10–12 万 | ≤ 4 MB（实测 145–175 KB，Draco） |
| game | 任务 / 低画质机库 | 约 0.7–1 万 | ≤ 420 KB（实测 35–45 KB） |

- 展示级与任务级共用同一份 `JetSpec`，按不同分段重新生成，不做简单 Decimate。
- 静态网格按材质合并，单台 draw call 通常 14–17 个。
- 机库高画质异步加载 showcase；`quality=low` 或任务内使用 game。

## 6. 建模/涂装约定

- **机身**：30–48 个站位、带 chine 的 faceted/round/wide 截面；机头雷达罩、脊背、尾锥单独处理。
- **机翼**：`WingSpec.curve` 支持 7 个 `(x, le, te)` 控制点，用来还原设计图的折线双三角/大后掠翼；翼面用 NACA 类厚度分布 + 后缘控制面缝隙。
- **进气道**：DSI 鼓包 / caret 方棱 / belly 三种；内壁暗腔、金属唇口。
- **喷口**：收敛-扩张花瓣、内腔、涡轮面、金属热段套筒、金属唇口；霜翼为 TVC 双喷口。
- **座舱**：高模透明舱盖 + 框条 + 座椅/头枕/HUD/侧台/操纵杆；低模用深色舱盖。
- **起落架**：高模舱门/支柱/轮组；低模简化版本；GLB 中汇总到 `Gear` 节点，由 `setGear()` 切换。
- **涂装**：PBR 材质分色 + 几何贴花（云纹、金线、编号）；颜色取 `src/data/girls.ts` 的 palette。
- **面板线**：在 `.blend` / Cycles 渲染中保留；实时 GLB 按材质 `Panel_Line` 过滤，避免细管在浏览器里被采样成黑色虚线。需要游戏内缝线时，建议另做 2K 烘焙贴图/法线。

## 7. 游戏接入

- `scripts/build-jets.mjs` 调用 Blender 并更新 `src/data/jet-models.json`。
- `src/render/jet-assets.ts`：
  - `preloadGameJetModels()` 启动预载五台任务低模；
  - `loadShowcaseJetModel(id)` 机库按需加载展示级；
  - `buildModelJetVisual(girl, lod)` 克隆 GLB、重建火焰/喷口光/航行灯、`setThrottle`/`setGear`/`setDamage`；
  - GLB 加载失败或 `?jets=procedural` 时，`girl-jets.ts` 回退到程序化 Blueprint 模型。
- `src/app/app.ts` 启动阶段显示“战机模型同步中… x/5”；机库异步替换不阻塞界面。

## 8. 调试

- 浏览器：`?jets=procedural` 强制旧模型；`window.__REBIRTH__.jetStatus()` 查看每台/每档是否就绪、三角面、字节数；机库/任务 QA 脚本会等待 showcase 就绪。
- 构建：`artifacts/jets/build/<id>.json` 为 Blender 单机摘要；`artifacts/jets/build-all.log` 为最近一次全量日志。
- 渲染：Cycles 优先 OptiX；失败自动回退 CPU。Blender 5.2 的 compositor API 有变化，当前渲染脚本没有依赖合成器。

## 9. 已知限制

- 脚本化 hard-surface 建模，不是手工雕刻；极端有机曲面/复杂内构受限。
- 三视图之间少量比例冲突，以俯视轮廓和游戏可读性优先。
- 实时模型不含面板缝/旧化贴图；后续可加烘焙贴图或法线。
- `.tools/` 与 Draco 解码器不入库；新环境需要 `npm run setup:blender` 与 `npm install`。
