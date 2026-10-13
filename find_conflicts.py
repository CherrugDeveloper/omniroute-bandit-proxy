#!/usr/bin/env python3
import sys

def find_conflict_markers(file_path):
    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()

        conflict_lines = []
        for i, line in enumerate(lines, 1):
            if line.startswith('<<<<<<<') or line.startswith('=======') or line.startswith('>>>>>>>'):
                conflict_lines.append((i, line.rstrip()))

        if conflict_lines:
            print("Conflict markers found:")
            for line_num, line_content in conflict_lines:
                print(f"Line {line_num}: {line_content}")
            return True
        else:
            print("No conflict markers found.")
            return False
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        return False
    except Exception as e:
        print(f"Error reading file: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python find_conflicts.py <file_path>")
        sys.exit(1)

    file_path = sys.argv[1]
    find_conflict_markers(file_path)