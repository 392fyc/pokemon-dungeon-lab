# PR #5四项交互修复：独立验收入口

当前候选：`374b916852dfe38ddb4c68ac253ddec5b6ffe7c7`，基线提交`2a79ba37c4f3d5f4df096be388c63b783ef87883`。
当前收据：[result-pr5-fixes.json](result-pr5-fixes.json)。
规格仍为已批准短规格，不修改规格来适配实现。

## 本轮结果

REA Linux、激活后的Node24.22.1：37项规则、14项场景初态、24项实际保存检查，合计75项全部通过。
使用真实engine和TrialStore；预期为独立字面夹具/固定结果，不调用生产计算器生成。
旧测试将重复collect视为合法空等一轮的预期错误，已依据短规格改为整轮拒绝。
G/T用后仍可合法撤离；V3先正常移动到出口再检验，不把站错格当成纯出口拒绝。

| 重点 | 本轮证据 |
| --- | --- |
| G/T重复取得、V3/V7纯出口取得 | 规则实际拒绝，完整世界不变；合法退出继续可用 |
| 墙、未揭示、前序B占格及既有其他拒绝 | 独立规则实际检查具体原因及“本轮未执行”，无状态推进 |
| V10拒绝确认Esc返回比较 | main差异符合；已准备真实按钮/键盘用例，REA未运行浏览器 |
| 有草稿切主控提示取消，无草稿不误报 | main按钮与数字键两条路径差异符合；浏览器效果由主会话另记 |

生产engine blob：`f37d4e1dccab1899b60aa18cd867fbfcf2348ee8`。
main blob：`ffc4ff3bcd1cf85dc7af6aaf560ac206b1a78c7c`。
save仍为`146fca2d1bac03db24f0e93f0817f0b8da7c06dc`；保存测试未改写。

## 复现命令

```sh
node --experimental-strip-types tests/acceptance/rules.test.mjs
node --experimental-strip-types tests/acceptance/scenarios.test.mjs
node --experimental-strip-types tests/acceptance/save.test.mjs
```

浏览器脚本新增4组PR5定向检查，并收紧原V1原因断言。关键交互通过实际按钮/键盘，状态和localStorage只读观察。
可用`TRIAL_CHECK_FILTER=PR5`筛选；Windows Edge/Playwright和实际地址沿用环境变量配置。
保存隔离机制不变，不用内部命令注入替代按钮操作。
正常揭示总会暴露相邻地面，因此“未揭示格”只用独立引擎夹具，不伪称浏览器自然流程已覆盖。

本轮REA没有候选Phaser/Vite依赖及已运行构建，未执行这4组或全19组浏览器检查。主会话在Windows实际运行的19组结果见[实现验收记录](https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/90-archive/%E8%AF%95%E5%BC%80%E5%8F%91/trial-acceptance-2026-10-29.md)，不算作REA亲测。
不把代码差异检查称为真实UI验证，不把程序通过称为玩家体验通过。
未重做依赖安装、生产构建、操作系统焦点或性能检查。

## 历史证据

[result-b066.json](result-b066.json)及[history/result-81.json](history/result-81.json)保留原字节，分别记录前轮通过与历史失败，不是本轮当前报告。
本轮写入仅限测试文件和此入口/新收据；不改生产、规格、受管内容，不创建commit或更新ref。
