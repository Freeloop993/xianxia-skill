/**
 * 零依赖状态存储 —— JSON 文件，每个玩家一个文件
 * 存储路径：./lite/data/{playerKey}.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "data");
function ensureDir() {
    if (!existsSync(DATA_DIR))
        mkdirSync(DATA_DIR, { recursive: true });
}
export function defaultState(playerKey) {
    return {
        playerKey,
        step: "ask_name",
        name: "无名修士",
        origin: null,
        plane: "human",
        realm: "炼气期·前期",
        cultivationCurrent: 0,
        cultivationMax: 96,
        bodyRealm: "凡胎之躯",
        bodyProgress: 0,
        soulRealm: "凡境",
        soulProgress: 0,
        hpMax: 100,
        attributes: null,
        spiritStone: 50,
        immortalStone: 0,
        hp: 100,
        mp: 100,
        lawPercent: 0,
        daoSealCount: 0,
        foundationPill: 0,
        insightRelic: 0,
        spiritEyeAccess: false,
        inventory: { "粗制匕首": 1 },
        pills: { nourishQi: 1, heal: 1, focus: 0 },
        lastPillQuality: "无",
        pillToxicity: 0,
        focusBuffTurns: 0,
        goal: "[开局] 踏上修仙之路",
        shaQi: 0,
        isDemonicPath: false,
        heartDevilTurns: 0,
        beastName: "无",
        beastStage: "无",
        beastLevel: 0,
        beastBond: 0,
        beastBondLevel: "陌路",
        hasAncientBeast: false,
        daoCompanion: null,
        relationSummary: "[道侣] 无, [灵兽] 无",
        factionReputation: { 黄枫谷: 0, 掩月宗: 0, 散修盟: 0 },
        npcRelations: { 墨雨: 0, 叶清霜: 0 },
        worldEvent: { id: "evt_ancient_ruin", name: "古修遗府出世", stage: "萌芽期", tension: 0, finaleMediaEmitted: false },
        avatar: { preset: null },
        idle: { active: false, startedAt: null, endsAt: null, scene: null, reminderSentAt: null },
        destinyTags: [],
        destinyDraftOptions: [],
        destinyRerollCount: 0,
        crafting: { alchemy: 0, talisman: 0, formation: 0, refining: 0 },
    };
}
export function loadState(playerKey) {
    ensureDir();
    const path = join(DATA_DIR, `${playerKey.replace(/[^a-zA-Z0-9_\-]/g, "_")}.json`);
    if (!existsSync(path))
        return defaultState(playerKey);
    try {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        // 兼容旧存档：合并默认值
        return { ...defaultState(playerKey), ...raw };
    }
    catch {
        return defaultState(playerKey);
    }
}
export function saveState(playerKey, state) {
    ensureDir();
    const path = join(DATA_DIR, `${playerKey.replace(/[^a-zA-Z0-9_\-]/g, "_")}.json`);
    writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}
