---
tags:
  - 路线/REA辅助研究
  - 项目/PokeBonk
  - 证据/索引
updated: 2026-10-25
build: mvnpa0xv
---
# 存档与恢复路径的证据索引

对应[研究报告](PokéBonk—存档与恢复路径—mvnpa0xv.md)。本索引的 S00–S12 对应报告中的命题；行号属于固定摘要的显示文本，原始范围在机器索引中。压缩符号不作为跨构建接口。

## S00

### 目标与输入

- 版本 0.8.47，构建 mvnpa0xv。2026-10-25 再次核对官网 HTML 构建和主模块内容；[本轮来源核对记录](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/input-provenance.json)保留时间、URL、摘要和复用路径。
- [主模块原始捕获](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/raw/assets/main-DasJJ4XQ-mvnpa0xv.js)：SHA-256 `4E050B55FF580A8B85FB5E6CFFFBDD5A9A168F30192AC80AB359704C353D95F1`，2,239,152 字节。
- [显示文本](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/main.formatted.js)：SHA-256 `EF80663AC5EFCA3E54A76FC865D21108D70E17B2682F024BF3CD0AA68AB75998`。沿用上轮 Babel 惰性解析与排版，没有执行脚本。
- [原始捕获清单](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/capture-manifest.json)、[上轮排版来源记录](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/format-provenance.json)、[生成的显示映射](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/main.formatted.js.map)。
- [本轮函数与对象形状索引](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/derived/evidence-index.json)，由[只读索引脚本](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/derived/index-save-path.mjs)生成，列出 63 个选定锚点及 47 处对象结构。脚本使用现有 Babel，仅分析语法树，不导入或执行目标模块。
- 原始范围是 UTF-16 字符索引，起点包含、终点不包含；原始列从 0 开始、行从 1 开始。不要视为字节偏移。

### REA 的实际使用

工具为 REA 6.7.0，源码提交 `475f09d5ca4f854cbc634074d5534717d58c6664`；Node.js 24.22.1。本轮仓库命令以 `D:\Project\rea` 为工作目录，未安装、构建或升级工具。

由于当前官方主模块摘要没有变化，复用[上轮完整应用 Evidence](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/evidence/application.evidence.json)，没有重做整份大型分析。父记录：

`ev_8368982231071ab2b35aea9779b0e0d8114e34d86400f3128325c616efcf70ff`

本轮将 bundle 中该条规范记录作为 application 输入，执行：

```powershell
node scripts/rea.mjs trace-application-feature D:\Project\Pokemon_REA_Workbench\pokebonk\2026-10-25-mvnpa0xv-save\evidence\trace-live-feature-v2.input.json --format json
```

输入 seed 为 `{kind:"string", value:"pb.live", match:"exact", case_sensitive:true}`，direction 为 outgoing。命令输出重定向到本轮证据目录；复做应另选路径，保留现有结果。

| 记录 | 实际结果 |
| --- | --- |
| [最终追踪结果](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/evidence/trace-live-feature-v2.result.json)、[退出码](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/evidence/trace-live-feature-v2.exitcode.txt)、[日志](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/evidence/trace-live-feature-v2.stderr.log) | 退出码 0；Evidence ID 为 `ev_66b1dba5e7b3ba6a28fb8f3a37665c860ac240fe4cf71a80d85ad991e6fc653f` |
| 匹配与覆盖 | 1 个 seed、1 个节点、0 条边；coverage=partial，source_graph_status=partial |
| 节点含义 | 节点标签为 pb.live，工具将其分类为 endpoint；这不是它已被证明为网络端点。源码显示本轮所查用法是本地存储包装器的键 |
| 可用范围 | 该追踪只提供一个字面量定位线索，没有自动证明完整字段传递和恢复调用链；具体链路由源码核对 |
| 父分析限制 | 原应用图为部分覆盖；语义图曾触及每文件 20,000 节点及 20,000 未知记录上限。见[父摘要](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/evidence/application.summary.json)，不能用零条边作不存在调用的证明 |
| 输入修正记录 | [首次结果](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/evidence/trace-live-feature.result.json)退出码 1：将整个 bundle 当成单条 Evidence，触发结构校验。后续改为精确选取父记录后成功；没有改写父证据或重跑源分析 |

[最终输入](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-save/evidence/trace-live-feature-v2.input.json)含完整父记录，体积较大，默认先读结果与索引。上述证据都属于静态分析，未产生目标运行观察。

## S01

招式实例与升级：

- Kv：34322–34357。level=1、timer=0.4、mods 默认值；phase/active/tick/aim/charging/orbHits/burst/sub/swapT/parents/extra 等为实例字段。
- Yv：34434–34470。按升级选择数组改变等级和 mods；等级本身不足以重现不同选择。
- Gy.addMove：36965–36970。从 Hv 定义创建 new Kv；此函数不读取历史 build。
- 玩家构造初值：36763–36777；Gy.constructor：36867–36869，recompute 后设置 hp=maxHp。

## S02

运行时到成果对象：

- WO.build：66839–66862；moves 的 k/lv/dmg 位于 66845–66849；items、vits、stats、passive 和 peak 位于 66850–66860。
- WO.result：66863–66941；角色等级与最终物种、招式键、统计、end 等；生成 build 的 try/catch 位于 66930–66939。
- WO.keepLive：66942–66952；result(false) 及捕获相关集合。
- 原始范围：WO.build [1501691, 1502127)，WO.result [1502127, 1503500)，WO.keepLive [1503500, 1503699)。三者位于原始第 1072 行；具体列见机器索引。
- “未保存 mods／计时”的范围是这些成果对象及 S03 的 progress，不是对服务端所有数据表的断言。

## S03

长期档案基线与进度声明：

- aM.beginRun：70997–71001。获取 ticket、扣减开局 boosts 对应本地 bag、structuredClone(profile) 为 snap。
- aM.report：71005–71029。对计数器和研究取正向差值；seen、forms 取新项，league/shinies/classics 来自本次集合。
- aM.keepLive：71030–71032。要求 ticket.id 和 snap 存在。
- aM.endRun：71043–71064。发送报告，成功采用响应 profile，失败 adopt 开局基线。
- aM.adopt/rebase：70812–70836。替换档案并保留部分偏好，对正在进行的进度差值作合并。snap 是长期档案基线，不是 Kv 或战场序列化。

## S04

记录触发、模拟时间与检查点：

- 主模块 MO=30：65748；nextCp/nextLive：65977–65978；WO.simulate：67363–67368。
- 配置 heartbeat=60：[news 显示文本](../../../Pokemon_REA_Workbench/pokebonk/2026-10-25-mvnpa0xv-moves/derived/news.formatted.js) 3625 行。与主模块导入配置及 S.heartbeat 使用共同核对。
- WO.checkpoint：66812–66821。t/stage/kills/level/damage/splits，再 keepLive。
- AV.checkpoint/flushCps：92472–92490。内存排队、发送 checkpoints，成功后从队列删除该批。
- 页面 pagehide：93399；freeze/visibilitychange：93422–93423。
- 捕获进度后 keepLive：46881–46884、46930。
- 这是静态调用与时间条件，没有实测定时精度、崩溃损失窗口或浏览器事件可靠性。

## S05

本地 live、pending 与中断补交：

- vV 存储包装器：92183–92202。get 用 JSON.parse，set 用 JSON.stringify；失败被捕获。
- 浏览器锁名、心跳键、超时常量：92204–92207；wV：92208–92214。若能查询锁，要求该锁仍持有且标记年龄小于 180 秒；否则回退标记年龄小于 8 秒。这只是该客户端的活跃判定条件。
- AV.keepLive：92492–92538。建立活跃标记；旧局不再活跃时可入 pending；写 live 的 ticket/result/acc/cps；end.how=rescued；cps 最后最多 300 条；pending 最后最多五条。
- AV.endLive：92539–92541。
- AV.flushNow：92613–92650。按账号筛选、旧 live 转 pending、发送 finish、处理结果。
- AV.flushNow 原始范围 [2202427, 2203299)，原始第 1079 行，列 [104770, 105642)。
- 此处 rescued 表示中断成果补交，不是本作伙伴救援设计的证据。

## S06

正常结束与提交失败：

- WO.finish：66953–66977；aM.endRun：71043–71064。
- AV.finishRun：92542–92576。移除 live、结束活跃标记；有效 ID 检查；先登记 pending，再请求 finish；成功移除 pending 并规范化响应 profile。
- AV.dropPending：92577–92579；retryLater：92584–92592；flushNow：92613–92650。
- EV 与 TV：92215–92221。offline/maintenance 可重试；服务端 5xx 及部分其他 4xx 可重试，明确排除 400/404/409/410/413/422；不能推断这些状态在服务端的业务含义。
- flushNow 对 409 的处理：92644–92647，客户端计为 saved 并通知界面；不能据此证明服务器已将奖励入账或保证幂等。

## S07

登录身份恢复和长期档案载入：

- AV.restore：92334–92347。读取 pb.session，调用 /auth/me；401 清除会话。
- AV.loadProfile：92432–92440。尝试 flushPending、最多等待 6 秒的竞速，再 GET /profile，并 Aj(r.profile)。
- VV 初始化：93482–93493；VV.signedIn：93495–93502；aM.load：70800–70802。
- 这条 restore 恢复的是登录会话与随后读取的 profile，所查代码不向 WO/Kv 注入旧战斗状态。本轮未读取真实用户存储，也未验证登录和请求成功。

## S08

下一局的新对象：

- VV.openRun：93589–93626。开始请求的字段、ticket.seed/boosts、旧对象 dispose、新 WO。
- WO.constructor：65985–66006；applyBoosts：66039–66051；首次 buildStage：66055–66074。
- 66067–66069 创建 Gy、投射物等，并按起始配置添加第一招；lab 属性及槽位加成从 meta 读取。
- Gy 默认字段/constructor 与 addMove 见 S01；普通实例经 Hv 创建。某些 boosts 会调开局等级与待升级次数，因此构造初值与最后开局数值要分开。
- VV.openRun 原始范围 [2227802, 2229167)，原始第 1079 行，列 [130145, 131510)。
- WO.resume：67190–67194，只将已有页面内 paused/modal 状态改回 play，没有读取或反序列化战斗快照。

## S09

长期 profile 的客户端结构与规范化：

- kj：70520–70573，默认 profile；Aj：70574–70600，合并默认值、设置及若干数组/对象/数值的缺省修补。
- aM.load：70800–70802；Jj：70704–70715，刷新日/周任务；openBiomes：70803–70805。
- aM.adopt/rebase：70812–70836。客户端载入、响应采用与并发进度合并。
- 默认 profile 中没有逐招等级和 mods 字段；Aj 保留响应对象的其他字段，因此不能仅靠默认结构声称服务端绝无额外资料。

## S10

持久资料的写入入口与下一局使用：

- aM.save/saveNow：70806–70811；AV.savePrefs：92441–92452。只发送明确列出的设置、选择与外观/team 字段，不能把 save 理解为整份档案直接写盘。
- aM.act、flush、buyLab 等：70853–70906；AV.actions：92731 行开始，POST /profile/actions 后采用响应。
- aM.labStats：70930–70938；WO 读取实验室次数/槽位：66003、66067；永久属性传给新玩家，不是继承旧招式 mods。
- team 切换与 league 检查：70977–70989、71065–71067。
- boosts 扣减：70997–71001；选择界面：83838 行起；WO.applyBoosts：66039–66051。
- 对返回 profile 的依赖只证明客户端契约，未验证服务器权威计算、实际持久化或跨设备同步。

## S11

本地配装计划：

- NA：69519；FA：69521–69530；IA：69531–69551；RA：69561–69576。
- 内容限于四类经过筛选的列表；没有招式等级、mods 或运行状态。
- XA：69631–69652，用当前玩家已拥有的内容计算 done。
- 计划说明与界面：70022 行起。来源支持将它解释为希望获得的内容与局内提示，不能等同已拥有物品或可继续的一局。

## S12

历史展示与“重建”误读：

- BM：72309–72421。读取 build 与 moves，名称键查当前资料；72324–72328 为无 build 的回退；72355–72368 显示等级和累计伤害占比。
- HM：72468–72502；AV.runBuild：92790–92792。读取往期配装并进入展示。
- Wk：68737–68753。new Kv、复制 level/mods、尝试 Yv，用于升级对比；不是读存档。
- 所查展示函数没有向当前玩家恢复这些历史等级与统计，也不能由显示内容反推服务端存了完整运行状态。

## 复核与交付范围

长期 profile 与本地计划路径由独立只读研究者核对；主代理核对成果、补交、新局创建及字段边界。未执行目标程序，未访问真实业务会话或服务器实现。静态复核不等于完成真实读档、崩溃恢复或后台奖励验证。

返回：[研究报告](PokéBonk—存档与恢复路径—mvnpa0xv.md)、[REA 目录](README.md)。
