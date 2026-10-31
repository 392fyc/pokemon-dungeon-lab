---
updated: 2026-10-31
---
# Obsidian 使用说明

本库是 pokemon-dungeon-lab 仓库的 `docs/`，同时是一个 Obsidian vault。用 Obsidian 打开**主 checkout** 的 `docs/` 文件夹浏览；从[KB 入口](../README.md)开始读。

## 谁在哪里改

- 代理不在 Obsidian 里写。代理在任务 worktree（`.worktrees/<任务>/`）里直接编辑 Markdown，和代码一起走 PR；合并后，主 checkout 更新，Obsidian 就能看到新内容。
- 用户在 Obsidian 里直接改了文档时，告诉代理，由代理把改动收进任务分支再提交。
- Obsidian MCP 只用于检索主 checkout 中已合并的内容，不经它写入；不用 Computer Use 编辑笔记。

## 链接写法

- 用相对 Markdown 链接，例如 `[游戏规则](../01-现行规则/游戏规则.md)`。这种链接在 Obsidian、GitHub 和代理读文件时都能用。
- 不用 `[[wikilink]]`。在 Obsidian 的“设置 → 文件与链接”里关掉 `Use [[Wikilinks]]`，新建的链接就会是 Markdown 链接。
- 检查脚本 `kb_check.py` 会检查库里每一条链接，指向不存在文件的链接算错误。

## 找以前的内容

库里只留现行内容，过时的文档已删除。需要看以前的规格、研究或用户原话时，按[决策登记](../03-决策/决策登记.md)“来源”列的固定提交链接，在 GitHub 上打开当时的版本。
