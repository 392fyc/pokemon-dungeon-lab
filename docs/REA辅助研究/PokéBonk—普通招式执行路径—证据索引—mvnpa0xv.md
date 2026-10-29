---
tags:
  - 路线/REA辅助研究
  - 项目/PokeBonk
  - 证据/索引
updated: 2026-10-25
build: mvnpa0xv
---
# 普通招式执行路径的证据索引

对应[研究报告](PokéBonk—普通招式执行路径—mvnpa0xv.md)。下面的行号属于本轮生成的显示文本；稳定依据是原始文件摘要和原始范围。压缩名只适用于该构建。

## 输入与工具身份

- [原始捕获清单](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/capture-manifest.json)：9 份公开文件的 URL、捕获时间、HTTP 状态和 SHA-256；只捕获所需入口、模块和数据，没有打包全站资源。
- [原始主模块](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/raw/assets/main-DasJJ4XQ-mvnpa0xv.js)：`4E050B55FF580A8B85FB5E6CFFFBDD5A9A168F30192AC80AB359704C353D95F1`，2,239,152 字节。
- [显示文本](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/main.formatted.js)：`EF80663AC5EFCA3E54A76FC865D21108D70E17B2682F024BF3CD0AA68AB75998`。由现有 Babel parser 8.0.4 / generator 8.0.6 排版，没有执行目标脚本；不是恢复出作者的原始工程。
- [排版来源记录](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/format-provenance.json)、[生成的映射](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/main.formatted.js.map)、[符号原始范围](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/symbol-index.json)、[本轮重点证据位置](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/evidence-index.json)。
- 原始范围使用 UTF-16 字符索引，起点包含、终点不包含；原始列号从 0 开始、行号从 1 开始，不能当作字节偏移。
- REA 6.7.0，提交 `475f09d5ca4f854cbc634074d5534717d58c6664`；Node.js 24.22.1。所有 REA 仓库命令显式以 `D:\Project\rea` 为工作目录。

## REA 实际执行与限制

实际执行的核心命令（工作目录 `D:\Project\rea`）：

```powershell
node scripts/rea.mjs analyze-javascript-application D:\Project\Pokemon_REA_Workbench\pokebonk\2026-10-25-mvnpa0xv-moves\raw --source-path assets/main-DasJJ4XQ-mvnpa0xv.js --source-path assets/news-BchkQ1Jv-mvnpa0xv.js --source-path assets/main-D1tqSJkl-mvnpa0xv.js --detail summary --evidence_output D:\Project\Pokemon_REA_Workbench\pokebonk\2026-10-25-mvnpa0xv-moves\evidence\application.evidence.json --format json

node scripts/rea.mjs trace-javascript-semantics D:\Project\Pokemon_REA_Workbench\pokebonk\2026-10-25-mvnpa0xv-moves\evidence\trace-Hv.input.json --format json
```

以上输出路径已经存在，复做时应另选结果路径；REA 不覆盖已有 Evidence。两项命令退出码均为 0。

| 产物 | 实际结果与适用范围 |
| --- | --- |
| [完整应用 Evidence](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/evidence/application.evidence.json) | 主记录 `ev_8368982231071ab2b35aea9779b0e0d8114e34d86400f3128325c616efcf70ff`；保存原输入身份、解析事实和不完整覆盖信息 |
| [摘要](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/evidence/application.summary.json)与[过程日志](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/evidence/application.stderr.log) | 9 文件编目；选定 3 份 JS 解析，0 解析失败；其余 6 个输入不在该轮源码分析选择中。JSON 数据另由本轮只读解析，不冒称 REA 已解释全部数据语义 |
| 自动语义图 | 每文件 20,000 节点与 20,000 未知记录上限被触及；语义图 `partial/truncated`，共保留 24,732 项语义未知。摘要自身的 complete-within-view 只表示摘要视图读完，不能改写为目标完整 |
| [Hv 调用者查询](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/evidence/trace-Hv.result.json) | `ev_40bdbef0528a40ec05af5ac2fc3af935cab79861fdbac238064a33bca015b38f`；找到 1 个种子、0 条调用关系，coverage=partial。源码可直接见 Wv/Gv 等调用 Hv，因此不据零条关系断言“没有调用者” |
| [REA 函数锚点](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/rea-function-anchors.json) | Hv、Vv、Kv、py、mv、hh 的返回节点与原始位置；保留父证据 ID，避免凭压缩名跨构建匹配 |

原始目录整体摘要为 `358bb3a1a979589067d19bcd0e8ff6934d6c92d6ea6bdf3bc1dd044c4e7f8ae0`，只标识本次选择的本地捕获集合，不是完整网站摘要。没有提高工具资源上限或重跑相同大型分析。后续语义由源码逐段核对补足，明确属于静态解释，不是 REA 自动图或运行证明。

## E01

目标身份与入口：`raw/index.html` 的 pokebonk-build；入口脚本的动态 import；[news 显示文本](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/news.formatted.js) 第 2–5 行及第 6287–6288 行的版本/构建。原站链接：[首页](https://pokebonk.com/)、[入口](https://pokebonk.com/assets/main-D1tqSJkl-mvnpa0xv.js)、[主模块](https://pokebonk.com/assets/main-DasJJ4XQ-mvnpa0xv.js)、[共享与更新模块](https://pokebonk.com/assets/news-BchkQ1Jv-mvnpa0xv.js)。

## E02

载入和数据：主显示文本第 46–67 行 `na`，108–208 行 `A`，其中 load 从 121 行开始、effectiveness 位于 160–172 行；news 第 6287–6342 行的数据版本标签和 `ma`。主 import 将 news 的 g（ma）导入为 an。

输入为 [moves](https://pokebonk.com/data/moves.json?v=Ixf0MGdc)、[learnsets](https://pokebonk.com/data/learnsets.json?v=tYT2wrvN)、[pokemon](https://pokebonk.com/data/pokemon.json?v=5l9YG1H_)、[types](https://pokebonk.com/data/types.json?v=Do_Iczfr)。当前 moves 快照 919 条，只表示输入数量。moves SHA-256 为 `BD7A87D79D3A18A818EEF5BCEF375E068401105F50FDA2C3A12D844426A82518`。

## E03

适配：`Av` 33338–33651；`Pv` 33661–34089，三例映射位于 33695、33768–33769；`Fv` 34090–34189，之后合并 SPECIAL；`Vv` 34222–34232；`Hv` 34233–34275；状态默认表 `dv` 32239–32258、`pv` 32274–32303。

Hv 原始 UTF-16 范围为 [769195, 770268)，原始第 883 行，列 [462419, 463492)。Vv 范围 [768722, 769195)，py 范围 [776064, 788359)。原型与三例数据/算术记录见 [move-examples.json](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/move-examples.json)，其中明确区分表值、转录公式与运行验证。

## E04

资格：`Wv` 34291–34298；`Gv` 34299–34321；`rS` 47256–47263；`iS` 47264；`sS` 47323–47449；选项实际应用 `lS` 47512–47528。关注普通学习表、角色 kit、共享已解锁来源的不同条件；不要把等级资格写成必定出现的概率。

## E05

实例和升级：`Kv` 34322–34357；`Gy.addMove` 36965–36970；`Jv` 34390–34433；`Yv` 34434–34470；`py` 34595 行开始的战斗参数折算。角色开局构造与第一招选择见 66067–66069 行。

## E06

调度：`WO.update` 67311–67346；`WO.simulate` 67363–67428，逐槽调用在 67392–67395；`WO.castMove` 67429–67443；`py` 34595–35262。本次仅据单人模式玩家角色的普通招式分支解释，显式分流的 random、fusion 与联机不并入完成范围。

## E07

连锁：`py` 的 chain 分支 35071–35106。首目标 aimTarget(14)、集合去重、最多 f+1 个目标、每跳 0.9 指数衰减、半径内最近候选和直接 combat.hit。十万伏特专属 link 在 17385–17389。

## E08

投射物：barrage 建队列在 34917–34920；逐枚发射在 34793–34826；`hh.fire` 21283–21292；`hh.step` 21360–21508，其中地形/物体检查在 21408–21425、敌人命中参数在 21473–21483；重复命中记录在 21522–21527。

critBonus 的边界按四段连接核对：Hv 写定义 → py 计算并放入共同 x 对象 → barrage 另建 fire 参数而未携带 → hh 存储与碰撞 hit 参数未携带。对照共同伤害层 32382 行的 `n.critBonus ?? 0`。这里只确认所查数据传递，不代表已做概率实验。

## E09

光束：启动与蓄力 34921–34961；持续分支在 34742–34792。用瞄准方向与束线偏移筛选、tick=0.09、威力达到 110 时延迟 0.5；延迟后 active 取折算持续时间×1.3。日光束 beam/cast 专属显示在 16968–16975。

## E10

结算：`mv.hit` 32313–32321；hit0 32344–32352；`strike` 32353–32480；`applyStatus` 32525–32569；`killEnemy` 32729–32745；`takeHp` 32746–32750。状态实际消耗见敌人 update 第 12721 行调用 tickStatus、第 12729 行的麻痹减速，以及 tickStatus 第 32669–32672 行的计时衰减与概率停顿。定义状态、施加状态和后续更新是三处不同责任。

## E11

目标与空间筛选：`WO.aimTarget` 66532–66568；`WO.aimDir` 66569–66609；`Jp.nearest` 12963–12984；`Jp.within` 12985–12998。第 66535 行先返回范围内的有效锁定目标，不查视线；66536–66548 行 manual 按镜头方向筛选，也不查视线。无有效锁定目标且处于 auto 时，66550–66557 行先选治疗/护盾敌人，仍不查视线；之后的 66563–66567 行才对普通候选做视线优先与最近者回退。不能概括成绝对视线约束。

## E12

表现：`oh`/键索引、`sh`/回调表取值在 21205–21222；`ly` 音频调用在 34589–34594。飞叶 trail/hit 为 16918–16929；十万伏特 link 为 17385–17389；日光束 beam/cast 为 16968–16975。音频表位于更早的同名招式键条目，不能把第一次字符串命中误认成战斗执行入口。

## 研究与复核边界

数据和学习路径由独立只读研究者核对，执行、命中与结算由主代理逐段核对；所有结果以同一主模块摘要绑定。独立检查和数学算例不算实机验证。当前文档交付给游戏路线，由其决定如何引用；本次没有修改游戏路线的玩法、制作规格或工程。

返回：[研究报告](PokéBonk—普通招式执行路径—mvnpa0xv.md)、[REA 目录](README.md)。
