---
name: generate-slash-command
description: Generate a new slash command definition (Markdown) and optional executable wrapper script following project best practices. When to use this skill: you need to create a new slash command for the agent to use, ensuring it follows the standard format for documentation, arguments, and execution. Include keywords: slash command, command generation, documentation, wrapper script, automation.
---

# When to use
Use this skill when you want to expose a new capability or skill as a slash command. This ensures the command is properly documented and (optionally) has a robust wrapper script for execution.

# When NOT to use
- Do not use this skill to create the actual logic of the command (the skill or script it invokes). Create those first.
- Do not use this skill if you only need a simple script without a slash command interface.

# Inputs required
- `name`: The name of the slash command (e.g., `git-auto-commit`).
- `description`: A brief description of what the command does.
- `arguments`: A list of arguments the command accepts (e.g., `<-m "message">`).
- `usage_examples`: Examples of how to use the command.
- `features`: Key features of the command.
- `env_vars`: (Optional) Environment variables used by the command.
- `exit_codes`: (Optional) Exit codes and their meanings.
- `generate_wrapper`: (Optional) Boolean, whether to generate a `.sh` wrapper script. Default: `true`.
- `target_script`: (Optional) Path to the script the wrapper should invoke. Required if `generate_wrapper` is `true`.

# Workflow
1.  **Gather Inputs**: Ensure all required parameters are provided.
2.  **Generate Markdown**: Create `.roo/commands/<name>.md` using the standard template.
3.  **Generate Wrapper (Optional)**: If requested, create `.roo/commands/<name>.sh`.
4.  **Verify**: Ensure files are created and have correct permissions (if applicable).

# Files
- [`.roo/skills/generate-slash-command/assets/command-template.md`](assets/command-template.md): Template for the slash command Markdown file.
- [`.roo/skills/generate-slash-command/assets/wrapper-template.sh`](assets/wrapper-template.sh): Template for the executable wrapper script.
