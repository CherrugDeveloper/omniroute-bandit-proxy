import { parametersSchema as z, defineCustomTool, CustomToolContext } from "@roo-code/types"
//@ts-ignore spawnSync really does exist
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"

export default defineCustomTool({
  name: "update_changelog",
  description: "Aggiorna automaticamente il file CHANGELOG.md analizzando i commit git recenti secondo lo schema esistente.",
  parameters: z.object({
    version: z.string().optional().describe("Versione da assegnare (es. v1.1.3). Se non specificata, viene calcolata o chiesta."),
    limit: z.number().optional().describe("Numero di commit recenti da considerare (default: 15)."),
  }),
  async execute({ version, limit = 15 }, context: CustomToolContext) {
    //@ts-ignore cwd exists
    const cwd = context.task.cwd || process.cwd();

    // Get recent git commits
    const gitResult = spawnSync(
      "git",
      ["log", `-n`, `${limit}`, `--pretty=format:%s (%h) %ad`, `--date=short`],
      { cwd, encoding: "utf-8", shell: true }
    );

    if (gitResult.status !== 0) {
      return `Errore nell'esecuzione di git log: ${gitResult.stderr || gitResult.stdout}`;
    }

    const commitLines = gitResult.stdout.trim().split("\n").filter(Boolean);
    if (commitLines.length === 0) {
      return "Nessun commit trovato.";
    }

    // Determine today's date in YYYY-MM-DD
    const today = new Date().toISOString().split("T")[0];

    // Read existing CHANGELOG.md
    const changelogPath = path.join(cwd, "CHANGELOG.md");
    let existingContent = "";
    if (fs.existsSync(changelogPath)) {
      existingContent = fs.readFileSync(changelogPath, "utf-8");
    } else {
      existingContent = "# Changelog\n\nTutte le modifiche rilevanti a OmniRoute Bandit Proxy.\n\n";
    }

    // Determine version if not provided
    let targetVersion = version;
    if (!targetVersion) {
      // Find latest version in changelog or default to v1.1.3 or similar
      const match = existingContent.match(/## (v\d+\.\d+\.\d+)/);
      if (match) {
        const parts = match[1].replace("v", "").split(".").map(Number);
        parts[2] = (parts[2] || 0) + 1;
        targetVersion = `v${parts.join(".")}`;
      } else {
        targetVersion = "v1.1.3";
      }
    }

    // Format commits into changelog bullets matching schema
    // Schema example:
    // ## v1.0.12 — 2026-10-10
    // - Dashboard: filtri tab Modelli (provider, stato, N≥, avg≥, search)
    // - API: /v1/models, /v1/models/summary, /v1/providers
    const bulletLines: string[] = [];
    for (const line of commitLines) {
      // Clean up commit message format: "feat: something (hash) date" -> "- **feat**: something" or similar
      // Let's parse conventional commit if possible: type(scope): subject (hash)
      bulletLines.push(`- ${line}`);
    }

    const newEntry = `## ${targetVersion} — ${today}\n` + bulletLines.join("\n") + `\n\n`;

    // Insert new entry after header in CHANGELOG.md
    const headerPattern = /(# Changelog\s*\n[\s\S]*?\n\n)/;
    let updatedContent = "";
    if (headerPattern.test(existingContent)) {
      updatedContent = existingContent.replace(headerPattern, `$1${newEntry}`);
    } else {
      updatedContent = `# Changelog\n\nTutte le modifiche rilevanti a OmniRoute Bandit Proxy.\n\n${newEntry}${existingContent}`;
    }

    fs.writeFileSync(changelogPath, updatedContent, "utf-8");

    //@ts-ignore say exists
    if (context.task && context.task.say) {
      context.task.say("custom_tool", `Changelog aggiornato con successo alla versione ${targetVersion}`);
    }

    return `Successo! Aggiunta la sezione ${targetVersion} — ${today} con ${commitLines.length} commit in [` + path.relative(cwd, changelogPath) + `](CHANGELOG.md:1).`;
  }
});
