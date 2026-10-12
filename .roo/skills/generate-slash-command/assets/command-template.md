---
description: {{description}}
arguments: {{arguments}}
---

# {{title}}

{{long_description}}

## Executable Wrapper

An executable wrapper script is available at [.roo/commands/{{name}}.sh](.roo/commands/{{name}}.sh). This wrapper:
- Resolves the workspace root automatically
- Invokes the target script with all arguments
- Forwards environment variables
- Propagates exit codes

You can invoke it directly:
```bash
./.roo/commands/{{name}}.sh [options]
```

## Usage

```
/{{name}} [options]
```

## Options

{{options_list}}

## Examples

```
{{usage_examples}}
```

## Features

{{features_list}}

## Environment Variables

{{env_vars_list}}

## Exit Codes

{{exit_codes_list}}
