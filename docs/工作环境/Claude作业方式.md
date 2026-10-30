---
tags:
  - 工作环境/配置
  - 项目/分工
updated: 2026-10-30
---
# Claude 主会话的作业方式

2026-10-30 起，后续工作由本机 Claude Code 主会话接手。同日稍后，用户让本机 Codex 重新上线并行开发：Claude 主导 `main` lane，Codex 主导 `dev` lane，分工以[多 lane 并行协作](多lane并行协作.md)为准；本页仍描述 Claude 一侧怎样执行。原来"Codex 主会话 + 两个 Codex Cloud 环境"的分工见[研究范围与双云分工](../市场研究/研究范围与双云分工.md)，那份记录保留历史身份。本页回答：两个云环境都属于 Codex（ChatGPT 账号），Claude 无法派任务过去，那么原来由它们承担的工作现在由谁做、怎样保持独立、结果怎样交付。

## 起点：哪些执行位置真实可用

以下事实于 2026-10-30 在本机核对：

| 位置 | 实际情况 | 能否由 Claude 直接使用 |
| --- | --- | --- |
| 本机 Windows | Node 24.22.1、npm 11.16.0、Edge 156、Playwright（npx 缓存中的 1.59.1）、`gh`、git-safe 均可用；Claude 对 PR #5 的两轮审核就用这套环境跑通（实现方的 Windows 检查另用 Playwright 1.62.1，见验收记录） | 能 |
| 本机原生子代理 | 项目已装 `mercury-dev`（Sonnet）、`mercury-reviewer` 与 `mercury-acceptance`（Opus）；后两者是只读角色，有防写守卫 | 能 |
| Codex Cloud：`pokemon-dungeon-lab` 与 REA 环境 | 属于 ChatGPT 账号，见 [REA 与 Codex Cloud](REA与CodexCloud.md) 和仓库的 `cloud/README.md` | 不能；只有用户能手动开任务 |
| Claude 云环境 | 账号下只有一个与本项目无关的环境；本项目尚未建立专用环境 | 能，但需先建环境（见下文） |

## 原角色怎样对应

| 原角色 | 现在由谁承担 | 怎样保持独立 |
| --- | --- | --- |
| Codex 主会话：规格、整合、正式交付 | Claude 主会话（Opus） | 不变 |
| 游戏云：实现 | `mercury-dev` 子代理，在自己的 `.worktrees/<任务>/` 中写代码；简单改动由主会话直接完成 | 只改分配的写入范围；交回本机实际运行的检查结果 |
| REA 云：独立验收与问题核查 | `mercury-acceptance` 做盲验收，`mercury-reviewer` 做审查 | 只给规格、验收条件和固定候选提交，不给实现思路；只读守卫阻止写入 |
| 主会话的 Windows 浏览器检查 | Claude 主会话 | 不变 |

这样替换的依据是：原来分出两个云环境，一是为了让实现者和验收者互不影响，二是为了在 Linux 上做交叉检查。前一个目的，本机子代理加上工作树隔离就能做到；后一个目的在阶段 5 不是必需，因为路线要求的是 Windows 实测。

这里有两个限制，需要如实说明：

- **独立性比两个云环境弱。** 子代理和主会话在同一台机器、同一账号下运行，能防止验收者照抄实现思路，却挡不住共用环境的问题。因此关键结论仍由主会话亲自复跑，并在报告中分开写明"亲自运行""复用"和"子代理自述"。
- **没有 Linux 交叉检查。** 需要时按下文建立 Claude 云环境，或请用户手动派一个 Codex 云任务。

## 交付方式

- **本机提交**：在任务 worktree 中经 `.mercury/packs/git-safe/scripts/git-safe.ps1` 执行 `add`、`commit` 和 `push`，提交前运行 `guard.ps1 mark-review`。任务分支按 `<type>/<purpose>-claude` 命名，再开 PR，由用户决定是否合并。
- **Codex 云的原发布方式**：阶段 3—4 采用"GitHub 连接器建树、提交并以 `expected_sha` 更新分支"，记录在[当前规格入口](../trial-spec/README.md)。这是 Codex 云在没有 Shell 推送能力时使用的方式，只在用户派发 Codex 云任务时继续沿用。
- **跨环境递交文件**：截图、视频、报告等文件用 `mercury-test-file-delivery` 技能，核验原字节后再采用。

## Codex 云的定位

两个 Codex 云环境保留不动，作为用户手动派发的可选通道，例如需要 Linux 交叉检查，或需要 REA 工具时。2026-10-30 本机 Codex 重新上线后，`dev` lane 的本机 Codex 也可以为自己认领的 issue 派发云任务，方针见[多 lane 并行协作](多lane并行协作.md)第 11 节；Claude 仍不能派发。它们交回的结果按其他代理的结论处理：先在本机核对固定提交和实际运行结果，再决定是否采用。

## Claude 云环境：需要时再建

2026-10-30 用户授权可以创建 Claude 云环境，并决定**等真正需要时再建**。以下情形值得建：

| 情形 | 云端带来的价值 |
| --- | --- |
| 需要 Linux 交叉检查 | 系统与本机不同，能发现与环境相关的问题 |
| 长任务要在用户关机后继续运行 | 云会话在关闭电脑后仍然运行 |
| 需要"另一台机器"级别的独立验收 | 隔离程度比本机子代理更高 |

Claude 云会话不会把结果直接回报给主会话，只留下分支或 PR。因此它适合可以无人值守的独立任务，不适合主会话边做边整合的工作。

依据 [Claude 云环境官方文档](https://code.claude.com/docs/en/cloud-environments)（2026-10-30 读取），准备好的配置如下：

| 项目 | 设定 | 依据或未核实之处 |
| --- | --- | --- |
| 名称 | `pokemon-dungeon-lab` | 不与其他项目共用环境 |
| 创建方式 | 在 claude.ai/code 或桌面应用新会话界面的环境选择器中选 **New environment** | 文档写明只能在界面中创建 |
| 网络 | **Trusted** | 默认允许列表包含 npm、nodejs.org、GitHub 和 `*.googleapis.com`，但不含 Playwright 的浏览器下载站。下载失败时改为 **Custom** 并加入 `cdn.playwright.dev`；这个域名是否足够尚未核实 |
| 安装脚本 | 从 nodejs.org 安装 Node 24.22.1 并按官方 SHASUMS256 校验，再安装 Playwright 的 Chromium | 默认镜像只有 Node 20、21、22，而本项目 `engines` 要求 Node ≥ 24.22.1；脚本须在约 5 分钟内完成，环境才会被缓存 |
| 依赖安装 | 会话开始后按锁文件执行 `npm ci` | 不写进环境镜像，以免锁文件更新后镜像过时 |
| 密钥与环境变量 | 不设置 | 本项目不需要 |
| GitHub 访问 | 需在私有仓库安装 Claude GitHub App，或通过 `/web-setup` 连接 | 本仓库是否已连接尚未核实 |

环境建好后，先开一个只读会话核对工具链，确认无误再派正式任务。Linux 上的检查结果不能当作 Windows 已通过。

## 共同规则

- 每个等待都事先设定截止时间（见 AGENTS 受管段 "Waiting on long-running work"）；超时就如实报告当时的状态，不无限等待。
- 派给不加载本仓说明的代理时，在派发提示中重述费曼解释和第一性原理两条规则。
- 涉及代理规则、权限或跨仓写入的改动，先做独立审查。
