# Ponytail for this repository

## Installed

The official Ponytail **core skill**, using its documented repository skill/instruction fallback. Root `AGENTS.md` asks coding tasks to read it once, unless the user opts out. All twelve existing engineering-standard sections are preserved verbatim and remain authoritative, including testing requirements and the final response format. The baseline standards continue to apply when Ponytail is disabled.

Only the core skill is included. The plugin, lifecycle hooks, review/audit/debt/gain/help skills, mode-state storage and Claude-specific band/board are not installed. No application code, dependencies, schema, deployment configuration or global Codex settings are changed. Token savings have not been measured.

## Provenance

- Official repository: <https://github.com/DietrichGebert/ponytail>
- Reviewed revision: `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846` (plugin manifest version **5.3.3**).
- `SKILL.md` is an unmodified copy of upstream `skills/ponytail/SKILL.md`.
- Its SHA-256 is `9badd22a32e19cb884e46dfa8d3aae82bb81dfa5484105b8b4f0262df823a509`.
- `LICENSE` is the upstream MIT license, including the original copyright notice.
- Reviewed official [README](https://github.com/DietrichGebert/ponytail/blob/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846/README.md), [INSTALL / Codex](https://github.com/DietrichGebert/ponytail/blob/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846/INSTALL.md#codex), [portability instructions](https://github.com/DietrichGebert/ponytail/blob/96608e078b2d5ea607c5c3b8b5a54d1c1fba6846/docs/agent-portability.md) and `.codex-plugin/plugin.json`.

Updates require reviewing a new official revision and changing the recorded pin/hash. Do not run an unreviewed remote installer or replace the project's engineering standards with upstream `AGENTS.md`.

## Cloud verification — 2 November 2026

The installed Codex CLI reports version **0.159.2** and exposes plugin management. However, the documented marketplace installation failed while creating `/home/agent/.codex/.tmp/marketplaces`: **read-only file system**. Plugin activation additionally requires reviewing/trusting hooks in `/hooks`; no hook trust was bypassed.

Two read-only, ephemeral fresh-task attempts failed before model execution because the in-process app server could not initialize on this filesystem. The second attempt used the documented per-process `sqlite_home` and `log_dir` options to place validation state under `/tmp`; it still failed. A separate fresh app-server `skills/list` check also exited before initialization with the same error. No account credentials were copied, and `CODEX_HOME` was not changed.

**Verified:** official skill/license bytes and hash; required skill frontmatter; preserved original engineering rules; valid local links; integration-only diff.

**Not verified:** native skill-catalog discovery, automatic instruction loading in a fresh Codex Cloud task, or actual skill activation. File placement and an instruction reference are not evidence that these runtime features are active.

## Fresh-task acceptance check

After this branch is selected in a supported Codex environment, open a genuinely new task from the repository root and ask:

> Without editing files, follow the project instructions and report which Ponytail skill you loaded, its path, its ordered reuse hierarchy, and which project rules take precedence. Distinguish a repository skill from an activated plugin.

Check that the task reads `.agents/skills/ponytail/SKILL.md`, explains project reuse before standard-library/native features before installed dependencies before custom code, and retains the security/testing rules and final response format. On hosts supporting native repository skills, `$ponytail` should select the core skill; its availability still needs to be observed. Do not mark activation verified merely because the agent repeats the name from the prompt.

The repository instructions provide the fallback even when a host does not expose native skill commands. Persistent plugin levels and hooks require a supported plugin host; they are not supplied by this integration.

To remove this adapter, remove section 13 from root `AGENTS.md` and this skill folder, preserving sections 1–12.
