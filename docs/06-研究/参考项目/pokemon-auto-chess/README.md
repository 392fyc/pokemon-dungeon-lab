---
updated: 2026-11-02
---
# Pokémon Auto Chess（PAC）源码解析

研究对象：开源自走棋 [keldaanCommunity/pokemonAutoChess](https://github.com/keldaanCommunity/pokemonAutoChess)，固定提交 `11446314d8d8bb0e58ff517ab50aa576dd10a3c7`（2026-10-31，版本 6.12.0）。

**做法**：只做静态阅读。没有安装依赖，没有运行 `postinstall`（它会下载音乐），没有构建或运行游戏，也没有把任何代码或素材导入本仓。每条结论都附固定提交的永久链接和行号，并标明证据类型：**[源码]** 直接读代码；**[文件观察]** 看文件名、数量、图片尺寸与内容统计；**[推断]** 由前两者推出，写明依据。代码由三个只读子代理分题阅读；关键结论（位掩码、变体概率、图集尺寸、许可标签计数、BITE 与基类代码、音效表）由主笔复核过。

**为什么读它**：本作要解决的问题是“用社区 PMD 风格素材，做一个回合制探险队式迷宫，并且每份素材的来源与许可都说得清”。PAC 是已经长期运营的同类开源项目，用的正是 SpriteCollab 精灵、PMD 图块和 Phaser。它的做法可以当作“已在生产中跑通的假设”，逐条检验是否适合本作，而不是直接当作答案。

用户的 fork 以前做过系统层的观察（奖励、Boss、状态归属），见固定提交 `d03ef51` 的 [pokemon-autochess-mod](https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/06-%E7%A0%94%E7%A9%B6/%E5%8F%82%E8%80%83%E9%A1%B9%E7%9B%AE/pokemon-autochess-mod/README.md)。本目录不重复那部分，只看素材、技能、地图、界面与许可。

## 本目录索引

| 文档 | 状态 | 说明 |
| --- | --- | --- |
| [素材流水线](素材流水线.md) | 现行 | SpriteCollab 的取得、AnimData 解析、切帧与打包、Phaser 按 8 方向播放、缺图兜底、署名记录；对本作的导入与署名建议 |
| [技能实现](技能实现.md) | 现行 | 一技能一类的策略模式、服务器事件与客户端动画表、五个技能端到端、数据与写死的分界；对本作招式动画的建议 |
| [地图与界面](地图与界面.md) | 现行 | 噪声生成地图、8 邻格位掩码归并 47 种的自动拼接、DTEF 图集格式（与 PDMN 对照）、界面图标的来源与组织 |

## 五个问题的答案摘要

- **A 素材流水线**：维护者在本机克隆 SpriteCollab，运行手动脚本切帧、打包，每只宝可梦一张图集，另生成帧时长、命中延迟、表情与作者四份索引；Phaser 按需加载，用“编号/色/动作/Anim 或 Shadow/方向”的键播放；缺图时依次换成精灵球占位、missingno、相近动作。署名只记作者，不记许可。
- **B 技能实现**：每个技能一个类；服务器只发“谁、对谁、在哪”的事件，客户端按技能 id 查动画表，表项由几种动画工厂组合而成。普通技能约 20—45 行服务器代码加 1—5 行客户端表项；没有技能音效。
- **C 地图与图块**：用的是 PMD 原版地牢图块（143 个主题）。地图由噪声随机生成，按 8 邻格位掩码归并成 47 种图块；图集一组 432×192，墙、水、地面三套各 6×8，与 PDMN 的单组布局相同。
- **D 界面**：头像来自 SpriteCollab；道具和技能图标打成图集，道具另复制散图给 React；属性图标是项目自制的 SVG。
- **E 许可**：见下一节。

## 许可边界

**PAC 自己的说法自相矛盾**：
- `LICENSE` 文件是 GPL-3 全文（[源码] [LICENSE#L1-L2](https://github.com/keldaanCommunity/pokemonAutoChess/blob/11446314d8d8bb0e58ff517ab50aa576dd10a3c7/LICENSE#L1-L2)），README 的徽章也写 GPLv3；
- `package.json` 却写 `"license": "BSD-3-Clause"`（[源码] [package.json#L8](https://github.com/keldaanCommunity/pokemonAutoChess/blob/11446314d8d8bb0e58ff517ab50aa576dd10a3c7/package.json#L8)）；
- README 另声明“All rights to The Pokemon Company”（[源码] [README.md#L3-L7](https://github.com/keldaanCommunity/pokemonAutoChess/blob/11446314d8d8bb0e58ff517ab50aa576dd10a3c7/README.md#L3-L7)）；
- 仓库里没有任何针对素材的许可文件。

所以本作按更严格的一方理解：**代码按 GPL-3 处理**。

| 类别 | 例子 | 本作怎么对待 | 依据 |
| --- | --- | --- | --- |
| **只能学思路，独立重写** | 全部 PAC 代码：自动拼接算法、技能策略类、动画工厂、加载与缺图兜底、打包脚本 | 可以读、可以描述原理，不复制代码或逐行改写。GPL-3 的代码一旦并入，本作就要按 GPL-3 发布 | `LICENSE` 为 GPL-3 |
| **附条件可用（只限私有构建）** | SpriteCollab 的精灵与头像，标签为 `CC_BY-NC_4`、`PMDCollab_1`、`PMDCollab_2` | 不从 PAC 取，直接从 SpriteCollab 固定提交取；逐文件记录作者与许可标签；只用于私有构建，不商用 | SC 的 README（`ca82c75`）：投稿默认按 CC BY-NC 4.0 授权，要求署名、非商用；`PMDCollab_*` 两个标签的确切条款**未核实** |
| **需要用户单独决定** | SpriteCollab 中作者为 CHUNSOFT、标签为 `Unspecified` 的条目（PAC 里 626 个头像目录含 CHUNSOFT；`Unspecified` 共 616 行） | 默认不用；要用时由用户逐项决定 | [文件观察] 头像目录 `credits.txt` 的统计，见[素材流水线](素材流水线.md)第 5 节 |
| **不能用** | 143 套 PMD 地牢图块、技能帧图、道具图标、音乐（另一仓库 `pokemonAutoChessMusic`） | 不使用，只借鉴效果 | 仓库内没有来源或许可说明；地牢图块推断为原版或 PMDO（PMD: Origins）素材 |
| **项目自制、但许可不明** | 属性 SVG 图标、状态图标 | 不使用；需要时自己做 | 没有单独的许可声明，只能按 GPL-3 仓库内容理解，且不确定是否为原创 |

**本作已有的约束**：
- 角色素材取自 SpriteCollab，逐文件记录来源与许可；
- 只用于私有构建；
- 公开发布的许可路线待定；
- 来源见 [CLAUDE.md](../../../../CLAUDE.md) 的“当前范围”。

本页不改变这些约束，只把 PAC 的情况对照进来。

## 对本作的建议（建议，不是决定）

1. **素材导入要记许可，不只记作者**：导入 SpriteCollab 时读 `credits.txt` 的许可列，写进逐文件清单；缺标签的拒绝导入（[素材流水线](素材流水线.md)）。
2. **招式画面用“事件＋动画表＋少数工厂”**：规则只产出事件，画面查表组合（[技能实现](技能实现.md)）。
3. **地形拼接用 8 邻格位掩码、47 种**：图集布局可参照 DTEF，图块必须原创（[地图与界面](地图与界面.md)）；具体规格等 main 的地形研究定方向（S10 暂停中）。
4. **PAC 的代码一律独立重写**；PAC 仓库里的图块、帧图、图标、音乐都不进本仓。

## 没有核实的部分

- `PMDCollab_1`、`PMDCollab_2` 两个许可标签的确切条款。
- PAC 的 PMD 地牢图块、技能帧图、道具图标的来源。
- 静态阅读不能证明运行行为；标为 [推断] 的结论都需要运行观察才能确认。

返回：[上一级](../README.md)
