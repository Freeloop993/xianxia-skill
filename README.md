# 玄黄修仙

一个基于 OpenClaw 的中文文字修仙 RPG Skill。

**玄黄修仙** 不是简单的仙侠陪聊 Prompt，而是一个带有开局状态机、事件结算、角色状态、存档机制和世界观约束的修仙游戏引擎。它面向文本聊天场景设计，适合在 OpenClaw环境下、微信、discord、feishu等中运行。
https://github.com/Freeloop993/xianxia-skill/blob/main/references/%E5%9B%BE%E7%89%871.png


---

## 项目特点

- **完整开局流程**：支持问名、出身选择、属性分配、命数抽取四步开局
- **入世主循环**：支持闭关、坊市、炼丹、历练、突破等自然语言行动推进
- **规则与叙事分离**：模型负责叙事，引擎负责数值结算与规则校验
- **角色状态可追踪**：支持境界、修为、灵石、HP/MP、目标等状态展示
- **存档保护**：已有存档时默认续档，不会静默覆盖

---

## 适用场景

这个项目适合用在以下场景：

- 想在 OpenClaw 中部署一个可长期运行的修仙玩法
- 想在wx,feishu,discord等渠道中提供稳定的文字修仙体验
- 想做一个规则明确、不会随意漂设定的仙侠叙事引擎

---

## 核心能力

安装后，项目会注册 3 个核心工具：

- `xiuxian_turn`：处理开局阶段四步状态机
- `xiuxian_state`：查询当前角色状态与记忆摘要
- `xiuxian_apply_events`：处理入世后的事件结算

通过这三个工具，项目可以完成从开局到长期游玩的完整流程。

---

## 安装要求

- Node.js **18 或更高版本**
- OpenClaw **2025.x 或更高版本**

推荐使用本地链接方式安装：

```bash
openclaw plugins install --link /path/to/xianxia
```

例如：

```bash
openclaw plugins install --link /root/.openclaw/workspace/skills/xianxia
```

---

## 安装后必须重启

**这是最重要的一点。**

这个项目安装完成后，**必须重启 OpenClaw / Gateway**，否则工具不会被加载，Skill 无法正常使用。

请务必注意：

> 安装成功 ≠ 当前进程已经生效

如果没有重启，常见现象包括：

- `xiuxian_turn` 找不到
- `xiuxian_state` 找不到
- `xiuxian_apply_events` 找不到
- 看起来安装成功，但实际无法调用

所以最准确的说明是：

> 安装完成后必须重启 OpenClaw / Gateway，否则本项目注册的工具不会生效。

---

## 渠道与交互设计

这个项目优先考虑文本聊天环境下的稳定性。

因此，当前交互方式以以下形式为主：

- 叙事正文
- 纯文本状态栏
- A/B/C/D 显式选项
- Markdown 图片

项目**不依赖**复杂的结构化动作协议，避免在弱交互渠道中出现兼容问题。

这使它尤其适合企业微信等环境。

---

## Hermes 兼容性说明

本项目**兼容 Hermes**，但需要明确一点：

> **兼容不等于开箱即用。**

如果你希望把它接入 Hermes，通常需要你**自行让 Hermes 修改代码完成适配**，包括但不限于：

- 工具调用方式的适配
- 消息流程的适配
- 输出格式的适配
- 插件加载链路的适配

因此，推荐使用下面这句表述：

> 本项目兼容 Hermes，但 Hermes 侧需要自行修改代码完成兼容，并非开箱即用。

---

## 项目结构

典型目录结构如下：

```text
xianxia/
├── SKILL.md
├── README.md
├── package.json
├── openclaw.plugin.json
├── dist/
│   └── plugin.js
├── references/
│   ├── world-core.md
│   ├── onboarding.md
│   ├── battle-rules.md
│   └── systems.md
└── data/
```

其中：

- `SKILL.md`：Skill 说明与调用规则
- `openclaw.plugin.json`：插件清单与工具定义
- `dist/plugin.js`：运行入口
- `references/`：世界观与规则文档
- `data/`：运行中产生的玩家存档与记忆数据

---

## 项目定位

这个项目的定位不是“随便聊聊修仙”，而是一个可以持续运行、持续扩展的修仙引擎。

它更关注：

- 规则稳定
- 叙事一致
- 存档安全
- 渠道兼容
- 后续扩展能力

如果你想做一个更稳、更可维护的中文修仙玩法项目，它会比单纯 Prompt 更适合长期使用。

## License

本项目使用 **MIT License** 开源，详见仓库中的 `LICENSE` 文件。

---

## 总结

**玄黄修仙** 是一个面向 OpenClaw 的中文文字修仙 RPG Skill，提供开局状态机、入世事件结算、状态展示和存档保护能力。

请记住两点：

1. **安装后必须重启 OpenClaw / Gateway，否则工具不会生效。**
2. **兼容 Hermes，但需要你自己让 Hermes 修改代码完成兼容。**
