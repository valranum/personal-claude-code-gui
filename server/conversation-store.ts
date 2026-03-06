import fs from "fs";
import path from "path";
import { Conversation, ChatMessage, ConversationFile } from "./types.js";

const DATA_DIR = path.join(process.cwd(), "data", "conversations");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export function listConversations(): Conversation[] {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      const data: ConversationFile = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, f), "utf-8"),
      );
      return data.conversation;
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export function getConversation(id: string): ConversationFile | null {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

export function createConversation(
  id: string,
  title: string,
  cwd: string,
  model: string,
): ConversationFile {
  ensureDataDir();
  const now = new Date().toISOString();
  const file: ConversationFile = {
    conversation: { id, title, cwd, model, createdAt: now, updatedAt: now },
    messages: [],
  };
  fs.writeFileSync(filePath(id), JSON.stringify(file, null, 2));
  return file;
}

export function updateConversation(
  id: string,
  updates: Partial<Conversation>,
): void {
  const file = getConversation(id);
  if (!file) return;
  Object.assign(file.conversation, updates, {
    updatedAt: new Date().toISOString(),
  });
  fs.writeFileSync(filePath(id), JSON.stringify(file, null, 2));
}

export function addMessage(id: string, message: ChatMessage): void {
  const file = getConversation(id);
  if (!file) return;
  file.messages.push(message);
  file.conversation.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath(id), JSON.stringify(file, null, 2));
}

export function deleteConversation(id: string): boolean {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}
