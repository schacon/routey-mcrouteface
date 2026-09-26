# Best local text models on Apple-silicon Macs, per narrow task (as of 2026-09-26)

Scope note: about 20 searches and fetches. Primary sources: Hugging Face model cards and ollama.com/library pages, fetched 2026-09-26. Mac speed numbers come from third-party benchmark posts. Vendor benchmark numbers are self-reported unless marked otherwise.

## Which current model families lead each task at small sizes (<= ~35B total, or MoE with small active params)?

### Takeaway

As of September 2026 the Qwen line leads most general, coding, agentic and reasoning tasks at <=35B. The main local picks are Qwen3.6-35B-A3B (MoE, 3B active, fast) and the dense Qwen3.6-27B and Qwen3.8-27B (the 3.8 was released 2026-08-14 and is stronger but slower). Gemma 4 (26B-A4B MoE, 31B dense) is the main alternative. All of these are thinking-by-default hybrids that can switch thinking off. qwen3-coder:30b (2025) remains a non-thinking, fast option, but its generation is now older.

### Cited Findings

**Qwen3.6-35B-A3B** (Qwen/Qwen3.6-35B-A3B; Ollama `qwen3.6:35b` / `qwen3.6:latest` 23GB, `qwen3.6:35b-mlx` 24GB)

- 35B total / 3B active MoE. Hybrid Gated DeltaNet plus gated attention. 262,144 native context, extensible to about 1.01M with YaRN. Apache 2.0. Released 2026-04 (one source says April 27). — [HF card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B); [llm-stats](https://llm-stats.com/models/qwen3.6-35b-a3b)
- Thinking is on by default and can be turned off with `enable_thinking: False` in `chat_template_kwargs`. `preserve_thinking: True` keeps reasoning from earlier turns, which helps agents. — [HF card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)
- Vendor benchmarks, listed as Qwen3.6-35B-A3B / Qwen3.5-35B-A3B / Qwen3.5-27B / Gemma4-31B:
  - SWE-bench Verified: 73.4 / 70.0 / 75.0 / 52.0
  - SWE-bench Pro: 49.5 / 44.6 / 51.2 / 35.7
  - Terminal-Bench 2.0: 51.5 / 40.5 / 41.6 / 42.9
  - LiveCodeBench v6: 80.4 / 74.6 / 80.7 / 80.0
  - AIME26: 92.7 / 91.0 / 92.6 / 89.2
  - GPQA: 86.0 / 84.2 / 85.5 / 84.3
  - MMLU-Pro: 85.2 / 85.3 / 86.1 / 85.2
  - — [HF card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)
- Accepts text, image and video input. — [HF card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B)

**Qwen3.6-27B** (dense; Ollama `qwen3.6:27b` 18GB, `qwen3.6:27b-mlx` 19GB)

- Listed on Ollama with 256K context and text+image input. — [ollama qwen3.6](https://ollama.com/library/qwen3.6)
- The Qwen3.8-27B card uses it as the baseline (see below).

**Qwen3.8-27B** (Ollama `qwen3.8:27b` 18GB, `qwen3.8:27b-mlx`; updated on Ollama 2026-09-25, 2.6M downloads)

- 27.78B dense parameters, text/image/video input, Apache 2.0, 262,144 native context. Released 2026-08-14. — [kingy.ai summary](https://kingy.ai/blog/qwen3-8-27b-specs-benchmarks-local-hardware/) (secondary source)
- Ollama says "Thinking mode is on by default and can be disabled per request." Reasoning depth is tunable with `reasoning_effort`, and `preserve_thinking` is supported. — [ollama qwen3.8](https://ollama.com/library/qwen3.8)
- Vendor numbers against Qwen3.6-27B: Terminal-Bench 2.1 63.4 → 73.0; DeepSWE 1.1 13.3 → 42.2; OSWorld-Verified 63.9 → 84.3. — [kingy.ai](https://kingy.ai/blog/qwen3-8-27b-specs-benchmarks-local-hardware/) (secondary; I did not open the primary HF card)
- Simon Willison's review (2026-08-16), a credible community eval:
  - The model is "excellent," but it defaults to `xhigh` reasoning and "wildly overthinks." A pelican SVG took 21 minutes and 22,276 reasoning tokens, versus 137 s with no reasoning.
  - His advice: run it "on low or even no reasoning levels at first."
  - Speed was 15-30 tok/s in LM Studio with a 17GB Q4_K_M build on a 128GB M5 Max. Multi-token prediction gave about a 72% speedup.
  - It worked well as a coding agent under the Pi framework.
  - — [Simon Willison](https://simonwillison.net/2026/Aug/16/qwen-38-27b/)
- Artificial Analysis has a page for "Qwen3.8 27B (xhigh)". — [Artificial Analysis](https://artificialanalysis.ai/models/qwen3-8-27b) (not fetched)

**Qwen3.5 small sizes** (Ollama `qwen3.5:0.8b` 1.0GB, `:2b` 2.7GB, `:4b` 3.4GB, `:9b` 6.6GB (the default/latest), `:27b` 17GB, `:35b` 24GB, `:122b` 81GB)

- MLX variants exist for 0.8b through 35b.
- All sizes list 256K context and text+image input, with support for 201 languages and dialects.
- — [ollama qwen3.5](https://ollama.com/library/qwen3.5)

**Gemma 4** (Ollama `gemma4`)

- Tags:
  - E2B: 7.2GB, 2.3B effective params, 128K context
  - E4B: 9.6GB, 4.5B effective, 128K
  - 12B: 7.6GB, 256K
  - 26B MoE: 19GB, 25.2B total / 3.8B active, 256K
  - 31B dense: 20GB, 30.7B, 256K
- All sizes have configurable thinking, turned on with the `<|think|>` token and off by leaving it out.
- 31B vendor scores: MMLU-Pro 85.2, AIME 2026 89.2, Codeforces Elo 2150, 128K long-context 66.4%. E4B scores 69.4 on MMLU-Pro.
- — [ollama gemma4](https://ollama.com/library/gemma4)

**gpt-oss** (Ollama `gpt-oss:20b` 14GB, `gpt-oss:120b` 65GB)

- 128K context.
- Reasoning effort is configurable as low, medium or high. The page does not offer an "off" setting.
- Uses MXFP4 weights. Supports structured outputs and function calling. Apache 2.0. Last updated about 11 months ago.
- — [ollama gpt-oss](https://ollama.com/library/gpt-oss)

**Granite 4.2** (Ollama `granite4.2`: 3B, 8B, 30B)

- A reasoning model family released 2026-08-25. Ollama describes it as "made for enterprise agents." — [eesel review](https://www.eesel.ai/blog/granite-4-2-review); [Ollama on X](https://x.com/ollama/status/2092277283709186550?lang=en)
- 3B vendor scores (not reproduced by others): AIME25 78.33, GPQA 54.80, LiveCodeBench v6 69.71. — [eesel review](https://www.eesel.ai/blog/granite-4-2-review)

**Other Ollama-listed newcomers** (from the ollama.com "newest" search page; I did not evaluate them)

- `nemotron-3.5-lightning` (30B, tools+thinking)
- `lfm2.5` (8B total / 1B active, tools+thinking)
- `laguna-xs-2.1` (33B / 3B active)
- `north-mini-code-1.0` (30B / 3B active, coding)
- `glm-5.3-flash`, `deepseek-v4.1-flash`, `qwen3.8-flash-next` (sizes not shown)
- `ornith` (9B, 35B), `muse-glimmer` (30B)
- — [ollama search, newest](https://ollama.com/search?o=newest)

**Mac speed**

- Qwen3.5-35B-A3B on an M4 Max 128GB (March 2026):
  - MLX Python API: about 130 tok/s
  - MLX HTTP server: 84-107 tok/s
  - llama.cpp: about 71 tok/s
  - Ollama (Q4_K_M): 41-48 tok/s
  - About 20GB RAM at 4-bit.
  - — [Ante Kapetanovic](https://antekapetanovic.com/blog/qwen3.5-apple-silicon-benchmark/)
- llmcheck (Q4, 256 tokens in / 512 out, Aug-Sept 2026):
  - Qwen3.6-35B-A3B: 52 tok/s on M5 Max (MLX), 42 on M4 Max
  - Gemma 4 26B-A4B: 50 on M5 Max, 40 on M4 Max
  - Gemma 4 31B: 26 on M5 Max, 24 on M4 Max
  - Qwen3.5 9B: 82 on M5 Max (Ollama)
  - Qwen3-Coder-Next 80B-A3B: 35 on M5 Max
  - No gpt-oss-20b data.
  - — [llmcheck](https://llmcheck.net/benchmarks)
- mlx-serve claims 239 tok/s on an M4 Max with Qwen3.6-35B-A3B. This is a vendor claim. — [mlx-serve](https://mlxserve.com/blog/why-mlx-serve-is-fast/)

**SQL**

- BIRD dev leaderboard as of 2026-08-26: ReToolSQL 74.77%, then Gemini-SQL2 74.12% and Arctic-Text2SQL-R1 72.20%.
- Arctic-Text2SQL-R1-14B scores 70.04%. It is the best model under 30B on BIRD, and it is a Qwen2.5-Coder fine-tune.
- — [search summary / Snowflake blog](https://www.snowflake.com/en/blog/engineering/arctic-text2sql-r1-sql-generation-benchmark/); [ReToolSQL](https://arxiv.org/pdf/2608.27796)
- A June 2026 on-prem BIRD study tested only Qwen2.5-Coder, CodeLlama and Llama-3.x.
  - Zero-shot: Qwen2.5-Coder-32B 50.39%, Llama-3.3-70B 49.22%.
  - Self-correction added about 1 point. Self-consistency added +0.13 points at about 5x the tokens.
  - It has no results for Qwen3, Gemma or thinking models.
  - — [arXiv 2606.29733](https://arxiv.org/html/2606.29733)

### Inferences

Per-task picks for a Mac with 24-48GB. None are confirmed by task-specific leaderboards unless a source is cited above.

- **General chat / quick facts:** Qwen3.6-35B-A3B with thinking off (fastest capable model) or Gemma 4 26B-A4B. For about 8-16GB, use qwen3.5:9b or gemma4 E4B.
- **Code generation/editing:** Qwen3.6-35B-A3B (LCB v6 80.4) or Qwen3.6-27B / Qwen3.8-27B. qwen3-coder:30b is the non-thinking fallback.
- **Agentic multi-step coding:** Qwen3.8-27B (Terminal-Bench 2.1 73.0), then Qwen3.6-27B (Qwen3.5-27B scores 75.0 SWE-V), then Qwen3.6-35B-A3B (SWE-V 73.4, Terminal-Bench 2.0 51.5). Gemma4-31B trails at SWE-V 52.0.
- **Reasoning/math:** Qwen3.6-35B-A3B with thinking on (AIME26 92.7, GPQA 86.0) or Qwen3.8-27B. gpt-oss-20b is a smaller option with high reasoning effort.
- **Translation/multilingual:** the Qwen3.5/3.6 family (201 languages claimed). Gemma 4 is a plausible alternative. I found no translation benchmark numbers.
- **Writing/rewriting prose:** no benchmark was found. Gemma 4 and Qwen3.6 are reasonable picks, but this is unverified.
- **Long-context reading:** every Qwen3.5/3.6/3.8 and Gemma 4 (>=12B) model offers 256K. The only published long-context number I found is Gemma4-31B at 66.4% on 128K.

### Gaps

- I did not verify these families at all: GLM-4.7-Flash, Devstral, Phi-4, Ministral 3, Nemotron numbers, SmolLM3, DeepSeek distills. The time budget ran out.
- No BIRD or Spider numbers exist for Qwen3.x, Gemma 4 or gpt-oss.
- I found no Aider polyglot, RULER, LongBench or NIAH numbers for these models.
- I found no tok/s figure for gpt-oss-20b on a Mac.
- The Qwen3.8-27B benchmarks come from a secondary site. I did not open the primary card.

## Verify or refute: "qwen3-coder:30b is non-thinking and very fast; good for SQL, quick technical facts like Postgres's default port, and answering questions over long pasted text"

### Takeaway

Partly true.

- **"Non-thinking": confirmed.**
- **"Very fast": plausible.** It is a 3.3B-active MoE of the same size class as Qwen3.5/3.6-35B-A3B, which run at roughly 40-130 tok/s on an M4/M5 Max depending on runtime. I found no qwen3-coder-specific Mac number.
- **"Long pasted text": the context size is confirmed (256K).** I found no quality evidence for long-context QA.
- **"Good for SQL" and "quick facts": unverified.** It is a 2025-generation code model. Qwen3.6-35B-A3B with thinking off is a newer drop-in with the same speed profile and published higher benchmarks.

### Cited Findings

- 30.5B total / 3.3B active. 262,144 native context, extendable to 1M with YaRN. The card says: "This model supports only non-thinking mode and does not generate `<think></think>` blocks in its output." — [HF Qwen3-Coder-30B-A3B-Instruct](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct)
- Ollama `qwen3-coder:30b` / `:latest` is 19GB with 256K context, updated about 1 year ago. It is described as for "agentic and coding tasks," with pretraining on 7.5T tokens at a 70% code ratio. — [ollama qwen3-coder](https://ollama.com/library/qwen3-coder)
- Recommended sampling: temp 0.7, top_p 0.8, top_k 20, repetition_penalty 1.05. — [HF card](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct)
- Same-architecture MoE speed on an M4 Max, using Qwen3.5-35B-A3B at 4-bit: about 41-48 tok/s in Ollama, about 71 in llama.cpp, about 130 in MLX. — [Ante Kapetanovic](https://antekapetanovic.com/blog/qwen3.5-apple-silicon-benchmark/)
- Qwen-Coder bases are the backbone of the leading small text-to-SQL systems. Arctic-Text2SQL-R1 is built on Qwen2.5-Coder, and Qwen2.5-Coder-32B tops the 2026 on-prem BIRD study. This is indirect support for coder models on SQL. — [Snowflake](https://www.snowflake.com/en/blog/engineering/arctic-text2sql-r1-sql-generation-benchmark/); [arXiv 2606.29733](https://arxiv.org/html/2606.29733)

### Inferences

- **Routing role:** qwen3-coder:30b is a sound "fast, no-thinking" local model for SQL and code-adjacent quick answers. A simple fact like Postgres's default port (5432) is trivial for any model of this size.
- **Better default:** Qwen3.6-35B-A3B with `enable_thinking=false` is the stronger choice today. It has the same 3B-active speed class, it is newer (April 2026), and it outscores the Qwen3.5 generation.
- **Caveat on the qwen3.6 alternative:** its Ollama tag needs thinking turned off per request (`think: false`). Otherwise it becomes slow.
- **Long pasted text:** Ollama's default `num_ctx` is much smaller than 256K. Long-text use needs `num_ctx` raised explicitly. This comes from general Ollama knowledge and is not sourced here.

### Gaps

- No BIRD/Spider score for Qwen3-Coder-30B-A3B.
- No long-context QA benchmark (RULER/LongBench) for it.
- No tok/s measurement on a Mac specific to qwen3-coder:30b.

## Which small models are best at fast, reliable JSON classification (for routing)?

### Takeaway

Small models (2-4B) now produce valid JSON almost perfectly, but choosing the right label is the weak point. Every model tested kept a 15-25 point gap between JSON pass rate and value accuracy. For a routing classifier, the best options are:

- qwen3.5:4b / qwen3.5:2b with thinking off, plus Ollama `format` JSON-schema-constrained output. These are 3-4GB and fast.
- A stronger middle tier: qwen3.5:9b, gemma4 E4B, or granite4.2:3b. Granite 4.2 is a reasoning model, so check whether thinking can be turned off.

### Cited Findings

- On a JSON structured-output benchmark of small models:
  - Strict accuracy: Qwen Coder 3B 75.67% (best), Qwen2.5 1.5B 67.10%, Qwen3.5 2B 64.98%, Granite 3.3 2B 64.61%.
  - Format compliance ranged 98-100%. Qwen3.5 2B and Granite 3.3 2B hit 100%.
  - — [arXiv 2607.16202](https://arxiv.org/pdf/2607.16202)
- Across 21 models, "every model produces nearly perfect JSON, yet a sizeable fraction of leaf values... are wrong," with gaps of 15-25 points. — [Structured Output Benchmark, arXiv 2604.25359](https://arxiv.org/html/2604.25359v1)
- Ollama tags:
  - qwen3.5:2b 2.7GB, qwen3.5:4b 3.4GB, qwen3.5:9b 6.6GB — [ollama qwen3.5](https://ollama.com/library/qwen3.5)
  - gemma4 E4B 9.6GB — [ollama gemma4](https://ollama.com/library/gemma4)
  - granite4.2 3B/8B/30B — [ollama search](https://ollama.com/search?o=newest)
  - lfm2.5 8B-A1B — [ollama search](https://ollama.com/search?o=newest)
- Speed: Qwen3.5 9B runs at 82 tok/s and Gemma 4 E4B at 84-161 tok/s on M-series Max chips. — [llmcheck](https://llmcheck.net/benchmarks)
- gpt-oss lists "structured outputs" as a capability, but its reasoning cannot be fully turned off (low/medium/high only). — [ollama gpt-oss](https://ollama.com/library/gpt-oss)

### Inferences

- For routing, latency is dominated by prefill of the prompt plus a few output tokens. A 2-4B non-thinking model with schema-constrained decoding and a few-shot prompt is the practical choice.
- Accuracy should be validated on the app's own labeled prompts, because the value-accuracy gap is the real risk.
- Thinking must be forced off, e.g. `think: false` in Ollama. The Qwen3.5+, Gemma 4 and Granite 4.2 families all default to or support reasoning, which would kill latency.

### Gaps

- There is no direct head-to-head on prompt-classification accuracy for Qwen3.5-4B vs Gemma4-E4B vs Granite4.2-3B vs LFM2.5.
- I could not confirm whether Granite 4.2 and LFM2.5 thinking can be turned off in Ollama.

## Which exist as Ollama tags today vs only as MLX repos?

### Takeaway

Everything recommended above exists as an official Ollama tag. Ollama now publishes `-mlx` variants for Qwen3.5 and Qwen3.6 (and `qwen3.8:27b-mlx`), so choosing between Ollama and MLX no longer means choosing a different distribution.

### Cited Findings

- **Ollama tags checked on 2026-09-26:**
  - `qwen3.6:27b`, `:35b`, `:27b-mlx`, `:35b-mlx` — [link](https://ollama.com/library/qwen3.6)
  - `qwen3.8:27b`, `:27b-mlx` — [link](https://ollama.com/library/qwen3.8)
  - `qwen3.5:{0.8b,2b,4b,9b,27b,35b,122b}` plus MLX variants for 0.8b-35b — [link](https://ollama.com/library/qwen3.5)
  - `qwen3-coder:30b`, `:480b` — [link](https://ollama.com/library/qwen3-coder)
  - `gemma4` E2B/E4B/12B/26B/31B — [link](https://ollama.com/library/gemma4)
  - `gpt-oss:20b`, `:120b` — [link](https://ollama.com/library/gpt-oss)
  - `granite4.2`, `nemotron-3.5-lightning`, `lfm2.5`, `laguna-xs-2.1`, `north-mini-code-1.0` — [link](https://ollama.com/search?o=newest)
- **MLX/HF:** the canonical weights are `Qwen/Qwen3.6-35B-A3B` and `Qwen/Qwen3-Coder-30B-A3B-Instruct` on Hugging Face. — [HF](https://huggingface.co/Qwen/Qwen3.6-35B-A3B); [HF](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct)
- **Runtime speed:** MLX is about 2-3x faster than Ollama Q4_K_M for 35B-A3B MoE on an M4 Max (about 130 vs about 45 tok/s). — [Ante Kapetanovic](https://antekapetanovic.com/blog/qwen3.5-apple-silicon-benchmark/)
- **MLX advantage by size:** one guide says MLX leads by 20-87% under about 14B, and the lead "collapses at 27B+" because memory bandwidth saturates. This is secondary and I did not open it. — [starmorph guide](https://blog.starmorph.com/blog/apple-silicon-llm-inference-optimization-guide)

### Inferences

Prefer the Ollama `-mlx` tags where they exist. They give MLX speed while keeping the Ollama API. Whether Ollama's MLX tags match mlx-lm speed was not measured.

### Gaps

- I did not look up exact mlx-community repo names (e.g. mlx-community/Qwen3.6-35B-A3B-4bit).
- I did not check Ollama pages for GLM-4.7-Flash, Devstral, Phi-4, Ministral 3, SmolLM3 or DeepSeek distills.
