/**
 * xianxia-lite plugin 入口
 * 3个工具：xiuxian_turn / xiuxian_state / xiuxian_apply_events
 *
 * ═══════════════════════════════════════════════════════
 * 媒体输出协议（Markdown 内嵌模式）
 * ═══════════════════════════════════════════════════════
 * 图片/视频已直接以 markdown ![alt](url) 格式嵌入在 reply 正文中。
 * 企微 bot markdown v2 可直接渲染图片。
 *
 * 工具返回字段：
 *   reply: string           叙事正文（已包含 markdown 图片）
 *   status_block: string    状态栏（已硬渲染 fenced code block）
 *
 * LLM 输出顺序：
 *   1. 直接原样输出 reply_text 字段的全部内容
 *   2. ❌ 禁止输出 openclaw_actions 候选块或任何结构化动作协议块
 */
import { resolveXianxiaTurn, getInventoryItemsFromState } from "./core/xianxiaEngine.js";
import { applyEvents } from "./core/eventEngine.js";
import { loadState, saveState } from "./state.js";
import { writeMemory, readMemory, formatMemory } from "./memory.js";
// ─── 回复文本组装 ─────────────────────────────────────────────────────────────
function hasActionChoices(text) {
    const s = (text ?? "").trim();
    return />\s*A\.|(?:^|\n)A\.|(?:^|\n)A[：:、．.]/m.test(s)
        && />\s*B\.|(?:^|\n)B\.|(?:^|\n)B[：:、．.]/m.test(s)
        && />\s*C\.|(?:^|\n)C\.|(?:^|\n)C[：:、．.]/m.test(s)
        && />\s*D\.|(?:^|\n)D\.|(?:^|\n)D[：:、．.]/m.test(s);
}
function extractGoalTag(goal) {
    const m = String(goal ?? "").match(/^\[([^\]]+)\]/);
    return m ? m[1].trim() : null;
}
function extractChoices(text) {
    const s = String(text ?? "");
    const lines = s.split(/\r?\n/);
    const picks = [];
    for (const line of lines) {
        const m = line.match(/^\s*>?\s*([ABCD])[\.．、:：]\s*(.+)$/);
        if (m)
            picks.push(`${m[1]}. ${m[2].trim()}`);
    }
    return picks.length === 4 ? picks : null;
}
function buildFallbackChoices(state, reply) {
    const goal = `${state?.goal ?? ""}`;
    const goalTag = extractGoalTag(goal);
    const context = `${goal} ${(reply ?? "").slice(0, 300)}`;
    if (goalTag === "认主一线") {
        return [
            "> A. 稳住心神，借这一线联系强行完成卵心认主",
            "> B. 暂断认主，挥匕首先斩向扑来的阴影兽爪",
            "> C. 吞下丹药强撑气血，再边退边护住卵心",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (goalTag === "守卵阴影") {
        return [
            "> A. 护住卵心，强行后撤，先避开黑雾第一扑",
            "> B. 正面迎上阴影兽爪，先挡下这一击",
            "> C. 借供台与庙柱周旋，寻找黑雾本体破绽",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (goalTag === "异卵苏醒" || /\[异卵苏醒\]|异卵苏醒|卵心.*苏醒|守着它的东西|庙中异动/.test(goal) || /守着它的东西|庙中异动|卵心微光在你手下越发明亮/.test(context)) {
        return [
            "> A. 立刻取出卵心微光，先把这线机缘握在手里",
            "> B. 暂不触碰卵心，先检查砖缝抓痕与阴影异动的来源",
            "> C. 一手扣住匕首一手护住裂缝，试探庙中是否有东西现身",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (goalTag === "卵心微光" || /\[卵心微光\]|卵心微光|接触裂缝中的卵状微光/.test(goal)) {
        return [
            "> A. 直接触碰卵状微光，尝试建立感应",
            "> B. 先用匕首或碎石试探裂缝反应，再决定是否伸手",
            "> C. 暂退半步，观察那细鸣是否再次出现并判断危险",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (goalTag === "裂隙异鸣" || /\[裂隙异鸣\]|裂隙异鸣|裂缝深处的活物气息/.test(goal)) {
        return [
            "> A. 俯身查看裂缝深处的幽青微光",
            "> B. 先检查周围抓痕，判断是否有守护兽潜伏",
            "> C. 取出丹药与匕首做好防备，再接近裂缝",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (goalTag === "荒庙深入" || /\[荒庙深入\]|荒庙深入|进入荒庙，追索异卵碎片共鸣的源头/.test(goal)) {
        return [
            "> A. 进入荒庙，查看供台后方那片异常地面",
            "> B. 先沿地上的拖痕与碎片痕迹继续检查来源",
            "> C. 退到庙外四周巡视，确认附近是否还有活物或埋伏",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (goalTag === "荒庙探查" || /\[荒庙探查\]|荒庙探查|异卵碎片|荒庙内部异常/.test(goal)) {
        return [
            "> A. 蹲下细查地上的异卵碎片与纹路",
            "> B. 推门进入荒庙，先看里面是否还留有痕迹",
            "> C. 绕到庙后观察，确认异常是否另有入口",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (/山村|村口|老人|旧庙|异闻|山路/.test(context)) {
        return [
            "> A. 去村口继续打听旧庙与异兽传闻",
            "> B. 回屋吐纳修炼，先稳住第一缕真元",
            "> C. 顺着山路继续前探，主动寻找异常痕迹",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    if (/旧园|废井|宅院|残碑/.test(context)) {
        return [
            "> A. 前往旧园深处，细查残碑与草木异常",
            "> B. 去废井附近探查，确认是否有灵异波动",
            "> C. 暂回屋内整顿思绪与物资，再决定下一步",
            "> D. 自由行动（请直接描述你想做的事）",
        ].join("\n");
    }
    return [
        "> A. 继续顺着当前线索深入调查",
        "> B. 暂且收束心神，就地修炼稳固修为",
        "> C. 先观察周围环境，再决定是否前进",
        "> D. 自由行动（请直接描述你想做的事）",
    ].join("\n");
}
function ensureDynamicChoices(reply, state) {
    const trimmedReply = (reply ?? "").trim();
    if (!trimmedReply)
        return { text: trimmedReply, staleChoicesFixed: false, goalTag: extractGoalTag(state?.goal), choices: null };
    // Only inject ABCD choices during in_world phase; skip during onboarding steps
    const step = state?.step ?? "ask_name";
    if (step !== "in_world")
        return { text: trimmedReply, staleChoicesFixed: false, goalTag: extractGoalTag(state?.goal), choices: null };
    const goalTag = extractGoalTag(state?.goal);
    let finalText = trimmedReply;
    let choices = extractChoices(trimmedReply);
    let staleChoicesFixed = false;
    if (!choices) {
        finalText = `${trimmedReply}\n\n${buildFallbackChoices(state, trimmedReply)}`;
        choices = extractChoices(finalText);
        staleChoicesFixed = true;
    }
    const lastGoalTag = state?.lastGoalTag ?? null;
    const lastChoices = Array.isArray(state?.lastChoices) ? state.lastChoices : null;
    if (goalTag && lastGoalTag && goalTag !== lastGoalTag && choices && lastChoices && JSON.stringify(choices) === JSON.stringify(lastChoices)) {
        finalText = `${trimmedReply}\n\n${buildFallbackChoices(state, trimmedReply)}`;
        choices = extractChoices(finalText);
        staleChoicesFixed = true;
    }
    return { text: finalText, staleChoicesFixed, goalTag, choices };
}
function buildReplyText(reply, statusBlock, state) {
    const parts = [];
    const prepared = ensureDynamicChoices(reply, state);
    const trimmedReply = prepared.text;
    if (trimmedReply)
        parts.push(trimmedReply);
    // Avoid duplicate status block: skip appending if reply already contains one
    const replyHasStatus = /```(?:ini|text)/.test(trimmedReply);
    const trimmedStatus = (statusBlock ?? "").trim();
    if (trimmedStatus && !replyHasStatus)
        parts.push(trimmedStatus);
    return {
        replyText: parts.join("\n\n"),
        staleChoicesFixed: prepared.staleChoicesFixed,
        goalTag: prepared.goalTag,
        choices: prepared.choices,
    };
}
// ─── 状态栏硬渲染 ─────────────────────────────────────────────────────────────
function renderShortStatus(state) {
    const cur = state.cultivationCurrent ?? 0;
    const max = state.cultivationMax ?? 0;
    return [
        "```text",
        `【${state.name ?? "无名修士"}】`,
        `境界：${state.realm ?? "炼气前期"}`,
        `修为：${cur}/${max}`,
        `HP：${state.hp ?? 100}/100  MP：${state.mp ?? 100}/100`,
        `灵石：${state.spiritStone ?? 0}`,
        `目标：${state.goal ?? "自由探索"}`,
        "```",
    ].join("\n");
}
function renderDetailStatus(state) {
    const cur = state.cultivationCurrent ?? 0;
    const max = state.cultivationMax ?? 0;
    const inventory = getInventoryItemsFromState(state);
    const inventoryStr = inventory.length > 0 ? inventory.slice(0, 8).join("、") : "无";
    const destinyStr = (state.destinyTags ?? []).join("、") || "未定";
    const shaQi = state.shaQi ?? 0;
    return [
        "```text",
        `【${state.name ?? "无名修士"}】`,
        `境界：${state.realm ?? "炼气前期"}`,
        `肉身：${state.bodyRealm ?? "凡胎之躯"}`,
        `神识：${state.soulRealm ?? "凡境"}`,
        `修为：${cur}/${max}`,
        `HP：${state.hp ?? 100}/100  MP：${state.mp ?? 100}/100`,
        `灵石：${state.spiritStone ?? 0}`,
        `煞气：${shaQi}`,
        `目标：${state.goal ?? "自由探索"}`,
        `灵兽：${state.beastName || "无"}`,
        `命数：${destinyStr}`,
        `背包：${inventoryStr}`,
        "```",
    ].join("\n");
}
// ─── 关键节点判断 ─────────────────────────────────────────────────────────────
function isKeyEvent(triggers, violations, state) {
    return (triggers.length > 0 ||
        violations.length > 0 ||
        state.hp <= 30 ||
        (state.shaQi ?? 0) >= 80);
}
// ─── 统一 instruction ────────────────────────────────────────────────────────
const INSTRUCTION_NORMAL = [
    "【严格按以下顺序输出，不得追加任何 openclaw_actions / JSON / XML 协议块】",
    "直接原样输出 reply_text 字段的全部内容，不要修改、不要省略、不要添加任何额外内容。",
    "入世阶段叙事正文后，必须给出 4 个行动选项。A/B/C 必须贴合当前场景、当前目标与当前线索，D 固定为'自由行动（请直接描述你想做的事）'。",
    "若当前目标或局势已发生变化，行动选项也必须同步变化；禁止连续复用上一轮完全相同的一组选项。",
    "若正文中已包含动态行动选项，则保持原样；若缺失，系统会自动补入贴合当前目标的动态兜底选项。",
    "❌ 禁止输出 openclaw_actions 代码块、XML 标签、JSON 数组、动作卡片等任何结构化协议块",
].join("\n");
const INSTRUCTION_STATE = [
    "直接输出 status_block（纯文本 fenced code block）。不要输出叙事正文。",
    "❌ 禁止输出 openclaw_actions 或任何结构化动作协议块。",
].join("\n");
// ─── 续档检测 ─────────────────────────────────────────────────────────────────
const RESUME_TRIGGERS = /^(继续修仙|继续|恢复存档|resume|\/resume|回到修仙|接着修仙)$/i;
const START_TRIGGERS = /^(开始修仙|\/xianxia|进入修仙|开始)$/i;
const RESTART_TRIGGERS = /^(重新修仙|删档重开|新开一局|重新开局|重开)$/i;
const CONFIRM_RESTART_TRIGGERS = /^(B|b|重新开局|确认重开|重开确认)$/;
function hasValidSave(state) {
    return state.step === "in_world" ||
        (state.step !== "ask_name" && state.name !== "无名修士") ||
        (state.step === "ask_name" && state.name !== "无名修士");
}
function doHardReset(key) {
    const fresh = loadState("__fresh__nonexistent__");
    fresh.playerKey = key;
    fresh.step = "ask_name";
    fresh.name = "无名修士";
    saveState(key, fresh);
    return fresh;
}
// ─── 工具 1：xiuxian_turn ────────────────────────────────────────────────────
export async function xiuxian_turn(params) {
    const key = params?.playerKey ?? "default";
    const state = loadState(key);
    const rawInput = typeof params?.input === "string" ? params.input : "";
    const trimmedInput = String(rawInput ?? "").trim();
    console.log(`[xiuxian_turn] key=${key} step=${state.step} input=${trimmedInput.slice(0, 30)}`);
    if (!trimmedInput) {
        return {
            step: state.step,
            reply: "",
            status_block: renderDetailStatus(state),
            instruction: INSTRUCTION_STATE,
        };
    }
    if (trimmedInput === "/state") {
        const recentMemory = readMemory(key, 5);
        return {
            is_state_command: true,
            memory_summary: formatMemory(recentMemory),
            reply: "",
            status_block: renderDetailStatus(state),
            instruction: INSTRUCTION_STATE,
        };
    }
    if (RESTART_TRIGGERS.test(trimmedInput)) {
        if (hasValidSave(state)) {
            state.awaitingRestartConfirm = true;
            saveState(key, state);
            return {
                step: state.step,
                has_save: true,
                awaiting_restart_confirm: true,
                save_name: state.name,
                save_realm: state.realm,
                reply: "",
                status_block: renderShortStatus(state),
                instruction: [
                    `【重开确认】playerKey=${key} 已有存档「${state.name}」（${state.realm}），重开将永久清除旧档。`,
                    "以天道口吻严肃告知修行者此操作不可逆，询问是否确认（A. 取消，继续旧档 / B. 确认重开，舍弃旧档）。",
                    "❌ 禁止输出 openclaw_actions 代码块、JSON 数组、XML 标签等任何结构化动作协议块。",
                ].join("\n"),
            };
        }
        const fresh = doHardReset(key);
        const result = resolveXianxiaTurn(fresh, "开始修仙");
        const statusBlock = renderDetailStatus(result.state);
        const reply = result.replyText ?? "";
        const built = buildReplyText(reply, statusBlock, result.state);
        result.state.lastGoalTag = built.goalTag;
        result.state.lastChoices = built.choices;
        result.state.lastReplyText = built.replyText;
        saveState(key, result.state);
        return {
            step: result.state.step,
            next_suggestions: result.nextSuggestions,
            violations: result.violations,
            reply,
            reply_text: built.replyText,
            status_block: statusBlock,
            instruction: INSTRUCTION_NORMAL,
        };
    }
    if (CONFIRM_RESTART_TRIGGERS.test(trimmedInput) && hasValidSave(state) && state.awaitingRestartConfirm === true) {
        const fresh = doHardReset(key);
        const result = resolveXianxiaTurn(fresh, "开始修仙");
        const statusBlock = renderDetailStatus(result.state);
        const reply = result.replyText ?? "";
        const built = buildReplyText(reply, statusBlock, result.state);
        result.state.lastGoalTag = built.goalTag;
        result.state.lastChoices = built.choices;
        result.state.lastReplyText = built.replyText;
        saveState(key, result.state);
        return {
            step: result.state.step,
            next_suggestions: result.nextSuggestions,
            violations: result.violations,
            reply,
            reply_text: built.replyText,
            status_block: statusBlock,
            instruction: INSTRUCTION_NORMAL,
        };
    }
    if (RESUME_TRIGGERS.test(trimmedInput)) {
        if (!hasValidSave(state)) {
            return {
                step: "ask_name",
                no_save: true,
                reply: "",
                status_block: "",
                instruction: [
                    "【无存档】当前 playerKey 无任何修仙存档。",
                    "以天道口吻告知修行者尚无存档，询问是否开始新局（A. 开始新局 / B. 暂不开始）。",
                    "❌ 禁止输出 openclaw_actions 代码块、JSON 数组、XML 标签等任何结构化动作协议块。",
                ].join("\n"),
            };
        }
        const recentMemory = readMemory(key, 8);
        return {
            step: state.step,
            is_resume: true,
            memory_summary: formatMemory(recentMemory),
            reply: "",
            status_block: state.step === "in_world" ? renderShortStatus(state) : renderDetailStatus(state),
            state_data: {
                step: state.step,
                name: state.name,
                realm: state.realm,
                cultivation: { current: state.cultivationCurrent, max: state.cultivationMax },
                hp: state.hp,
                mp: state.mp,
                spirit_stone: state.spiritStone,
                goal: state.goal,
            },
            instruction: [
                "【续档恢复】检测到已有存档，直接续接上次剧情。",
                "1. 输出 status_block（纯文本 fenced code block）",
                "2. 以天道口吻简短描述修行者当前处境（2-3句），无缝衔接上次进度",
                "❌ 禁止输出 openclaw_actions 代码块、JSON 数组、XML 标签等任何结构化动作协议块。",
            ].join("\n"),
        };
    }
    if (START_TRIGGERS.test(trimmedInput) && hasValidSave(state)) {
        return {
            step: state.step,
            has_save: true,
            save_name: state.name,
            save_realm: state.realm,
            reply: "",
            status_block: renderShortStatus(state),
            instruction: [
                `【存档检测】playerKey=${key} 已有存档「${state.name}」（${state.realm}），禁止直接重开。`,
                "以天道口吻告知修行者检测到旧档，询问是否续接或重开（A. 继续旧档 / B. 重新开局）。",
                "❌ 禁止输出 openclaw_actions 代码块、JSON 数组、XML 标签等任何结构化动作协议块。",
            ].join("\n"),
        };
    }
    // Clear restart confirm flag on any normal input
    if (state.awaitingRestartConfirm) {
        state.awaitingRestartConfirm = false;
        saveState(key, state);
    }
    // In-world: route narrative/choice inputs to LLM instead of engine fallback.
    // Engine only handles: 闭关/修炼, 坊市/交易/买, pill commands, breakthrough, idle.
    // Everything else (A/B/C/D choices, free-text story actions) should go to LLM.
    if (state.step === "in_world") {
        const ENGINE_KEYWORDS = /闭关|修炼|坊市|交易|买|服用|炼制|尝试筑基|尝试结丹|尝试元婴|尝试化神|尝试飞升|挂机|领取挂机|结束挂机/;
        const isEngineCommand = ENGINE_KEYWORDS.test(trimmedInput);
        if (!isEngineCommand) {
            // Expand bare A/B/C/D to full choice text
            let actionText = trimmedInput;
            if (/^[A-Da-d]\.?$/.test(trimmedInput)) {
                const idx = trimmedInput.toUpperCase().charCodeAt(0) - 65;
                const choices = Array.isArray(state.lastChoices) ? state.lastChoices : null;
                if (choices && choices[idx]) {
                    actionText = choices[idx].replace(/^[A-D]\.\s*/, "");
                }
            }
            const recentMemory = readMemory(key, 5);
            const statusBlock = renderShortStatus(state);
            return {
                step: state.step,
                is_choice_action: true,
                expanded_choice: actionText,
                original_input: trimmedInput,
                memory_summary: formatMemory(recentMemory),
                reply: "",
                status_block: statusBlock,
                state_data: {
                    step: state.step,
                    name: state.name,
                    plane: state.plane,
                    realm: state.realm,
                    cultivation: { current: state.cultivationCurrent, max: state.cultivationMax },
                    hp: state.hp,
                    mp: state.mp,
                    spirit_stone: state.spiritStone,
                    sha_qi: state.shaQi,
                    goal: state.goal,
                    beast: { name: state.beastName, bond: state.beastBondLevel },
                    destiny_tags: state.destinyTags,
                    last_reply_text: state.lastReplyText,
                },
                instruction: [
                    `【剧情选项执行】修行者选择了：「${actionText}」`,
                    "请根据上一轮剧情上下文（last_reply_text）和修行者的选择，撰写本轮叙事推进（200-400字）。",
                    "叙事必须紧扣修行者所选的行动，不得偏离到无关场景。",
                    "正文结尾必须给出 A/B/C/D 四个行动选项（A/B/C 贴合当前场景，D 固定为'自由行动（请直接描述你想做的事）'）。",
                    `撰写完叙事正文后，请调用 xiuxian_apply_events 工具结算，参数如下：`,
                    `  - events: 本轮发生的事件数组（至少包含一个 {{"type":"story_progress"}}）`,
                    `  - narrativeText: 你刚才撰写的完整叙事正文（含A/B/C/D选项），这是【必填参数】`,
                    `  - rawInput: "${trimmedInput}"`,
                    `  - playerKey: "${key}"`,
                    "⚠️ narrativeText 必须传入你写的完整正文，否则用户将只看到状态栏而看不到任何剧情！",
                    "❌ 禁止直接输出叙事正文给用户，必须通过 xiuxian_apply_events 的 narrativeText 参数传递。",
                    "❌ 禁止输出 openclaw_actions 代码块、JSON 数组、XML 标签等任何结构化动作协议块。",
                ].join("\n"),
            };
        }
    }
    const result = resolveXianxiaTurn(state, rawInput);
    const tag = result.structured.action_tag ?? "unknown";
    writeMemory(key, `[${tag}] ${rawInput.slice(0, 40)} → ${result.state.realm}`, tag, result.state.realm);
    const statusBlock = result.state.step !== "in_world"
        ? renderDetailStatus(result.state)
        : renderShortStatus(result.state);
    const reply = result.replyText ?? "";
    const built = buildReplyText(reply, statusBlock, result.state);
    result.state.lastGoalTag = built.goalTag;
    result.state.lastChoices = built.choices;
    result.state.lastReplyText = built.replyText;
    saveState(key, result.state);
    return {
        step: result.state.step,
        next_suggestions: result.nextSuggestions,
        violations: result.violations,
        destiny_draft_options: result.state.step === "ask_destiny"
            ? result.state.destinyDraftOptions ?? []
            : undefined,
        destiny_reroll_count: result.state.step === "ask_destiny"
            ? result.state.destinyRerollCount ?? 0
            : undefined,
        reply,
        reply_text: built.replyText,
        status_block: statusBlock,
        instruction: INSTRUCTION_NORMAL,
    };
}
// ─── 工具 2：xiuxian_state ──────────────────────────────────────────────────
export async function xiuxian_state(params) {
    const key = params.playerKey ?? "default";
    const state = loadState(key);
    const recentMemory = readMemory(key, 5);
    return {
        exists: state.step !== "ask_name" || state.name !== "无名修士",
        memory_summary: formatMemory(recentMemory),
        reply: "",
        status_block: renderDetailStatus(state),
        state_data: {
            step: state.step,
            name: state.name,
            plane: state.plane,
            realm: state.realm,
            body_realm: state.bodyRealm,
            soul_realm: state.soulRealm,
            cultivation: { current: state.cultivationCurrent, max: state.cultivationMax },
            hp: state.hp,
            mp: state.mp,
            spirit_stone: state.spiritStone,
            sha_qi: state.shaQi,
            goal: state.goal,
            idle: state.idle,
            beast: { name: state.beastName, bond: state.beastBondLevel },
            attributes: state.attributes,
            destiny_tags: state.destinyTags,
            inventory_list: getInventoryItemsFromState(state),
            last_goal_tag: state.lastGoalTag,
            last_choices: state.lastChoices,
        },
        instruction: "若用户输入 /state，直接输出 status_block（纯文本 fenced code block）。不要输出叙事正文。❌ 禁止输出 openclaw_actions 或任何结构化动作协议块。否则用 state_data 组装 events，调用 xiuxian_apply_events。",
    };
}
// ─── 工具 3：xiuxian_apply_events ────────────────────────────────────────────
export async function xiuxian_apply_events(params) {
    const key = params?.playerKey ?? "default";
    const state = loadState(key);
    if (!params?.events || !Array.isArray(params.events) || params.events.length === 0) {
        const statusBlock = renderShortStatus(state);
        const built = buildReplyText("", statusBlock, state);
        return {
            ok: true,
            violations: [],
            triggers: [],
            reply: "",
            reply_text: built.replyText,
            status_block: statusBlock,
            instruction: INSTRUCTION_NORMAL,
        };
    }
    const result = applyEvents({
        state: state,
        events: params.events,
        rawInput: params.rawInput,
        narrativeText: params.narrativeText,
    });
    const hardViolation = result.violations.some((v) => v.code === "E_RULE_REALM_CHEAT" || v.code === "E_RULE_PLANE_LEAK");
    if (!hardViolation && params.rawInput) {
        const tag = params.events[0]?.type ?? "other";
        writeMemory(key, `${params.rawInput.slice(0, 40)} HP:${result.state.hp} 灵石:${result.state.spiritStone}`, tag, result.state.realm);
    }
    const needsDetail = isKeyEvent(result.triggers, result.violations, result.state);
    const statusBlock = needsDetail
        ? renderDetailStatus(result.state)
        : renderShortStatus(result.state);
    const mediaMarkdown = (result.media ?? []).filter(Boolean).join("\n\n");
    // ── 正文兜底链（改法1）：显式处理空字符串，不仅仅依赖 ?? ──
    let narrativeReply = result.guardedNarrative;
    if (!narrativeReply || !String(narrativeReply).trim()) {
        narrativeReply = params.narrativeText;
    }
    if (!narrativeReply || !String(narrativeReply).trim()) {
        narrativeReply = state.lastReplyText;
    }
    narrativeReply = String(narrativeReply || "").trim();
    // ── 调试日志：快速定位正文丢失环节 ──
    console.log("[xianxia][apply_events] guardedNarrative =", JSON.stringify((result.guardedNarrative ?? "").slice(0, 80)));
    console.log("[xianxia][apply_events] params.narrativeText =", JSON.stringify((params.narrativeText ?? "").slice(0, 80)));
    console.log("[xianxia][apply_events] state.lastReplyText =", JSON.stringify((state.lastReplyText ?? "").slice(0, 80)));
    console.log("[xianxia][apply_events] final narrativeReply =", JSON.stringify(narrativeReply.slice(0, 80)));
    // ── 组装最终 reply（改法2）：确保 replyCore 非空 ──
    const replyCore = mediaMarkdown
        ? `${mediaMarkdown}\n\n${narrativeReply}`.trim()
        : narrativeReply;
    // ── 改法2续：如果正文仍为空，显式报错而非静默返回状态块 ──
    if (!replyCore) {
        console.error("[xianxia][apply_events] CRITICAL: narrative is empty after all fallbacks!");
        return {
            ok: false,
            violations: [{ code: "E_EMPTY_NARRATIVE", message: "叙事正文为空，apply_events 无法返回有效内容" }],
            triggers: result.triggers ?? [],
            reply: "【系统提示】本回合叙事生成异常，请重新输入你的行动。",
            reply_text: `【系统提示】本回合叙事生成异常，请重新输入你的行动。\n\n${statusBlock}`,
            status_block: statusBlock,
            instruction: INSTRUCTION_NORMAL,
        };
    }
    const built = buildReplyText(replyCore, statusBlock, result.state);
    console.log("[xianxia][apply_events] built.replyText length =", built.replyText.length);
    result.state.lastGoalTag = built.goalTag;
    result.state.lastChoices = built.choices;
    result.state.lastReplyText = built.replyText;
    if (!hardViolation) {
        saveState(key, result.state);
    }
    return {
        ok: !hardViolation,
        violations: result.violations,
        triggers: result.triggers,
        reply: replyCore,
        reply_text: built.replyText,
        status_block: statusBlock,
        instruction: INSTRUCTION_NORMAL,
    };
}
// ─── OpenClaw 工具注册 ────────────────────────────────────────────────────────
export const tools = { xiuxian_turn, xiuxian_state, xiuxian_apply_events };
function register(api) {
    api.registerTool({
        name: "xiuxian_turn",
        description: "【开局专用·每步必调】处理开局四步状态机：ask_name → ask_origin → ask_attr → ask_destiny → in_world。",
        parameters: {
            type: "object",
            properties: {
                input: { type: "string", description: "玩家输入" },
                playerKey: { type: "string", description: "玩家唯一标识，默认 default" }
            },
            required: ["input"]
        },
        async execute(_toolCallId, params) {
            const result = await xiuxian_turn(params);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
    }, { name: "xiuxian_turn" });
    api.registerTool({
        name: "xiuxian_state",
        description: "【状态查询】返回角色详细状态 + 最近记忆摘要。",
        parameters: {
            type: "object",
            properties: {
                playerKey: { type: "string" }
            },
            required: []
        },
        async execute(_toolCallId, params) {
            const result = await xiuxian_state(params);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
    }, { name: "xiuxian_state" });
    api.registerTool({
        name: "xiuxian_apply_events",
        description: "【入世阶段·结算事件·必调】结算本回合事件，返回 reply / status_block。",
        parameters: {
            type: "object",
            properties: {
                events: {
                    type: "array",
                    description: "事件列表",
                    items: { type: "object", properties: { type: { type: "string" } }, required: ["type"] }
                },
                rawInput: { type: "string", description: "玩家原始输入" },
                narrativeText: { type: "string", description: "模型撰写的叙事正文（含A/B/C/D选项），必须传入，否则用户将看不到剧情内容" },
                playerKey: { type: "string" }
            },
            required: ["events", "narrativeText"]
        },
        async execute(_toolCallId, params) {
            const result = await xiuxian_apply_events(params);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
    }, { name: "xiuxian_apply_events" });
    api.logger.info("[xianxia-lite] 3 tools registered: xiuxian_turn, xiuxian_state, xiuxian_apply_events");
}
export { register };
