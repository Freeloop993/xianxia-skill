import { guardXianxiaReply } from "./xianxiaGuard.js";
import { appendMedia, MEDIA } from "./xianxiaMedia.js";
import { blockedBreakthrough, validatePlayerInput } from "./xianxiaValidator.js";
import { detectActionTag, evolveWorld } from "./xianxiaWorld.js";
import { applyDestinyToState } from "./stateHelpers.js";
const stageByPlane = {
    human: [
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
    ],
    spirit: [
        { realm: "炼虚期·前期", max: 10000 },
        { realm: "炼虚期·中期", max: 15000 },
        { realm: "炼虚期·后期", max: 20000 },
        { realm: "合体期·前期", max: 25000 },
        { realm: "合体期·中期", max: 35000 },
        { realm: "合体期·后期", max: 50000 },
        { realm: "大乘期·前期", max: 60000 },
        { realm: "大乘期·中期", max: 80000 },
        { realm: "大乘期·后期", max: 100000 },
    ],
};
function parseOrigin(text) {
    const t = text.toUpperCase();
    if (t.includes("A") || text.includes("天南") || text.includes("山村"))
        return "A";
    if (t.includes("B") || text.includes("乱星") || text.includes("渔村"))
        return "B";
    if (t.includes("C") || text.includes("大晋") || text.includes("世家"))
        return "C";
    return null;
}
function parseAvatarSelection(input) {
    if (input.includes("选择男修") || input.includes("男角色") || input.includes("男修"))
        return "male";
    if (input.includes("选择女修") || input.includes("女角色") || input.includes("女修"))
        return "female";
    if (input.includes("自定义立绘") || input.includes("上传立绘"))
        return "custom";
    return null;
}
function normalizeNaturalInput(rawInput) {
    let input = (typeof rawInput === "string" ? rawInput : "").trim();
    if (!input)
        return input;
    const map = [
        { reg: /(打坐|冥想|修炼一会|闭关一会|先修炼|吐纳)/, to: "闭关修炼" },
        { reg: /(逛坊市|去集市|去市场|买材料|采购)/, to: "去坊市" },
        { reg: /(出门历练|出去探险|外出冒险|去野外|打怪)/, to: "外出探索" },
        { reg: /(炼丹|练丹|炼制丹药|做丹药).*纳气/, to: "炼制纳气丹" },
        { reg: /(炼丹|练丹|炼制丹药|做丹药).*(回春|回血|疗伤)/, to: "炼制回春丹" },
        { reg: /(炼丹|练丹|炼制丹药|做丹药).*(凝神|回蓝|回法|专注)/, to: "炼制凝神丹" },
        { reg: /(吃|嗑|服).*(纳气丹|修为丹)/, to: "服用纳气丹" },
        { reg: /(吃|嗑|服).*(回春丹|回血丹|疗伤丹)/, to: "服用回春丹" },
        { reg: /(吃|嗑|服).*(凝神丹|回蓝丹|回法丹|专注丹)/, to: "服用凝神丹" },
        { reg: /(我要男|男主|男角色|选男|男修)/, to: "选择男修" },
        { reg: /(我要女|女主|女角色|选女|女修)/, to: "选择女修" },
    ];
    for (const rule of map) {
        if (rule.reg.test(input)) {
            input = rule.to;
            break;
        }
    }
    return input;
}
function parseAttributes(text) {
    const normalized = text.replace(/，/g, ",");
    const keyMap = {
        根骨: "physique",
        悟性: "comprehension",
        神魂: "soul",
        机缘: "fortune",
        心智: "willpower",
    };
    const picked = new Map();
    const seenCn = new Set();
    const reg = /(根骨|悟性|神魂|机缘|心智)\s*(?:[:：=]?\s*)(\d{1,3})/g;
    let match;
    while ((match = reg.exec(normalized)) !== null) {
        const cn = match[1];
        const val = Number(match[2]);
        if (seenCn.has(cn))
            return null;
        seenCn.add(cn);
        picked.set(keyMap[cn], val);
    }
    if (picked.size !== 5)
        return null;
    const attrs = {
        physique: picked.get("physique") ?? 0,
        comprehension: picked.get("comprehension") ?? 0,
        soul: picked.get("soul") ?? 0,
        fortune: picked.get("fortune") ?? 0,
        willpower: picked.get("willpower") ?? 0,
    };
    const total = Object.values(attrs).reduce((sum, n) => sum + n, 0);
    if (total !== 100)
        return null;
    return attrs;
}
function getStages(state) {
    return state.plane === "human" ? stageByPlane.human : stageByPlane.spirit;
}
function findStageIndex(state) {
    const stages = getStages(state);
    const idx = stages.findIndex((s) => s.realm === state.realm);
    return idx < 0 ? 0 : idx;
}
function applyStage(state, index) {
    const stages = getStages(state);
    const safe = Math.max(0, Math.min(index, stages.length - 1));
    state.realm = stages[safe].realm;
    state.cultivationMax = stages[safe].max;
}
function parseIdleHours(input) {
    const hourMatch = input.match(/(\d+)\s*小时/);
    const minuteMatch = input.match(/(\d+)\s*分钟/);
    if (hourMatch) {
        return Math.max(1, Math.min(24, Number(hourMatch[1])));
    }
    if (minuteMatch) {
        const minutes = Math.max(1, Number(minuteMatch[1]));
        return Math.max(1, Math.min(24, Math.ceil(minutes / 60)));
    }
    return 1;
}
function canSuggestBreakthrough(state, target) {
    if (target === "筑基") {
        return state.realm.startsWith("炼气期") && state.realm !== "炼气期·前期";
    }
    if (target === "结丹") {
        return state.realm.startsWith("筑基期") && state.realm !== "筑基期·前期";
    }
    return false;
}
function buildSuggestionsByState(state, actionTag) {
    if (state.step !== "in_world") {
        return ["闭关修炼", "去坊市", "外出探索"];
    }
    const suggestions = new Set();
    suggestions.add("继续闭关");
    suggestions.add("回坊市");
    suggestions.add("深入历练");
    if (actionTag === "market") {
        suggestions.add("炼制纳气丹");
        suggestions.add("炼制回春丹");
    }
    else if (actionTag === "explore") {
        suggestions.add("开始挂机1小时");
        suggestions.add("服用回春丹");
    }
    else {
        suggestions.add("炼制纳气丹");
        suggestions.add("服用纳气丹");
    }
    suggestions.add("服用凝神丹");
    if (canSuggestBreakthrough(state, "筑基")) {
        suggestions.add("尝试筑基");
    }
    if (canSuggestBreakthrough(state, "结丹")) {
        suggestions.add("尝试结丹");
    }
    return [...suggestions].slice(0, 8);
}
function advanceSmallStages(state) {
    if (state.plane === "immortal")
        return [];
    const logs = [];
    while (state.cultivationCurrent >= state.cultivationMax) {
        const stages = getStages(state);
        const idx = findStageIndex(state);
        const next = idx + 1;
        if (next >= stages.length) {
            state.cultivationCurrent = state.cultivationMax;
            logs.push("当前真元已达位面上限，需准备飞升。仙途未止。");
            break;
        }
        const crossMajor = stages[idx].realm.split("·")[0] !== stages[next].realm.split("·")[0];
        if (crossMajor)
            break;
        state.cultivationCurrent -= state.cultivationMax;
        applyStage(state, next);
        logs.push(`真元贯通周天，境界提升至**${state.realm}**。`);
    }
    return logs;
}
function applyPotionCommand(state, input) {
    const rollQuality = () => {
        const bonus = Math.floor(((state.attributes?.comprehension ?? 20) + (state.attributes?.fortune ?? 20)) / 20);
        const r = Math.random() * 100 + bonus * 2;
        if (r >= 90)
            return "上品";
        if (r >= 55)
            return "良品";
        return "凡品";
    };
    const toxicityDeltaByQuality = {
        凡品: 8,
        良品: 4,
        上品: 1,
    };
    const gainMulByQuality = {
        凡品: 1,
        良品: 1.2,
        上品: 1.45,
    };
    if (input.includes("炼制纳气丹")) {
        if (state.spiritStone < 30)
            return "炼制失败：灵石不足（需要30）。";
        state.spiritStone -= 30;
        const q = rollQuality();
        state.lastPillQuality = q;
        state.pills.nourishQi += q === "上品" ? 2 : 1;
        return `丹火一转，炼成${q}纳气丹。`;
    }
    if (input.includes("炼制回春丹")) {
        if (state.spiritStone < 40)
            return "炼制失败：灵石不足（需要40）。";
        state.spiritStone -= 40;
        const q = rollQuality();
        state.lastPillQuality = q;
        state.pills.heal += q === "上品" ? 2 : 1;
        return `药香凝而不散，炼成${q}回春丹。`;
    }
    if (input.includes("炼制凝神丹")) {
        if (state.spiritStone < 60)
            return "炼制失败：灵石不足（需要60）。";
        state.spiritStone -= 60;
        const q = rollQuality();
        state.lastPillQuality = q;
        state.pills.focus += 1;
        return `神识微震，炼成${q}凝神丹。`;
    }
    if (input.includes("服用纳气丹")) {
        if (state.pills.nourishQi < 1)
            return "服用失败：纳气丹不足。";
        state.pills.nourishQi -= 1;
        const quality = state.lastPillQuality === "无" ? "凡品" : state.lastPillQuality;
        const gain = Math.floor((24 + Math.floor((state.attributes?.comprehension ?? 20) / 5)) * gainMulByQuality[quality]);
        state.cultivationCurrent += gain;
        state.pillToxicity = Math.min(120, state.pillToxicity + toxicityDeltaByQuality[quality]);
        const logs = advanceSmallStages(state);
        return `丹力化开（${quality}），真元 +${gain}。${logs.join(" ")}`.trim();
    }
    if (input.includes("服用回春丹")) {
        if (state.pills.heal < 1)
            return "服用失败：回春丹不足。";
        state.pills.heal -= 1;
        const quality = state.lastPillQuality === "无" ? "凡品" : state.lastPillQuality;
        const heal = Math.floor(30 * gainMulByQuality[quality]);
        state.hp = Math.min(100, state.hp + heal);
        state.pillToxicity = Math.min(120, state.pillToxicity + toxicityDeltaByQuality[quality]);
        return `药力温养经脉（${quality}），气血恢复 ${heal}。`;
    }
    if (input.includes("服用凝神丹")) {
        if (state.pills.focus < 1)
            return "服用失败：凝神丹不足。";
        state.pills.focus -= 1;
        const quality = state.lastPillQuality === "无" ? "凡品" : state.lastPillQuality;
        const turns = quality === "上品" ? 5 : quality === "良品" ? 4 : 3;
        state.focusBuffTurns = Math.max(state.focusBuffTurns, turns);
        state.pillToxicity = Math.min(120, state.pillToxicity + toxicityDeltaByQuality[quality]);
        return `识海清明（${quality}），获得${turns}回合凝神修炼加成。`;
    }
    return null;
}
function itemLine(state) {
    return getInventoryItemsFromState(state).join(", ");
}
export function getInventoryItemsFromState(state) {
    const parts = [];
    // 1. 通用物品栏（真实存储）
    const inv = state.inventory ?? {};
    for (const [name, qty] of Object.entries(inv)) {
        if (qty > 0)
            parts.push(`${name} x${qty}`);
    }
    // 2. 丹药（独立字段，方便引擎直接操作）
    if (state.pills.nourishQi > 0)
        parts.push(`纳气丹 x${state.pills.nourishQi}`);
    if (state.pills.heal > 0)
        parts.push(`回春丹 x${state.pills.heal}`);
    if (state.pills.focus > 0)
        parts.push(`凝神丹 x${state.pills.focus}`);
    // 3. 突破材料（独立字段兼容历史）
    if (state.foundationPill > 0)
        parts.push(`筑基丹 x${state.foundationPill}`);
    if (state.insightRelic > 0)
        parts.push(`悟道之物 x${state.insightRelic}`);
    if (state.spiritEyeAccess)
        parts.push("通天灵眼令牌 x1");
    return parts.length > 0 ? parts : ["（空）"];
}
function formatIdleRemainMs(ms) {
    if (ms <= 0)
        return "0分钟";
    const totalMin = Math.ceil(ms / (60 * 1000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0)
        return `${h}小时${m}分钟`;
    return `${m}分钟`;
}
function cultivationLine(state) {
    if (state.plane === "immortal") {
        return `法则: 时空(${state.lawPercent}%)`;
    }
    return `真元: ${state.cultivationCurrent}/${state.cultivationMax}`;
}
function buildStatusIni(state) {
    const x = state.attributes;
    const attrLine = x
        ? `根骨${x.physique}/悟性${x.comprehension}/神魂${x.soul}/机缘${x.fortune}/心智${x.willpower}`
        : "待分配";
    const avatar = state.avatar.preset === null ? "未选择" : state.avatar.preset;
    const buffLine = state.focusBuffTurns > 0 ? `凝神加成(${state.focusBuffTurns}回合)` : "无";
    const toxLevel = state.pillToxicity >= 80 ? "高" : state.pillToxicity >= 40 ? "中" : "低";
    return [
        "```text",
        "【修行者状态】",
        `名  号 : ${state.name}`,
        `立  绘 : ${avatar}`,
        `境  界 : ${state.realm}`,
        `肉  身 : ${state.bodyRealm}`,
        `神  识 : ${state.soulRealm ?? "凡境"}`,
        `修  为 : ${cultivationLine(state)}`,
        `道  印 : ${state.daoSealCount > 0 ? `${state.daoSealCount} 枚` : "暂无"}`,
        "功  法 : 青元纳气诀, 无",
        `物  品 : ${itemLine(state)}`,
        `丹  药 : 纳气丹(${state.pills.nourishQi})/回春丹(${state.pills.heal})/凝神丹(${state.pills.focus})`,
        `品  质 : ${state.lastPillQuality}`,
        `丹  毒 : ${state.pillToxicity}/100 (${toxLevel})`,
        `丹  效 : ${buffLine}`,
        `资  产 : 灵石 ${state.spiritStone} / 仙元石 ${state.immortalStone}`,
        `状  态 : HP ${state.hp}/100, MP ${state.mp}/100, 健康`,
        `煞  气 : ${state.shaQi} (轻微)`,
        `目  标 : ${state.goal}`,
        `灵  兽 : ${state.beastName} ([状态: ${state.beastStage}], [等级: ${state.beastLevel}])`,
        `关  系 : ${state.relationSummary}`,
        `先  天 : ${attrLine}`,
        "```",
    ].join("\n");
}
function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}
function summarizeEffects(before, after) {
    const effects = [];
    const pushIfChanged = (key, label, b, a) => {
        if (b === a)
            return;
        effects.push({ key, label, before: b, after: a });
    };
    pushIfChanged("name", "名号", before.name, after.name);
    pushIfChanged("step", "流程阶段", before.step, after.step);
    pushIfChanged("origin", "出身", before.origin, after.origin);
    pushIfChanged("plane", "位面", before.plane, after.plane);
    pushIfChanged("realm", "境界", before.realm, after.realm);
    pushIfChanged("goal", "目标", before.goal, after.goal);
    pushIfChanged("spiritStone", "灵石", before.spiritStone, after.spiritStone);
    pushIfChanged("hp", "生命", before.hp, after.hp);
    pushIfChanged("mp", "法力", before.mp, after.mp);
    pushIfChanged("avatar", "立绘", before.avatar.preset, after.avatar.preset);
    pushIfChanged("pill.nourishQi", "纳气丹", before.pills.nourishQi, after.pills.nourishQi);
    pushIfChanged("pill.heal", "回春丹", before.pills.heal, after.pills.heal);
    pushIfChanged("pill.focus", "凝神丹", before.pills.focus, after.pills.focus);
    pushIfChanged("focusBuffTurns", "凝神回合", before.focusBuffTurns, after.focusBuffTurns);
    return effects;
}
function summarizeWorldChanges(before, after) {
    const changes = [];
    if (before.worldEvent.stage !== after.worldEvent.stage) {
        changes.push({ key: "world.stage", label: "世界事件阶段", value: `${before.worldEvent.stage} -> ${after.worldEvent.stage}` });
    }
    if (before.worldEvent.tension !== after.worldEvent.tension) {
        changes.push({ key: "world.tension", label: "世界张力", value: `${before.worldEvent.tension} -> ${after.worldEvent.tension}` });
    }
    return changes;
}
function summarizeRelationDelta(before, after) {
    const allNpc = Array.from(new Set([...Object.keys(before.npcRelations), ...Object.keys(after.npcRelations)]));
    const changed = allNpc
        .map((name) => ({
        name,
        before: before.npcRelations[name] ?? 0,
        after: after.npcRelations[name] ?? 0,
    }))
        .filter((x) => x.before !== x.after)
        .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
    if (!changed.length)
        return "暂无明显变化";
    const top = changed[0];
    return `${top.name}观感：${top.before} → ${top.after}`;
}
function buildTurnSummary(before, after) {
    const stoneDelta = after.spiritStone - before.spiritStone;
    const hpDelta = after.hp - before.hp;
    const cvDelta = after.cultivationCurrent - before.cultivationCurrent;
    const gainLine = `本次收获：灵石 ${stoneDelta >= 0 ? `+${stoneDelta}` : stoneDelta} / 真元 ${cvDelta >= 0 ? `+${cvDelta}` : cvDelta} / HP ${hpDelta >= 0 ? `+${hpDelta}` : hpDelta}`;
    const worldLine = before.worldEvent.stage !== after.worldEvent.stage
        ? `局势变化：世界事件「${after.worldEvent.name}」已从${before.worldEvent.stage}推进到${after.worldEvent.stage}`
        : `局势变化：世界事件「${after.worldEvent.name}」维持${after.worldEvent.stage}（张力 ${before.worldEvent.tension} → ${after.worldEvent.tension}）`;
    const relationLine = `关系变化：${summarizeRelationDelta(before, after)}`;
    return ["【回合小结】", gainLine, worldLine, relationLine].join("\n");
}
function detectUiHints(state) {
    if (state.step === "ask_name") {
        return { input_expected: "请输入名号（可先选立绘）", input_examples: ["选择男修", "选择女修", "韩立"] };
    }
    if (state.step === "ask_origin") {
        return { input_expected: "请输入出身选项 A/B/C", input_examples: ["A", "B", "C"] };
    }
    if (state.step === "ask_attr") {
        return { input_expected: "请输入五项先天属性，总和100", input_examples: ["根骨20 悟性20 神魂20 机缘20 心智20"] };
    }
    return { input_expected: "请输入行动", input_examples: ["闭关修炼", "炼制纳气丹", "服用纳气丹", "去坊市"] };
}
function inferActionTag(before, after, rawInput) {
    if (before.step === "ask_name" && after.step === "ask_name")
        return "onboarding";
    if (before.step === "ask_name" && after.step === "ask_origin")
        return "name_setup";
    if (before.step === "ask_origin")
        return "origin_setup";
    if (before.step === "ask_attr")
        return "attribute_setup";
    if (before.step === "ask_destiny")
        return "destiny_setup";
    if (rawInput.includes("选择男修") || rawInput.includes("选择女修") || rawInput.includes("自定义立绘"))
        return "avatar_setup";
    if (rawInput.includes("炼制") || rawInput.includes("服用"))
        return "alchemy";
    return detectActionTag(rawInput, false);
}
function finalizeReply(state, replyText, nextSuggestions, media, violations = [], meta) {
    const isDaozuPeak = state.realm.includes("道祖") && state.realm.includes("大圆满");
    const guarded = guardXianxiaReply(replyText, state.plane, isDaozuPeak);
    const before = meta?.stateBefore ?? cloneState(state);
    const structured = {
        mode: "xianxia",
        raw_input: meta?.rawInput ?? "",
        action_tag: meta?.actionTag ?? inferActionTag(before, state, meta?.rawInput ?? ""),
        state_before: before,
        state_after: cloneState(state),
        effects: summarizeEffects(before, state),
        violations,
        world_changes: summarizeWorldChanges(before, state),
        suggestions: nextSuggestions,
        ui_hints: detectUiHints(state),
        media,
        fallback_text: guarded,
    };
    return { replyText: guarded, nextSuggestions, state, media, violations, structured };
}
function tryMajorBreakthrough(state, input) {
    let media = [];
    if (input.includes("尝试筑基")) {
        if (state.realm !== "炼气期·后期" || state.cultivationCurrent < state.cultivationMax) {
            return { media, violations: blockedBreakthrough("筑基失败：需先达到炼气后期圆满。") };
        }
        if (state.foundationPill < 1) {
            return { media, violations: blockedBreakthrough("筑基失败：缺少筑基丹。") };
        }
        state.foundationPill -= 1;
        state.cultivationCurrent = 0;
        applyStage(state, getStages(state).findIndex((s) => s.realm === "筑基期·前期"));
        return { media, scene: "丹田气海凝实成台，成功踏入筑基期·前期。" };
    }
    if (input.includes("尝试结丹")) {
        if (state.realm !== "筑基期·后期" || state.cultivationCurrent < state.cultivationMax) {
            return { media, violations: blockedBreakthrough("结丹失败：需先达到筑基后期圆满。") };
        }
        if ((state.attributes?.willpower ?? 0) < 20) {
            return { media, violations: blockedBreakthrough("结丹失败：心智不足，难渡心魔。") };
        }
        state.cultivationCurrent = 0;
        applyStage(state, getStages(state).findIndex((s) => s.realm === "结丹期·前期"));
        return { media, scene: `心魔劫散，金丹凝成，境界踏入结丹期·前期。` };
    }
    if (state.plane === "immortal" && input.includes("尝试凝印")) {
        if (state.lawPercent < 100) {
            return { media, violations: blockedBreakthrough("凝印失败：法则领悟需达到100%。") };
        }
        state.lawPercent = 0;
        state.daoSealCount += 1;
        return { media, scene: `道火炼魂而不灭，成功凝聚第 ${state.daoSealCount} 枚道印。` };
    }
    return { media };
}
// ═══════════════════════════════════════════════════════════════════════════════
// 命数抽卡池
// ═══════════════════════════════════════════════════════════════════════════════
const DESTINY_COMMON = [
    "坚韧不拔", "丹道亲和", "手有余香", "家境殷实",
    "气血充盈", "符道学徒", "过目不忘", "祖传铁剑",
];
const DESTINY_RARE = [
    "天生剑骨", "残破的古玉", "大衍残篇", "煞气淬体",
    "药灵之体", "御风之才", "神秘的兽卵", "前世残梦", "异种灵根",
];
const DESTINY_LEGEND = [
    "天灵根", "隔代老祖的残魂", "掌天之缘", "大能转世",
    "先天道体", "妖神血脉", "鸿蒙剑胎", "麒麟之缘",
];
function weightedPickOne(pool, weight) {
    if (Math.random() < weight && pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)] ?? null;
    }
    return null;
}
/** 随机抽取 count 张不重复命数牌 */
function drawDestinyOptions(count) {
    const picked = new Set();
    const attempts = count * 20;
    for (let i = 0; i < attempts && picked.size < count; i++) {
        // 权重：普通 65% / 珍品 28% / 绝品 7%
        const tag = weightedPickOne(DESTINY_LEGEND, 0.07) ??
            weightedPickOne(DESTINY_RARE, 0.28) ??
            DESTINY_COMMON[Math.floor(Math.random() * DESTINY_COMMON.length)];
        picked.add(tag);
    }
    return [...picked].slice(0, count);
}
/** 匹配用户输入的命数选择（字母/编号/关键词） */
function matchDestinyTag(input, options) {
    const trimmed = (typeof input === "string" ? input : "").trim();
    // A/B/C 或 1/2/3
    const letterIdx = ["A", "B", "C", "a", "b", "c"].indexOf(trimmed[0] ?? "");
    if (letterIdx >= 0 && options[letterIdx % 3])
        return options[letterIdx % 3];
    const numIdx = parseInt(trimmed, 10);
    if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= options.length)
        return options[numIdx - 1];
    // 关键词匹配
    for (const tag of options) {
        if (input.includes(tag))
            return tag;
    }
    return null;
}
function buildDestinyPrompt(options, rerollCount) {
    const remaining = 2 - rerollCount;
    const rerollHint = remaining > 0 ? `（还可重新抽取 ${remaining} 次）` : "（最终一轮，必须从中选择）";
    const list = options.map((t, i) => `> ${String.fromCharCode(65 + i)}. **【${t}】**`).join("\n");
    return [`命数之启——天道为你呈现三张命格牌，选择其一作为此生天赋${rerollHint}：`, list].join("\n\n");
}
export function resolveXianxiaTurn(state, text) {
    const rawInput = (typeof text === "string" ? text : "").trim();
    const input = normalizeNaturalInput(rawInput);
    const turnStateBefore = cloneState(state);
    const finalize = (nextState, replyText, nextSuggestions, media, violations = [], actionTag) => finalizeReply(nextState, replyText, nextSuggestions, media, violations, {
        rawInput,
        actionTag,
        stateBefore: turnStateBefore,
    });
    const avatarSelection = parseAvatarSelection(input);
    if (avatarSelection) {
        state.avatar.preset = avatarSelection;
        const avatarLabel = avatarSelection === "male" ? "男修" : avatarSelection === "female" ? "女修" : "自定义";
        return finalize(state, [`立绘已切换为：${avatarLabel}。`, buildStatusIni(state)].join("\n\n"), ["报上姓名"], [], [], "avatar_setup");
    }
    const wantsStartIdle = /(开始|先|我要|去)?\s*挂机/.test(input) &&
        !/(挂机状态|查看挂机|领取挂机|结算挂机|结束挂机|停止挂机|退出挂机)/.test(input);
    if (wantsStartIdle) {
        const hours = parseIdleHours(input);
        const start = new Date();
        const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
        state.idle.active = true;
        state.idle.startedAt = start.toISOString();
        state.idle.endsAt = end.toISOString();
        state.idle.reminderSentAt = null;
        state.idle.scene = "洞府闭关";
        return finalize(state, [`已进入挂机历练：${hours}小时。挂机期间开启状态锁，仅可【挂机状态/领取挂机/结束挂机】。`, buildStatusIni(state)].join("\n\n"), ["挂机状态", "领取挂机", "结束挂机"], [], [], "idle_start");
    }
    if (input.includes("挂机状态") || input.includes("查看挂机")) {
        const now = Date.now();
        const ends = state.idle.endsAt ? new Date(state.idle.endsAt).getTime() : null;
        const remain = state.idle.active && ends ? formatIdleRemainMs(ends - now) : "未挂机";
        return finalize(state, [`挂机状态：${state.idle.active ? "进行中" : "未开启"}。剩余：${remain}。`, buildStatusIni(state)].join("\n\n"), state.idle.active ? ["领取挂机", "结束挂机"] : ["开始挂机1小时", "闭关修炼"], [], [], "idle_status");
    }
    if (input.includes("领取挂机") || input.includes("结算挂机")) {
        if (!state.idle.active || !state.idle.endsAt) {
            return finalize(state, "当前没有可领取的挂机收益。", ["开始挂机1小时", "闭关修炼"], [], [], "idle_claim");
        }
        const now = Date.now();
        const startTs = state.idle.startedAt ? new Date(state.idle.startedAt).getTime() : now;
        const endTs = new Date(state.idle.endsAt).getTime();
        if (now < endTs) {
            return finalize(state, `挂机尚未结束，仍需等待 ${formatIdleRemainMs(endTs - now)}。`, ["挂机状态", "结束挂机"], [], [], "idle_claim");
        }
        const hours = Math.max(1, Math.floor((endTs - startTs) / (60 * 60 * 1000)));
        const stoneGain = 10 * hours + Math.floor((state.attributes?.fortune ?? 20) / 10) * hours;
        const cvGain = 12 * hours + Math.floor((state.attributes?.comprehension ?? 20) / 10) * hours;
        state.spiritStone += stoneGain;
        state.cultivationCurrent += cvGain;
        state.pillToxicity = Math.max(0, state.pillToxicity - hours);
        const logs = advanceSmallStages(state);
        state.idle.active = false;
        state.idle.startedAt = null;
        state.idle.endsAt = null;
        state.idle.scene = null;
        state.idle.reminderSentAt = null;
        const worldLogs = evolveWorld(state, "cultivate");
        const summary = buildTurnSummary(turnStateBefore, state);
        return finalize(state, [summary, `挂机结算完成：灵石 +${stoneGain}，真元 +${cvGain}。${logs.join(" ")}`.trim(), worldLogs.join(" "), buildStatusIni(state)].join("\n\n"), buildSuggestionsByState(state, "cultivate"), [], [], "idle_claim");
    }
    if (input.includes("结束挂机") || input.includes("停止挂机") || input.includes("退出挂机")) {
        if (!state.idle.active) {
            return finalize(state, "当前未处于挂机状态。", ["开始挂机1小时"], [], [], "idle_end");
        }
        state.idle.active = false;
        state.idle.startedAt = null;
        state.idle.endsAt = null;
        state.idle.scene = null;
        state.idle.reminderSentAt = null;
        return finalize(state, "已手动结束挂机，状态锁解除。", ["闭关修炼", "去坊市", "外出探索"], [], [], "idle_end");
    }
    if (state.idle.active) {
        return finalize(state, ["当前处于挂机状态锁。请先【领取挂机】或【结束挂机】后再进行剧情交互。", buildStatusIni(state)].join("\n\n"), ["挂机状态", "领取挂机", "结束挂机"], [], [], "idle_locked");
    }
    const preViolations = validatePlayerInput(state, input);
    if (preViolations.length > 0) {
        return finalize(state, ["天道示警：当前行为不合此界法则。", ...preViolations.map((v) => `- ${v.code}: ${v.message}`), buildStatusIni(state)].join("\n\n"), ["闭关修炼", "去坊市", "外出探索"], [], preViolations, "rule_violation");
    }
    if (state.step === "ask_name") {
        if (!input || input === "开始" || input === "开始修仙") {
            return finalize(state, `混沌未分，天门乍开。

你这一缕真灵已被此界感知。修行一道，先定其名，后承其命；名号一落，因果自成。

报上你的姓名。若尚未想好，也可先答：选择男修 / 选择女修。`, ["选择男修", "选择女修", "报上姓名"], [], [], "onboarding");
        }
        state.name = input.slice(0, 16);
        state.step = "ask_origin";
        return finalize(state, `${MEDIA.ONBOARDING_ORIGIN}

名号已定。

自此之后，你便以「${state.name}」之名行走此界。接下来，该定你的出身。出身不同，所见天地、所承苦乐、所逢机缘，皆不相同。

> A. 天南之地·越国山村
*“此子生于天南一隅，青山绿水，灵气稀薄。虽无修仙传承，然自幼采药牧牛，于山野间磨砺，心性之坚韧，远超常人。”*
初始增益：**[道心坚韧]** —— 突破时遭遇心魔概率降低。

> B. 乱星之海·海岛渔村
*“此子生于乱星海域，惊涛骇浪，妖兽环伺。为求生计，日日与风浪搏斗，与海兽争锋，淣炼出一副远比同龄人强健的体魄。”*
初始增益：**[体魄初成]** —— 炼体修为直接从**后天锻体**起步。

> C. 大晋王朝·没落世家
*“此子生于大晋修仙世家，虽家道中落，资源不复往昔，然耳濡目染，自幼便听闻长辈谈玄论道，于神魂一道，有超乎常人的天赋。”*
初始增益：**[神识天赋]** —— 神识先天强于常人，修炼神识功法事半功倍。

择其一，告知于我。`, ["A", "B", "C"], [], [], "name_setup");
    }
    if (state.step === "ask_origin") {
        const origin = parseOrigin(input);
        if (!origin)
            return finalize(state, `你的出身尚未落定。

请从以下三处来路中择其一：
A. 天南之地·越国山村
B. 乱星之海·海岛渔村
C. 大晋王朝·没落世家`, ["A. 天南之地·越国山村", "B. 乱星之海·海岛渔村", "C. 大晋王朝·没落世家"], [], [], "origin_setup");
        state.origin = origin;
        if (origin === "B")
            state.bodyRealm = "后天锻体";
        if (origin === "C")
            state.soulRealm = "灵境雏形";
        state.step = "ask_attr";
        return finalize(state, `${MEDIA.ONBOARDING_ATTRS}

出身既定，然汝之真灵尚有可塑之基。大道五十，天衍四九，人遁其一。此一线生机，便在于汝之抉择。

今赐予你 **100点** 先天道蕴，请将其分配于以下五项：
- **根骨**：肉身强度与炼体资质
- **悟性**：领悟功法与法则的速度
- **神魂**：神识强度与成长潜力
- **机缘**：奇遇、秘藏、贵人运
- **心智**：道心稳固，抗心魔与幻术

五项必须齐全，总和必须**正好100**。
请按这个格式回答：
根骨20，悟性20，神魂20，机缘20，心智20`, ["根骨20 悟性20 神魂20 机缘20 心智20"], [], [], "origin_setup");
    }
    if (state.step === "ask_attr") {
        const attrs = parseAttributes(input);
        if (!attrs) {
            return finalize(state, `你方才的先天分配有误。

须满足两条：
1. 根骨、悟性、神魂、机缘、心智五项都要填写
2. 五项总和必须正好为100

请按示例重新回答：
根骨20，悟性20，神魂20，机缘20，心智20`, ["根骨20 悟性20 神魂20 机缘20 心智20"], [], [], "attribute_setup");
        }
        state.attributes = attrs;
        state.step = "ask_destiny";
        state.destinyRerollCount = 0;
        state.destinyDraftOptions = drawDestinyOptions(3);
        return finalize(state, `${MEDIA.ONBOARDING_DESTINY}

五行既定，命盘将开。

天幕之上，三张命数牌正缓缓显形。你尚可重抽 **${2 - state.destinyRerollCount}** 次，若对眼前缘法不满，可弃而再抽；若已有心动之选，便从中择一，定你此生道途。

${state.destinyDraftOptions.map((t, i) => `> ${String.fromCharCode(65 + i)}. **【${t}】**`).join("\n")}

你可以直接回复命数名称，或回复“重新抽取”。`, [...state.destinyDraftOptions, "重新抽取"], [], [], "attribute_setup");
    }
    if (state.step === "ask_destiny") {
        const reroll = /重新|再抽|换一组|不要|重抽/.test(input);
        if (reroll) {
            if (state.destinyRerollCount >= 2) {
                // 第3次必选
                return finalize(state, `天数已定，第三轮命数为最终命运，从中选择其一：\n${state.destinyDraftOptions.map((t, i) => `> ${String.fromCharCode(65 + i)}. ${t}`).join("\n")}`, state.destinyDraftOptions, [], [], "destiny_setup");
            }
            state.destinyRerollCount += 1;
            state.destinyDraftOptions = drawDestinyOptions(3);
            return finalize(state, buildDestinyPrompt(state.destinyDraftOptions, state.destinyRerollCount), [...state.destinyDraftOptions, ...(state.destinyRerollCount < 2 ? ["重新抽取"] : [])], [], [], "destiny_setup");
        }
        // 尝试匹配所选命数
        const chosen = matchDestinyTag(input, state.destinyDraftOptions);
        if (!chosen) {
            return finalize(state, `命格未定，请从以下命数中择其一：\n${state.destinyDraftOptions.map((t, i) => `> ${String.fromCharCode(65 + i)}. ${t}`).join("\n")}`, [...state.destinyDraftOptions, ...(state.destinyRerollCount < 2 ? ["重新抽取"] : [])], [], [], "destiny_setup");
        }
        state.destinyTags = [chosen];
        state.step = "in_world";
        state.destinyDraftOptions = [];
        state.goal = "[自由探索] 先稳固炼气修为，再寻筑基线索";
        applyDestinyToState(state);
        const openingScene = state.origin === "A"
            ? `命数已定：**【${chosen}】**。天地为证，修仙之路正式展开。\n\n晨雾尚未散尽，越国山村的鸡鸣已穿过篱墙与薄田。${state.name}推门而出，只见青山如黛，小溪贴着村路蜿蜒而去。空气里混着草木清气与泥土潮意，一切看似寻常。\n\n然而今晨有些不同——村口的李老汉正拄着拐杖，神色惶然地拦住每一个路过的人。他说昨夜山里旧庙方向传来一阵闷响，今早去查看时，庙前的石阶上多了一道深可见骨的巨大爪痕，地面还残留着一片焦黑的鳞片。那东西散发着一股说不清的腥热气息，连村里的狗都不敢靠近。\n\n李老汉把那片焦鳞递到你面前，掌心大小，触手微烫，隐约有细纹在鳞面流转。\n\n> A. 接过焦鳞仔细端详，尝试感受上面是否残留灵气\n> B. 先去旧庙实地查看那道爪痕和现场痕迹\n> C. 向李老汉追问更多细节——昨夜闷响的方向、持续多久、有无光芒\n> D. 自由行动（请直接描述你想做的事）`
            : state.origin === "B"
                ? `命数已定：**【${chosen}】**。天地为证，修仙之路正式展开。\n\n海风裹着咸湿气息扑面而来，乱星海边的渔村尚笼在灰蓝晨色之中。${state.name}立在礁石与木栈之间，脚下潮声拍岸不绝，远处渔火未熄。\n\n今晨的潮水退得比往常更远，露出了一大片平日不曾见过的黑色礁盘。码头上几个老渔夫围在一起低声议论——昨夜子时，海面突然涌起一道数丈高的血色浪墙，持续了整整一炷香才消退。更诡异的是，今早退潮后，礁盘上赫然躺着一具从未见过的海兽残骸，体长近两丈，腹部被什么东西从内部撕裂开来，空空如也。\n\n残骸周围的礁石上，散落着几枚拇指大小、泛着幽蓝微光的鳞片。一个胆大的渔家少年刚伸手去捡，指尖便被灼出一道血痕，吓得连退三步。那些鳞片此刻仍静静躺在那里，微光明灭不定。\n\n> A. 走近海兽残骸，查看腹部撕裂的伤口和内部痕迹\n> B. 小心捡起一枚幽蓝鳞片，试着以气血抵御灼热感知其来历\n> C. 找到昨夜亲眼目睹血色浪墙的老渔夫，详细询问当时情形\n> D. 自由行动（请直接描述你想做的事）`
                : `命数已定：**【${chosen}】**。天地为证，修仙之路正式展开。\n\n大晋王朝的暮色沉在残旧屋檐之上，没落世家的宅院静得只剩风过回廊。${state.name}独自立于旧庭之间，墙角爬满苔痕，断碑半埋在草中，昔日的修仙门楣早已不复。\n\n今夜有些不同。方才你在书房翻阅一卷泛黄的族谱残页时，指尖无意间触到封底夹层里一块冰凉的玉片。玉片不过两指宽，通体漆黑，却在你触碰的瞬间亮起一道极细的金色纹路，随即又暗了下去。与此同时，宅院深处的废井方向传来一声沉闷的"嗡"响，像是什么沉睡已久的东西被惊动了。\n\n你握着那枚黑玉片站在庭中，能感觉到它仍在微微发热。废井的方向一片漆黑，但你天生敏锐的神识隐约捕捉到了一丝极淡的灵气波动，正从那个方向缓缓渗出。\n\n> A. 仔细查看黑玉片上的金色纹路，尝试以神识探入其中\n> B. 提灯前往废井方向，追踪那丝灵气波动的来源\n> C. 先回书房翻找族谱残页，看是否有关于这枚玉片的记载\n> D. 自由行动（请直接描述你想做的事）`;
        return finalize(state, [openingScene, buildStatusIni(state)].join("\n\n"), ["闭关修炼", "去坊市", "外出探索", "自由行动"], [], [], "destiny_setup");
    }
    let media = [];
    let scene = "";
    let usedMajorBreakthrough = false;
    const major = tryMajorBreakthrough(state, input);
    media = appendMedia(media, ...major.media);
    if (major.violations) {
        return finalize(state, ["天道压下劫门，突破条件尚未齐备。", ...major.violations.map((v) => `- ${v.code}: ${v.message}`), buildStatusIni(state)].join("\n\n"), ["闭关修炼", "去坊市", "外出探索"], media, major.violations, "breakthrough");
    }
    if (major.scene) {
        scene = major.scene;
        usedMajorBreakthrough = true;
    }
    if (!scene) {
        const potionScene = applyPotionCommand(state, input);
        if (potionScene) {
            scene = potionScene;
            state.goal = "[丹药调理] 以丹药稳固修为与状态";
        }
    }
    if (!scene && (input.includes("闭关") || input.includes("修炼"))) {
        const baseGain = 8 + Math.floor((state.attributes?.comprehension ?? 20) / 10);
        const buffGain = state.focusBuffTurns > 0 ? 10 : 0;
        const gain = baseGain + buffGain;
        state.cultivationCurrent += gain;
        state.mp = Math.max(40, state.mp - 8);
        if (state.focusBuffTurns > 0)
            state.focusBuffTurns -= 1;
        state.goal = "[闭关清修] 累积真元，冲击下一小境界";
        const logs = advanceSmallStages(state);
        scene = `静室之中，灵息绵长，修为增长 ${gain}。${logs.join(" ")}`;
        state.pillToxicity = Math.max(0, state.pillToxicity - 2);
    }
    if (!scene && (input.includes("坊市") || input.includes("交易") || input.includes("买"))) {
        state.spiritStone = Math.max(0, state.spiritStone - 12);
        state.mp = Math.min(100, state.mp + 5);
        state.goal = "[坊市周旋] 收集丹药与突破材料线索";
        scene = "坊市人潮拥挤，几番试探后换得一份可疑线图，灵石消耗 12。";
    }
    if (!scene) {
        const gainStone = 10 + Math.floor((state.attributes?.fortune ?? 20) / 10);
        state.spiritStone += gainStone;
        state.hp = Math.max(65, state.hp - 6);
        state.goal = "[外出历练] 扩展地图并寻找遗府传闻";
        scene = `山道多雾，沿途斩除低阶妖兽，收得灵石 ${gainStone}。`;
    }
    if (state.pillToxicity >= 100) {
        state.hp = Math.max(1, state.hp - 20);
        state.mp = Math.max(1, state.mp - 20);
        state.focusBuffTurns = 0;
        state.pillToxicity = 60;
        scene += " 丹毒反噬骤起，气血与法力受损。";
    }
    const worldLogs = evolveWorld(state, detectActionTag(input, usedMajorBreakthrough));
    if (state.worldEvent.stage === "终末期" && !state.worldEvent.finaleMediaEmitted) {
        state.worldEvent.finaleMediaEmitted = true;
        worldLogs.push(`宗门战争已至终末，胜负将于此役分晓。`);
    }
    const reply = [
        scene,
        worldLogs.join(" "),
        buildStatusIni(state),
    ].join("\n\n");
    return finalize(state, reply, ["继续闭关", "回坊市", "深入历练", "炼制纳气丹", "服用纳气丹", "服用回春丹", "服用凝神丹", "尝试筑基", "尝试结丹"], media, [], usedMajorBreakthrough ? "breakthrough" : undefined);
}
