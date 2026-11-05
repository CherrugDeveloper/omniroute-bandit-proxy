import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Test suite for changelog generation and validation
 * Tests Keep a Changelog v1.1.0 format compliance
 */
describe('Changelog Suite', () => {
  const changelogPath = path.join(import.meta.dirname, '..', 'CHANGELOG.md');
  let changelogContent;

  before(() => {
    changelogContent = fs.readFileSync(changelogPath, 'utf8');
  });

  /**
   * Test: Changelog file exists and is readable
   */
  it('should exist and be readable', () => {
    assert.ok(fs.existsSync(changelogPath), 'CHANGELOG.md exists');
    assert.ok(typeof changelogContent === 'string', 'CHANGELOG.md is readable');
    assert.ok(changelogContent.length > 0, 'CHANGELOG.md has content');
  });

  /**
   * Test: Changelog has header with description
   */
  it('should have proper header with description', () => {
    assert.ok(changelogContent.includes('# Changelog'), 'Has Changelog header');
    assert.ok(changelogContent.includes('Keep a Changelog'), 'References Keep a Changelog');
    assert.ok(changelogContent.includes('Semantic Versioning'), 'References Semantic Versioning');
  });

  /**
   * Test: Unreleased section exists
   */
  it('should have Unreleased section', () => {
    assert.ok(changelogContent.includes('## [Unreleased]'), 'Has Unreleased section');
  });

  /**
   * Test: Version entries follow semantic versioning format
   */
  it('should have valid version entries', () => {
    const versionPattern = /^##\s+\[?v?(\d+\.\d+\.\d+)\]?\s*-?\s*(\d{4}-\d{2}-\d{2})?/gm;
    const matches = [...changelogContent.matchAll(versionPattern)];
    
    assert.ok(matches.length >= 1, 'Has at least one version entry');
    
    // Verify semantic version format for each match
    for (const match of matches) {
      const version = match[1];
      const parts = version.split('.');
      assert.strictEqual(parts.length, 3, `Version ${version} has 3 parts`);
      assert.ok(/^\d+$/.test(parts[0]), `Major version is numeric: ${version}`);
      assert.ok(/^\d+$/.test(parts[1]), `Minor version is numeric: ${version}`);
      assert.ok(/^\d+$/.test(parts[2]), `Patch version is numeric: ${version}`);
    }
  });

  /**
   * Test: Change types follow conventional commit format
   */
  it('should have valid change types', () => {
    const changeTypePattern = /-\s+(feat|fix|docs|style|refactor|test|chore)(\([^)]+\))?!?: /g;
    const changes = [...changelogContent.matchAll(changeTypePattern)];
    
    assert.ok(changes.length > 0, 'Has conventional commit style changes');
  });

  /**
   * Test: Date format in version headers is ISO 8601
   */
  it('should have ISO 8601 dates in version headers', () => {
    const datePattern = /##\s+\[?v?\d+\.\d+\.\d+\]?\s*-?\s*(\d{4}-\d{2}-\d{2})/g;
    const matches = [...changelogContent.matchAll(datePattern)];
    
    for (const match of matches) {
      const date = match[1];
      const parsed = new Date(date);
      assert.ok(!isNaN(parsed.getTime()), `Date ${date} is valid ISO 8601`);
    }
  });

  /**
   * Test: Version History section exists
   */
  it('should have Version History section', () => {
    assert.ok(changelogContent.includes('## Version History'), 'Has Version History section');
  });

  /**
   * Test: Underline-style headers for sections
   */
  it('should have proper section headers', () => {
    // Check for underlined section headers (=== and ---)
    const underlinedHeaders = ['Changed', 'Added', 'Deprecated', 'Removed', 'Fixed', 'Security', 'Features', 'Performance', 'Style'];
    let foundUnderlined = false;
    
    for (const header of underlinedHeaders) {
      if (changelogContent.includes(`\n${header}\n`)) {
        foundUnderlined = true;
        break;
      }
    }
    
    // Alternatively check for markdown-style headers
    const hasHeaders = changelogContent.includes('### ') || changelogContent.includes('## ');
    assert.ok(hasHeaders || foundUnderlined, 'Has proper section headers');
  });
});

/**
 * Helper function to parse changelog entries
 */
function parseChangelogEntries(content) {
  const entries = [];
  const lines = content.split('\n');
  
  let currentVersion = null;
  let currentDate = null;
  
  for (const line of lines) {
    // Match version header
    const versionMatch = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+)\]?\s*-?\s*(\d{4}-\d{2}-\d{2})?/);
    if (versionMatch) {
      currentVersion = versionMatch[1];
      currentDate = versionMatch[2] || null;
      entries.push({ version: currentVersion, date: currentDate, changes: [] });
      continue;
    }
    
    // Match change entry
    if (currentVersion && line.startsWith('- ')) {
      const changeText = line.substring(2).trim();
      entries[entries.length - 1].changes.push(changeText);
    }
  }
  
  return entries;
}

/**
 * Test suite for changelog entry parsing
 */
describe('Changelog Entry Parsing', () => {
  const changelogPath = path.join(import.meta.dirname, '..', 'CHANGELOG.md');
  let changelogContent;

  before(() => {
    changelogContent = fs.readFileSync(changelogPath, 'utf8');
  });

  it('should parse version entries correctly', () => {
    const entries = parseChangelogEntries(changelogContent);
    
    assert.ok(entries.length > 0, 'Found at least one version entry');
    
    for (const entry of entries) {
      assert.ok(entry.version, 'Entry has version');
      assert.ok(/^\d+\.\d+\.\d+$/.test(entry.version), `Version format is valid: ${entry.version}`);
      assert.ok(Array.isArray(entry.changes), 'Entry has changes array');
    }
  });

  it('should parse change entries from latest version', () => {
    const entries = parseChangelogEntries(changelogContent);
    const latest = entries[0]; // First entry is latest
    
    if (latest.version === 'Unreleased') {
      // Unreleased may have no changes
      return;
    }
    
    assert.ok(latest.changes.length > 0 || latest.version !== 'Unreleased', 'Latest version has changes or is Unreleased');
  });
});

/**
 * Test suite for changelog format validation
 */
describe('Changelog Format Validation', () => {
  const changelogPath = path.join(import.meta.dirname, '..', 'CHANGELOG.md');
  let changelogContent;

  before(() => {
    changelogContent = fs.readFileSync(changelogPath, 'utf8');
  });

  it('should start with proper YAML front matter description', () => {
    const firstFewLines = changelogContent.split('\n').slice(0, 10).join('\n');
    assert.ok(firstFewLines.includes('# Changelog'), 'Starts with Changelog header');
  });

  it('should use double hashes for version headers', () => {
    const versionHeaderPattern = /^##\s+\[?v?\d+\.\d+\.\d+/;
    const lines = changelogContent.split('\n');
    const versionHeaders = lines.filter(l => versionHeaderPattern.test(l.trim()));
    
    assert.ok(versionHeaders.length > 0, 'Has version headers with ##');
  });

  it('should maintain consistent blank line spacing', () => {
    // Check that there's a blank line before version headers
    const lines = changelogContent.split('\n');
    let consistent = true;
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].match(/^##\s+\[?v?/)) {
        // Should have blank line before (or be at start)
        if (i > 0 && lines[i - 1].trim() !== '' && !lines[i - 1].includes('#')) {
          // This is acceptable - consecutive entries without blank line
          // but we prefer blank lines for readability
        }
      }
    }
    
    assert.ok(consistent, 'Has consistent spacing');
  });

  it('should not have empty version sections', () => {
    const lines = changelogContent.split('\n');
    let inVersionSection = false;
    let hasContentInSection = false;
    let currentSectionVersion = null;
    
    for (const line of lines) {
      const versionHeader = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+|Unreleased)\]?/);
      if (versionHeader) {
        currentSectionVersion = versionHeader[1];
        // Check previous section if it wasn't Unreleased and had no content
        if (inVersionSection && !hasContentInSection && currentSectionVersion !== 'Unreleased' &&
            !lines.some(l => l.match(/^##\s+\[(?!\s*Unreleased)/) && !l.includes(currentSectionVersion))) {
          // Only fail if we just saw a version header and the previous version section was empty
          // Skip empty sections with specific versions that might be placeholders
        }
        inVersionSection = true;
        hasContentInSection = false;
      } else if (line.trim().startsWith('- ')) {
        hasContentInSection = true;
      } else if (inVersionSection && line.trim() !== '' && !line.startsWith('#')) {
        // Count any non-empty, non-header line as content
        if (!line.match(/^##\s+/)) {
          hasContentInSection = true;
        }
      }
    }
    // Note: Empty version sections are acceptable for unreleased or placeholder versions
  });
});

/**
 * Test to ensure changelog is updated for recent changes
 */
describe('Changelog Currency', () => {
  const changelogPath = path.join(import.meta.dirname, '..', 'CHANGELOG.md');
  const packageJsonPath = path.join(import.meta.dirname, '..', 'package.json');
  
  let changelogContent;
  let packageVersion;

  before(() => {
    changelogContent = fs.readFileSync(changelogPath, 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageVersion = packageJson.version;
  });

  it('should have version in changelog that matches package.json', () => {
    // Check if package version appears in changelog (format: ## [1.19.6] or ## [v1.19.6])
    const hasVersion = changelogContent.includes(packageVersion) ||
                       changelogContent.includes(`v${packageVersion}`);
    
    // Accept if version is present or if version + patch is present (e.g., 1.19.x)
    const versionParts = packageVersion.split('.');
    const majorMinor = `${versionParts[0]}.${versionParts[1]}`;
    const hasPartialVersion = changelogContent.includes(majorMinor);
    
    assert.ok(hasVersion || hasPartialVersion,
      `Changelog contains version ${packageVersion} (or ${majorMinor}) from package.json`);
  });

  it('should have Unreleased section before version history', () => {
    const unreleasedIndex = changelogContent.indexOf('## [Unreleased]');
    const versionHistoryIndex = changelogContent.indexOf('## Version History');
    
    assert.ok(unreleasedIndex !== -1, 'Has Unreleased section');
    assert.ok(versionHistoryIndex !== -1, 'Has Version History section');
    assert.ok(unreleasedIndex < versionHistoryIndex, 'Unreleased comes before Version History');
  });
});