# 三人地牢试开发

本仓库正在按获准准备包开展阶段3—4：先做能运行、能保存的一轮，再完成探索、战斗、邀请、撤离／全灭和独立重开的单层片段。采用Phaser 4.2.1＋TypeScript与Vite，使用自制几何占位和人工试验数据。本阶段交付私有网页构建，Windows Electron封装留待后续。

## 项目方向

- 每局进入随机地牢探索，包含轻度撤离带出机制；伙伴、招式机和特殊物品可用于以后冒险，具体保留和损失规则待设计。
- 可以采用 Pokémon Showdown 数据库，首批阵容从某个时代中选取有限而多样的子集。
- 角色视觉参考 Big Kid Nation 的 Pokémon Arena 2D；研究 PokéBonk 的招式适配、融合及内容生产方法。
- 本片段采用行动推进回合、三人同行、固定队列与一次伙伴干预；数据时代、正式名单、融合和长期经济不在本次实现范围。

## 入口

- [当前约束与后续代理规则](AGENTS.md)
- [当前授权、固定规格与分工](docs/trial-spec/README.md)
- [规则与输入](docs/trial-spec/玩法研究/单层试开发短规格.md)
- [验收与观察场景](docs/trial-spec/玩法研究/试开发验收与观察场景.md)
- [2026-10-25历史研究快照](docs/research/README.md)
- [云端环境准备说明](cloud/README.md)

研究主库的定位方式见AGENTS.md。当前12份精选规格来自已合入研究PR #4的固定提交5f35478，来源和派生摘要见[当前来源清单](docs/trial-spec/source-manifest.json)。`docs/research/`与`docs/research-snapshot.json`保留2026-10-25原字节，仅作历史参考。私有运行证据在被忽略的`.artifacts/trial/`，凭据不进入仓库。

本仓库名称是准备阶段的工作名称，不代表游戏名称或发行决定。
