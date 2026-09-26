# Hosted & Frontier Text Models for a Model Router (as of 2026-09-26)

Primary source for all ids, dates, context, prices, modalities and reasoning flags: the live OpenRouter models API, fetched 2026-09-26 — [OpenRouter models API](https://openrouter.ai/api/v1/models) (458 models listed). "Date" is OpenRouter's `created` timestamp, which is when OpenRouter added the model and usually matches vendor launch day. "R" means `reasoning` is in `supported_parameters`. Prices are USD per 1M tokens, input/output. Every listed model outputs text only unless marked otherwise. Most have a `:batch` variant at about 50% of the price. The OpenRouter API truncates model descriptions (they end in "..."), so the "best at" notes combine the API description with the vendor or benchmark sources cited.

## What are the current Claude family models and their OpenRouter ids?

### Takeaway

Anthropic's current lineup on OpenRouter has four tiers: **Claude Opus 5.5** (`anthropic/claude-opus-5.5`, released 2026-09-22, $4/$20), the current #1 on the Artificial Analysis Intelligence Index; **Claude Fable 5.1** (`anthropic/claude-fable-5.1`, released 2026-09-01, $10/$50), the "Mythos-class" top tier; **Claude Sonnet 5** (`anthropic/claude-sonnet-5`, released 2026-06-30, $2/$10); and **Claude Haiku 4.5** (`anthropic/claude-haiku-4.5`, $1/$5). OpenRouter lists no Haiku 5 and no Mythos model.

### Cited Findings

| OpenRouter id                 | Date       | Context                     | $ in/out | Input modalities  | R   | Notes                                                                       |
| ----------------------------- | ---------- | --------------------------- | -------- | ----------------- | --- | --------------------------------------------------------------------------- |
| `anthropic/claude-opus-5.5`   | 2026-09-22 | 1,000,000 (128k max output) | 4 / 20   | text, image, file | R   | Successor to Opus 5. Strong at multi-step changes in large codebases        |
| `anthropic/claude-fable-5.1`  | 2026-09-01 | 1,000,000 (128k out)        | 10 / 50  | text, image, file | R   | Biggest gains in agentic coding, long-running workflows and knowledge work  |
| `anthropic/claude-fable-5`    | 2026-06-09 | 1,000,000                   | 10 / 50  | text, image, file | R   | Described as "Mythos-class", built for autonomous knowledge work and coding |
| `anthropic/claude-opus-5`     | 2026-07-24 | 1,000,000                   | 5 / 25   | text, image, file | R   | Previous Opus                                                               |
| `anthropic/claude-sonnet-5`   | 2026-06-30 | 1,000,000 (128k out)        | 2 / 10   | text, image, file | R   | Adaptive thinking with selectable effort (low/medium/high/max)              |
| `anthropic/claude-opus-4.8`   | 2026-05-27 | 1,000,000                   | 5 / 25   | text, image, file | R   | Legacy                                                                      |
| `anthropic/claude-sonnet-4.6` | 2026-02-17 | 1,000,000                   | 3 / 15   | text, image, file | R   | Legacy. More expensive than Sonnet 5                                        |
| `anthropic/claude-haiku-4.5`  | 2025-10-15 | 200,000                     | 1 / 5    | text, image, file | R   | Newest Haiku on OpenRouter                                                  |

- Sources for the table: [OpenRouter models API](https://openrouter.ai/api/v1/models).
- OpenRouter also has alias ids that always point at the newest model in a family: `~anthropic/claude-opus-latest`, `~anthropic/claude-sonnet-latest`, `~anthropic/claude-fable-latest` and `~anthropic/claude-haiku-latest`. `~anthropic/claude-haiku-latest` lists a 200k context at $1/$5, which matches Haiku 4.5 — [OpenRouter models API](https://openrouter.ai/api/v1/models).
- **Fable and Mythos:** Claude Fable 5.1 and Claude Mythos 5.1 are the same model with different safeguards. Fable 5.1 is generally available. Mythos 5.1 is only available through Anthropic's trusted access programs, for cybersecurity and life-sciences work. The first-party API id is `claude-fable-5-1`. Anthropic says Fable 5.1 costs about 25% less than Fable 5 on typical workloads, and up to 45% less on agentic work, because cache reads are cheaper — [Anthropic](https://www.anthropic.com/claude-fable-and-mythos-5-1); [Thurrott](https://www.thurrott.com/a-i/anthropic/340951/anthropic-releases-claude-fable-5-1-and-mythos-5-1); [VentureBeat](https://venturebeat.com/technology/anthropics-claude-fable-5-1-and-mythos-5-1-arrive-with-a-75-cost-reduction-for-fable-cache-reads)
- **Opus 5.5 scores and pricing (Artificial Analysis):**
  - At max effort, Opus 5.5 scores 58 on the Artificial Analysis Intelligence Index, the highest measured. GPT-6 Astra (max) scores 53.
  - It leads on Humanity's Last Exam (61.4%; previous best was Fable 5.1 at 59.1%) and SciCode (66.9%).
  - It scores 59.6% on Terminal-Bench 4.0, level with GPT-6 Astra.
  - It has GDPval-AA v2.1 Elo 1846 and AA-Briefcase Elo 1822.
  - Price is $4/$20, down from Opus 5's $5/$25. Cache reads are $0.20.
  - It uses about 119k output tokens per Index task, versus 73k for Opus 5 and 27k for GPT-6 Astra.

  Sources: [Artificial Analysis](https://artificialanalysis.ai/articles/claude-opus-5-5); [AA on X](https://x.com/ArtificialAnlys/status/2102438210798514391)

- **SWE-bench Verified (aggregator):** Claude Opus 5 96%, Claude Mythos 5 95.5%, Claude Fable 5 95%, Opus 4.8 88.6%, Sonnet 5 85.2% — [BenchLM](https://benchlm.ai/benchmarks/swe-bench-verified). BenchLM also notes the benchmark is saturated, with frontier models clustered in the mid-90s — [BenchLM](https://benchlm.ai/benchmarks/swe-bench-verified).
- **Creative writing:** Claude Opus 5 leads the EQ-Bench Creative Writing board (Elo 2121). Kimi K3 is second (2071) and GPT-5.6 Sol third (1963). Claude Fable 5 leads the overall LMArena Text board (1506). These come from search-result snippets that I did not verify on the primary pages — [llm-stats Creative Writing](https://llm-stats.com/benchmarks/creative-writing-v3); [arena.ai creative writing](https://arena.ai/leaderboard/text/creative-writing)

### Inferences

- Opus 5.5 is cheaper than Fable 5.1 ($4/$20 vs $10/$50) and scores higher on the AA Index. That probably makes it the default top-tier Anthropic model for a router. Fable 5.1 remains a premium option for long agentic coding.
- Sonnet 5 at $2/$10 is the Anthropic "workhorse". Haiku 4.5 is old (Oct 2025) and is poor value next to GPT-6 Luna, Gemini Flash-Lite and DeepSeek Flash.
- Opus 5.5 is token-hungry at max effort, so a router should set `reasoning_effort` per task.

### Gaps

- I found no source saying a Claude Haiku 5 exists. OpenRouter lists none.
- I found no independent SWE-bench Verified figure for Opus 5.5 or Fable 5.1. BenchLM's figures above are aggregator numbers, and the mid-90s scores are unusually high. Treat them with caution.

## What are the current OpenAI GPT-5.x/GPT-6 models (Luna, Sol, Terra, Astra) and their OpenRouter ids?

### Takeaway

OpenAI now names its tiers **Astra** (flagship), **Sol** (cost-efficient high end), **Terra** (balanced, GPT-5.6 only so far) and **Luna** (fast and cheap). The GPT-6 generation has Astra (2026-09-04/09) and Sol and Luna (2026-09-22). Each tier has a "-pro" id that is the same model with `reasoning.mode=pro`. "Luna", "Sol", "Terra" and "Astra" are confirmed as real names. There is no GPT-6 Terra yet.

### Cited Findings

| OpenRouter id                                 | Date       | Context              | $ in/out                    | Input modalities  | R   | Notes                                                                            |
| --------------------------------------------- | ---------- | -------------------- | --------------------------- | ----------------- | --- | -------------------------------------------------------------------------------- |
| `openai/gpt-6-astra`                          | 2026-09-04 | 1,050,000 (128k out) | 10 / 50                     | text, image, file | R   | Flagship for analysis, software engineering, deep research and long-horizon work |
| `openai/gpt-6-astra-pro`                      | 2026-09-04 | 1,050,000            | 10 / 50                     | text, image, file | R   | Same model with `reasoning.mode=pro`                                             |
| `openai/gpt-6-sol`                            | 2026-09-22 | 1,050,000            | 2 / 10                      | text, image, file | R   | Cost-efficient high end, below Astra                                             |
| `openai/gpt-6-sol-pro`                        | 2026-09-22 | 1,050,000            | 2 / 10                      | text, image, file | R   | Pro reasoning mode                                                               |
| `openai/gpt-6-luna`                           | 2026-09-22 | 1,050,000            | 0.10 / 0.50                 | text, image, file | R   | Fast and cheap: chat, classification, light agentic work                         |
| `openai/gpt-6-luna-pro`                       | 2026-09-22 | 1,050,000            | 0.10 / 0.50                 | text, image, file | R   | Pro reasoning mode                                                               |
| `openai/gpt-5.6-sol`                          | 2026-07-09 | 1,050,000            | 2 / 10 (see conflict below) | text, image, file | R   | Previous generation                                                              |
| `openai/gpt-5.6-terra`                        | 2026-07-09 | 1,050,000            | 2 / 12                      | text, image, file | R   | "Balanced", between Sol and Luna                                                 |
| `openai/gpt-5.6-luna`                         | 2026-07-09 | 1,050,000            | 0.20 / 1.20                 | text, image, file | R   | Previous generation                                                              |
| `openai/gpt-5.5` / `openai/gpt-5.5-pro`       | 2026-04-24 | 1,050,000            | 5/30 ; 30/180               | text, image, file | R   | Legacy                                                                           |
| `openai/gpt-5.4-mini` / `openai/gpt-5.4-nano` | 2026-03-17 | 400,000              | 0.75/4.5 ; 0.20/1.25        | text, image, file | R   | Legacy small models                                                              |
| `openai/gpt-5.3-codex`                        | 2026-02-24 | 400,000              | 1.75 / 14                   | text, image, file | R   | Legacy coding model                                                              |
| `openai/gpt-chat-latest`                      | 2026-05-05 | 400,000              | 5 / 30                      | text, image, file | –   | Alias for the ChatGPT "Instant" model. No reasoning parameter                    |

- Sources for the table: [OpenRouter models API](https://openrouter.ai/api/v1/models). Alias ids: `~openai/gpt-astra-latest`, `~openai/gpt-sol-latest`, `~openai/gpt-terra-latest`, `~openai/gpt-luna-latest` and `~openai/gpt-mini-latest`.
- **Launch coverage:** OpenAI released GPT-6 Sol and Luna on 2026-09-22 to sit alongside GPT-6 Astra, which launched earlier in September. Sol is for everyday work. Luna is cheaper and optimized for speed and volume. Sol costs $2/$10 and Luna $0.10/$0.50. Coverage cites prior GPT-5.6 prices of $4/$20 (Sol) and $0.20/$1.20 (Luna). OpenAI says Sol makes about half as many factual mistakes as its predecessor — [TechCrunch](https://techcrunch.com/2026/09/22/openai-launches-gpt-6-sol-and-luna/); [OpenAI](https://openai.com/index/introducing-gpt-6-sol-and-luna/) (the OpenAI page returned 403, so I used the snippet); [The New Stack](https://thenewstack.io/openai-gpt-6-sol-luna-release/)
- **GPT-6 Astra (Artificial Analysis):**
  - Released 2026-09-09.
  - Intelligence Index 53, tied with Fable 5.1. Coding Agent Index 62, tied with Fable 5.1 (Opus 5 is 60, GPT-5.6 Sol 55).
  - Terminal-Bench v4.0: 59%. Fable 5.1 scores 52% and GPT-5.6 Sol 40%.
  - About 27k output tokens per task, and about 40% of Fable 5.1's cost per task ($3.26 vs $7.63).
  - Hallucination rate is half of GPT-5.6 Sol's (51% vs 92%).
  - Priced at $10/$50 with a 90% cache-read discount.

  Source: [Artificial Analysis](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra)

- **Terminal-Bench 2.0:** GPT-5.5 leads with 82.7% among 53 models. Terminal-Bench 2.0 is older than the 4.0 version cited above — [llm-stats Terminal-Bench 2.0](https://llm-stats.com/benchmarks/terminal-bench-2)
- **Conflict (GPT-5.6 Sol price):** OpenRouter lists `openai/gpt-5.6-sol` at $2/$10. TechCrunch says GPT-5.6 Sol cost $4/$20, and Artificial Analysis says Astra's $10/$50 is 2.5× GPT-5.6 Sol, which also implies $4/$20. Either OpenRouter's listing was repriced or it is wrong. [OpenRouter API](https://openrouter.ai/api/v1/models) vs [TechCrunch](https://techcrunch.com/2026/09/22/openai-launches-gpt-6-sol-and-luna/)
- **Conflict (Astra date):** OpenRouter's `created` date is 2026-09-04, while Artificial Analysis gives 2026-09-09 as the release date.

### Inferences

- Router mapping: Luna for cheap/fast tasks, Sol for the mid tier, Astra for frontier work. Prefer the `-pro` variants for hard reasoning tasks (same price per token, but more tokens).
- GPT-6 Sol costs the same as Claude Sonnet 5 ($2/$10).
- GPT-6 Luna at $0.10/$0.50 with a 1.05M context is one of the best-value 1M-context hosted models.

### Gaps

- I did not get first-party SWE-bench, Terminal-Bench or other benchmark numbers for GPT-6 Sol or Luna, because the OpenAI page returned 403.
- It is unclear whether OpenAI will ship a GPT-6 Terra.
- The difference between `-pro` and the base model is only documented as "reasoning.mode=pro". I found no numbers on how much latency or cost it adds.

## What are the current Gemini, Grok, DeepSeek, Qwen, Kimi, GLM and Mistral models and ids?

### Takeaway

- **Gemini:** Google's newest models are Flash models. Gemini 3.8 Flash ($0.75/$3.75) and Gemini 3.5 Flash-Lite ($0.30/$2.50) are current. The Pro flagship is still `google/gemini-3.1-pro-preview` (February 2026). Gemini 3.5 Pro has not shipped.
- **Grok:** Grok 4.7 (2026-09-21) is the xAI flagship. The vendor is now branded "SpaceXAI". There is no Grok 5.
- **Chinese open-weight models:** these offer the best value. DeepSeek V4.1 Flash, V4 Pro 0813, Qwen3.8 Max, Kimi K3 and GLM-5.3 all have roughly 1M context.
- **Mistral:** Mistral lags. Its newest model is Medium 3.5 (April 2026).

### Cited Findings

| OpenRouter id                                          | Date              | Context             | $ in/out                   | Input modalities                | R   | Notes                                                                            |
| ------------------------------------------------------ | ----------------- | ------------------- | -------------------------- | ------------------------------- | --- | -------------------------------------------------------------------------------- |
| `google/gemini-3.8-flash`                              | 2026-09-02        | 1,048,576 (65k out) | 0.75 / 3.75                | text, image, video, file, audio | R   | Google's most capable Flash, with gains in software engineering and agentic work |
| `google/gemini-3.7-flash`                              | 2026-08-13        | 1,048,576           | 0.75 / 3.75                | text, image, video, file, audio | R   | Google recommends it for efficiency-first work                                   |
| `google/gemini-3.5-flash-lite`                         | 2026-07-21        | 1,048,576           | 0.30 / 2.50                | text, image, video, file, audio | R   | Built for subagents                                                              |
| `google/gemini-3.1-flash-lite`                         | 2026-05-07        | 1,048,576           | 0.25 / 1.50                | text, image, video, file, audio | R   | Cheapest Gemini                                                                  |
| `google/gemini-3.5-flash`                              | 2026-05-19        | 1,048,576           | 1.50 / 9.00                | text, image, video, file, audio | R   | Pricier than 3.8 Flash. Superseded                                               |
| `google/gemini-3.1-pro-preview`                        | 2026-02-19        | 1,048,576           | 2 / 12                     | text, image, video, file, audio | R   | Current Pro. A `-customtools` variant also exists                                |
| `x-ai/grok-4.7`                                        | 2026-09-21        | 500,000 (450k out)  | 1.60 / 4.80 (see conflict) | text, image, file               | R   | Flagship for coding and agentic work. Checks its own work                        |
| `x-ai/grok-4.3`                                        | 2026-05-01        | 1,000,000           | 1.25 / 2.50                | text, image, file               | R   |                                                                                  |
| `x-ai/grok-4.20` / `x-ai/grok-4.20-multi-agent`        | 2026-03-31        | 2,000,000           | 1.25 / 2.50                | text, image, file               | R   | Largest context on the list                                                      |
| `x-ai/grok-build-0.1`                                  | 2026-05-20        | 256,000             | 1 / 2                      | text, image, file               | R   | Fast model for agentic coding                                                    |
| `deepseek/deepseek-v4.1-flash`                         | 2026-09-10        | 1,048,576           | 0.30 / 1.20                | text, image                     | R   | Sparse MoE, 8–16B active                                                         |
| `deepseek/deepseek-v4-flash`                           | 2026-04-24        | 1,048,576           | 0.047 / 0.094              | text                            | R   | Extremely cheap                                                                  |
| `deepseek/deepseek-v4-flash-0731`                      | 2026-07-31        | 1,310,720           | 0.021 / 0.32               | text                            | R   |                                                                                  |
| `deepseek/deepseek-v4-pro-0813`                        | 2026-08-12        | 1,048,576           | 0.264 / 0.792              | text                            | R   | V4 Pro general-availability release                                              |
| `qwen/qwen3.8-max-0902`                                | 2026-09-03        | 1,000,000           | 2 / 6                      | text, image, video              | R   | 2.4T MoE                                                                         |
| `qwen/qwen3.8-max-prime`                               | 2026-09-23        | 1,000,000           | 4 / 12                     | text, image, video              | R   | Higher-throughput version of the same model                                      |
| `qwen/qwen3.8-flash`                                   | 2026-08-26        | 1,000,000           | 0.15 / 0.47                | text, image, video              | R   |                                                                                  |
| `qwen/qwen3.7-flash`                                   | 2026-07-28        | 1,000,000           | 0.03 / 0.13                | text, image, video              | R   |                                                                                  |
| `moonshotai/kimi-k3`                                   | 2026-07-16        | 1,048,576           | 3 / 15                     | text, image, video              | R   | 2.8T open-weight. Complex coding and agentic work                                |
| `moonshotai/kimi-k2.7-code`                            | 2026-06-12        | 262,144             | 0.656 / 3.30               | text, image                     | R   |                                                                                  |
| `z-ai/glm-5.3`                                         | 2026-08-18        | 1,310,720           | 0.379 / 1.192              | text                            | R   | Software engineering and long-horizon agents                                     |
| `z-ai/glm-5.3-prime`                                   | 2026-09-23        | 1,000,000           | 2.80 / 8.80                | text                            | R   | 1.5–2× throughput                                                                |
| `z-ai/glm-5.3-flash`                                   | 2026-08-26        | 1,310,720           | 0.04 / 0.50                | text, image, video              | R   |                                                                                  |
| `z-ai/glm-5.3-flashx`                                  | 2026-09-18        | 1,048,576           | 0.37 / 1.25                | text, image, video              | R   |                                                                                  |
| `minimax/minimax-m3`                                   | 2026-05-31        | 1,048,576           | 0.30 / 1.20                | text, image, video              | R   |                                                                                  |
| `xiaomi/mimo-v2.6-pro` / `xiaomi/mimo-v2.6-flash`      | 2026-09-21        | ~1,050,000          | 0.435/0.87 ; 0.14/0.28     | text, image, video, audio       | R   |                                                                                  |
| `mistralai/mistral-medium-3-5`                         | 2026-04-30        | 262,144             | 1.50 / 7.50                | text, image, file               | R   | Dense 128B model                                                                 |
| `mistralai/mistral-small-2603`                         | 2026-03-16        | 262,144             | 0.15 / 0.60                | text, image                     | R   |                                                                                  |
| `mistralai/mistral-large-2512`                         | 2025-12-01        | 262,144             | 0.50 / 1.50                | text, image, file               | –   |                                                                                  |
| `mistralai/devstral-2512` / `mistralai/codestral-2508` | 2025-12 / 2025-08 | 262k / 256k         | 0.40/2.00 ; 0.30/0.90      | text, file                      | –   | Coding                                                                           |

- Sources for the table: [OpenRouter models API](https://openrouter.ai/api/v1/models). Alias ids: `~google/gemini-pro-latest`, `~google/gemini-flash-latest`, `~x-ai/grok-latest`, `~deepseek/deepseek-pro-latest`, `~deepseek/deepseek-flash-latest`, `~moonshotai/kimi-latest`, `~z-ai/glm-latest` and `~z-ai/glm-flash-latest`.
- **Gemini 3.8 Flash:**
  - Launched 2026-09-02 at $0.75/$3.75, the same price as 3.7 Flash. Both prices double on 2027-01-01.
  - Built on 3.7 Flash and spends more thinking tokens. Google recommends staying on 3.7 Flash for efficiency-first workloads.
  - Beats Claude Opus 5 on three of the benchmarks Google published.

  Sources: [eesel](https://www.eesel.ai/blog/gemini-3-8-flash); [9to5Google](https://9to5google.com/2026/09/02/gemini-3-8-flash-launch/)

- As of September 2026, Gemini 3.5 Pro has not shipped. Google said on 2026-07-21 that it is "testing with partners". The current Pro is Gemini 3.1 Pro, and there is no 3.8 Pro — [Codersera](https://codersera.com/blog/gemini-3-5-pro-launch-guide-2026/); [QCode](https://qcode.cc/en/gemini-3-5-pro-guide)
- **Grok 4.7:**
  - Released 2026-09-21 with 2.1T parameters.
  - Scores: CursorBench 4.0 46.3%, DeepSWE v1.1 71.0%, Terminal-Bench 4.0 38.0%, AA-Briefcase 1657.
  - Fable 5.1 still leads on 4 of 7 of the benchmarks xAI published.
  - Announced price is $2/$6.

  Sources: [x.ai](https://x.ai/news/grok-4-7); [MarkTechPost](https://www.marktechpost.com/2026/09/21/spacexai-releases-grok-4-7/); [OfficeChai](https://officechai.com/ai/grok-4-7-benchmarks/)

- Artificial Analysis gives Grok 4.7 an Intelligence Index of 46 — [Artificial Analysis](https://artificialanalysis.ai/articles/claude-opus-5-5)
- **Conflict (Grok 4.7 price):** OpenRouter lists $1.60/$4.80, but the vendor announced $2/$6. OpenRouter may be showing a promotional or cheaper provider price.
- **Open-weight models on the AA Intelligence Index (checked 2026-09-08):** GLM-5.3 (max effort) 45, Kimi K3 44, GLM-5.3-Flash 42, Qwen3.8-2.4T-A95B 40, DeepSeek V4 Pro 0813 36 — [Morph / aggregator](https://www.morphllm.com/best-open-source-llm) (via search snippet)
- **Kimi K3:** Terminal-Bench 2.1 88.3. SWE-bench Verified 93.4% on Vals AI's harness. #1 on Arena Frontend Code Arena — [Morph](https://www.morphllm.com/best-open-source-coding-model-2026) (search snippet, unverified)
- **DeepSeek V4.1 Flash:** released 2026-09-10 under the MIT license. Reports Terminal-Bench 2.1 90.6 and DeepSWE 74.2. These are vendor-reported and unverified — same source.
- **SWE-bench Verified (BenchLM):** DeepSeek V4 Pro 0813 80.6%, MiniMax M3 80.5%, Qwen3.7 Max 80.4%, Kimi K2.6 80.2%, DeepSeek V4 Flash 0731 79% — [BenchLM](https://benchlm.ai/benchmarks/swe-bench-verified)

### Inferences

- Terminal-Bench 2.1 scores near 90 for the open models are not comparable to Terminal-Bench 4.0 scores near 59 for the frontier models. These are different benchmark versions, so do not rank across them.
- For a 1M context at very low cost, the candidates are DeepSeek V4 Flash ($0.047/$0.094), GLM-5.3-Flash ($0.04/$0.50), Qwen3.7-Flash ($0.03/$0.13) and GPT-6 Luna ($0.10/$0.50).
- The Mistral models are not competitive for general routing. They may still suit EU-residency needs.

### Gaps

- Is there a Grok 5? I found no evidence of one.
- There is no DeepSeek V4.1 Pro. The Pro line is still at V4 Pro 0813.
- I found no authoritative Qwen3.8 Max benchmarks.
- Mistral: I did not check for anything newer than Medium 3.5 outside OpenRouter.

## Which models are best value for fast/cheap hosted use versus frontier, and which are best for each task?

### Takeaway

**Fast/cheap tier:** GPT-6 Luna, Gemini 3.5 Flash-Lite / 3.7 Flash, DeepSeek V4.1 Flash / V4 Flash, Qwen3.8 Flash and GLM-5.3-Flash.

**Mid tier:** Claude Sonnet 5, GPT-6 Sol, Gemini 3.8 Flash, Grok 4.7, GLM-5.3 and DeepSeek V4 Pro.

**Frontier tier:** Claude Opus 5.5 (tops the AA Index at 58), GPT-6 Astra (53, most token-efficient), Claude Fable 5.1 (53, premium price) and Kimi K3 / Qwen3.8 Max (open-weight frontier).

### Cited Findings

- Scores and token use:
  - Opus 5.5 scores 58 on the AA Index. GPT-6 Astra and Fable 5.1 score 53, and Grok 4.7 scores 46 — [Artificial Analysis](https://artificialanalysis.ai/articles/claude-opus-5-5); [AA Astra](https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra)
  - Astra uses about 27k tokens per task, against 78k for Fable 5.1 and 119k for Opus 5.5 — same sources.
- OpenRouter web search (`:online` suffix or `plugins:[{id:"web"}]`):
  - Native search is the default for OpenAI, Anthropic, Google, Perplexity and SpaceXAI (xAI) models.
  - Exa is the fallback for other models, at $0.007 per request for up to 10 results.
  - Other engines: Parallel ($0.001–0.005), Perplexity ($0.005) and Firecrawl (bring your own key).
  - Parameters: `max_results` (default 5), `search_context_size`, `include_domains`/`exclude_domains` and `engine`.

  Source: [OpenRouter web search docs](https://openrouter.ai/docs/guides/features/plugins/web-search)

- Perplexity models on OpenRouter are all dated 2025:
  - `perplexity/sonar`: $1/$1, 127k context
  - `perplexity/sonar-pro`: $3/$15, 200k
  - `perplexity/sonar-pro-search`: $3/$15, 200k
  - `perplexity/sonar-reasoning-pro`: $2/$8, 128k
  - `perplexity/sonar-deep-research`: $2/$8, 128k

  OpenRouter also has `openrouter/fusion`, a panel of several models that runs with web search and fetch enabled — [OpenRouter models API](https://openrouter.ai/api/v1/models)

- OpenRouter's own routers: `openrouter/auto`, and `openrouter/pareto-code`, which ranks coding models by Artificial Analysis coding percentile using a `min_coding_score` setting — [OpenRouter models API](https://openrouter.ai/api/v1/models)

### Inferences — task → best 1–3 hosted models (my synthesis from the findings above; not a single sourced ranking)

| Task                                                 | Cheap/fast pick                                                                          | Best-quality picks                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| General chat / quick facts                           | `openai/gpt-6-luna`, `google/gemini-3.7-flash`                                           | `openai/gpt-6-sol` (Sol halves factual errors vs GPT-5.6), `anthropic/claude-sonnet-5`                                                 |
| Code generation / editing                            | `deepseek/deepseek-v4.1-flash`, `z-ai/glm-5.3-flash`                                     | `anthropic/claude-sonnet-5`, `openai/gpt-6-sol`, `google/gemini-3.8-flash`                                                             |
| SQL                                                  | `openai/gpt-6-luna`, `deepseek/deepseek-v4.1-flash`                                      | `openai/gpt-6-sol`, `anthropic/claude-sonnet-5` (no SQL-specific benchmark found)                                                      |
| Shell                                                | `deepseek/deepseek-v4.1-flash` (TB 2.1 90.6, vendor-reported), `x-ai/grok-build-0.1`     | `openai/gpt-6-astra` (TB 4.0 59%), `anthropic/claude-opus-5.5` (TB 4.0 59.6%)                                                          |
| Agentic multi-step coding (SWE-bench/Terminal-Bench) | `z-ai/glm-5.3`, `moonshotai/kimi-k3`                                                     | `anthropic/claude-opus-5.5`, `openai/gpt-6-astra` (Coding Agent Index 62), `anthropic/claude-fable-5.1`                                |
| Long-context reading (1M)                            | `openai/gpt-6-luna` (1.05M), `google/gemini-3.5-flash-lite` (1M, audio/video/file input) | `google/gemini-3.1-pro-preview`, `anthropic/claude-opus-5.5`, `x-ai/grok-4.20` (2M)                                                    |
| Writing / prose                                      | `moonshotai/kimi-k3` (#2 in EQ-Bench creative writing)                                   | `anthropic/claude-opus-5.5` / `anthropic/claude-opus-5` (#1 EQ-Bench), `anthropic/claude-fable-5.1`                                    |
| Reasoning / math                                     | `openai/gpt-6-luna-pro`, `deepseek/deepseek-v4-pro-0813`                                 | `anthropic/claude-opus-5.5` (HLE 61.4%), `openai/gpt-6-astra-pro`, `openai/gpt-6-sol-pro`                                              |
| Research with web search                             | `perplexity/sonar`, `<cheap model>:online` (Exa)                                         | `perplexity/sonar-pro-search` / `sonar-deep-research`, `openai/gpt-6-sol:online` or `anthropic/claude-sonnet-5:online` (native search) |
| Translation                                          | `google/gemini-3.7-flash`, `qwen/qwen3.8-flash`                                          | `openai/gpt-6-sol`, `anthropic/claude-sonnet-5` (no translation benchmark found)                                                       |
| Structured extraction                                | `openai/gpt-6-luna`, `google/gemini-3.5-flash-lite` (both support `structured_outputs`)  | `openai/gpt-6-sol`, `anthropic/claude-sonnet-5`                                                                                        |

- The frontier Claude and OpenAI models spend many reasoning tokens. Routers should pass `reasoning_effort` (all of them support it) and start at low or medium effort for simple tasks.
- `structured_outputs` is supported by nearly every current model. The exception is `z-ai/glm-5.3-prime`, which does not list it in its supported parameters.
- On OpenRouter, `anthropic/claude-fable-5`, `anthropic/claude-fable-5.1` and `anthropic/claude-sonnet-5` do not list `temperature` as a supported parameter. Among the current Claude models, only `anthropic/claude-opus-5` and `anthropic/claude-opus-5.5` list it. A router should not send `temperature` to the others.

### Gaps

- I found no reliable task-specific benchmarks for SQL, translation or structured extraction for the September 2026 models, so those rows are inferred.
- Terminal-Bench scores span versions 2.0, 2.1 and 4.0, which makes cross-vendor comparison unreliable.
- I could not reach the LMArena primary pages. The writing and chat rankings come from search snippets.
- The Perplexity Sonar models on OpenRouter have 2025 dates. I could not verify whether newer Sonar versions exist outside OpenRouter.
- Latency and throughput (tokens/s) were not collected.
