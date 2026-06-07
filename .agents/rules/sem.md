---
trigger: always_on
description: Always utilize sem for entity-level impact analysis and change verification when planning or reviewing code modifications.
---

## sem

This project integrates `sem` (an entity-level semantic diff tool) to understand structural codebase changes instead of just line diffs.

Rules:
- **Planning & Research**: When analyzing bugs or planning changes to a specific function or class, run `sem impact <entity_name>` or `sem graph --entity <entity_name>` to trace transitive dependencies and identify affected components.
- **Verification**: After making code changes, run `sem diff` (or `sem diff --format json`) to distinguish between cosmetic (whitespace/comments) and structural changes. Ensure the structural diff aligns perfectly with the intended logic modifications.
- **Documentation**: Use entity-level diff details to write structured summaries in `walkthrough.md`, clearly stating which functions, methods, or classes were added, modified, or deleted.
- **Environment**: If `sem` CLI is not installed or command fails, guide the user to install it via `brew install sem-cli` or build it from source (https://github.com/Ataraxy-Labs/sem). Do not execute auto-install commands without user approval.
