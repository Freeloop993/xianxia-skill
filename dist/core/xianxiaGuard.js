// ─── 终局禁词（未达道祖大圆满禁止输出）────────────────────────────────────────
const endLikeTerms = [
    "全文完", "故事结束", "传奇将继续", "完美的蜕变",
    "感谢你陪伴", "仙途情缘", "旅途结束", "修仙之路就此",
];
// ─── 三界位面禁词（按位面隔绝知识壁垒）────────────────────────────────────────
const forbiddenByPlane = {
    human: [
        // 灵界专属
        "风元大陆", "血天大陆", "雷鸣大陆", "炼虚期", "合体期", "大乘期",
        "法则之力", "空间法则", "时间法则", "轮回法则", "法相真身", "玄天圣体",
        // 仙界专属
        "北寒仙域", "中天仙域", "轮回仙域", "烛龙仙域", "天庭", "轮回殿",
        "大罗金仙", "道祖", "仙元石", "太乙玉仙", "金仙", "真仙",
        "道印", "仙元力", "仙魂",
    ],
    spirit: [
        // 仙界专属（灵界可知晓模糊传说，但不可出现具体名称）
        "北寒仙域", "中天仙域", "轮回仙域", "天庭", "道祖",
        "大罗金仙", "太乙玉仙", "道印", "仙元力", "仙魂",
    ],
    immortal: [],
};
// ─── 核心函数 ─────────────────────────────────────────────────────────────────
function removeForbiddenTerms(text, plane) {
    let result = text;
    for (const term of forbiddenByPlane[plane]) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(escaped, "g"), "上界传闻");
    }
    return result;
}
function stripEndingTerms(text) {
    let result = text;
    for (const term of endLikeTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(new RegExp(escaped, "g"), "仙途未止");
    }
    return result;
}
/**
 * 确保回复中只有一个 ini 状态块（防止 LLM 重复输出状态面板）
 */
function ensureSingleIniBlock(text) {
    const matches = text.match(/```ini/g) ?? [];
    if (matches.length <= 1)
        return text;
    const first = text.indexOf("```ini");
    if (first < 0)
        return text;
    const end = text.indexOf("```", first + 6);
    if (end < 0)
        return text;
    const keep = text.slice(0, end + 3);
    const rest = text.slice(end + 3).replace(/```ini[\s\S]*?```/g, "");
    return `${keep}\n\n${rest}`.trim();
}
/**
 * 修仙叙事守卫：按顺序执行所有过滤
 * @param text 引擎原始文本
 * @param plane 当前位面
 * @param isDaozuPeak 是否已达道祖大圆满（唯一允许终局文本的条件）
 */
export function guardXianxiaReply(text, plane, isDaozuPeak) {
    let guarded = text;
    // 1. 终局词过滤（未达道祖大圆满）
    if (!isDaozuPeak) {
        guarded = stripEndingTerms(guarded);
    }
    // 2. 位面知识壁垒（替换高位面词汇）
    guarded = removeForbiddenTerms(guarded, plane);
    // 3. 确保只有一个 ini 状态块
    guarded = ensureSingleIniBlock(guarded);
    return guarded;
}
