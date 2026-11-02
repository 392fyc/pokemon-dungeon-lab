---
updated: 2026-11-03
---
# 8.8 画面返工 mock

用户 2026-11-03 固定的界面 mock（原话“先按当前来固定收束。请务必所有工作方都能参照到该mock”）。规格与规则改动见 [8.8画面与规则返工规格](../8.8画面与规则返工规格.md)。

## 本目录索引

| 文档 | 状态 | 说明 |
| --- | --- | --- |
| 本页 | 现行 | mock 的组成与用法 |

## 组成

| 子目录 | 内容 | 怎样用 |
| --- | --- | --- |
| [`shots/`](shots/README.md) | 每个画面、每种状态的截图（1280×720） | 先看这里 |
| [`html/`](html/README.md) | 不依赖外部运行时的普通 HTML：`title.html` → `starter.html` → `camp.html` → `main.html`，可以点；网址加 `?state=` 直接看某个状态 | 浏览器直接打开 |
| [`source/`](source/README.md) | 用户评审用的 Design 画布原稿（`.dc.html` 与 `canvas.json`）；图片写作 `/_blob/<id>`，对应关系见下表 | 只读参考，视觉与 `html/` 一致；页面引用的 `./support.js`（画布运行时）不在仓库里，原稿不能单独打开，只能读源码 |
| [`img/`](img/README.md) | mock 用到的图片，都由仓库现有素材裁出：宝可梦取 `public/assets/characters/<编号>/Idle-Anim.png` 第一帧并整数倍放大；`dungeon-*.png` 是 8.5b 的 Windows 截图（PR #152 证据）局部；`rattata.png`、`dungeon-wet.png` 是备用图，mock 没有用到 | 不是生产素材 |

`source/` 里图片编号与文件的对应：17dbff…=bulbasaur，601a86…=charmander，d4d532…=squirtle，6674ad…=chikorita，c1e357…=cyndaquil，63727d…=totodile，a8d308…=treecko，cf35fb…=torchic，b481db…=dungeon-moss，4c9138…=chansey，1f434c…=snorlax，ddcd21…=abra，94de1c…=pidgey。

## 读 mock 时要知道的

- mock 定的是**布局、信息分区、字段与交互**。宝可梦、建筑、小地图、迷宫背景是示意；正式实现用游戏自己的素材与渲染（迷宫背景截图里残留的旧单位标签不是设计的一部分）。
- 拖动物品、真实战斗等不在 mock 里，只做了样子。
- 用户评审时的在线画布只有用户能打开，**以本目录为准**。

返回：[计划目录](../README.md)
