# 独立验收：当前结果

当前候选树：`b066d9230addf4eb195e259c9e80bcf126065c26`。
规格来源：`392fyc/pokemon-game-research@5f3547889b30e59f6cdfebc5af8c91e46cba4ee4`。
当前收据：[result-b066.json](result-b066.json)。

## 当前结论

本轮对实际TrialStore重跑24项独立保存检查，24项通过。此前“待邀请存档只改phase即可跳过邀请”的S9失败已修复。
仅就已声明的纯规则、初态与保存API范围，没有遗留阻断；整合候选与真实浏览器结果仍需另核，不能据此宣称整个游戏或I1通过。

| 对象 | 固定blob | 证据 |
| --- | --- | --- |
| engine.ts | df1d45f1d0311435232411e358b39201be800a1d | 复用此前32项规则通过，未重跑 |
| scenarios.ts | 00b0c1c37633486c013ebf92af128ce3c463cb82 | 复用此前14项初态通过，未重跑 |
| save.ts | 146fca2d1bac03db24f0e93f0817f0b8da7c06dc | 本轮24项保存检查通过 |
| main.ts | 728b69a68b2fc561c15c3226953955c33c9a11fc | 差异静态核对：仅blur增加render；未在REA运行浏览器 |

## 运行方式

使用Node24.22.1，无需额外测试框架：

```sh
node --experimental-strip-types tests/acceptance/rules.test.mjs
node --experimental-strip-types tests/acceptance/scenarios.test.mjs
node --experimental-strip-types tests/acceptance/save.test.mjs
```

fixtures.mjs由规格独立填写；不导入生产场景、寻路、伤害或资源工厂计算预期。
rules.test覆盖M1—M6及无邀请分支、V1—V13核心行为、K1—K5分支；K5的A/B为12/20。
scenarios.test只把生产场景当被观察对象，比较独立初态；内部挡路者名字、已死敌人登记项和未入场模板坐标不作为规则差异。
save.test调用真实TrialStore，在存储端口注入失败及异步暂缓；没有替换保存协调器。预期来自固定字面结果或不变性要求。

## 尚未由本环境验证

V2界面草稿取消/编辑者显示、I1键盘重复/失焦/跨面板确认、实际浏览器关闭恢复与origin、Windows表现，以及安装/类型检查/生产构建。
主会话已有浏览器证据由其单独维护，不伪称REA亲测。当前修复未改变既有测试本体，不增加非法存档枚举。

## 历史失败

[history/result-81.json](history/result-81.json)保留树81ebef0b上的23/24保存结果及S9复现，不能作为当前报告。
更早save a8deddf7的负PP和缺邀请unit失败也记录在历史收据中，已在后续版本修复。

本次不修改生产代码、根配置或依赖，不创建正式提交、分支更新或PR评论。
