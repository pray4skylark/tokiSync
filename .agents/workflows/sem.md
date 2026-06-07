---
name: sem
description: Utilise entity-level semantic diffing and impact analysis to streamline coding workflow
---

# Workflow: sem

Follow this workflow to leverage `sem` for semantic code analysis and verification.

## Steps

### 1. Prerequisite Check
Verify that `sem` is installed in your terminal environment.
```bash
sem --version
```
*If not installed, prompt the user to run `brew install sem-cli`.*

### 2. Dependency & Impact Analysis (Pre-change)
Before modifying a core function, method, or class:
1. Identify the entity name you plan to change.
2. Run the impact analysis command:
   ```bash
   sem impact <entity_name>
   ```
3. Read the output (or use `--json` for structured processing) to find all dependent functions that might be affected. Keep these dependencies in mind for writing test cases.

### 3. Review Changes (Post-change)
After making edits to source files, compare the working tree:
```bash
sem diff
```
- Focus on the **Structural changes** section to verify your logic is correct.
- If there are too many changes, filter by extension (e.g., `sem diff --file-exts .ts .js`).
- If you only want to see what is staged for commit:
  ```bash
  sem diff --staged
  ```

### 4. Document Changes
When generating the final `walkthrough.md`:
1. Use `sem diff --format markdown` to extract the changes.
2. Embed the output table directly into the walkthrough to show exact functions and classes modified.
