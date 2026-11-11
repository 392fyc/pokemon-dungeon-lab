---
tags:
  - 工作环境/配置
  - 项目/分工
updated: 2026-11-12
---
# Claude 主会话的作业方式

2026-10-30 起，后续工作由本机 Claude Code 主会话接手。同日稍后，用户让本机 Codex 重新上线并行开发：Claude 主导 `main` lane，Codex 主导 `dev` lane，分工以[多 lane 并行协作](多lane并行协作.md)为准；本页仍描述 Claude 一侧怎样执行。原来"Codex 主会话 + 两个 Codex Cloud 环境"的分工见[研究范围与双云分工](https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/06-%E7%A0%94%E7%A9%B6/%E5%B8%82%E5%9C%BA%E7%A0%94%E7%A9%B6/%E7%A0%94%E7%A9%B6%E8%8C%83%E5%9B%B4%E4%B8%8E%E5%8F%8C%E4%BA%91%E5%88%86%E5%B7%A5.md)，那份记录保留历史身份。本页回答：两个云环境都属于 Codex（ChatGPT 账号），Claude 无法派任务过去，那么原来由它们承担的工作现在由谁做、怎样保持独立、结果怎样交付。

## 起点：哪些执行位置真实可用

以下事实于 2026-10-30 在本机核对：

| 位置 | 实际情况 | 能否由 Claude 直接使用 |
| --- | --- | --- |
| 本机 Windows | Node 24.22.1、npm 11.16.0、Edge 156、Playwright（npx 缓存中的 1.59.1）、`gh`、git-safe 均可用；Claude 对 PR #5 的两轮审核就用这套环境跑通（实现方的 Windows 检查另用 Playwright 1.62.1，见验收记录） | 能 |
| 本机原生子代理 | 项目已装 `mercury-dev`（Sonnet）、`mercury-reviewer` 与 `mercury-acceptance`（Opus）；后两者是只读角色，有防写守卫 | 能 |
| Codex Cloud：`pokemon-dungeon-lab` 与 REA 环境 | 属于 ChatGPT 账号，见 [REA 与 Codex Cloud](https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/07-%E5%B7%A5%E4%BD%9C%E7%8E%AF%E5%A2%83/REA%E4%B8%8ECodexCloud.md) 和仓库的 `cloud/README.md` | 不能；只有用户能手动开任务 |

## 原角色怎样对应

| 原角色 | 现在由谁承担 | 怎样保持独立 |
| --- | --- | --- |
| Codex 主会话：规格、整合、正式交付 | Claude 主会话（Opus） | 不变 |
| 游戏云：实现 | `dev` lane 的 Codex（D-20261030-07、D-20261111-01）：Claude 主会话出设计与实装方案并审查代码，不直接改代码，也不派 `mercury-dev` 写代码（用户 2026-11-12：“你实装作业我是不是要求都给codex？”，见 [#222 评论](https://github.com/392fyc/pokemon-dungeon-lab/issues/222#issuecomment-6804537146)） | Codex 在自己的分支实现并附自测证据，main 审查后合并 |
| REA 云：独立验收与问题核查 | `mercury-acceptance` 做盲验收，`mercury-reviewer` 做审查 | 只给规格、验收条件和固定候选提交，不给实现思路；只读守卫阻止写入 |
| 主会话的 Windows 浏览器检查 | Claude 主会话 | 不变 |

这样替换的依据是：原来分出两个云环境，一是为了让实现者和验收者互不影响，二是为了在 Linux 上做交叉检查。前一个目的，现在由 Codex 实现、Claude 主会话与只读子代理审查来做到；后一个目的在阶段 5 不是必需，因为路线要求的是 Windows 实测。

这里有两个限制，需要如实说明：

- **独立性比两个云环境弱。** 子代理和主会话在同一台机器、同一账号下运行，能防止验收者照抄实现思路，却挡不住共用环境的问题。因此关键结论仍由主会话亲自复跑，并在报告中分开写明"亲自运行""复用"和"子代理自述"。
- **Linux 交叉检查由 `dev` lane 的 Codex 按其流程做**（D-20261103-14；Claude 云会话已停用）。

## 交付方式

- **本机提交**：在任务 worktree 中经 `.mercury/packs/git-safe/scripts/git-safe.ps1` 执行 `add`、`commit` 和 `push`，提交前运行 `guard.ps1 mark-review`。任务分支按 `<type>/<purpose>-claude` 命名，再开 PR，由用户决定是否合并。
- **Codex 云的原发布方式**：阶段 3—4 采用"GitHub 连接器建树、提交并以 `expected_sha` 更新分支"，记录在[当时的规格入口（固定提交 d03ef51）](https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/90-archive/trial-spec/README.md)。这是 Codex 云在没有 Shell 推送能力时使用的方式，只在用户派发 Codex 云任务时继续沿用。
- **跨环境递交文件**：截图、视频、报告等文件用 `mercury-test-file-delivery` 技能，核验原字节后再采用。

## Codex 云的定位

两个 Codex 云环境保留不动，作为用户手动派发的可选通道，例如需要 Linux 交叉检查，或需要 REA 工具时。2026-10-30 本机 Codex 重新上线后，`dev` lane 的本机 Codex 也可以为自己认领的 issue 派发云任务，方针见[多 lane 并行协作](多lane并行协作.md)第 11 节；Claude 仍不能派发。它们交回的结果按其他代理的结论处理：先在本机核对固定提交和实际运行结果，再决定是否采用。

## 共同规则

- 每个等待都事先设定截止时间（见 AGENTS 受管段 "Waiting on long-running work"）；超时就如实报告当时的状态，不无限等待。
- 派给不加载本仓说明的代理时，在派发提示中重述费曼解释和第一性原理两条规则。
- 涉及代理规则、权限或跨仓写入的改动，先做独立审查。
