---
description: Testing wrapper generation
arguments: <-v verbose>
---

# Wrapper test

Testing wrapper generation

## Executable Wrapper

An executable wrapper script is available at [.roo/commands/wrapper-test.sh](.roo/commands/wrapper-test.sh). This wrapper:
- Resolves the workspace root automatically
- Invokes the target script with all arguments
- Forwards environment variables
- Propagates exit codes

You can invoke it directly:
```bash
./.roo/commands/wrapper-test.sh [options]
```

## Usage

```
/wrapper-test [options]
```

## Options

<-v verbose>

## Examples

```
/wrapper-test -v
```

## Features

Tests wrapper

## Environment Variables

None

## Exit Codes

None
