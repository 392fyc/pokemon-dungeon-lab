# 宝可梦二维迷宫研究与环境准备

本仓库用于筹备一个能够独立运行的二维迷宫游戏，目标平台为网页和 Windows。当前已授权研究整理及 Codex Cloud 环境配置，尚未开始游戏功能开发。

## 项目方向

- 每局进入随机地牢探索，包含轻度撤离带出机制；伙伴、招式机和特殊物品可用于以后冒险，具体保留和损失规则待设计。
- 可以采用 Pokémon Showdown 数据库，首批阵容从某个时代中选取有限而多样的子集。
- 角色视觉参考 Big Kid Nation 的 Pokémon Arena 2D；研究 PokéBonk 的招式适配、融合及内容生产方法。
- 引擎、语言、数据时代、首批名单、战斗时间推进方式及是否加入融合，均未确定。

## 入口

- [当前约束与后续代理规则](AGENTS.md)
- [研究资料快照](docs/research/README.md)
- [已确定方向与未决问题](docs/research/项目目标与当前决策.md)
- [数据、素材与内容制作流程](docs/research/制作流程/数据素材与内容制作总览.md)
- [云端环境准备说明](cloud/README.md)

研究主库是本机由 Obsidian 管理的 vault，定位方式与使用规则见 AGENTS.md 受管段「Linked repositories」中的 Pokemon_Game_Research。这里的资料是 2026 年 10 月 25 日用于云端工作准备的快照；来源清单和 SHA-256 位于 `docs/research-snapshot.json`。`.obsidian` 配置、其他项目资料和凭据不进入本仓库。

本仓库名称是准备阶段的工作名称，不代表游戏名称或发行决定。
