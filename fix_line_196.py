#!/usr/bin/env python3
import sys

def fix_line_196(file_path):
    with open(file_path, 'r') as f:
        lines = f.readlines()

    # Line 196 is index 195 (0-based)
    if len(lines) >= 196:
        lines[195] = '        if [[ "$subject" =~ ^(feat|fix|docs|style|refactor|test|chore)(\\([^)]+\\))?:\ .+ ]]; then\n'

        with open(file_path, 'w') as f:
            f.writelines(lines)
        print(f"Fixed line 196 in {file_path}")
    else:
        print(f"File {file_path} doesn't have 196 lines")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: fix_line_196.py <file_path>")
        sys.exit(1)

    fix_line_196(sys.argv[1])