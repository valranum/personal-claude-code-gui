import fs from "fs";
import path from "path";
import { WorkspaceConfig } from "./types.js";

const CONFIG_DIR = path.join(process.cwd(), "data", "workspace-configs");

function ensureDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function configPath(cwd: string): string {
  const encoded = Buffer.from(cwd).toString("base64url");
  return path.join(CONFIG_DIR, `${encoded}.json`);
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  mcpServers: [],
  customAgents: [],
};

export function getConfig(cwd: string): WorkspaceConfig {
  ensureDir();
  const fp = configPath(cwd);
  if (fs.existsSync(fp)) {
    try {
      return JSON.parse(fs.readFileSync(fp, "utf-8"));
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(cwd: string, config: WorkspaceConfig): void {
  ensureDir();
  fs.writeFileSync(configPath(cwd), JSON.stringify(config, null, 2));
}
