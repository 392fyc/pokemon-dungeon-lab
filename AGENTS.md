<!-- MERCURY:BEGIN managed by tools/mercury.py from the packs in .mercury/config.json; edits here stop the installer, change the pack and run apply -->
## Mercury-managed section

This section, from the begin marker to the end marker, is installed and kept up to date by Mercury
(`python tools/mercury.py apply`) from the packs the project selects in `.mercury/config.json`. Do not edit it by
hand: a hand edit stops the next apply. Everything outside the markers belongs to the project and is never touched.
Paths Mercury manages, and who may change them, are listed in `.mercury/packs/core/docs/mercury-harness-ownership.md`.

## Explanation and reasoning

These rules bind the main agent and every subagent in both Codex and Claude Code, in every kind of task.

- **Explain the Feynman way.** When you explain, report, review, or hand off, write so that someone outside the task can follow it. Use plain words, define each term the reader may not know, build from what the reader already knows, and back each point with a concrete example or the actual evidence. If you cannot explain a point simply, treat it as a gap in your own understanding: return to the source and close the gap, or mark the point as unresolved. Do not cover it with jargon.
- **Reason from first principles in research, design, and investigation.** Start from the goal, the hard constraints, and facts verified in primary sources or by direct observation, and build the conclusion up from them. Treat conventions, analogies, existing implementations, earlier conclusions, and other agents' claims as hypotheses to check, not as premises. State the assumptions a conclusion depends on and label any that remain unverified. Check the assumptions the conclusion actually depends on, in proportion to risk; evidence that stays applicable under the evidence-reuse rules counts as verified fact. User decisions and authorization are constraints, not hypotheses.
- **Carry the rules into delegation.** When you delegate to an agent that does not load these instructions, restate both rules in the delegation prompt. Examples: Claude Code's built-in Explore and Plan agents, agents defined with `omitClaudeMd`, and agents working in another repository or directory that has its own instructions.

## Scope, verification, and completion

Use .mercury/packs/core/docs/mercury-task-contract.md for
bounded scope, test relevance, evidence reuse, provenance-check triggers,
review, and completion. Read its details when needed for these decisions;
it does not add a mandatory workflow or weaken governing requirements.

## Mercury roles and Git safety rules

- Mercury installs five roles for both hosts: `mercury-dev`, `mercury-reviewer`, `mercury-acceptance`, `mercury-design` and `mercury-research`, as `.claude/agents/mercury-*.md` and `.codex/agents/mercury-*.toml`. They are generated from `.mercury/packs/core/roles/`; change the source in Mercury, not the generated files. A project role of the same name in `.claude/agents/` takes priority over a user-level one, so these project roles apply in this project.
- `mercury-reviewer`, `mercury-acceptance`, `mercury-design` and `mercury-research` are read-only. Codex enforces this with the sandbox; the Claude roles run a `PreToolUse` guard (`.mercury/packs/core/hooks/readonly_guard.sh`) that blocks write commands in Bash and PowerShell. The guard is best-effort, not an operating-system sandbox. A project can name more write-type scripts in `params.guard_write_scripts` in `.mercury/config.json`, and scripts that write only for some `-Action` values in `params.guard_write_actions`.
- A project's own roles and skills live in its project area: declared in `.mercury/local.json`, with role sources in `.mercury/local/roles/`. Mercury's installer (`tools/mercury.py apply`, run from a Mercury checkout) generates their `.claude/agents/`, `.codex/agents/` and skill entry files without the `mercury-` prefix; change the source or the manifest, never the generated files. Mercury updates do not touch this area.
- `.codex/rules/mercury-git-safety.rules` forbids raw `git push` and direct switching to `develop`, `main` or `master` in Codex. Perform Git writes through the controlled entry point that this project's own instructions name; never bypass a denial through another shell.

## Mercury updates (deploy pack)

- `.github/workflows/mercury-update.yml` and `.github/workflows/mercury-verify.yml` are managed files: Mercury renders them from `params` in `.mercury/config.json` (`integration_branch`, `required_checks`, `update_schedule`). Do not edit them by hand; change the params and run the installer from a released Mercury commit.
- Updates arrive on their own. GitHub runs scheduled workflows only from the default branch, so when that is not the integration branch the scheduled run only starts the same workflow on the integration branch (`gh workflow run`); the update itself always runs from the integration branch's own copy. A scheduled job takes the latest released Mercury commit (`origin/master` of Mercury), and when the managed files differ it opens one pull request from a `mercury/update-*` branch into the integration branch. The same job merges that pull request (squash) only when every condition holds: the source commit is on Mercury's `master` and descends from the recorded one, only Mercury-managed paths changed, and the project's required checks plus the `Mercury verify` check (a GitHub Actions check run, not a status) are green on the exact head. Paths the new release stops shipping may only be deleted. Otherwise it stops and says why.
- Do not push to, force-push or rebase a `mercury/update-*` branch, do not edit `.mercury/config.json` inside an update pull request, and do not merge an update pull request by hand to get around a failed condition; fix the cause or ask the project owner.

## Linked repositories

Declared in `linked_repos` in `.mercury/config.json`; Mercury renders this section from it. Each entry says what the repository is for, how to find it without a machine path, how to use it quickly (skills, scripts, commands) and the rules that bind work in it. Anything its rules do not allow needs its own authorized scope.

### Pokemon_Game_Research

- Purpose: Obsidian vault with the main research library (PokéBonk, Pokémon Arena 2D, data and asset pipeline, decisions); docs/research in this repository is a dated snapshot of it.
- Locate: PDL_RESEARCH_ROOT, else the research_root key of the ignored .local/roots.json in the main checkout. Stop when neither is set; never guess from a parent directory.
- Use: Start from its README.md, which indexes the research by question, and 项目目标与当前决策.md for what is decided; docs/research-snapshot.json here lists the snapshotted sources with SHA-256.
- Rules: Read and write only through Obsidian MCP or CLI after verifying the vault; never edit notes with Computer Use. The snapshot here never overwrites the vault automatically; a sync compares source and target and records the actual file list.
<!-- MERCURY:END -->

# 代理工作约定

## 当前范围

2026-10-29用户已批准按研究PR #4准备包开始阶段3—4试开发，并采用Vite。固定来源为pokemon-game-research@5f3547889b30e59f6cdfebc5af8c91e46cba4ee4。范围内同步规格、安装锁定依赖、建立工程、运行规则／保存／浏览器检查和交付私有可玩片段连续执行，不逐步询问。正式平衡、公开发布、网络扩权及第三方素材／数据引入不在本次范围。

先读README.md、docs/trial-spec/README.md，再读其中的当前规则、短规格和验收场景。docs/research/及其清单仅为2026-10-25历史快照。云端范围以本文件和用户较新的指令为准；不需要访问本机vault才能读取本仓固定规格。

## 设计边界

目标平台为网页和 Windows，二维随机迷宫，包含轻度撤离带出元素。可使用 Pokémon Showdown 数据；阵容以某个时代的有限多样子集起步。用户喜欢 Big Kid Nation 的 Pokémon Arena 2D 角色视觉样式。

本片段已采用Phaser 4.2.1＋TypeScript、Vite、行动推进回合和三人上限，具体执行按docs/trial-spec/当前入口。一张固定单层图、人工参数和自制几何占位；可返回、半额邀请、终局记录与独立重开是本轮获准的试验基准。时代基准、正式名单、长期培养、完整救援经济、素材许可路线和最终平衡仍待后续决定。

## 研究与验证

使用清楚的简体中文。解释时从目标、硬约束和直接核实的事实出发，说明具体例子、证据和仍未知的部分。区分开发者自述、网页观察、公开客户端静态分析、推断和实际运行验证。优先维护方一手资料，在线版本和计划继续依赖时重新核查。

角色截图只作研究参考，不视为生产素材。数据与素材分别记录来源、版本、署名和适用限制。不要导入来源不明的 ROM、密钥、账号配置或私有凭据。

按任务风险选择必要检查。通过 Linux 云端的构建或浏览器检查，不能宣称 Windows 原生运行已通过；记录实际平台和验证范围。

## 文件维护

保留用户已有改动，修改前读当前内容。研究文档按主题命名并维护相对链接与总索引。Obsidian 资料只通过 MCP 或 CLI 操作；MCP 写入前先核实 vault，不使用 Computer Use 编辑笔记。

研究主库的位置只在本机配置，不写进仓库：先读环境变量 `PDL_RESEARCH_ROOT`，没有时读主 checkout 中被 Git 忽略的 `.local/roots.json`，格式为 `{"research_root": "<研究库的绝对路径>"}`，由在本机工作的用户或代理创建。两者都没有时停止并说明缺少哪一项，不从父目录或相邻目录猜测。云端环境没有本机 vault，需要主库时同样停止。

本仓库的研究快照不自动覆盖本机主库。需要同步时核对来源和目标的当前内容，并保存实际同步清单。环境验证产物写入忽略目录，不能提交凭据或整个环境。

## Git 写入

Mercury安装的Codex规则禁止直接切换到`main`和裸`git push`。本次授权工作通过[当前规格的受控发布约定](docs/trial-spec/README.md)交付：GitHub连接器创建白名单文件树和提交，检查目标分支头后以expected_sha、force=false更新任务分支；不直写main，不强推，不绕过拒绝。独立审查和必要验证完成后才提交正式交付。Mercury受管路径保持原维护入口，本任务不手工改写。
