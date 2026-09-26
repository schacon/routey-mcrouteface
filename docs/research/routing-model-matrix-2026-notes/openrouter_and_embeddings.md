# OpenRouter Integration Surface and Embedding/Reranking Models (as of 2026-09-26)

Method note: OpenRouter facts come from the live docs (fetched as `.md` via `https://openrouter.ai/docs/llms.txt`, which includes the OpenAPI YAML) and from unauthenticated calls to the public API on 2026-09-26. Model scores come from model cards and papers. "Unverified" marks anything not confirmed against a primary source.

## Exact OpenRouter PKCE flow and endpoints; any restrictions on localhost callbacks?

### Takeaway

An Electron app opens `https://openrouter.ai/auth?callback_url=http://localhost:<port>/callback&code_challenge=<b64url(sha256(verifier))>&code_challenge_method=S256` in the browser. It receives `?code=...` on the loopback server, then sends `POST https://openrouter.ai/api/v1/auth/keys` with `{code, code_verifier, code_challenge_method}` and gets back `{key, user_id}`. No client secret or app registration is needed. Localhost and 127.0.0.1 callbacks are allowed on any port. The only restriction is attribution: a localhost app gets a fixed title such as `localhost:51423` and does not appear in rankings or the marketplace.

### Cited Findings

**Step 1: auth URL**

- Formats: `https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256`. `plain` is also accepted, and so is a bare `?callback_url=`. "The `code_challenge` parameter is optional but recommended." — [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- S256 challenge: the docs example computes `Buffer.from(sha256(verifier)).toString('base64url')`, so the encoding is base64url. — [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Optional URL parameters:
  - `key_label` prefills the label of the new key.
  - `workspace_id` preselects a workspace (UUID).
  - `required_workspace_id` locks the key to one workspace and takes precedence over `workspace_id`.
  - Source: [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Localhost: "Localhost callbacks are supported on **any port**. This is useful for CLI tools and local-first apps that bind to an arbitrary free OS port for the OAuth callback (e.g. `http://localhost:51423/callback`)." Also: "Localhost apps are assigned a fixed title matching the host and port (e.g. `localhost:3000`) but will not appear in the OpenRouter marketplace or rankings." — [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- The API schema for `callback_url` says: "Supports https URLs and localhost/127.0.0.1 URLs on any port for local CLI tools." — [Create authorization code (OpenAPI)](https://openrouter.ai/docs/api/api-reference/oauth/create-authorization-code.md)
- Headless mode: omit `callback_url`, as in `https://openrouter.ai/auth?code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256&key_label=<YOUR_APP_NAME>`. The page then shows the code on screen for the user to paste into the app. `code_challenge` is **required** in this mode. — [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)

**Step 2: key exchange**

- Endpoint: `POST https://openrouter.ai/api/v1/auth/keys` with `Content-Type: application/json`. — [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Request body:
  - `code` (string, required)
  - `code_verifier` (string, sent if a challenge was used)
  - `code_challenge_method` (enum `S256` | `plain` | null)
  - Example: `{"code":"auth_code_abc123def456","code_challenge_method":"S256","code_verifier":"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"}`
  - Source: [Exchange authorization code for API key (OpenAPI)](https://openrouter.ai/docs/api/api-reference/oauth/exchange-authorization-code-for-api-key.md)
- 200 response: `{"key": "sk-or-v1-...", "user_id": "user_2yOP..."}`. Both fields are listed as required, and `user_id` may be null. — [Exchange (OpenAPI)](https://openrouter.ai/docs/api/api-reference/oauth/exchange-authorization-code-for-api-key.md)
- Errors (guide):
  - `400 Invalid code_challenge_method`
  - `403 Invalid code or code_verifier`
  - `403 Authorization code expired`: "Authorization codes expire 10 minutes after issuance."
  - `405 Method Not Allowed`: use POST and HTTPS.
  - Source: [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)
- Deep links: take the lowercase hex SHA-256 of the key. Activity is at `https://openrouter.ai/logs?api_key_hash=<hash>` and key settings at `https://openrouter.ai/keys/<hash>`. They work only for the signed-in owner. — [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)

**Key limits (server-side code creation)**

- `POST /api/v1/auth/keys/code` ("Create authorization code") is the programmatic way to create a code. It is authenticated with an API key per the spec's global `security: apiKey`; whether this has to be the app owner's key is **unverified**.
  - Body: `callback_url` (required, uri), `code_challenge`, `code_challenge_method` (S256|plain), `limit` (number, "Credit limit for the API key to be created"), `expires_at` (ISO 8601 UTC with seconds, e.g. `2027-12-31T23:59:59Z`; "minute-precision timestamps are rejected"), `key_label` (max 100 chars, defaults to the app name), `usage_limit_type` (`daily`|`weekly`|`monthly`, the reset interval), and `workspace_id` (uuid).
  - Response: `{"data":{"id":"auth_code_xyz789","app_id":12345,"created_at":"..."}}`.
  - Source: [Create authorization code (OpenAPI)](https://openrouter.ai/docs/api/api-reference/oauth/create-authorization-code.md)
- The browser `/auth` URL guide documents only `callback_url`, `code_challenge`, `code_challenge_method`, `key_label`, `workspace_id` and `required_workspace_id`. It does **not** document a `limit` query parameter. In the browser flow the user sets any limit on the consent screen or later in key settings. — [OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth)

**Checking a key's credits and limits**

- `GET https://openrouter.ai/api/v1/key` with `Authorization: Bearer <key>` returns a `data` object. Example fields:
  - `label`, `limit` (100), `limit_remaining` (74.5; null means unlimited), `limit_reset` ("monthly")
  - `usage`, `usage_daily`, `usage_weekly`, `usage_monthly`
  - `byok_usage*`, `include_byok_in_limit`
  - `is_free_tier`, `is_management_key`, `is_provisioning_key`
  - `expires_at`, `free_model_daily_requests {limit, remaining, used}`
  - `allowed_data_regions`, `creator_user_id`, `organization_id`, `workspace_id`
  - `rate_limit {interval, requests, note}`: "This field is deprecated and safe to ignore."
  - Source: [Get current API key (OpenAPI)](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key.md)
- `GET /api/v1/credits` ("Get remaining credits": total purchased and used) requires a **Management key**, so a PKCE user key cannot call it. — [docs index llms.txt](https://openrouter.ai/docs/llms.txt)
- `:free` models are limited to 20 requests/min. The daily cap is 50/day with under $10 of credits purchased and 1000/day at $10 or more. A negative balance can return 402 errors, even for free models. Rate limiting returns 429 with `X-RateLimit-*` headers and an optional `Retry-After`. — [Limits](https://openrouter.ai/docs/api/reference/limits)

**App attribution headers**

- `HTTP-Referer` is the app URL and the primary identifier for rankings.
- `X-OpenRouter-Title` is the display name. The legacy `X-Title` is still accepted.
- `X-OpenRouter-Categories` takes up to 2 per request and 10 per app.
- `X-OpenRouter-App-Visibility: hidden` hides the app from rankings.
- "apps using `localhost` URLs must also include `X-OpenRouter-Title` to be tracked."
- Source: [App attribution](https://openrouter.ai/docs/app-attribution)

**Models API: `GET https://openrouter.ai/api/v1/models`** (public, no auth needed; verified with curl)

- Model object fields, from a live response and the API reference:
  - `id`, `canonical_slug`, `hugging_face_id`, `name`, `created` (unix), `description`, `context_length`
  - `architecture {modality, input_modalities[], output_modalities[], tokenizer, instruct_type}`
  - `pricing {prompt, completion, request, image, audio, audio_output, image_token, image_output, input_cache_read, input_cache_write, input_cache_write_1h, input_audio_cache, internal_reasoning, web_search, discount, overrides}`. Values are USD per token or unit, as strings. Router models show `"-1"`.
  - `top_provider {context_length, max_completion_tokens, is_moderated}`
  - `per_request_limits {prompt_tokens, completion_tokens}` or null
  - `supported_parameters[]`, `default_parameters{}`, `supported_voices`, `knowledge_cutoff`, `expiration_date`
  - `links {details: "/api/v1/models/<id>/endpoints"}`, `benchmarks`, `reasoning`, `alias_target`
  - Response metadata: `total_count`, `links.next`.
  - Sources: [Get models reference](https://openrouter.ai/docs/api/api-reference/models/get-models); live call to `https://openrouter.ai/api/v1/models`
- Query params:
  - `offset`, `limit`, `category`, `supported_parameters`, `output_modalities`, `input_modalities`, `sort`, `q`, `context`
  - `min_price`, `max_price`, `min_output_price`, `max_output_price`
  - `arch`, `model_authors`, `providers`, `distillable`, `zdr`, `region`, `min_age_days`, `max_age_days`
  - `min_/max_intelligence_index`, `min_/max_coding_index`, `min_/max_agentic_index`, `min_/max_tool_success_rate`
  - `use_rss`, `use_rss_chat_links`
  - Source: [Get models reference](https://openrouter.ai/docs/api/api-reference/models/get-models)
- Live counts on 2026-09-26:
  - the default list returned 458 models
  - `?output_modalities=image` returned 57
  - `?output_modalities=all` returned 628
  - `?input_modalities=audio` returned 49
  - The default list therefore appears to be text-output models only; this is an inference from the counts. — live API calls
- Dedicated discovery endpoints: `GET /api/v1/images/models` — [Image generation guide](https://openrouter.ai/docs/guides/overview/multimodal/image-generation); `GET /api/v1/embeddings/models` — [Embeddings](https://openrouter.ai/docs/api/reference/embeddings)

**Image generation.** There are three paths.

- (a) Chat completions with `modalities`. The request schema has `modalities: ["text","image","audio"]`, described as "Output modalities for the response". `image_config` is an object of "Provider-specific image configuration options", e.g. `{aspect_ratio: "16:9", quality: "high"}`. The assistant message returns `images: [{image_url: {url: "data:image/png;base64,..."}}]`. — [Create a chat completion (OpenAPI)](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion.md)
  - Live model example: `google/gemini-3.8-flash`-family image models show `output_modalities: ["image","text"]` and `pricing.image_output`. Image-only models such as `recraft/*` show `["image"]`. The advice to send `modalities: ["image"]` for image-only models and `["image","text"]` for dual-output models comes from community sources and is **unverified** against current docs. — live API; [search summary](https://openrouter.ai/docs/guides/overview/multimodal/overview)
- (b) Dedicated Image API: `POST https://openrouter.ai/api/v1/images`.
  - Body: `{model, prompt, n, resolution: "512"|"1K"|"2K"|"4K", aspect_ratio, quality, output_format, stream}`.
  - Response: `{created, data:[{b64_json, media_type}], usage:{..., cost}}`.
  - SSE events: `image_generation.partial_image` and `image_generation.completed`.
  - Source: [Image generation guide](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- (c) Server tool: add `{"type":"openrouter:image_generation","parameters":{"model":"openai/gpt-5-image",...}}` to `tools`. Any model can then generate images. — [Image generation server tool](https://openrouter.ai/docs/guides/features/server-tools/image-generation.md)
- Other modality endpoints (blog dated 2026-07-16): `POST /api/v1/videos` (async), `/api/v1/audio/speech`, `/api/v1/audio/transcriptions`, `/api/v1/embeddings`. — [Every modality, one API](https://openrouter.ai/blog/insights/every-modality-one-api/)

**Audio input and output via chat completions**

- Input content part: `{"type":"input_audio","input_audio":{"data":"<base64>","format":"wav"}}`. Formats: wav, mp3, aiff, aac, ogg, flac, m4a, pcm16, pcm24, depending on the model. — [Audio guide](https://openrouter.ai/docs/guides/overview/multimodal/audio)
- Output: `"modalities":["text","audio"], "audio":{"voice":"alloy","format":"wav"}, "stream": true`. Output "requires streaming". Chunks arrive as `choices[].delta.audio {data, transcript}`. — [Audio guide](https://openrouter.ai/docs/guides/overview/multimodal/audio)

**Web search**

- The `:online` suffix, e.g. `openai/gpt-5.2:online`, is shorthand for `plugins: [{"id":"web"}]`.
- Plugin options:
  - `engine`: `native`|`exa`|`firecrawl`|`parallel`|`perplexity`
  - `mode`
  - `max_results` (default 5)
  - `search_prompt`
  - `include_domains` / `exclude_domains`
- Native-search depth: `web_search_options.search_context_size` = low|medium|high.
- Newer server tool: `openrouter:web_search`, where the model decides when to search.
- Citations come as `annotations[].type == "url_citation"` with `{url, title, content, start_index, end_index}`.
- Pricing: Exa costs $0.007 per request in auto mode. Parallel costs $0.001–0.005. Perplexity costs $0.005. Native search is passed through from the provider.
- Source: [Web search](https://openrouter.ai/docs/guides/features/plugins/web-search)

### Inferences

- For Electron, bind a loopback HTTP server on an ephemeral port such as `http://127.0.0.1:0` and use it as `callback_url`. Use S256 with a base64url challenge and exchange the code from the main process. No backend or secret is needed.
- Store the returned `sk-or-v1-...` key via OS keychain/safeStorage and poll `GET /api/v1/key` to show remaining credits. `/credits` is not usable with a user key.
- Localhost callbacks give up marketplace attribution. Sending `HTTP-Referer` (a public URL such as the GitHub repo) plus `X-OpenRouter-Title` on inference requests should still attribute usage, but that is inferred from the attribution docs.
- For generic image output in a chat UI, `modalities` plus `message.images` is the simplest path. `/api/v1/images` suits a dedicated image tool.

### Gaps

- There is no documented browser-URL parameter for a per-key credit `limit` in the `/auth` redirect flow. It exists only on `POST /auth/keys/code`, and I did not confirm who may call that endpoint.
- There is no published list of which image models need `["image"]` versus `["image","text"]` in `modalities`. Check each model's `architecture.output_modalities`.

## Does OpenRouter offer an embeddings endpoint and which models?

### Takeaway

Yes. OpenRouter has `POST /api/v1/embeddings` (OpenAI-compatible) and `GET /api/v1/embeddings/models`, which listed 33 models on 2026-09-26. It also has a rerank endpoint, `POST /api/v1/rerank`, with Cohere, Voyage, Qwen3 and NVIDIA rerankers.

### Cited Findings

- Embeddings request: `POST https://openrouter.ai/api/v1/embeddings` with `{model, input (string | string[] | multimodal parts with text/image_url), encoding_format, provider{order, allow_fallbacks, data_collection}}`. The response is OpenAI-style `data[].embedding`. — [Embeddings reference](https://openrouter.ai/docs/api/reference/embeddings)
- Embeddings are also supported in the Batch API (`/v1/embeddings`). — [docs index](https://openrouter.ai/docs/llms.txt)
- Live `GET /api/v1/embeddings/models` on 2026-09-26 returned 33 models (id, context, $/token prompt):
  - OpenAI: `openai/text-embedding-3-large` (8192, 1.3e-7), `openai/text-embedding-3-small` (8192, 2e-8), `openai/text-embedding-ada-002`
  - Voyage: `voyageai/voyage-4-large` (32000, 1.2e-7), `voyageai/voyage-4` (6e-8), `voyageai/voyage-4-lite` (2e-8), `voyageai/voyage-code-4` (1.2e-7), `voyageai/voyage-multimodal-3.5` (text+image)
  - Google: `google/gemini-embedding-2` (8192, 2e-7; text/image/file/audio/video), `google/gemini-embedding-2-preview`, `google/gemini-embedding-001` (20000, 1.5e-7)
  - Qwen: `qwen/qwen3-embedding-8b` (32768, 1e-8), `qwen/qwen3-embedding-4b` (2e-8)
  - Perplexity: `perplexity/pplx-embed-v1-4b`, `perplexity/pplx-embed-v1-0.6b` (4e-9)
  - NVIDIA: `nvidia/nemotron-3-embed-1b:free`, `nvidia/llama-nemotron-embed-vl-1b-v2:free`
  - Mistral: `mistralai/mistral-embed-2312`, `mistralai/codestral-embed-2505`
  - BAAI: `baai/bge-m3`, bge-base/large-en-v1.5
  - Also e5, gte, sentence-transformers MiniLM/mpnet, and `liquid/lfm-2.5-embedding-350m:free`
  - Source: live call to `https://openrouter.ai/api/v1/embeddings/models`
  - Not listed: Cohere embed and Jina embeddings.
- Rerank request: `POST https://openrouter.ai/api/v1/rerank` with `{model, query, documents: (string | {text?, image?})[], top_n, provider}`.
  - Response: `{id: "gen-rerank-...", model, provider, results:[{index, relevance_score, document:{text}}], usage:{search_units, total_tokens, cost}}`.
  - Source: [Submit a rerank request (OpenAPI)](https://openrouter.ai/docs/api/api-reference/rerank/submit-a-rerank-request.md)
  - A live POST without auth returned 401 (the endpoint exists). There is no `/rerank/models` endpoint; it returned 404.
- Rerank models:
  - Voyage: `rerank-2.5-lite` ($0.02/M), `rerank-2.5` ($0.05/M)
  - Qwen: `qwen3-reranker-8b` ($0.20/M), `qwen3-reranker-0.6b`, `qwen3-reranker-4b`
  - NVIDIA: `llama-nemotron-rerank-vl-1b-v2:free`
  - Cohere: `rerank-4-pro` ($0.0025/search), `rerank-4-fast` ($0.002/search), `rerank-v3.5` ($0.001/search)
  - Source: [OpenRouter rerank collection](https://openrouter.ai/collections/rerank-models)
- OpenRouter's own guide (published 2026-09-23) recommends:
  - `openai/text-embedding-3-small` as the English RAG default
  - `voyageai/voyage-4-large` for long inputs
  - `qwen/qwen3-embedding-8b` for multilingual with open weights
  - `voyageai/voyage-code-4` for code
  - `google/gemini-embedding-2` for text and image
  - `nvidia/nemotron-3-embed-1b:free` as the free option
  - Source: [Best Embedding Models in 2026](https://openrouter.ai/blog/insights/best-embedding-models-2026/)

### Inferences

- One OpenRouter key can cover chat, images, embeddings and reranking. Qwen3-Embedding-8B on OpenRouter ($0.01/M) produces vectors in the same space as the local Ollama `qwen3-embedding:8b`, assuming the same weights and instruction prompts. That allows a hybrid local and cloud setup; this is inferred and not tested.

### Gaps

- The embeddings models listing does not include MTEB scores. Per-model rerank ids with a vendor prefix (e.g. `cohere/rerank-4-pro`) are confirmed only for `cohere/rerank-v3.5` from the API example.

## Top MTEB (v2) local and hosted embedding and reranking models today?

### Takeaway

Local embeddings: Qwen3-Embedding (0.6B/4B/8B, on Ollama) leads open models on MMTEB. The 8B scores 70.58 multilingual and 75.22 English v2; the 0.6B scores 64.33 and 70.70. EmbeddingGemma-300m is the strongest option under 500M (61.15 / 69.67).

Hosted embeddings: Gemini Embedding (001 at 68.37 MMTEB; Embedding 2 at 69.9), Voyage-4-large and OpenAI text-embedding-3-large (58.93 MMTEB, now clearly behind).

Reranking: Qwen3-Reranker-4B/8B (MTEB-R ~69–70) is well ahead of bge-reranker-v2-m3 (57.03). Hosted options are Cohere Rerank 4 and Voyage rerank-2.5.

### Cited Findings

**Embedding scores (MTEB Multilingual Mean(Task) / MTEB Eng v2 Mean(Task))**

- Qwen3-Embedding-8B: 70.58 / 75.22 (Retrieval 86.40 / 69.44)
- Qwen3-Embedding-4B: 69.45 / 74.60
- Qwen3-Embedding-0.6B: 64.33 / 70.70
- gemini-embedding-exp-03-07: 68.37 / 73.3
- multilingual-e5-large-instruct: 63.22 / 65.53
- Cohere-embed-multilingual-v3.0: 61.12 multilingual
- BGE-M3: 59.56 multilingual
- text-embedding-3-large: 58.93 multilingual
- NV-Embed-v2: 56.29 / 69.81
- Source for all of the above: [Qwen3-Embedding-8B model card](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- A web-search summary cites 73.83 MMTEB for Qwen3-8B, which conflicts with the model card's 70.58. The model card is the primary source; the higher number may come from a later leaderboard or a different version and is **unverified**. — [search result: codesota/modal aggregators](https://www.codesota.com/benchmarks/mteb)
- EmbeddingGemma-300m:
  - MMTEB 61.15 at 768d, 60.71 at 512d, 59.68 at 256d, 58.23 at 128d
  - MTEB Eng v2 69.67 at 768d
  - 2048-token context, Matryoshka dimensions, Q4_0 and Q8_0 QAT checkpoints
  - Source: [EmbeddingGemma model card](https://huggingface.co/google/embeddinggemma-300m)
- Gemini Embedding 2 (arXiv, 2026-05-26): MTEB Multilingual 69.9, MTEB Code 84.0. It is natively multimodal. — [arXiv 2605.27295](https://arxiv.org/abs/2605.27295)
- Voyage-4-large: 32K context, 1024 default dimensions, $0.12/M tokens. Voyage claims it beats text-embedding-3-large by 14% NDCG@10 on its RTEB benchmark (a vendor claim). One third-party test found voyage-3.5 beat the flagships on a 3-domain average. — [aimultiple / search summary](https://aimultiple.com/embedding-models); [Voyage docs](https://docs.voyageai.com/docs/embeddings)
- Ollama library sizes (download size for the default tag):
  - `nomic-embed-text`: 274MB, 87.1M pulls
  - `mxbai-embed-large`: 670MB, 335M params
  - `bge-m3`: 1.2GB, 567M params
  - `embeddinggemma`: 622MB, 300M params
  - `nomic-embed-text-v2-moe`: 958MB
  - `qwen3-embedding`:
    - `0.6b`: 639MB (q8_0), 32K context
    - `4b`: 2.5GB (q4_K_M), 40K context
    - `8b`: 4.7GB (q4_K_M); 8.0GB at q8_0; 15GB at fp16
  - Sources: [Ollama embedding search](https://ollama.com/search?c=embedding); [qwen3-embedding tags](https://ollama.com/library/qwen3-embedding/tags); ollama.com/library/<model>/tags (scraped)

**Rerankers**

- Scores are MTEB-R / MMTEB-R / MTEB-Code, reranking the top 100 candidates from Qwen3-Embedding-0.6B:
  - Qwen3-Reranker-0.6B: 65.80 / 66.36 / 73.42
  - Qwen3-Reranker-4B: 69.76 / 72.74 / 81.20
  - Qwen3-Reranker-8B: 69.02 / 72.94 / 81.22
  - BGE-reranker-v2-m3: 57.03 / 58.36 / 41.38
  - gte-multilingual-reranker-base: 59.51 / 59.44 / 54.18
  - Jina-multilingual-reranker-v2-base: 58.22 / 63.73 / 58.98
  - Source: [Qwen3-Reranker-4B model card](https://huggingface.co/Qwen/Qwen3-Reranker-4B)
- mxbai-rerank-large-v2: about 1.5–2B params, Apache 2.0, BEIR 57.49, 0.89s latency on A100. mxbai-rerank-base-v2 scores BEIR 55.57. — [mxbai-rerank-large-v2 card](https://huggingface.co/mixedbread-ai/mxbai-rerank-large-v2)
- Ollama has no native `/api/rerank` endpoint. Rerank support is an open PR (#7219), and community adapters and community model uploads (e.g. `sam860/qwen3-reranker`) fill the gap. — [ollama PR #7219](https://github.com/ollama/ollama/pull/7219); [sam860/qwen3-reranker](https://ollama.com/sam860/qwen3-reranker)
- Hosted rerankers: Cohere Rerank 4 Pro and Fast (32K context, 100+ languages), Cohere Rerank v3.5, Voyage rerank-2.5 and 2.5-lite, all through OpenRouter. — [OpenRouter rerank collection](https://openrouter.ai/collections/rerank-models); [Cohere on OpenRouter](https://openrouter.ai/cohere)

**Suggested shortlist (synthesis)**

- Local embedding:
  1. `qwen3-embedding:0.6b` (639MB) as the default
  2. `embeddinggemma` (622MB, 300M) for small footprint and English quality
  3. `qwen3-embedding:4b` or `8b` (2.5 / 4.7GB) for best quality
  - `nomic-embed-text` and `mxbai-embed-large` are popular but older and lower-scoring. They are not in the tables above, so treat that as **unverified** relative ranking.
- Local rerank:
  1. Qwen3-Reranker-0.6B
  2. Qwen3-Reranker-4B
  3. bge-reranker-v2-m3 (weaker but widely supported)
  - All of these need llama.cpp/MLX/sentence-transformers or a community Ollama build.
- Hosted embedding:
  1. `google/gemini-embedding-2` (multimodal, 69.9 MMTEB)
  2. `voyageai/voyage-4-large` or `voyage-code-4`
  3. `qwen/qwen3-embedding-8b` via OpenRouter (cheapest top-scorer)
  - `openai/text-embedding-3-large` is a legacy baseline at 58.93 MMTEB.
- Hosted rerank:
  1. Cohere `rerank-4-pro` or `rerank-4-fast`
  2. Voyage `rerank-2.5`
  3. `qwen3-reranker-8b`
  - All are reachable via OpenRouter `/api/v1/rerank`.

### Inferences

- Measured Mac speeds are not available. From the parameter counts, the 0.3–0.6B embedders should embed thousands of short chunks per minute on Apple silicon, and 4B/8B will be several times slower. Treat this as a rough estimate only.
- Qwen3-Reranker is an LLM-style yes/no-logit reranker, not a classic cross-encoder, which is part of why generic Ollama rerank support is awkward.

### Gaps

- I found no primary benchmarks of tokens/sec or chunks/sec on Mac (M-series, Ollama vs MLX) for these embedders or rerankers.
- I did not fetch the current live MTEB leaderboard (the HF Space is JS-rendered). The scores above are from model cards and papers dated 2025–2026, so newer leaderboard entries may exist (e.g. LGAI-Embedding, Granite Embedding R2 per arXiv listings).
- MTEB v2 scores for Voyage-4, Cohere embed-v4 and Jina v4/v5 were not found in primary sources.
- MLX community repo names (e.g. `mlx-community/Qwen3-Embedding-0.6B-*`) were not verified.
