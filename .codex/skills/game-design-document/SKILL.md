---
name: game-design-document
description: "Generate a Game Design Document (GDD) through a structured six-phase collaborative workflow. Use when the user proposes a game idea, requests a GDD, or starts game design brainstorming."
---

# Game Design Document Generator

## Core Goal

Use a six-phase structured conversation to turn a vague game idea into a complete Game Design Document (GDD).

## Principles

- Ask only one question at a time, and provide options whenever possible to reduce user effort.
- At the end of each phase, summarize the current design and ask: "目前为止是否正确？" Continue only after the user confirms.
- Keep each presented design section around 200-300 Chinese characters when possible.
- Follow YAGNI: design only what the user explicitly needs. Do not add speculative future features.
- If the user has already confirmed part of the design, skip that part and start from the first unfinished phase.
- If the user changes earlier decisions, go back, update the relevant phase, and reconfirm before proceeding.
- Use concrete numeric examples, not only abstract descriptions.

## Phase 1: Core Feel

Goal: define the main source of fun and rhythm of play.

1. Ask the user for the basic concept: genre, theme, and inspirations.
2. Clarify the core interaction: what does the player repeatedly do, such as playing cards, moving pieces, shooting, matching, or drafting?
3. Ask the user to choose the experience rhythm:
   - 高压博弈型: scarce resources and careful optimization.
   - 数值割草型: steady early game and explosive late-game scaling.
   - 反转逆袭型: comeback moments and extreme power reversals.
4. Confirm style references, such as Balatro, Slay the Spire, or Hades.

Confirmation: summarize the core experience positioning and ask whether it is correct.

## Phase 2: The Math

Goal: establish the core formula and win/loss logic.

1. Design the core formula, such as `总伤害 = (基础值 + 加成) * 倍率`.
2. Define win and loss conditions:
   - What counts as winning?
   - What counts as losing?
   - What does failure cost: health, resources, turns, score, or another penalty?
3. Design the scaling curve:
   - Early game: stable additive growth, such as `+N`.
   - Mid game: small multipliers, such as `x1.2` or `x1.5`.
   - Late game: combo-triggered large multipliers, such as `x3` or `x5`.
4. Provide one "chemical reaction" example that shows how 2-3 elements combine into a numeric spike.

Confirmation: show the formula and numeric example, then ask whether it is correct.

## Phase 3: Content Pool

Goal: design the layered structure and expansion framework for characters, cards, items, or other content.

1. Design a rarity or tier system, such as 普通 / 精英 / 高级 / 传奇, and define each tier's role:
   - Low tiers provide stable base values.
   - High tiers provide powerful but rare multipliers.
2. Design factions or categories if they fit the game. Give each faction a distinct mechanical identity.
3. Use the expandable template `[触发条件] + [数值奖励]`.
   - Triggers may include hand type, value, operation, state, position, timing, or resource threshold.
   - Rewards may include base value, additive bonus, multiplier, resource gain, or rule modification.
4. Design active skills or consumables, plus passive items or global effects.
5. Provide 2-4 representative examples for each relevant faction or tier.

Confirmation: show the content pool structure and examples, then ask whether it is correct.

## Phase 4: Progression

Goal: bind level flow, narrative structure, and numeric growth.

1. Split the world or premise into campaigns, chapters, or acts.
2. For each chapter, define:
   - Example enemies or challenges.
   - Expected numeric range, such as player damage or score.
   - Core experience goal, such as learning rules, building first combos, or facing extreme challenges.
3. Keep numeric growth smooth and avoid sudden unexplained spikes.
4. Plan a difficulty ladder unlocked after completion.
5. Design endgame content only if needed, such as hidden levels or endless mode.

Confirmation: show a chapter list and numeric range table, then ask whether it is correct.

## Phase 5: Economy

Goal: design the resource loop, shop, and exploration structure.

1. Define core resources, such as money, health, momentum, experience, or reroll tokens.
2. Design the shop:
   - Purchasable content types: characters, cards, items, upgrades.
   - Refresh or reroll rules.
   - Deck thinning, deletion, or simplification mechanics if relevant.
3. Design map event types for roguelike structures:
   - Normal combat, elite combat, random event, rest, and shop.
4. Design meta-progression only if needed:
   - Unlock conditions for new characters or items.
   - Achievements and collection compendium.

Confirmation: show the economy system overview, then ask whether it is correct.

## Phase 6: Output

Goal: compile the confirmed design into a structured Markdown GDD.

1. Generate the GDD with this structure:
   - 游戏概述: name, genre, core mechanic, target audience.
   - 核心玩法: base rules and win/loss conditions.
   - 数值模型: formula and scaling curve.
   - 系统设计: character system, skills, and items.
   - 关卡与成长: chapter list and difficulty ladder.
   - 经济系统: resources, shop, and exploration.
   - 视觉与美术风格.
   - 扩展性与重玩价值.
2. Save the final document as `GDD.md` in the project directory unless the user requests another location.
3. Ask: "GDD 已完成，是否需要进入技术选型或原型开发阶段？"
