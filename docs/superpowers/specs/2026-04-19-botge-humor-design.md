# Botge Humor & Reply-Quality Redesign

- **Date:** 2026-04-19
- **Status:** Design (approved, awaiting implementation plan)
- **Scope:** The conversational ("talkative") reply pipeline only — `src/api/ollama.ts`, `src/api/vector-store.ts`, `src/message-create-handlers/ollama-message-create-handler.ts`, `src/config.ts`, plus new supporting files. Not in scope: slash commands, emote/clip/quote handlers, moderation, or any non-reply bot feature.

---

## 1. Context

Today, every reply Botge makes flows through a single LLM call with a single hand-written system prompt. All personality lives in two strings in `ollama.ts` (a scoring prompt and a generation prompt). There are no exemplar banks, no per-moment persona variation, no post-processing of model output, no offline evaluation, and no structured logging beyond `console.log`. RAG is implemented (Chroma + sequence-number windowing) but the generation prompt explicitly tells the model **not to reference past context directly** — the system retrieves memories and forbids using them.

See `ollama.ts:64-74` (scoring prompt), `ollama.ts:103-115` (generation prompt), `ollama-message-create-handler.ts` (orchestrator), and `config.ts` (knobs) for the current state.

## 2. Goals

- Replies feel like a funny member of the group chat, not "a mildly snarky AI."
- Voice adapts to the moment — joke-setup, rant, link, question, serious — instead of one flat register.
- In-group callbacks and running bits surface naturally.
- Output is free of AI tells (name prefix, markdown, banned openers, repetition).
- Tuning is data-driven: changes are evaluated offline against real chat snippets before shipping.
- Voice improves over time without manual prompt edits.

## 3. Non-goals

- No new bot features outside the reply pipeline.
- No breaking change to the Discord command surface, emote/clip/quote systems, or moderation.
- No replacement of Ollama or Chroma. Local-first stays local-first.
- No per-server configuration UI (the bot remains scoped to the configured channels).

## 4. Guiding principle

Each phase ships user-visible improvement *and* builds infrastructure the later phases rely on. Nothing is throwaway. The agent mesh (Phase 6) is the final state, but every preceding phase stands on its own merit so we can stop at any phase boundary if value has plateaued.

## 5. Target architecture (end state, post-Phase 7)

```
Discord message
      │
      ▼
┌──────────────────────────────┐
│ Tier 0: Ingestion            │
│  - Buffer (rolling, per ch.) │
│  - Tagger (small model)      │──►  Chroma (message + topic tags)
│  - Embed + persist           │
└──────────────────────────────┘
      │ (gates: buffer size, cooldown, random, direct mention)
      ▼
┌──────────────────────────────┐
│ Tier 1: Scout (router)       │
│  - Reads recent buffer       │
│  - Classifies moment         │
│  - Picks 2–3 specialists     │
│  - Can veto (stay silent)    │
└──────────────────────────────┘
      │
      ▼
┌──────────────────────────────┐
│ Tier 2: Specialists          │
│  (one-shot ensemble in 26B)  │
│  - Each has own system prompt│
│  - Each has own exemplar bank│
│  - Each has own RAG filter   │
└──────────────────────────────┘
      │ (N candidate drafts)
      ▼
┌──────────────────────────────┐
│ Tier 3: Director (26B)       │
│  - Reads candidates          │
│  - Reads anti-repetition feed│
│  - Picks / merges / vetoes   │
└──────────────────────────────┘
      │
      ▼
┌──────────────────────────────┐
│ Tier 4: Editor (deterministic)│
│  - Strips prefix, markdown   │
│  - Rejects banned openers    │
│  - Dedupes vs last 20 outputs│
│  - 1 regen on rejection      │
└──────────────────────────────┘
      │
      ▼
┌──────────────────────────────┐
│ Presence layer               │
│  - Reaction tier (3–5 score) │
│  - Timing jitter             │
└──────────────────────────────┘
      │
      ▼
   Discord reply
      │
      ▼
┌──────────────────────────────┐
│ Self-improvement loop        │
│  - ⭐ reaction → exemplar bank│
│  - Reply log (JSONL)         │
└──────────────────────────────┘
```

## 6. Phased rollout

### Phase 0 — Foundation fixes

Fix latent bugs from the audit before any content work.

- Move `setLastReplyTime` to **after** a successful reply, not before scoring.
- Either enforce `replyScoreThreshold` against the numeric score OR remove the knob — no decorative config.
- Fix `getCollection()` — the `_collectionPromise` must live at module scope, not inside the function body.
- Fix the default model tag: `gemma4:26b` → `gemma3:27b`.
- Bump `num_ctx` to 8192.
- Add `options.repeat_penalty: 1.15`.
- Use Ollama `format: 'json'` on the scorer call; remove the ```json``` regex cleanup.
- Gate the full-prompt `console.log` in `ollamaChat` behind a `DEBUG_OLLAMA=1` env var.

**Files touched:** `src/api/ollama.ts`, `src/api/vector-store.ts`, `src/message-create-handlers/ollama-message-create-handler.ts`, `src/config.ts`.

**Success criterion:** existing behavior preserved; all bug-audit items resolved; no new features.

---

### Phase 1 — Content quick wins

Ship user-visible improvements with no new infrastructure.

- **B4** Flip the RAG directive in the generation prompt: `"If a natural callback exists, use it. Do not invent past events."`
- **B5** Narrow the RAG query: embed the last 1–3 messages, not the full 30-message buffer.
- **B6** Exclude the bot's own output from RAG at query time: `where: { $and: [{ channelId }, { author: { $ne: botName } }] }`.
- **B11** Deterministic editor, new file `src/api/reply-editor.ts`:
  - Strip leading `${botName}:` prefix.
  - Strip surrounding quotes and markdown code fences.
  - Reject if starts with banned openers (`Absolutely`, `Great`, `I `, `Sure,`) — configurable list.
  - Reject if > 280 chars.
  - Reject if cosine-similar (≥ 0.85, measured via `nomic-embed-text` on the reply text) to any of the last 20 bot outputs in the same channel. The "last 20 outputs" list is a new per-channel rolling buffer, populated by the editor itself on each successful send.
  - One regen pass with stricter prompt on rejection. Silence if second attempt also rejects.
- **B15** Temporal context: inject `"It is {weekday} {HH}:00 UTC"` into the system prompt.

**Files touched:** `src/api/ollama.ts`, `src/api/vector-store.ts`, `src/message-create-handlers/ollama-message-create-handler.ts`, new `src/api/reply-editor.ts`.

**Success criterion:** sampled replies on known past chats (evaluated manually until Phase 2 harness exists) show fewer AI tells, occasional natural callbacks, no name-prefix or markdown leakage.

---

### Phase 2 — Evaluation & memory infrastructure

Invisible to users; unblocks all downstream tuning.

- **B17** Offline replay harness, new file `scripts/replay.ts`:
  - Signature: `ts-node scripts/replay.ts <channelId> <messageId> [--prompt-version=v2]`.
  - Loads the chat window ending at that message from Chroma.
  - Runs the full pipeline (gates disabled) and prints the reply it would have generated, plus every intermediate artifact (score, retrieved context, editor decisions).
  - Supports A/B: `--compare v1,v2` prints both side-by-side.
- **B19** Structured reply log, new file `DATA/reply-log.jsonl`:
  - One JSON object per line: `{timestamp, channelId, triggerMessageId, moment_tags, score, reason, retrieved_context_ids, candidates, chosen, editor_decisions, post_reactions?}`.
  - `post_reactions` is populated asynchronously later via a separate reaction listener (Phase 7 uses this too).
- **B7** Topic tagger, new module `src/api/tagger.ts`:
  - Small-model LLM call (`llama3.2:3b` or `phi3`) on every incoming message.
  - Returns up to 3 tags from a closed taxonomy: `anime, vtuber, poe, gaming, meme, cat, tech, personal, rant, joke-setup, link, question, serious, meta`.
  - Tags stored in Chroma metadata alongside `seqNum, channelId, author`.
  - Backfill script `scripts/backfill-tags.ts` walks existing Chroma rows and tags them once.
  - Replaces the long-referenced-but-never-built `backfill.js`.

**Files touched:** new `scripts/replay.ts`, new `scripts/backfill-tags.ts`, new `src/api/tagger.ts`, modified `src/api/vector-store.ts` (metadata write), modified `src/message-create-handlers/ollama-message-create-handler.ts` (tag on ingest, write reply log).

**Config additions:** `TAGGER_MODEL` (default `llama3.2:3b`), `REPLY_LOG_PATH` (default `DATA/reply-log.jsonl`).

**Success criterion:** replay harness reproduces a live-chat reply exactly; topic tags populate on ingest; backfill completes without loss; reply log begins accumulating.

---

### Phase 3 — Voice depth

Convert "reasonable AI" into "member of the group."

- **B1** Exemplar banks, new directory `config/exemplars/`:
  - One file per voice: `default.json`, `anime.json`, `vtuber.json`, `poe.json`, `meme.json`, `cat.json`, `roaster.json`, `callback.json`, `sincere.json`.
  - Schema per file:
    ```json
    {
      "persona": "anime",
      "tone_notes": "short, deadpan, drops genre jargon without explaining it",
      "exemplars": [
        {
          "context": "group is debating sub vs dub",
          "response": "dub enjoyers are just anime-lite speedrunners",
          "tags": ["roast", "anime"]
        }
      ]
    }
    ```
  - 5–15 exemplars per persona, hand-curated at launch.
- Prompt assembly: when a persona is active, inject the top-k most-relevant exemplars (semantic match against the current moment) into the system prompt as few-shot.
- **B3** Inside-joke ledger, new file `config/running-bits.json`:
  - Schema:
    ```json
    {
      "bits": [
        {"id": "divine-orb-suffering", "description": "the group jokes about never dropping a Divine Orb", "tags": ["poe"], "last_used": null}
      ]
    }
    ```
  - Human-editable. Injected into every system prompt as: `Ongoing bits: <short descriptions>`.

**Files touched:** new `config/exemplars/*.json`, new `config/running-bits.json`, new `src/api/persona-loader.ts` (loads + selects exemplars), modified `src/api/ollama.ts` (prompt assembly).

**Success criterion:** replay harness shows noticeably in-group replies; at least 30% of generated replies in an evaluation sample reference an exemplar-style phrase or a running bit when the moment fits.

---

### Phase 4 — Presence layer

Realism without extra LLM cost.

- **B13** Reaction tier (score comes from whichever scorer is current — `scoreReplyOpportunity` pre-Phase 5, `scoutRoute.score` from Phase 5 onward):
  - Score 3–5: `message.react(emoji)` on the triggering message, chosen from a configurable pool keyed by moment tag (e.g. `poe-rant → 😩`, `anime-post → 👀`). No text reply.
  - Score 6–7: short reply enforced (1 phrase, no punctuation required).
  - Score 8+: full reply (current path).
- **B14** Typing-time jitter: before `message.reply`, `await sleep(2000 + reply.length * 50 + random(0, 3000))`. Typing indicator already pulses correctly; this just stretches the "thinking" window.
- **B10** `n=3` sampling:
  - Single Ollama call with `options.n: 3` (or loop + concurrency if unsupported).
  - Deterministic pick: shortest non-rejected candidate with lowest mean cosine similarity to last 20 bot outputs.

**Files touched:** `src/message-create-handlers/ollama-message-create-handler.ts`, `src/api/ollama.ts`, new `src/api/reaction-pool.ts`, new `config/reaction-pool.json`.

**Config additions:** `REACTION_TIER_ENABLED`, `TYPING_JITTER_MAX_MS` (default 5000).

**Success criterion:** live channel shows a mix of reactions and text; no back-to-back identical replies; perceived latency feels natural (not instant, not late).

---

### Phase 5 — Intent router (bridge to mesh)

Single small-model call replacing today's `scoreReplyOpportunity`. Structured output:

```json
{
  "topic": "poe",
  "moment_type": "rant",
  "persona": "roaster",
  "should_reply": true,
  "score": 7,
  "reason": "good setup for a dry PoE jab"
}
```

The `persona` field drives which exemplar bank (Phase 3) and which system-prompt template is used for the generation call. Still **one generation call** — this is agent-lite.

**Files touched:** rename `scoreReplyOpportunity` → `scoutRoute`, expand its response schema, modify the handler to branch on `persona`.

**Decision gate:** evaluate Phase 5 output via the replay harness across a curated set of 50+ chat snippets. If quality meets target, Phase 6 is optional. Target: ≥ 70% of replies rated "hits the moment" on a blind read against the current prompt baseline.

**Success criterion:** replies vary register by moment; no single-voice drift; route telemetry in the reply log shows a healthy distribution across personas.

---

### Phase 6 — The Botge Mesh

Only built if Phase 5's decision gate says the quality ceiling isn't reached. Hybrid compute:

- **Scout** — same as Phase 5, now also picks 2–3 specialists (not just one persona).
- **Specialists** — one-shot ensemble in 26B: a single call with `format: 'json'` asking the model to role-play N named specialists and produce N drafts. Each specialist is briefed with its own exemplar bank + its own RAG slice (topic-filtered via Phase 2 tags). This supersedes Phase 4's generic `n=3` sampling — the same slot in the pipeline is now persona-distinct drafts rather than stylistic variants of one voice.
- **Director** (second 26B call) — reads all candidates + anti-repetition feed + Scout's reasoning. Picks one, merges two, or vetoes. Output: the final line.
- **Editor** — unchanged from Phase 1.

Specialist roster (locked):

| Name | Voice | Retrieval filter |
|---|---|---|
| `AnimeAgent` | deadpan fan, no explaining jokes | tag includes `anime` |
| `VTuberAgent` | clip-brained, chat-emote cadence | tag includes `vtuber` |
| `PoEAgent` | battle-scarred arpg vet | tag includes `poe` or `gaming` |
| `MemeAgent` | current-format native | tag includes `meme` |
| `CatAgent` | cursed/wholesome cat energy | any tag, low weight |
| `RoasterAgent` | dry, punchline-first | any tag |
| `CallbackAgent` | searches for in-group history | tag matches current moment |
| `SincereAgent` | rare mode for real questions | tag includes `question` or `serious` |

**Files touched:** new `src/api/mesh/scout.ts`, `src/api/mesh/specialists.ts`, `src/api/mesh/director.ts`, extensive edits to the handler.

**Success criterion:** mesh beats Phase 5 on the same blind replay-harness eval by a margin worth the latency cost (target: +15% "hits the moment" rate at ≤ 15s total latency).

---

### Phase 7 — Self-improvement loop

Closes the voice-tuning flywheel.

- **B18** Reaction-based promotion:
  - New reaction listener: if a bot reply receives ⭐ (configurable), the reply log entry is marked `promoted: true`.
  - Script `scripts/promote-exemplars.ts` (run on a schedule — Task Scheduler / cron / manual; exact trigger left to the implementation plan) reads promoted entries and appends them to the relevant specialist's exemplar bank.
  - Caps per persona (max 50 exemplars; oldest auto-rotated).
- Reply log enriched with post-send reaction data.

**Files touched:** new `src/message-handlers/reaction-add-handler.ts` or equivalent, new `scripts/promote-exemplars.ts`, modified reply log schema.

**Success criterion:** after 2 weeks of live use, specialist banks show organic growth and promoted lines replay cleanly.

---

## 7. Data schemas (summary)

### `config/exemplars/<persona>.json`
```json
{
  "persona": "string",
  "tone_notes": "string",
  "exemplars": [
    {"context": "string", "response": "string", "tags": ["string"]}
  ]
}
```

### `config/running-bits.json`
```json
{
  "bits": [
    {"id": "string", "description": "string", "tags": ["string"], "last_used": "ISO8601 | null"}
  ]
}
```

### Chroma metadata (extended)
```
{ author, channelId, seqNum, timestamp, tags: ["anime", "rant", ...] }
```

### `DATA/reply-log.jsonl` (one line per reply attempt)

Fields marked with † are populated only from the phase indicated. Earlier phases write `null` or omit.
```json
{
  "timestamp": "ISO8601",
  "channelId": "string",
  "triggerMessageId": "string",
  "scout": {"topic": "string", "moment_type": "string", "persona": "string", "specialists": ["string"] /* †Phase 6 */, "should_reply": true, "score": 0, "reason": "string"},
  "retrieved_context_ids": ["string"],
  "candidates": [{"source": "string", "text": "string"}],
  "director_pick": {"text": "string", "reasoning": "string"} /* †Phase 6; pre-Phase 6 this is just the chosen candidate */,
  "editor_decisions": ["stripped_prefix", "passed"],
  "final_reply": "string | null",
  "reply_message_id": "string | null",
  "post_reactions": [{"emoji": "string", "userId": "string", "timestamp": "ISO8601"}],
  "promoted": false
}
```

## 8. Evaluation approach

- Phase 2's replay harness is the authoritative tool. Every subsequent phase commits with a replay-harness run on a curated 50+ snippet eval set.
- Blind A/B reads against the prior phase (eyes on output, author hidden) gate each phase's ship decision.
- Reply log + reaction data feed longitudinal quality tracking once Phase 7 is live.

## 9. Explicitly dropped

Noted so we do not second-guess later:

- **B2** lexicon harvesting — speculative; revisit if Phase 3 leaves a gap.
- **B9** personality dial — superseded by personas + exemplars.
- **B12** explicit anti-repetition memory — covered by Phase 1's editor dedupe.
- **B16** per-user profiles — later, gated on topic-tag sufficiency.
- **B20, B21, B22** shape/bit/mood variety — revisit post-mesh.

## 10. Open questions (to be resolved in the implementation plan)

- `n=3` sampling: does the local Ollama build of `gemma3:27b` honor `options.n`, or do we loop? Verify during Phase 4.
- Tagger model: benchmark `llama3.2:3b` vs `phi3` tag-accuracy during Phase 2 before locking the default.
- Phase 5 decision gate: who runs the blind A/B read — just the project owner, or a small group? Decide before Phase 5 completes.
- Promotion cap and rotation policy: fixed 50 per persona, or weighted by recency? Revisit during Phase 7.

## 11. Phase dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► [gate] ──► Phase 6 ──► Phase 7
                                                                          │
                                                                          └─► stop (if quality sufficient)
```

Phase 7 can begin any time after Phase 2 (reply log exists) and Phase 3 (exemplar banks exist), in parallel with later phases. All other phases are sequential.
