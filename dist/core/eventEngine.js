import { blockedBreakthrough, validatePlayerInput } from "./xianxiaValidator.js";
import { evolveWorld } from "./xianxiaWorld.js";
import { guardXianxiaReply } from "./xianxiaGuard.js";
import { normalizeXianxiaState, applyBeastSet, applyBeastBondDelta, applyBodyProgress, applyBodyBreakthrough, applySoulBreakthrough, soulAlchemyBonus, applyShaQiSideEffects, checkHeartDevilOnBreakthrough, buildRelationSummary, spendSpiritStone, calcDestinyBonuses, } from "./stateHelpers.js";
// ─── 境界数据 ─────────────────────────────────────────────────────────────────
const HUMAN_REALMS = [
    { realm: "炼气期·前期", max: 96 },
    { realm: "炼气期·中期", max: 120 },
    { realm: "炼气期·后期", max: 216 },
    { realm: "筑基期·前期", max: 288 },
    { realm: "筑基期·中期", max: 540 },
    { realm: "筑基期·后期", max: 912 },
    { realm: "结丹期·前期", max: 1200 },
    { realm: "结丹期·中期", max: 2160 },
    { realm: "结丹期·后期", max: 2880 },
    { realm: "元婴期·前期", max: 3600 },
    { realm: "元婴期·中期", max: 4200 },
    { realm: "元婴期·后期", max: 4560 },
    { realm: "化神期·前期", max: 6000 },
    { realm: "化神期·中期", max: 7200 },
    { realm: "化神期·后期", max: 8400 },
];
const SPIRIT_REALMS = [
    { realm: "炼虚期·前期", max: 10000 },
    { realm: "炼虚期·中期", max: 15000 },
    { realm: "炼虚期·后期", max: 20000 },
    { realm: "合体期·前期", max: 25000 },
    { realm: "合体期·中期", max: 35000 },
    { realm: "合体期·后期", max: 50000 },
    { realm: "大乘期·前期", max: 60000 },
    { realm: "大乘期·中期", max: 80000 },
    { realm: "大乘期·后期", max: 100000 },
];
// 大境界突破前置条件检查
const BREAKTHROUGH_REQUIREMENTS = {
    "筑基期·前期": (s) => {
        if (s.realm !== "炼气期·后期" || s.cultivationCurrent < s.cultivationMax)
            return "需先达到炼气期·后期圆满。";
        if (s.foundationPill < 1)
            return "缺少筑基丹，无法筑基。";
        return null;
    },
    "结丹期·前期": (s) => {
        if (s.realm !== "筑基期·后期" || s.cultivationCurrent < s.cultivationMax)
            return "需先达到筑基期·后期圆满。";
        if ((s.attributes?.willpower ?? 0) < 20)
            return "心智不足20，难渡心魔劫。";
        return null;
    },
    "元婴期·前期": (s) => {
        if (s.realm !== "结丹期·后期" || s.cultivationCurrent < s.cultivationMax)
            return "需先达到结丹期·后期圆满。";
        if (!s.spiritEyeAccess)
            return "需在通天灵眼或同等超级灵脉之上才可碎丹成婴。";
        return null;
    },
    "化神期·前期": (s) => {
        if (s.realm !== "元婴期·后期" || s.cultivationCurrent < s.cultivationMax)
            return "需先达到元婴期·后期圆满。";
        if (s.insightRelic < 1)
            return "缺少悟道之物，无法引动元神蜕变。";
        return null;
    },
};
// ─── 辅助函数 ─────────────────────────────────────────────────────────────────
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function getRealmList(state) {
    return state.plane === "human" ? HUMAN_REALMS : SPIRIT_REALMS;
}
function findRealmIndex(state) {
    const list = getRealmList(state);
    const idx = list.findIndex((r) => r.realm === state.realm);
    return idx < 0 ? 0 : idx;
}
function advanceSmallRealms(state, triggers) {
    if (state.plane === "immortal")
        return;
    const list = getRealmList(state);
    while (state.cultivationCurrent >= state.cultivationMax) {
        const idx = findRealmIndex(state);
        const next = idx + 1;
        if (next >= list.length) {
            state.cultivationCurrent = state.cultivationMax;
            break;
        }
        // 跨大境界时停下，等待手动突破事件
        const curMajor = list[idx].realm.split("·")[0];
        const nxtMajor = list[next].realm.split("·")[0];
        if (curMajor !== nxtMajor)
            break;
        state.cultivationCurrent -= state.cultivationMax;
        state.realm = list[next].realm;
        state.cultivationMax = list[next].max;
        triggers.push({ type: "breakthrough_success", detail: `小境界提升至 ${state.realm}` });
    }
}
function cloneState(s) {
    return JSON.parse(JSON.stringify(s));
}
// ─── 单事件执行器 ─────────────────────────────────────────────────────────────
// ─── 战斗力计算 ───────────────────────────────────────────────────────────────
const REALM_TO_LEVEL = {
    "炼气期·前期": 1, "炼气期·中期": 5, "炼气期·后期": 9,
    "筑基期·前期": 13, "筑基期·中期": 17, "筑基期·后期": 21,
    "结丹期·前期": 25, "结丹期·中期": 29, "结丹期·后期": 33,
    "元婴期·前期": 37, "元婴期·中期": 41, "元婴期·后期": 45,
    "化神期·前期": 49, "化神期·中期": 53, "化神期·后期": 57,
    "炼虚期·前期": 61, "炼虚期·中期": 65, "炼虚期·后期": 69,
    "合体期·前期": 73, "合体期·中期": 77, "合体期·后期": 81,
    "大乘期·前期": 85, "大乘期·中期": 89, "大乘期·后期": 93,
};
/** 计算玩家当前基础战斗力等级 */
export function calcPlayerCombatLevel(state) {
    const base = REALM_TO_LEVEL[state.realm] ?? 1;
    // 炼体加成（金刚之躯+2 涅槃之体+4 法相真身+6 玄天圣体+10）
    const bodyBonus = {
        "后天锻体": 1, "先天之体": 1, "金刚之躯": 2, "涅槃之体": 4,
        "法相真身": 6, "玄天圣体": 10,
    };
    // 神识加成（灵境+1 意境+2 魂境+3 领域境+5）
    const soulBonus = {
        "灵境": 1, "意境": 2, "魂境": 3, "领域境": 5, "仙魂境": 8,
    };
    // 灵兽战斗力加成（信赖+2 通灵+4）
    const beastBonus = state.beastBondLevel === "通灵" ? 4
        : state.beastBondLevel === "信赖" ? 2 : 0;
    return base
        + (bodyBonus[state.bodyRealm] ?? 0)
        + (soulBonus[state.soulRealm] ?? 0)
        + beastBonus;
}
/** 根据等级差判断压制效果 */
function getCombatSuppressionDesc(diff) {
    if (diff >= 10)
        return "被对方轻易秒杀，毫无还手之力";
    if (diff >= 5)
        return "对方可突破全力防御，处于绝对劣势";
    if (diff >= 3)
        return "对方可稳定破防，明显处于下风";
    if (diff >= 1)
        return "对方略有压制，实力稍强";
    if (diff === 0)
        return "势均力敌";
    if (diff >= -2)
        return "己方略有优势";
    if (diff >= -5)
        return "己方明显占优，可稳定压制";
    return "己方碾压对手";
}
function applyOne(state, event, violations, triggers, media) {
    switch (event.type) {
        // ── 修炼 ──
        case "cultivation_gain": {
            let gain = event.value;
            if (gain > 0) {
                // 命数倍率（天灵根/先天道体等）
                const destinyMul = calcDestinyBonuses(state.destinyTags).cultivationMul;
                gain = Math.floor(gain * destinyMul);
                // 凝神丹 buff 加成（+10/回合）
                if (state.focusBuffTurns > 0) {
                    gain = Math.floor(gain * 1.3);
                    state.focusBuffTurns--;
                }
                // 道侣双修加成（+30%）
                const companionBonus = state.daoCompanion
                    && (state.npcRelations[state.daoCompanion] ?? 0) >= 91 ? 1.3 : 1.0;
                gain = Math.floor(gain * companionBonus);
            }
            state.cultivationCurrent += gain;
            if (state.cultivationCurrent < 0)
                state.cultivationCurrent = 0;
            advanceSmallRealms(state, triggers);
            break;
        }
        case "law_progress": {
            if (state.plane !== "immortal") {
                violations.push({ code: "E_RULE_PLANE_LEAK", message: "法则领悟度仅适用于仙界修士。" });
                break;
            }
            state.lawPercent = clamp(state.lawPercent + event.value, 0, 100);
            break;
        }
        case "dao_seal_gain": {
            if (state.plane !== "immortal") {
                violations.push({ code: "E_RULE_PLANE_LEAK", message: "道印凝聚仅适用于仙界金仙境界。" });
                break;
            }
            if (state.lawPercent < 100) {
                violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: "法则领悟度尚未圆满，无法凝聚道印。" });
                break;
            }
            state.daoSealCount += event.count;
            state.lawPercent = 0;
            triggers.push({ type: "breakthrough_success", detail: `成功凝聚第 ${state.daoSealCount} 枚道印` });
            break;
        }
        // ── 大境界突破 ──
        case "breakthrough_attempt": {
            const checker = BREAKTHROUGH_REQUIREMENTS[event.targetRealm];
            if (!checker) {
                // 小境界直接由 cultivation_gain 驱动，无需此事件
                violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: `未知的突破目标：${event.targetRealm}` });
                break;
            }
            const reason = checker(state);
            if (reason) {
                violations.push(...blockedBreakthrough(reason));
                triggers.push({ type: "breakthrough_fail", detail: reason });
                break;
            }
            // 消耗突破物品
            if (event.consumeItem === "筑基丹") {
                state.foundationPill -= 1;
            }
            if (event.consumeItem === "悟道之物") {
                state.insightRelic -= 1;
            }
            // 执行突破
            state.cultivationCurrent = 0;
            const list = getRealmList(state);
            const target = list.find((r) => r.realm === event.targetRealm);
            if (target) {
                state.realm = target.realm;
                state.cultivationMax = target.max;
            }
            // 结丹触发媒体
            triggers.push({ type: "breakthrough_success", detail: `突破至 ${state.realm}` });
            break;
        }
        // ── 飞升 ──
        case "ascend_attempt": {
            if (event.targetPlane === "spirit") {
                if (state.plane !== "human" || !state.realm.startsWith("化神期") || state.cultivationCurrent < state.cultivationMax) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: "飞升灵界需主修达到化神期·后期圆满。" });
                    triggers.push({ type: "ascend_fail", detail: "飞升条件未满" });
                    break;
                }
                state.plane = "spirit";
                state.realm = "炼虚期·前期";
                state.cultivationCurrent = 0;
                state.cultivationMax = 10000;
                triggers.push({ type: "ascend_success", detail: "飞升灵界" });
            }
            else if (event.targetPlane === "immortal") {
                if (state.plane !== "spirit" || !state.realm.startsWith("大乘期") || state.cultivationCurrent < state.cultivationMax) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: "飞升仙界需主修达到大乘期·后期圆满。" });
                    triggers.push({ type: "ascend_fail", detail: "飞升条件未满" });
                    break;
                }
                state.plane = "immortal";
                state.realm = "散仙";
                state.cultivationCurrent = 0;
                state.cultivationMax = 0;
                state.lawPercent = 0;
                triggers.push({ type: "ascend_success", detail: "飞升仙界" });
            }
            // 大乘媒体在突破到大乘时触发
            // 大乘突破 - 视频已移除，仅保留 trigger
            if (state.plane === "spirit" && state.realm.startsWith("大乘")) {
                triggers.push({ type: "breakthrough_success", detail: "晋升大乘" });
            }
            break;
        }
        // ── 资源 ──
        case "spirit_stone_delta": {
            let delta = event.value;
            if (delta > 0) {
                const stoneMul = calcDestinyBonuses(state.destinyTags).stoneMul;
                delta = Math.floor(delta * stoneMul);
            }
            state.spiritStone = Math.max(0, state.spiritStone + delta);
            break;
        }
        case "immortal_stone_delta": {
            state.immortalStone = Math.max(0, state.immortalStone + event.value);
            break;
        }
        // ── 生命/法力 ──
        case "hp_delta": {
            state.hp = clamp(state.hp + event.value, 0, 100);
            break;
        }
        case "mp_delta": {
            state.mp = clamp(state.mp + event.value, 0, 100);
            break;
        }
        case "hp_max_delta": {
            state.hpMax = Math.max(100, state.hpMax + event.value);
            state.hp = Math.min(state.hp, state.hpMax);
            break;
        }
        // ── 丹药 ──
        case "pill_craft": {
            const cost = event.pillType === "nourishQi" ? 30 : event.pillType === "heal" ? 40 : 60;
            // 用分层灵石扣款
            if (!spendSpiritStone(state, cost, violations))
                break;
            // 炼丹品质：基础随机 + 神识加成 + 命数丹道亲和 + 技艺加成
            const { alchemyBonus: destinyAlch } = calcDestinyBonuses(state.destinyTags);
            const soulBonus = soulAlchemyBonus(state); // 需要从 stateHelpers 导入
            const craftingBonus = Math.floor(state.crafting.alchemy / 10); // 每10点+1%
            const totalBonus = destinyAlch + soulBonus + craftingBonus;
            const r = Math.random() * 100 + totalBonus;
            const quality = r >= 90 ? "上品" : r >= 55 ? "良品" : "凡品";
            const cnt = event.count ?? 1;
            if (event.pillType === "nourishQi")
                state.pills.nourishQi += quality === "上品" ? cnt * 2 : cnt;
            else if (event.pillType === "heal")
                state.pills.heal += quality === "上品" ? cnt * 2 : cnt;
            else
                state.pills.focus += cnt;
            state.lastPillQuality = quality;
            // 炼丹熟练度增长（每次+2，满100封顶）
            state.crafting.alchemy = Math.min(100, state.crafting.alchemy + 2);
            break;
        }
        case "pill_consume": {
            const cnt = event.count ?? 1;
            const toxMap = { 凡品: 8, 良品: 4, 上品: 1 };
            const mulMap = { 凡品: 1, 良品: 1.2, 上品: 1.45 };
            const q = state.lastPillQuality === "无" ? "凡品" : state.lastPillQuality;
            if (event.pillType === "nourishQi") {
                if (state.pills.nourishQi < cnt) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: "纳气丹不足。" });
                    break;
                }
                state.pills.nourishQi -= cnt;
                const base = 24 + Math.floor((state.attributes?.comprehension ?? 20) / 5);
                state.cultivationCurrent += Math.floor(base * mulMap[q]) * cnt;
                state.pillToxicity = Math.min(120, state.pillToxicity + toxMap[q] * cnt);
                advanceSmallRealms(state, triggers);
            }
            else if (event.pillType === "heal") {
                if (state.pills.heal < cnt) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: "回春丹不足。" });
                    break;
                }
                state.pills.heal -= cnt;
                state.hp = Math.min(100, state.hp + Math.floor(30 * mulMap[q]) * cnt);
                state.pillToxicity = Math.min(120, state.pillToxicity + toxMap[q] * cnt);
            }
            else {
                if (state.pills.focus < cnt) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: "凝神丹不足。" });
                    break;
                }
                state.pills.focus -= cnt;
                const turns = q === "上品" ? 5 : q === "良品" ? 4 : 3;
                state.focusBuffTurns = Math.max(state.focusBuffTurns, turns * cnt);
                state.pillToxicity = Math.min(120, state.pillToxicity + toxMap[q] * cnt);
            }
            // 丹毒反噬检查
            if (state.pillToxicity >= 100) {
                state.hp = Math.max(1, state.hp - 20);
                state.mp = Math.max(1, state.mp - 20);
                state.focusBuffTurns = 0;
                state.pillToxicity = 60;
                triggers.push({ type: "pill_toxicity_backlash", detail: "丹毒反噬，气血法力受损。" });
            }
            break;
        }
        case "pill_toxicity_delta": {
            state.pillToxicity = clamp(state.pillToxicity + event.value, 0, 120);
            if (state.pillToxicity >= 100) {
                state.hp = Math.max(1, state.hp - 20);
                state.mp = Math.max(1, state.mp - 20);
                state.pillToxicity = 60;
                triggers.push({ type: "pill_toxicity_backlash", detail: "丹毒反噬，气血法力受损。" });
            }
            break;
        }
        // ── 煞气 ──
        case "sha_qi_delta": {
            state.shaQi = clamp(state.shaQi + event.value, 0, 999);
            applyShaQiSideEffects(state, triggers);
            break;
        }
        // ── 社交/关系 ──
        case "npc_relation_delta": {
            const cur = state.npcRelations[event.npc] ?? 0;
            state.npcRelations[event.npc] = clamp(cur + event.value, -100, 100);
            state.relationSummary = buildRelationSummary(state);
            break;
        }
        case "faction_rep_delta": {
            const cur = state.factionReputation[event.faction] ?? 0;
            const next = clamp(cur + event.value, -1000, 1000);
            state.factionReputation[event.faction] = next;
            // 首次拜入宗门：声望从 ≤0 变为 >0，触发拜师战报图
            if (cur <= 0 && next > 0) {
                const alreadyJoined = Object.entries(state.factionReputation)
                    .filter(([f, v]) => f !== event.faction && v > 0).length > 0;
                if (!alreadyJoined) {
                    // 首次加入任何宗门
                    triggers.push({ type: "breakthrough_success",
                        detail: `拜入${event.faction}，修仙之路正式启程。` });
                }
            }
            break;
        }
        case "dao_companion_set": {
            const companionRel = state.npcRelations[event.npcName] ?? 0;
            if (companionRel < 91) {
                violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                    message: `缔结道侣需双方关系达到「知己」(91+)，当前与${event.npcName}关系仅为 ${companionRel}。` });
                break;
            }
            state.daoCompanion = event.npcName;
            state.npcRelations[event.npcName] = 100;
            state.relationSummary = buildRelationSummary(state);
            triggers.push({ type: "breakthrough_success",
                detail: `与${event.npcName}缔结道侣之盟，双修修炼效率提升30%。` });
            break;
        }
        // ── 世界事件 ──
        case "world_tension_delta": {
            const prevStage = state.worldEvent.stage; // 必须在 evolveWorld 之前记录
            evolveWorld(state, event.actionTag ?? "other");
            if (state.worldEvent.stage !== prevStage) {
                triggers.push({ type: "world_stage_changed", detail: `世界事件进入${state.worldEvent.stage}` });
            }
            if (state.worldEvent.stage === "终末期" && !state.worldEvent.finaleMediaEmitted) {
                state.worldEvent.finaleMediaEmitted = true;
                triggers.push({ type: "world_finale", detail: "宗门战争终末，胜负将于此役分晓。" });
            }
            break;
        }
        case "world_stage_advance": {
            state.worldEvent.stage = event.targetStage;
            triggers.push({ type: "world_stage_changed", detail: `世界事件强制推进至${event.targetStage}` });
            break;
        }
        // ── 物品 ──
        case "item_gain": {
            const inv = state.inventory ?? {};
            const cur = inv[event.itemName] ?? 0;
            inv[event.itemName] = cur + (event.count ?? 1);
            state.inventory = inv;
            if (event.isKeyItem) {
                triggers.push({ type: "breakthrough_success",
                    detail: `获得关键物品：${event.itemName} x${event.count ?? 1}` });
            }
            break;
        }
        case "item_lose": {
            const inv = state.inventory ?? {};
            const cur = inv[event.itemName] ?? 0;
            const after = Math.max(0, cur - (event.count ?? 1));
            if (cur === 0) {
                violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                    message: `物品不足：${event.itemName} 当前数量为 0。` });
                break;
            }
            if (after === 0) {
                delete inv[event.itemName];
            }
            else {
                inv[event.itemName] = after;
            }
            state.inventory = inv;
            break;
        }
        case "foundation_pill_delta": {
            state.foundationPill = Math.max(0, state.foundationPill + event.value);
            break;
        }
        case "insight_relic_delta": {
            state.insightRelic = Math.max(0, state.insightRelic + event.value);
            break;
        }
        case "spirit_eye_access": {
            state.spiritEyeAccess = event.granted;
            break;
        }
        // ── 挂机 ──
        case "idle_start": {
            // 时长：最短1h，最长72h
            const hours = clamp(event.hours, 1, 72);
            const start = new Date();
            const end = new Date(start.getTime() + hours * 3600 * 1000);
            // 场景前置条件校验
            const scene = event.scene ?? "洞府闭关";
            if (scene === "宗门闭关") {
                const minRep = Math.min(...Object.values(state.factionReputation));
                if (minRep < 0 && Object.values(state.factionReputation).every((v) => v < 0)) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                        message: "宗门闭关需至少一个宗门声望≥0，当前与各方皆交恶。" });
                    break;
                }
            }
            if (scene === "宗门秘境") {
                const maxRep = Math.max(...Object.values(state.factionReputation));
                if (maxRep < 100) {
                    violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                        message: "宗门秘境需至少一个宗门声望≥100，方可获准入内修行。" });
                    break;
                }
            }
            state.idle = {
                active: true,
                startedAt: start.toISOString(),
                endsAt: end.toISOString(),
                scene,
                reminderSentAt: null,
            };
            break;
        }
        case "idle_claim": {
            if (!state.idle.active || !state.idle.endsAt)
                break;
            const now = Date.now();
            const endTs = new Date(state.idle.endsAt).getTime();
            if (now < endTs) {
                const remain = Math.ceil((endTs - now) / 60000);
                violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                    message: `挂机尚未结束，还需等待约 ${remain} 分钟。` });
                break;
            }
            const startTs = state.idle.startedAt
                ? new Date(state.idle.startedAt).getTime() : now;
            const totalHours = Math.max(1, Math.floor((endTs - startTs) / 3600000));
            const scene = state.idle.scene ?? "洞府闭关";
            // ── 属性快捷读取 ──
            const comprehension = state.attributes?.comprehension ?? 20;
            const fortune = state.attributes?.fortune ?? 20;
            const physique = state.attributes?.physique ?? 20;
            const soul = state.attributes?.soul ?? 20;
            const willpower = state.attributes?.willpower ?? 20;
            // ── 边际递减：按时段分段计算收益小时数 ──
            // 0-12h: ×1.0  /  12-24h: ×0.8  /  24-48h: ×0.5  /  48-72h: ×0.3
            function effectiveHours(raw) {
                const tier1 = Math.min(raw, 12);
                const tier2 = Math.max(0, Math.min(raw, 24) - 12) * 0.8;
                const tier3 = Math.max(0, Math.min(raw, 48) - 24) * 0.5;
                const tier4 = Math.max(0, Math.min(raw, 72) - 48) * 0.3;
                return tier1 + tier2 + tier3 + tier4;
            }
            const effH = effectiveHours(totalHours);
            // ── 奇遇检定（机缘驱动，每小时独立检定，最多触发3次）──
            // 概率 = (fortune / 200) per hour，上限15%/h
            const adventureProb = Math.min(0.15, fortune / 200);
            let adventureCount = 0;
            for (let h = 0; h < totalHours && adventureCount < 3; h++) {
                if (Math.random() < adventureProb)
                    adventureCount++;
            }
            const SCENE_CONFIG = {
                "洞府闭关": {
                    stoneBase: 8, cvBase: 15, cvMul: 1.0,
                    bodyProgress: 0, beastBond: 1,
                    shaQiPerHour: -0.5, toxDecayPerHour: 1.5,
                    injuryRisk: 0, injuryMaxHp: 100,
                    worldTension: 0,
                    adventureStoneBonus: 20, adventureCvBonus: 30,
                },
                "乱星海岸": {
                    stoneBase: 18, cvBase: 8, cvMul: 1.0,
                    bodyProgress: 3, beastBond: 2,
                    shaQiPerHour: -0.2, toxDecayPerHour: 0.5,
                    injuryRisk: 0.08, injuryMaxHp: 30,
                    worldTension: 1,
                    adventureStoneBonus: 60, adventureCvBonus: 15,
                },
                "古修遗府": {
                    stoneBase: 25, cvBase: 10, cvMul: 1.0,
                    bodyProgress: 2, beastBond: 0,
                    shaQiPerHour: 1.5, toxDecayPerHour: 0,
                    injuryRisk: 0.15, injuryMaxHp: 20,
                    worldTension: 2,
                    adventureStoneBonus: 120, adventureCvBonus: 50,
                },
                "宗门闭关": {
                    stoneBase: 5, cvBase: 18, cvMul: 1.3,
                    bodyProgress: 0, beastBond: 1,
                    shaQiPerHour: -1.0, toxDecayPerHour: 2.0,
                    injuryRisk: 0, injuryMaxHp: 100,
                    factionRepDelta: { key: "max", value: 0.5 },
                    worldTension: 0,
                    adventureStoneBonus: 10, adventureCvBonus: 60,
                },
                "坊市驻守": {
                    stoneBase: 22, cvBase: 2, cvMul: 1.0,
                    bodyProgress: 0, beastBond: 1,
                    shaQiPerHour: -0.3, toxDecayPerHour: 0.5,
                    injuryRisk: 0, injuryMaxHp: 100,
                    factionRepDelta: { key: "first", value: 0.3 },
                    worldTension: 0,
                    adventureStoneBonus: 80, adventureCvBonus: 5,
                },
                "红尘历练": {
                    stoneBase: 3, cvBase: 3, cvMul: 1.0,
                    bodyProgress: 0, beastBond: 3,
                    shaQiPerHour: -2.0, toxDecayPerHour: 1.0,
                    injuryRisk: 0, injuryMaxHp: 100,
                    worldTension: 0,
                    adventureStoneBonus: 15, adventureCvBonus: 15,
                },
                "乱星深海": {
                    stoneBase: 30, cvBase: 5, cvMul: 1.0,
                    bodyProgress: 8, beastBond: 0,
                    shaQiPerHour: 0.5, toxDecayPerHour: 0,
                    injuryRisk: 0.25, injuryMaxHp: 10,
                    worldTension: 2,
                    adventureStoneBonus: 150, adventureCvBonus: 20,
                },
                "宗门秘境": {
                    stoneBase: 20, cvBase: 20, cvMul: 1.2,
                    bodyProgress: 3, beastBond: 2,
                    shaQiPerHour: -0.5, toxDecayPerHour: 1.0,
                    injuryRisk: 0.05, injuryMaxHp: 40,
                    factionRepDelta: { key: "max", value: 1.0 },
                    worldTension: 1,
                    adventureStoneBonus: 100, adventureCvBonus: 80,
                },
                "野外散修": {
                    stoneBase: 14, cvBase: 12, cvMul: 1.0,
                    bodyProgress: 1, beastBond: 2,
                    shaQiPerHour: 0, toxDecayPerHour: 0.8,
                    injuryRisk: 0.05, injuryMaxHp: 50,
                    worldTension: 1,
                    adventureStoneBonus: 50, adventureCvBonus: 40,
                },
            };
            const cfg = SCENE_CONFIG[scene] ?? SCENE_CONFIG["洞府闭关"];
            // ── 属性加成系数 ──
            const compBonus = 1 + comprehension / 200; // 悟性：真元加成
            const fortBonus = 1 + fortune / 200; // 机缘：灵石加成
            const physBonus = 1 + physique / 300; // 根骨：炼体加成
            const soulBonus = 1 + soul / 300; // 神魂：灵兽羁绊加成
            // ── 结算：灵石 ──
            const stoneGain = Math.floor(cfg.stoneBase * effH * fortBonus
                + adventureCount * cfg.adventureStoneBonus);
            // ── 结算：真元 ──
            const cvGain = Math.floor(cfg.cvBase * (cfg.cvMul ?? 1.0) * effH * compBonus
                + adventureCount * cfg.adventureCvBonus);
            // ── 结算：炼体进度（记录在 goal 里，引擎不单独存炼体值，由模型叙事体现）──
            const bodyProgressTotal = Math.floor(cfg.bodyProgress * effH * physBonus);
            // ── 结算：灵兽羁绊 ──
            const beastBondGain = Math.floor(cfg.beastBond * effH * soulBonus);
            // ── 结算：煞气变化 ──
            const shaQiDelta = cfg.shaQiPerHour * totalHours;
            // ── 结算：丹毒消解 ──
            const toxDecay = Math.floor(cfg.toxDecayPerHour * totalHours);
            // ── 结算：受伤判定（逐小时，最多触发2次）──
            let injuryCount = 0;
            let totalHpLoss = 0;
            for (let h = 0; h < totalHours && injuryCount < 2; h++) {
                if (Math.random() < cfg.injuryRisk) {
                    injuryCount++;
                    totalHpLoss += Math.floor(10 + Math.random() * 20); // 10-30 HP 损耗
                }
            }
            // ── 结算：红尘历练心智加成（降低下次突破心魔概率，记录在 goal）──
            const isRedWorld = scene === "红尘历练";
            // ── 写入状态 ──
            state.spiritStone += stoneGain;
            state.cultivationCurrent += cvGain;
            state.pillToxicity = Math.max(0, state.pillToxicity - toxDecay);
            state.shaQi = clamp(state.shaQi + Math.floor(shaQiDelta), 0, 999);
            // 灵兽羁绊
            if (beastBondGain > 0 && state.beastName !== "无") {
                state.beastLevel = clamp(state.beastLevel + beastBondGain, 0, 100);
            }
            // 受伤
            if (totalHpLoss > 0) {
                state.hp = Math.max(cfg.injuryMaxHp, state.hp - totalHpLoss);
                triggers.push({ type: "pill_toxicity_backlash",
                    detail: `历练中遭遇 ${injuryCount} 次意外，损耗气血 ${totalHpLoss}。` });
            }
            // 声望变化
            if (cfg.factionRepDelta) {
                const entries = Object.entries(state.factionReputation);
                if (entries.length > 0) {
                    let targetFaction;
                    if (cfg.factionRepDelta.key === "max") {
                        targetFaction = entries.reduce((a, b) => a[1] > b[1] ? a : b)[0];
                    }
                    else {
                        targetFaction = entries[0][0];
                    }
                    const delta = Math.floor(cfg.factionRepDelta.value * totalHours);
                    state.factionReputation[targetFaction] =
                        clamp((state.factionReputation[targetFaction] ?? 0) + delta, -1000, 1000);
                }
            }
            // 世界张力
            if (cfg.worldTension > 0) {
                state.worldEvent.tension += Math.floor(cfg.worldTension * totalHours);
            }
            // 更新目标描述
            const summaryParts = [
                `灵石+${stoneGain}`,
                cvGain > 0 ? `真元+${cvGain}` : "",
                bodyProgressTotal > 0 ? `炼体进度+${bodyProgressTotal}` : "",
                adventureCount > 0 ? `奇遇×${adventureCount}` : "",
                totalHpLoss > 0 ? `HP-${totalHpLoss}` : "",
                isRedWorld ? "道心磨砺+1" : "",
            ].filter(Boolean).join("，");
            state.goal = `[挂机结算·${scene}] ${summaryParts}`;
            // 清空挂机状态
            state.idle = { active: false, startedAt: null, endsAt: null,
                scene: null, reminderSentAt: null };
            // 小境界自动推进
            advanceSmallRealms(state, triggers);
            // 将完整收益记录推入触发器供模型叙事
            triggers.push({
                type: "breakthrough_success",
                detail: JSON.stringify({
                    scene,
                    totalHours,
                    effH: Math.round(effH * 10) / 10,
                    stoneGain,
                    cvGain,
                    bodyProgressTotal,
                    beastBondGain,
                    adventureCount,
                    injuryCount,
                    totalHpLoss,
                    shaQiDelta: Math.floor(shaQiDelta),
                    toxDecay,
                }),
            });
            break;
        }
        case "idle_end": {
            state.idle = { active: false, startedAt: null, endsAt: null,
                scene: null, reminderSentAt: null };
            break;
        }
        // ── 灵兽 ──
        case "beast_bond_delta": {
            applyBeastBondDelta(state, event.value, triggers);
            state.relationSummary = buildRelationSummary(state);
            break;
        }
        case "beast_stage_advance": {
            state.beastStage = event.targetStage;
            triggers.push({ type: "breakthrough_success",
                detail: `${state.beastName}成长至【${event.targetStage}】阶段，实力大增。` });
            break;
        }
        case "beast_set": {
            applyBeastSet(state, event.name, event.stage, event.level, violations, triggers, media);
            state.relationSummary = buildRelationSummary(state);
            break;
        }
        // ── 角色信息 ──
        case "goal_update": {
            state.goal = event.goal;
            break;
        }
        case "relation_summary_update": {
            state.relationSummary = event.summary;
            break;
        }
        case "focus_buff_delta": {
            state.focusBuffTurns = Math.max(0, state.focusBuffTurns + event.turns);
            break;
        }
        // ── 炼体 ──
        case "body_realm_progress": {
            applyBodyProgress(state, event.value, event.location, violations);
            break;
        }
        case "body_realm_breakthrough": {
            applyBodyBreakthrough(state, event.targetRealm, violations, triggers);
            break;
        }
        // ── 战斗系统 ──
        case "combat_result": {
            const playerLevel = event.playerLevel;
            const enemyLevel = event.enemyLevel;
            const diff = enemyLevel - playerLevel;
            // 等级压制：高10级以上必败，无论模型传什么结果都覆盖
            if (diff >= 10 && event.outcome === "胜利") {
                violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                    message: `对方战斗力等级（${enemyLevel}）远超你（${playerLevel}），等级压制差${diff}，此战必败，天道不会让你凭空胜出。` });
                break;
            }
            // HP/MP 损耗
            state.hp = Math.max(1, state.hp - event.hpLoss);
            state.mp = Math.max(0, state.mp - event.mpLoss);
            if (event.outcome === "胜利") {
                // 战利品
                if (event.loot) {
                    for (const loot of event.loot) {
                        const inv = state.inventory ?? {};
                        inv[loot.itemName] = (inv[loot.itemName] ?? 0) + loot.count;
                        state.inventory = inv;
                    }
                }
                // 灵石奖励
                if (event.stoneReward) {
                    const stoneMul = calcDestinyBonuses(state.destinyTags).stoneMul;
                    state.spiritStone += Math.floor(event.stoneReward * stoneMul);
                }
                // 杀生煞气
                if (event.gainShaQi) {
                    state.shaQi = clamp(state.shaQi + 5, 0, 999);
                    applyShaQiSideEffects(state, triggers);
                }
                triggers.push({ type: "breakthrough_success",
                    detail: `战胜${event.enemyName}（${getCombatSuppressionDesc(-diff)}），损耗 HP:${event.hpLoss} MP:${event.mpLoss}` });
            }
            else if (event.outcome === "失败") {
                // 失败惩罚：掉落物品
                if (event.dropItems) {
                    for (const drop of event.dropItems) {
                        const inv = state.inventory ?? {};
                        const cur = inv[drop.itemName] ?? 0;
                        if (cur > 0) {
                            const after = Math.max(0, cur - drop.count);
                            if (after === 0)
                                delete inv[drop.itemName];
                            else
                                inv[drop.itemName] = after;
                            state.inventory = inv;
                        }
                    }
                }
                triggers.push({ type: "breakthrough_fail",
                    detail: `败于${event.enemyName}（${getCombatSuppressionDesc(diff)}），损耗 HP:${event.hpLoss} MP:${event.mpLoss}` });
            }
            else if (event.outcome === "逃跑") {
                triggers.push({ type: "breakthrough_fail",
                    detail: `从${event.enemyName}处脱身，损耗 HP:${event.hpLoss} MP:${event.mpLoss}` });
            }
            break;
        }
        case "combat_power_query": {
            // 纯查询，不修改状态，结果通过 trigger 返回
            const level = calcPlayerCombatLevel(state);
            triggers.push({ type: "breakthrough_success",
                detail: JSON.stringify({
                    combatLevel: level,
                    realm: state.realm,
                    bodyRealm: state.bodyRealm,
                    soulRealm: state.soulRealm,
                    beastBondLevel: state.beastBondLevel,
                    desc: `当前战斗力等级约 ${level}，${getCombatSuppressionDesc(0)}基准`,
                }) });
            break;
        }
        // ── 仙界法则 Map ──
        case "law_progress_map": {
            if (state.plane !== "immortal") {
                violations.push({ code: "E_RULE_PLANE_LEAK",
                    message: "法则领悟度仅适用于仙界修士。" });
                break;
            }
            const map = state.lawProgressMap ?? {};
            map[event.lawName] = clamp((map[event.lawName] ?? 0) + event.value, 0, 100);
            state.lawProgressMap = map;
            // 同步旧字段（取最高进度法则的值，保持兼容）
            const maxProgress = Math.max(...Object.values(map));
            state.lawPercent = maxProgress;
            break;
        }
        // ── 世界事件管理 ──
        case "world_event_add": {
            const events = state.worldEvents ?? [];
            if (!events.find((e) => e.id === event.id)) {
                events.push({
                    id: event.id,
                    name: event.name,
                    stage: "萌芽期",
                    tension: 0,
                    finaleMediaEmitted: false,
                    eventType: event.eventType,
                });
                state.worldEvents = events;
                triggers.push({ type: "world_stage_changed",
                    detail: `新世界事件「${event.name}」开始萌芽。` });
            }
            break;
        }
        case "world_event_tension": {
            const events = state.worldEvents ?? [];
            const target = events.find((e) => e.id === event.eventId);
            if (!target)
                break;
            const prevStage = target.stage;
            // 简单递进逻辑（复用 stageFromTension）
            target.tension += event.value;
            const stages = ["萌芽期", "发展期", "激化期", "终末期", "余波期"];
            const newStageIdx = Math.min(Math.floor(target.tension / 3), stages.length - 1);
            target.stage = stages[newStageIdx];
            state.worldEvents = events;
            // 同步主 worldEvent（若是第一个事件）
            if (events[0]?.id === event.eventId) {
                state.worldEvent.tension = target.tension;
                state.worldEvent.stage = target.stage;
            }
            if (target.stage !== prevStage) {
                triggers.push({ type: "world_stage_changed",
                    detail: `事件「${target.name}」进入${target.stage}` });
            }
            if (target.stage === "终末期" && !target.finaleMediaEmitted
                && target.eventType === "宗门战争") {
                target.finaleMediaEmitted = true;
                triggers.push({ type: "world_finale",
                    detail: `宗门战争「${target.name}」终末，胜负将于此役分晓。` });
            }
            break;
        }
        // ── 神识 ──
        case "soul_progress": {
            state.soulProgress = clamp(state.soulProgress + event.value, 0, 100);
            break;
        }
        case "soul_realm_breakthrough": {
            applySoulBreakthrough(state, event.targetRealm, violations, triggers);
            break;
        }
        // ── 技艺熟练度 ──
        case "crafting_progress": {
            state.crafting[event.skill] = clamp(state.crafting[event.skill] + event.value, 0, 100);
            // 每25点一个等级：0=学徒 25=师傅 50=大师 75=宗师
            const level = Math.floor(state.crafting[event.skill] / 25);
            const levelNames = ["学徒", "师傅", "大师", "宗师"];
            if (event.value > 0 && state.crafting[event.skill] % 25 < event.value) {
                triggers.push({ type: "breakthrough_success",
                    detail: `${event.skill}技艺提升至【${levelNames[level] ?? "宗师"}】（${state.crafting[event.skill]}/100）` });
            }
            break;
        }
    }
}
// ─── 主函数 ──────────────────────────────────────────────────────────────────
export function applyEvents(input) {
    const state = cloneState(input.state);
    const violations = [];
    const triggers = [];
    const media = [];
    // 0. 旧存档兼容补丁
    normalizeXianxiaState(state);
    // 1. 前置输入守卫（金手指/位面越界检测）
    if (input.rawInput) {
        const preViolations = validatePlayerInput(state, input.rawInput);
        violations.push(...preViolations);
        if (preViolations.length > 0) {
            return { state: input.state, violations, media, triggers,
                guardedNarrative: input.narrativeText };
        }
    }
    // 2. 挂机锁检查（挂机中只允许挂机相关事件）
    if (state.idle.active) {
        const allowedInIdle = ["idle_claim", "idle_end", "idle_start"];
        const blocked = (input.events ?? []).filter((e) => !allowedInIdle.includes(e.type));
        if (blocked.length > 0) {
            violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                message: "当前处于挂机状态锁，请先领取或结束挂机再进行其他行动。" });
            return { state: input.state, violations, media, triggers,
                guardedNarrative: input.narrativeText };
        }
    }
    // 3. 心魔回合自然递减（每次交互-1）
    if (state.heartDevilTurns > 0)
        state.heartDevilTurns--;
    // 4. 大境界突破前插入心魔检定
    const hasBreakthrough = (input.events ?? []).some((e) => e.type === "breakthrough_attempt" || e.type === "ascend_attempt");
    if (hasBreakthrough) {
        const passed = checkHeartDevilOnBreakthrough(state, violations, triggers);
        if (!passed) {
            return { state, violations, media, triggers, guardedNarrative: input.narrativeText };
        }
    }
    // 5. 逐个执行事件
    for (const event of (input.events ?? [])) {
        applyOne(state, event, violations, triggers, media);
    }
    // 6. 叙事守卫过滤
    let guardedNarrative;
    if (input.narrativeText) {
        const isDaozuPeak = state.realm.includes("道祖") && state.realm.includes("大圆满");
        guardedNarrative = guardXianxiaReply(input.narrativeText, state.plane, isDaozuPeak);
    }
    return { state, violations, media, triggers, guardedNarrative };
}
