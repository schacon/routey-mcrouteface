# Local model matrix

Which small, fast local models Routey should use, and for what. Written September 2026 from model
cards, public benchmarks, community measurements and Routey's own 80-prompt routing eval
(`pnpm eval:router`). Numbers marked _unverified_ come from a single source or were not measured.
The machine-readable version is `apps/desktop/contracts/local-models.ts`, which seeds the router's
roster and onboarding.

Speed classes assume an M-series Pro/Max at Q4: fast ≥ ~50 tok/s, medium 25–50, slow < 25.
Ollama 0.19+ uses the MLX backend on 32 GB+ Macs, about 15–30% faster than llama.cpp.

## Task → model

| Task                                       | First choice                               | Second choice                                           | Notes                                                                                                            |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Classifying prompts for routing            | **gemma4:e4b-it-qat**                      | qwen3.5:9b, qwen3.5:4b                                  | Routey eval, all correct: 49/50 tuning, 29/30 held-out, ~350 ms. Thinking off, JSON schema output.               |
| Code generation and editing                | **qwen3-coder:30b**                        | qwen3.6:35b (thinking off)                              | qwen3-coder is non-thinking with 3.3B active parameters (~64 tok/s MLX).                                         |
| SQL                                        | **qwen3-coder:30b**                        | qwen3.5:9b                                              | No public BIRD/Spider score for qwen3-coder (_unverified_); execution-guided self-correction helps small models. |
| Shell one-liners                           | **qwen3-coder:30b**                        | qwen3.5:9b                                              |                                                                                                                  |
| Multi-step coding agent                    | **qwen3.6:35b** (SWE-bench Verified 73.4%) | glm-4.7-flash (τ²-Bench 79.5), devstral-small-2 (68.0%) | Escalate large refactors to frontier.                                                                            |
| Quick factual answers                      | **qwen3.5:9b** (thinking off)              | gemma4:12b                                              | Small models invent niche facts; escalate when unsure.                                                           |
| Long pasted text: read, extract, summarize | **qwen3.5:9b** (LongBench v2 55.2)         | gemma4:12b (256K)                                       | gemma4:e4b stops at 128K; qwen3-coder's prose QA is unmeasured.                                                  |
| Writing and rewriting prose                | **gemma4:12b**                             | qwen3.5:9b                                              | Gemma's tone preference is a community view (_unverified_).                                                      |
| Reasoning and math                         | **gpt-oss:20b** (medium effort)            | glm-4.7-flash, qwen3.5:9b with thinking                 | gpt-oss always thinks, which adds latency.                                                                       |
| Images                                     | **qwen3.5:9b**                             | gemma4:e4b / 12b                                        | qwen3-coder, gpt-oss and GLM-flash are text only.                                                                |
| Other languages                            | **qwen3.5:9b** (201 languages)             | gemma4 (140+)                                           |                                                                                                                  |

## Models

| Model (Ollama tag) | Size                                                         | Thinking                         | Speed       | Vision     | Good at                                                   | Weak at                                                |
| ------------------ | ------------------------------------------------------------ | -------------------------------- | ----------- | ---------- | --------------------------------------------------------- | ------------------------------------------------------ |
| gemma4:e4b-it-qat  | 4.5B effective, 6 GB                                         | off unless `<\|think\|>`         | fast        | yes, audio | routing JSON, quick chat, 140+ languages                  | agents (TAU2 42), hard reasoning                       |
| qwen3.5:4b         | 4.7B, 3.4 GB                                                 | toggle (default disputed)        | fast        | yes        | cheap classification, instruction following (IFEval 89.8) | long context, multi-tool calls                         |
| qwen3.5:9b         | 9.7B, 6.6 GB                                                 | toggle                           | fast        | yes        | best under 10B: MMLU-Pro 82.5, GPQA 81.7, 256K context    | deep agentic coding                                    |
| gemma4:12b-it-qat  | 12B, 7.2 GB                                                  | off unless toggled               | medium      | yes        | writing, long documents, MMLU-Pro 77.2                    | 2.5× slower than e4b for routing with no accuracy gain |
| qwen3-coder:30b    | 30.5B / 3.3B active, 18 GB                                   | **never**                        | fast        | no         | code, repository-scale understanding, agent tool use      | general knowledge and prose (not benchmarked)          |
| qwen3.6:35b        | 35B / 3B active, 23 GB                                       | toggle                           | fast        | yes        | agentic coding, SWE-bench Verified 73.4%                  | lower quality with thinking off (_unverified_)         |
| glm-4.7-flash      | 30B / 3B active, 19 GB                                       | reasoning (toggle _unverified_)  | fast        | no         | tool use (τ² 79.5), SWE-bench 59.2, AIME25 91.6           | text only                                              |
| gpt-oss:20b / 120b | 21B / 3.6B and 117B / 5.1B active                            | **always** (low/med/high effort) | medium      | no         | reasoning, math, tools, structured output                 | latency; 120b needs a 96 GB+ Mac                       |
| qwen3.8:27b        | 27B dense, 29 GB                                             | effort levels                    | slow        | yes        | strongest dense ≤35B (SWE-bench Pro 61.7, GPQA 89.2)      | speed; the line has nothing smaller                    |
| devstral-small-2   | 24B dense                                                    | off                              | slow–medium | yes        | multi-file agentic editing (68.0%)                        | dense speed, narrow                                    |
| granite4.1:8b      | 8B, 512K context                                             | off                              | fast        | no         | very long context, structured output                      | reasoning vs Qwen3.5 (_unverified_)                    |
| Superseded         | qwen2.5:7b, llama3.1:8b / 3.2:3b, phi4, deepseek-r1 distills |                                  |             |            |                                                           | Behind 2026 models; the R1 distills always think.      |

Names that do not exist as small models: Qwen3.8 below 27B, a small DeepSeek V4 (V4-Flash is
284B / 13B active), small Llama 4, and "small" Mistral Small 4 (119B / 6B active).

## Decision models

These answer typed questions (choice, score, yes/no) with probabilities instead of generating
text. They are a good fit for "which tier?" or "needs tools?", and a poor fit for zero-shot
"what kind of task is this prompt?".

| Model                                                 | Where it runs                                                                  | Latency                                                           | Strengths                                                                                           | Limits                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Laya** (Apache 2.0; mmBERT 322M or ModernBERT 421M) | on-device; FluidUse runs it on the Neural Engine                               | ~4 ms per question on the ANE, ~20–50 ms for Routey's 8 questions | calibrated probabilities, many questions per pass; fine-tuned typed-decisions score 0.766           | base checkpoints are near chance zero-shot; negation and dict-shaped instructions hurt; Routey eval 19/30 held-out |
| **Jev** (TypeSafe, proprietary)                       | cloud API only (`api.typesafe.ai/v1/systemone`, Vercel AI Gateway, OpenRouter) | ~100 ms (70–500)                                                  | up to 255 options, calibrated, cheap ($0.042 per million input tokens)                              | not local; weak at counting, math and dates; typed-decisions 0.727                                                 |
| GLiClass (ModernBERT)                                 | on-device; FluidUse ANE port                                                   | 1.6–1.8 ms per 2-option decision                                  | zero-shot classification ~50× faster than cross-encoders; used as a model-router scorer in research | not yet measured on Routey's eval                                                                                  |

**What Routey does:** the classifier defaults to the best installed local model (gemma4:e4b-it-qat,
then qwen3.5:9b, qwen3.5:4b, gemma4:12b). Laya plus keyword cues is the fast fallback when no local
model is available or the model is slow. Fine-tuning Laya on Routey's routing labels, and measuring
GLiClass, are the most promising ways to get millisecond classification back.

## On this Mac (128 GB, checked 2026-09-25)

| Installed                    | Role in Routey                                      |
| ---------------------------- | --------------------------------------------------- |
| gemma4:e4b-it-qat            | prompt classifier (automatic choice)                |
| qwen3.5:9b, qwen3.5:9b-cap8k | quick facts, long text, images; classifier fallback |
| qwen3.5:4b, qwen3.5:4b-cap8k | small classifier fallback                           |
| gemma4:12b-it-qat            | writing, long documents                             |
| qwen3-coder:30b              | code, SQL, shell one-liners                         |
| glm-4.7-flash                | agentic coding and tool use                         |
| gpt-oss:120b                 | local reasoning and math                            |
| qwen3.5:35b-mlx              | general and reasoning (35B-A3B)                     |
| qwen3.8:27b variants         | hard local work, slow                               |
| qwen2.5:7b, qwen2.5:7b-cap8k | superseded                                          |
| muse-glimmer:30b-mlx         | not in the catalog                                  |

Not installed and worth considering: qwen3.6:35b (local coding agent), gpt-oss:20b (faster
reasoning than 120b).

## Sources

Qwen3.5 model card and Unsloth notes (huggingface.co/Qwen/Qwen3.5-9B, unsloth.ai/docs/models/qwen3.5);
Qwen3.6-35B-A3B card; Qwen3-Coder-30B-A3B card; Gemma 4 model card and QAT announcement
(ai.google.dev/gemma/docs/core/model_card_4); GLM-4.7-Flash (ollama.com/library/glm-4.7-flash);
gpt-oss (openai.com/index/introducing-gpt-oss); Devstral Small 2 card; Granite 4.1; DeepSeek-V4-Flash
card; small-model text-to-SQL results (arxiv.org/pdf/2511.04153, arxiv.org/html/2606.29733); MLX vs
llama.cpp benchmarks (willitrunai.com); Laya (github.com/NandhaKishorM/laya); FluidUse
(github.com/FluidInference/FluidUse); Jev (typesafe.ai/blog/introducing-system-one-models-and-jev,
docs.typesafe.ai); GLiClass (docs.knowledgator.com); zero-shot IE bench
(github.com/umstek/zero-shot-ie-bench); SCX router (arxiv.org/pdf/2609.02292).
