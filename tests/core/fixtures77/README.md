# 7.7 存档迁移旧样本

`v1-profile-current.json` 是冻结复制自 `../fixtures72/save72-plain.json` 的规则/内容 v1 存档，来自旧实现的静态保存样本。`v1-location-parts.json` 中的档案实例、招募邀请单位、无物种单位和楼层敌人都从该旧存档的对象字段复制并按各位置的旧格式制成独立片段；其中无物种 `strong/push` 单位沿用旧 `newcomer()` 的 PP 形状。`v1-recent-world.json` 是该冻结 v1 当前远征的旧 `recent` 外形，保留旧行为键和缺失的新状态字段。`v1-scenario-recruit.json` 对应仓库原 `scenarios.ts` 的 V13 固定场景：队员与敌方 `recruit` 都保留旧行为/PP 键。

测试把这些被冻结的 v1 片段放入各自位置，未用新版构造器生成旧格式存档。
