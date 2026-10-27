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
- Rules: Read and write only through Obsidian MCP or CLI after verifying the vault. The snapshot here never overwrites the vault automatically; a sync compares source and target and records the actual file list.
<!-- MERCURY:END -->

# 代理工作约定

## 当前范围

用户已授权维护研究资料、配置专用 Codex Cloud 环境以及验证该环境。开始游戏功能开发前，依据用户届时的明确任务执行。环境准备不等于引擎、玩法或首批内容已获批准。

先读 README.md、docs/research/项目目标与当前决策.md，再按 docs/research/README.md 的问题索引进入主题。云端范围以本文件和用户较新的指令为准；快照中的本机路径只描述研究主库的位置。

## 设计边界

目标平台为网页和 Windows，二维随机迷宫，包含轻度撤离带出元素。可使用 Pokémon Showdown 数据；阵容以某个时代的有限多样子集起步。用户喜欢 Big Kid Nation 的 Pokémon Arena 2D 角色视觉样式。

引擎、语言、时间推进方式、时代基准、首批名单、撤离与跨局保留规则、大型机制及融合是否加入，均待决定。不要把研究建议改写成批准的规则。

## 研究与验证

使用清楚的简体中文。解释时从目标、硬约束和直接核实的事实出发，说明具体例子、证据和仍未知的部分。区分开发者自述、网页观察、公开客户端静态分析、推断和实际运行验证。优先维护方一手资料，在线版本和计划继续依赖时重新核查。

角色截图只作研究参考，不视为生产素材。数据与素材分别记录来源、版本、署名和适用限制。不要导入来源不明的 ROM、密钥、账号配置或私有凭据。

按任务风险选择必要检查。通过 Linux 云端的构建或浏览器检查，不能宣称 Windows 原生运行已通过；记录实际平台和验证范围。

## 文件维护

保留用户已有改动，修改前读当前内容。研究文档按主题命名并维护相对链接与总索引。Obsidian 资料只通过 MCP 或 CLI 操作；MCP 写入前先核实 vault，不使用 Computer Use 编辑笔记。

本仓库的研究快照不自动覆盖本机主库。需要同步时核对来源和目标的当前内容，并保存实际同步清单。环境验证产物写入忽略目录，不能提交凭据或整个环境。

## Git 写入

Mercury 安装的 Codex 规则禁止直接切换到 `main` 和裸 `git push`。本仓库没有另设受控推送入口，因此 Codex 完成提交后停下，由用户推送或在用户授权的流程中交付。Mercury 受管的路径不手工编辑：它们只通过 `Mercury update` 的更新 PR，或在修改 `.mercury/config.json` 参数后、从已发布的 Mercury 提交运行安装器而改变。
