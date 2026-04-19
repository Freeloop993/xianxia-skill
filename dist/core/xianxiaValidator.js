// ─── 高位面词汇（人界不应出现）───────────────────────────────────────────────
const highPlaneTerms = [
    // 灵界
    "炼虚期", "合体期", "大乘期", "法则之力", "空间法则", "时间法则",
    "风元大陆", "血天大陆", "雷鸣大陆",
    // 仙界
    "北寒仙域", "中天仙域", "轮回仙域", "天庭", "大罗金仙",
    "道祖", "仙元石", "太乙玉仙", "金仙", "道印", "仙元力", "飞升仙界",
];
// ─── 金手指宣告词（直接宣称突破/获得）────────────────────────────────────────
const cheatTerms = [
    "我已突破", "我已经突破", "我直接飞升", "我获得了神器",
    "我现在是道祖", "我凝聚了道印", "我直接到了", "我瞬间突破",
    "我直接跳过", "我天生就是天灵根", "我本来就是大能转世",
];
// ─── 魔道/煞气阈值 ────────────────────────────────────────────────────────────
const SHAQ_NORMAL_THRESHOLD = 40; // 煞气>40：心魔概率大增
const SHAQ_HIGH_THRESHOLD = 80; // 煞气>80：正道通缉
const SHAQ_CRITICAL_THRESHOLD = 100; // 煞气>100：神智错乱风险
// ─── 主校验函数 ───────────────────────────────────────────────────────────────
export function validatePlayerInput(state, input) {
    const text = (typeof input === "string" ? input : "").trim();
    if (!text)
        return [];
    const violations = [];
    // 1. 金手指检测（直接宣告突破或获得）
    if (cheatTerms.some((t) => text.includes(t))) {
        violations.push({
            code: "E_RULE_REALM_CHEAT",
            message: "成长必须通过世界内行动与规则推进，不能直接宣告突破或获得神器。天道不会认可此等虚妄之举。",
        });
    }
    // 2. 位面知识壁垒（人界不可接触高位面具体知识）
    if (state.plane === "human" && highPlaneTerms.some((t) => text.includes(t))) {
        violations.push({
            code: "E_RULE_PLANE_LEAK",
            message: "当前身处人界，相关高位面知识与地名尚未进入你的认知范畴，此等知识对你而言只是虚妄传闻。",
        });
    }
    // 3. 煞气过高警告（影响心魔/通缉/神志）
    if (state.shaQi >= SHAQ_CRITICAL_THRESHOLD) {
        violations.push({
            code: "E_RULE_BREAKTHROUGH_BLOCKED",
            message: `煞气（${state.shaQi}）已达极危临界，神智随时可能失控。建议先寻静心法门或天材中和煞气。`,
        });
    }
    return violations;
}
// ─── 辅助：生成突破阻断违规 ──────────────────────────────────────────────────
export function blockedBreakthrough(reason) {
    return [{ code: "E_RULE_BREAKTHROUGH_BLOCKED", message: reason }];
}
export function evaluateShaQi(shaQi) {
    return {
        level: shaQi >= SHAQ_CRITICAL_THRESHOLD ? "冲天"
            : shaQi >= SHAQ_HIGH_THRESHOLD ? "浓郁"
                : shaQi >= SHAQ_NORMAL_THRESHOLD ? "中等"
                    : "轻微",
        heartDevilRisk: shaQi >= SHAQ_NORMAL_THRESHOLD,
        orthodoxPursuit: shaQi >= SHAQ_HIGH_THRESHOLD,
        madnessRisk: shaQi >= SHAQ_CRITICAL_THRESHOLD,
    };
}
