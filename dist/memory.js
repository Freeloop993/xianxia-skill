/**
 * 剧情记忆摘要 —— JSON 文件持久化，进程重启后不丢失
 * 存储路径：./lite/data/{playerKey}_memory.json
 * 每个玩家最多保留 50 条，超出自动淘汰最旧的
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "data");
const MAX_PER_PLAYER = 50;
function ensureDir() {
    if (!existsSync(DATA_DIR))
        mkdirSync(DATA_DIR, { recursive: true });
}
function memoryPath(playerKey) {
    return join(DATA_DIR, `${playerKey.replace(/[^a-zA-Z0-9_\-]/g, "_")}_memory.json`);
}
function loadEntries(playerKey) {
    ensureDir();
    const path = memoryPath(playerKey);
    if (!existsSync(path))
        return [];
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    }
    catch {
        return [];
    }
}
function saveEntries(playerKey, entries) {
    ensureDir();
    writeFileSync(memoryPath(playerKey), JSON.stringify(entries, null, 2), "utf-8");
}
export function writeMemory(playerKey, content, actionTag = "unknown", realm = "") {
    const entries = loadEntries(playerKey);
    entries.push({
        content: content.slice(0, 100),
        actionTag,
        realm,
        createdAt: new Date().toISOString(),
    });
    // 超出上限时淘汰最旧的
    if (entries.length > MAX_PER_PLAYER) {
        entries.splice(0, entries.length - MAX_PER_PLAYER);
    }
    saveEntries(playerKey, entries);
}
export function readMemory(playerKey, topK = 5) {
    const entries = loadEntries(playerKey);
    return entries.slice(-Math.min(topK, entries.length));
}
export function formatMemory(entries) {
    if (!entries.length)
        return "（暂无历史记忆）";
    return entries
        .map((e, i) => `[${i + 1}] [${e.actionTag}][${e.realm}] ${e.content}`)
        .join("\n");
}
