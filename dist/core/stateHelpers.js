import { MEDIA } from "./xianxiaMedia.js";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
// ═══════════════════════════════════════════════════════════════════════════════
// 一、旧存档兼容补丁（normalizeShape）
// ═══════════════════════════════════════════════════════════════════════════════
export function normalizeXianxiaState(state) {
    if (!state.avatar)
        state.avatar = { preset: null };
    if (!state.pills)
        state.pills = { nourishQi: 1, heal: 1, focus: 0 };
    if (!state.lastPillQuality)
        state.lastPillQuality = "无";
    if (typeof state.pillToxicity !== "number")
        state.pillToxicity = 0;
    if (typeof state.focusBuffTurns !== "number")
        state.focusBuffTurns = 0;
    if (!state.worldEvent)
        state.worldEvent = {
            id: "evt_ancient_ruin", name: "古修遗府出世",
            stage: "萌芽期", tension: 0, finaleMediaEmitted: false,
        };
    if (!state.factionReputation)
        state.factionReputation = { 黄枫谷: 0, 掩月宗: 0, 散修盟: 0 };
    if (!state.npcRelations)
        state.npcRelations = { 墨雨: 0, 叶清霜: 0 };
    if (!state.idle)
        state.idle = { active: false, startedAt: null, endsAt: null, scene: null, reminderSentAt: null };
    if (!state.relationSummary)
        state.relationSummary = "[道侣] 无 ([0]), [灵兽] 无 ([羁绊: 无(0/100)])";
    // 新字段补默认值（旧存档兼容）
    if (typeof state.hpMax !== "number")
        state.hpMax = 100;
    if (typeof state.bodyProgress !== "number")
        state.bodyProgress = 0;
    if (typeof state.soulProgress !== "number")
        state.soulProgress = 0;
    if (typeof state.spiritStoneMid !== "number")
        state.spiritStoneMid = 0;
    if (typeof state.spiritStoneHigh !== "number")
        state.spiritStoneHigh = 0;
    if (typeof state.spiritStoneTop !== "number")
        state.spiritStoneTop = 0;
    if (typeof state.beastBond !== "number")
        state.beastBond = 0;
    if (!state.beastBondLevel)
        state.beastBondLevel = deriveBeastBondLevel(state.beastBond);
    if (typeof state.hasAncientBeast !== "boolean")
        state.hasAncientBeast = false;
    if (state.daoCompanion === undefined)
        state.daoCompanion = null;
    if (!state.destinyTags)
        state.destinyTags = [];
    if (!state.destinyDraftOptions)
        state.destinyDraftOptions = [];
    if (typeof state.destinyRerollCount !== "number")
        state.destinyRerollCount = 0;
    if (typeof state.isDemonicPath !== "boolean")
        state.isDemonicPath = false;
    if (typeof state.heartDevilTurns !== "number")
        state.heartDevilTurns = 0;
    if (!state.crafting)
        state.crafting = { alchemy: 0, talisman: 0, formation: 0, refining: 0 };
    if (!state.inventory)
        state.inventory = { "粗制匕首": 1 };
    if (!state.lawProgressMap)
        state.lawProgressMap = {};
    if (!state.worldEvents || !Array.isArray(state.worldEvents)) {
        // 从旧的单 worldEvent 迁移
        state.worldEvents = [{ ...state.worldEvent, eventType: "秘境出世" }];
    }
    return state;
}
// ═══════════════════════════════════════════════════════════════════════════════
// 二、灵兽系统
// ═══════════════════════════════════════════════════════════════════════════════
const BEAST_BOND_THRESHOLDS = [
    [91, "通灵"],
    [61, "信赖"],
    [31, "亲密"],
    [11, "驯服"],
    [0, "陌路"],
];
export function deriveBeastBondLevel(bond) {
    for (const [threshold, level] of BEAST_BOND_THRESHOLDS) {
        if (bond >= threshold)
            return level;
    }
    return "陌路";
}
/** 灵兽战斗加成：羁绊等级影响实际战斗力发挥 */
export function beastCombatBonus(state) {
    if (state.beastName === "无")
        return 0;
    const bonusMap = {
        "陌路": 0,
        "驯服": 5,
        "亲密": 15,
        "信赖": 30,
        "通灵": 50,
    };
    return bonusMap[state.beastBondLevel];
}
/** 太古遗种孵化媒体触发 */
const ANCIENT_BEAST_MEDIA = {
    "麒麟": MEDIA.QILIN,
    // 以下为实际媒体链接
};
// CDN URL，以 Markdown ![alt](url) 格式嵌入正文
export const ANCIENT_BEAST_REAL_MEDIA = {
    "麒麟": MEDIA.QILIN,
    "鲲鹏": MEDIA.KUNPENG,
    "白泽": MEDIA.BAIZE,
    "九尾狐": MEDIA.JIUWEI,
};
/** 处理灵兽设置（包含太古遗种天命唯一校验） */
export function applyBeastSet(state, name, stage, level, violations, triggers, media) {
    const isAncient = Object.keys(ANCIENT_BEAST_REAL_MEDIA).some((k) => name.includes(k));
    if (isAncient) {
        if (state.hasAncientBeast) {
            violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                message: "天命唯一：你已与一只太古遗种缔结契约，此生无法再与其他太古遗种相遇。" });
            return;
        }
        state.hasAncientBeast = true;
        // 触发专属媒体
        for (const [key, mediaStr] of Object.entries(ANCIENT_BEAST_REAL_MEDIA)) {
            if (name.includes(key)) {
                media.push(mediaStr);
                triggers.push({ type: "breakthrough_success",
                    detail: `${key}降世，太古血脉与你的命运交织。`, media: mediaStr });
                break;
            }
        }
    }
    state.beastName = name;
    state.beastStage = stage;
    state.beastLevel = level;
    state.beastBond = 10; // 初始驯服
    state.beastBondLevel = deriveBeastBondLevel(10);
}
/** 更新灵兽羁绊值，同步羁绊等级 */
export function applyBeastBondDelta(state, delta, triggers) {
    if (state.beastName === "无")
        return;
    const prevLevel = state.beastBondLevel;
    state.beastBond = clamp(state.beastBond + delta, 0, 100);
    state.beastBondLevel = deriveBeastBondLevel(state.beastBond);
    if (state.beastBondLevel !== prevLevel) {
        triggers.push({ type: "breakthrough_success",
            detail: `与${state.beastName}的羁绊提升至【${state.beastBondLevel}】（${state.beastBond}/100）` });
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// 三、炼体系统
// ═══════════════════════════════════════════════════════════════════════════════
/** 炼体境界：名称 → HP上限增量 */
const BODY_REALM_HP_BONUS = {
    "凡胎之躯": 0,
    "后天锻体": 20,
    "先天之体": 40,
    "金刚之躯": 80,
    "涅槃之体": 150,
    "法相真身": 250,
    "玄天圣体": 400,
    "法则仙躯": 600,
    "道印金身": 900,
    "太乙不灭体": 1500,
    "大罗道体": 3000,
};
/** 炼体境界进度满100时可突破的目标 */
const BODY_REALM_NEXT = {
    "凡胎之躯": "后天锻体",
    "后天锻体": "先天之体",
    "先天之体": "金刚之躯",
    "金刚之躯": "涅槃之体",
    "涅槃之体": "法相真身",
    "法相真身": "玄天圣体",
};
/** 炼体境界突破地点要求 */
const BODY_REALM_LOCATION_REQ = {
    "金刚之躯": "乱星",
    "涅槃之体": "大晋",
    "玄天圣体": "血天|雷鸣",
};
export function applyBodyProgress(state, delta, location, violations) {
    // 地点校验
    const nextRealm = BODY_REALM_NEXT[state.bodyRealm];
    if (nextRealm && BODY_REALM_LOCATION_REQ[nextRealm]) {
        const req = BODY_REALM_LOCATION_REQ[nextRealm];
        if (location && !req.split("|").some((r) => location.includes(r))) {
            violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
                message: `突破${nextRealm}需在${req}相关地域进行，当前地点不满足条件。` });
            return;
        }
    }
    state.bodyProgress = clamp(state.bodyProgress + delta, 0, 100);
}
export function applyBodyBreakthrough(state, targetRealm, violations, triggers) {
    if (state.bodyProgress < 100) {
        violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
            message: `炼体进度尚未圆满（${state.bodyProgress}/100），无法突破至${targetRealm}。` });
        return;
    }
    const hpBonus = (BODY_REALM_HP_BONUS[targetRealm] ?? 0) - (BODY_REALM_HP_BONUS[state.bodyRealm] ?? 0);
    state.bodyRealm = targetRealm;
    state.bodyProgress = 0;
    state.hpMax = Math.max(100, state.hpMax + hpBonus);
    state.hp = Math.min(state.hp, state.hpMax); // HP不超过新上限
    triggers.push({ type: "breakthrough_success",
        detail: `炼体突破至【${targetRealm}】，气血上限提升至 ${state.hpMax}。` });
}
// ═══════════════════════════════════════════════════════════════════════════════
// 四、神识系统
// ═══════════════════════════════════════════════════════════════════════════════
const SOUL_REALM_ORDER = [
    "凡境", "灵境", "意境", "魂境", "领域境", "仙魂境",
];
/** 神识对炼丹成功率的加成（百分比） */
export function soulAlchemyBonus(state) {
    const idx = SOUL_REALM_ORDER.indexOf(state.soulRealm);
    if (idx < 0)
        return 0;
    // 凡境0% 灵境+10% 意境+20% 魂境+35% 领域境+50% 仙魂境+70%
    return [0, 10, 20, 35, 50, 70][idx] ?? 0;
}
/** 神识对同时操控法宝数量上限的加成 */
export function soulArtifactBonus(state) {
    const idx = SOUL_REALM_ORDER.indexOf(state.soulRealm);
    // 凡境1 灵境2 意境3 魂境4 领域境6 仙魂境10
    return [1, 2, 3, 4, 6, 10][idx] ?? 1;
}
export function applySoulBreakthrough(state, targetRealm, violations, triggers) {
    if (state.soulProgress < 100) {
        violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
            message: `神识进度尚未圆满（${state.soulProgress}/100），无法突破至${targetRealm}。` });
        return;
    }
    const curIdx = SOUL_REALM_ORDER.indexOf(state.soulRealm);
    const tgtIdx = SOUL_REALM_ORDER.indexOf(targetRealm);
    if (tgtIdx !== curIdx + 1) {
        violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
            message: `神识境界必须逐级突破，不可跨越。` });
        return;
    }
    state.soulRealm = targetRealm;
    state.soulProgress = 0;
    triggers.push({ type: "breakthrough_success",
        detail: `神识突破至【${targetRealm}】，操控法宝上限 ${soulArtifactBonus(state)}，炼丹加成 +${soulAlchemyBonus(state)}%。` });
}
// ═══════════════════════════════════════════════════════════════════════════════
// 五、魔道系统
// ═══════════════════════════════════════════════════════════════════════════════
const SHA_QI_ORTHODOX_THRESHOLD = 80; // 触发正道通缉
const SHA_QI_MADNESS_THRESHOLD = 100; // 触发心魔/神智失控
/** 煞气变化后的自动副作用处理 */
export function applyShaQiSideEffects(state, triggers) {
    // 超过通缉阈值时，对各正道势力声望惩罚
    if (state.shaQi >= SHA_QI_ORTHODOX_THRESHOLD && !state.isDemonicPath) {
        state.isDemonicPath = true;
        for (const faction of Object.keys(state.factionReputation)) {
            if (["黄枫谷", "掩月宗", "正道盟", "天道盟"].includes(faction)) {
                state.factionReputation[faction] = Math.min(state.factionReputation[faction] ?? 0, -200);
            }
        }
        triggers.push({ type: "sha_qi_madness",
            detail: "煞气冲天，正道势力已将你列为魔头，进入其地盘将遭到追杀。" });
    }
    // 超过神智失控阈值：触发心魔
    if (state.shaQi >= SHA_QI_MADNESS_THRESHOLD) {
        state.heartDevilTurns = Math.max(state.heartDevilTurns, 3);
        triggers.push({ type: "sha_qi_madness",
            detail: `煞气${state.shaQi}已达极危，心魔将在接下来 ${state.heartDevilTurns} 回合内伺机发作，突破时必须进行心魔检定。` });
    }
}
/** 突破时的心魔检定（心智越高越容易通过） */
export function checkHeartDevilOnBreakthrough(state, violations, triggers) {
    if (state.heartDevilTurns <= 0 && state.shaQi < 40)
        return true; // 无心魔风险
    const willpower = state.attributes?.willpower ?? 20;
    // 基础通过率：心智/100，煞气越高越难
    const passRate = Math.max(0.1, (willpower / 100) - (state.shaQi / 500));
    const passed = Math.random() < passRate;
    if (!passed) {
        state.heartDevilTurns += 2;
        violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
            message: `心魔骤起，突破失败！心魔将持续影响 ${state.heartDevilTurns} 回合（心智${willpower}，煞气${state.shaQi}）。` });
        triggers.push({ type: "sha_qi_madness",
            detail: "心魔劫难，突破失败，道心受损。" });
    }
    else {
        if (state.heartDevilTurns > 0)
            state.heartDevilTurns--;
        triggers.push({ type: "breakthrough_success",
            detail: "心魔劫难化为考验，道心愈发坚定。" });
    }
    return passed;
}
export function deriveRelationLevel(value) {
    if (value <= -51)
        return "死敌";
    if (value <= -11)
        return "敌对";
    if (value <= 10)
        return "中立";
    if (value <= 50)
        return "友善";
    if (value <= 90)
        return "信赖";
    return "知己";
}
/** 道侣双修加成：修炼效率 + 法则感悟 */
export function daoCompanionCultivationBonus(state) {
    if (!state.daoCompanion)
        return 0;
    const companionRel = state.npcRelations[state.daoCompanion] ?? 0;
    if (companionRel < 91)
        return 0; // 必须是知己等级
    // 双修加成：修炼收益×1.3，法则感悟速度×1.2
    return 30; // 返回百分比加成
}
/** 构建关系摘要字符串 */
export function buildRelationSummary(state) {
    const npcTop = Object.entries(state.npcRelations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, val]) => `[${name}] (${deriveRelationLevel(val)} ${val})`)
        .join("，");
    const companion = state.daoCompanion
        ? `[${state.daoCompanion}] (${state.npcRelations[state.daoCompanion] ?? 100})`
        : "无 ([0])";
    const beast = state.beastName !== "无"
        ? `${state.beastName} ([羁绊: ${state.beastBondLevel}(${state.beastBond}/100)])`
        : "无 ([羁绊: 无(0/100)])";
    return `[道侣] ${companion}, [灵兽] ${beast}, [NPC] ${npcTop || "无"}`;
}
export function calcDestinyBonuses(tags) {
    const bonuses = {
        cultivationMul: 1.0,
        stoneMul: 1.0,
        alchemyBonus: 0,
        heartDevilResist: 0,
        adventureBonus: 0,
    };
    for (const tag of tags) {
        switch (tag) {
            case "天灵根":
                bonuses.cultivationMul += 0.5;
                break; // 真元×1.5
            case "先天道体":
                bonuses.cultivationMul += 0.3;
                break; // 真元×1.3
            case "大能转世":
                bonuses.cultivationMul += 0.1;
                bonuses.heartDevilResist += 20;
                break;
            case "药灵之体":
                bonuses.alchemyBonus += 30;
                break;
            case "丹道亲和":
                bonuses.alchemyBonus += 15;
                break;
            case "体魄初成":
                bonuses.startBodyRealm = "后天锻体";
                break;
            case "神识天赋":
                bonuses.startSoulRealm = "灵境";
                break;
            case "大衍残篇":
                bonuses.startSoulRealm = "凡境";
                break; // 有神识功法
            case "家境殷实":
                bonuses.stoneMul += 0.3;
                break;
            case "手有余香":
                bonuses.adventureBonus += 0.03;
                break;
            case "坚韧不拔":
                bonuses.heartDevilResist += 15;
                break;
            case "煞气淬体":
                bonuses.startBodyRealm = "先天之体";
                break;
            case "妖神血脉":
                bonuses.cultivationMul += 0.1;
                bonuses.startBodyRealm = "先天之体";
                break;
            case "麒麟之缘":
                bonuses.adventureBonus += 0.05;
                break;
        }
    }
    return bonuses;
}
/** 应用命数词条到新建角色（开局时调用一次） */
export function applyDestinyToState(state) {
    const bonuses = calcDestinyBonuses(state.destinyTags);
    if (bonuses.startBodyRealm)
        state.bodyRealm = bonuses.startBodyRealm;
    if (bonuses.startSoulRealm)
        state.soulRealm = bonuses.startSoulRealm;
}
// ═══════════════════════════════════════════════════════════════════════════════
// 八、灵石分层兑换
// ═══════════════════════════════════════════════════════════════════════════════
/** 将所有灵石换算为"下品灵石等价值"（用于显示总资产） */
export function totalSpiritStoneValue(state) {
    return (state.spiritStone +
        state.spiritStoneMid * 100 +
        state.spiritStoneHigh * 10000 +
        state.spiritStoneTop * 1000000);
}
/** 尝试支付指定等价下品灵石数量（从低阶到高阶自动扣除） */
export function spendSpiritStone(state, amountLow, violations) {
    const total = totalSpiritStoneValue(state);
    if (total < amountLow) {
        violations.push({ code: "E_RULE_BREAKTHROUGH_BLOCKED",
            message: `灵石不足，需要 ${amountLow} 下品灵石等价，当前总计 ${total}。` });
        return false;
    }
    let remaining = amountLow;
    // 优先扣下品
    const fromLow = Math.min(state.spiritStone, remaining);
    state.spiritStone -= fromLow;
    remaining -= fromLow;
    if (remaining <= 0)
        return true;
    // 再扣中品（1中=100下）
    const fromMid = Math.min(state.spiritStoneMid, Math.ceil(remaining / 100));
    state.spiritStoneMid -= fromMid;
    remaining -= fromMid * 100;
    if (remaining <= 0) {
        state.spiritStone += Math.abs(remaining);
        return true;
    }
    // 再扣上品
    const fromHigh = Math.min(state.spiritStoneHigh, Math.ceil(remaining / 10000));
    state.spiritStoneHigh -= fromHigh;
    remaining -= fromHigh * 10000;
    if (remaining <= 0) {
        state.spiritStone += Math.abs(remaining);
        return true;
    }
    // 再扣极品
    const fromTop = Math.min(state.spiritStoneTop, Math.ceil(remaining / 1000000));
    state.spiritStoneTop -= fromTop;
    remaining -= fromTop * 1000000;
    state.spiritStone += Math.abs(remaining);
    return true;
}
