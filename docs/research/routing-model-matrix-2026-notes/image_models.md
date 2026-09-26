# Image models for routing (local Apple-silicon vs hosted), as of late September 2026

Scope: image understanding/VQA, OCR/document parsing, image generation, and image editing/inpainting. Research date: 2026-09-26. Many figures come from fast-moving leaderboards and third-party blogs, so treat speeds as order-of-magnitude. Claims from memory or without a primary source are marked **[UNVERIFIED]**.

## Which open image-generation models run well locally via MLX (mflux), and at what speed and memory?

### Takeaway

mflux (MLX-native, `uv tool install --upgrade mflux`) is the main way to run image models on a Mac. As of Sep 2026 it supports Z-Image (6B), FLUX.2 klein (4B/9B), Qwen-Image (20B), Qwen Image 2.1 (7.1B + 8B TE), Krea 2, Ideogram 4, ERNIE-Image, FIBO, Lens, Ming-Image, Boogu, and the SeedVR2 upscaler. The practical defaults are **Z-Image Turbo** (fast, small, very realistic) and **FLUX.2 klein 4B** (about 30-40 s per 1024² image on an M1 Max, ~8-13 GB). **Qwen-Image-2.1** is the strongest open-weight model on LMArena, but it carries a research-only license. Draw Things is the easiest GUI option. ComfyUI on MPS works but is slower for large models.

### Cited Findings

- mflux install: `uv tool install --upgrade mflux` (optionally `--with hf_transfer`). Example: `mflux-generate-z-image-turbo --prompt "..." --width 1280 --height 500 --seed 42 --steps 9 -q 8`. `-q 8`/`-q 4` sets quantization. It also has a Python API (`from mflux.models.z_image import ZImageTurbo; ZImageTurbo(quantize=8).generate_image(...)`). — [mflux README](https://github.com/filipstrand/mflux)
- mflux model table (README, fetched 2026-09-26): Z-Image (Nov 2025, 6B, distilled & base, "Fast, small, very good quality and realism"), Krea 2 (Jun 2026, 12B turbo), FLUX.2 (Jan 2026, 4B & 9B, "Fastest + smallest with very good quality and edit capabilities"), Ideogram 4 (Jun 2026, 9B, typography-focused, JSON captions), ERNIE-Image (Apr 2026, 8B), Lens (May 2026, 3.8B + 20B GPT-OSS TE, 4 steps), Ming-Image (Sep 2026, 6.15B + 16B MoE TE, design/posters/UI, RGBA output), Boogu Image (Jun 2026, 10B, 4-step), FIBO (8B, JSON prompts, edit), SeedVR2 (3B/7B, "Best upscaling model"), Qwen Image (20B, "Large model (slower)… Has edit capabilities"), Qwen Image 2.1 (Sep 2026, 7.1B + 8B Qwen3-VL TE, 40 steps), Depth Pro, FLUX.1 (legacy, 12B, Kontext edit + ControlNet). Features include LoRA, in-context/multi-image editing, ControlNet Canny, depth, **fill/inpainting**, Redux, and upscaling. — [mflux README](https://github.com/filipstrand/mflux)
- FLUX.2 klein 4B on an M1 Max: 1024×1024 in **30-40 s** with mflux or iris.c. — [lilting.ch](https://lilting.ch/en/articles/flux2-klein-4b-mflux-iris-m1-max)
- FLUX.2 klein 9B at 1024×1024 (diffusers/MPS-class path): M1 Max 180-240 s, M2 Max ~145 s, M3 Max ~105 s, M4 Max ~85 s. It needs about 29 GB ("64GB required" in the M1 Max test). FP8 is not available on MPS, and memory bandwidth is the main bottleneck (M1 Max 400 GB/s vs RTX 4090 1,008 GB/s). mflux 9B at 512² on M1 Max took 111 s. The article recommends 4B for most Macs. — [lilting.ch, Feb/Apr 2026](https://lilting.ch/en/articles/flux2-klein-apple-silicon)
- RAM-fit guide (Jun 2026): 16 GB fits SDXL and SD3.5 Medium (FLUX.1 4-bit ~9.85 GB is borderline). 32 GB fits FLUX.1 Q8 (12.7 GB), FLUX.2 klein 4B (7.75 GB), and SD3.5 Large (16.5 GB), with FLUX.2 klein 9B (18.2 GB) borderline. 64 GB+ fits FLUX.1 bf16 (23.8 GB) and Qwen-Image Q8 (21.8 GB), with FLUX.2-dev bf16 (64.4 GB) borderline. Speeds on M4 Pro: SDXL 1024² 20-40 s; FLUX.1-dev Q6 50-90 s; FLUX.1 schnell "under 15s on M2 Ultra". Recommended tools: Draw Things, ComfyUI Desktop (GGUF), MFLUX. Avoid DiffusionBee (unmaintained since 2024). — [modelfit.io](https://modelfit.io/guides/local-image-generation-mac/)
- Draw Things is back under active development (v6.0, Feb 2026) with FLUX.2 klein support. It ran about 50 s for FLUX.1-dev at 1024², 20 steps, on an M4 Pro. — [bitdoze](https://www.bitdoze.com/ai-images-mac/), [heyuan110 Mac mini M4 comparison](https://www.heyuan110.com/posts/ai/2026-02-15-mac-mini-local-image-generation/)
- Z-Image Turbo: a community benchmark covers an M4 Pro at 1024², 7 steps, across FP8/BF16/Q3-Q5 variants, but its numbers are in an interactive widget I could not extract. Another source reports "~100 seconds per image" on a MacBook Pro M5 32GB with the default (ComfyUI) workflow. — [z-image-turbo-benchmark](https://miroleon.github.io/z-image-turbo-benchmark/), search summary of [smartart.live](https://smartart.live/articles/256-z-image-turbo-apple-silicon-guide-3x-faster-than-flux-2026.html) (the M5 figure is a secondary source)
- Qwen-Image-2.1 was released as open weights on 2026-09-20. It is a unified T2I and editing model with a 7B DiT (32 single-stream layers) that supports RGBA/transparent output, up to 10 reference images, and mask/annotation-driven local edits. Diffusers, ComfyUI, vLLM-Omni, SGLang, and LightX2V supported it on day one. It has a **research license that bars commercial use**. — [MarkTechPost](https://www.marktechpost.com/2026/09/21/alibaba-qwen-releases-qwen-image-2-1/), [HF model card](https://huggingface.co/Qwen/Qwen-Image-2.1), [mixed-news](https://mixed-news.com/en/qwen-image-2-1-transparent-rgba-7b-open-weights-research-licence/)
- LMArena text-to-image (2026-09-24, 6.48M votes, 80 models): the top open-weight entries are **qwen-image-2.1 #17 (1228, "qwen-research" license)**, ideogram-4.0-quality #18 (1205, "Ideogram Open Model" license), qwen-image-2512 #42 (1125, Apache 2.0), hidream-o1-image #46 (1116, MIT), and flux-2-klein-9b #60 (1070, non-commercial). — [arena.ai text-to-image](https://arena.ai/leaderboard/text-to-image)

### Inferences

- Default local T2I route: **Z-Image Turbo via mflux (`-q 8`)** on machines with 16-32 GB, and **FLUX.2 klein 4B** when editing or reference images are needed. Use Qwen-Image-2.1 (mflux `qwen21`) for best open quality, but only for personal or research use because of its license. The 20B Qwen-Image needs 64 GB+ and is slow.
- Expect roughly 10-40 s per 1024² image on M3/M4 Max for 4-6B distilled models, and 1.5-3 min for 9B+ undistilled models. Speed scales with memory bandwidth (Max/Ultra chips are much faster than base/Pro).
- SD3.5 and HiDream are now legacy for local use. SD3.5 Large fits in 32 GB, but it and HiDream are outranked by newer models.

### Gaps

- I found no first-party mflux timing tables for Z-Image, Qwen-Image-2.1, or FLUX.2 on M4/M5 Max. Speeds above are community numbers, mostly M1 Max.
- I found no current (2026) data on Core ML Stable Diffusion (apple/ml-stable-diffusion) or DiffusionKit (argmaxinc). Both appear stale for new models **[UNVERIFIED]**.
- I did not check Ideogram 4 open-weight license terms in detail. The HF repo `ideogram-ai/ideogram-4-fp8` is referenced in the mflux README.

## Which local models are best for OCR and document parsing, and how do you run them on a Mac?

### Takeaway

Small dedicated OCR VLMs (0.9-5B) now beat giant general VLMs on document parsing. Leading options are **PaddleOCR-VL-1.6 / GLM-OCR / MinerU2.5-Pro** on OmniDocBench and **dots.mocr / LightOnOCR-2-1B / olmOCR-2-7B** on olmOCR-bench (Chandra 2 and Infinity-Parser2-Pro are higher but listed as closed). On a Mac, the easiest path is **`ollama run glm-ocr`** (~2.2 GB). MLX conversions (e.g. `mlx-community/DeepSeek-OCR-6bit` via mlx-vlm) and oMLX cover the rest. For general VQA, use **Qwen3-VL** or **Gemma 4** through Ollama or mlx-vlm.

### Cited Findings

- OmniDocBench v1.6 ranking (Aug 3, 2026): PaddleOCR-VL-1.6 96.34% (0.9B, Apache 2.0); MinerU2.5-Pro 95.75% (1.2B, Apache 2.0 with extra commercial terms); GLM-OCR 95.22% (0.9B, MIT); Ovis2.6-30B-A3B 93.70%; Qwen3-VL-235B 89.78%. The article concludes: "Small dedicated document models...beat Qwen3-VL-235B...at a fraction of the compute." dots.mocr (3B, MIT) scores 83.9% and Chandra OCR 2 85.8% on olmOCR-bench (modified OpenRAIL-M). SmolVLM2 scores 72.9% OCRBench. — [Roboflow](https://blog.roboflow.com/best-open-source-ocr-models/)
- olmOCR-bench leaderboard (updated 2026-05-21; 7,010 unit tests over 1,402 PDFs): infinity-parser2-pro 87.6 (closed); chandra-2 85.9 (listed closed, 5B); **dots.mocr 83.9 (open, 3B)**; **LightOnOCR-2-1B 83.2 (open, 1B)**; infinity-parser-7b 82.5; **olmocr-2-7b-1025 82.4 (open, 7B)**; falcon-ocr 80.3 (open); paddleocr-vl 80.0 (open, 0.9B); Qwen3-VL-4B 79.2 (open); PaddleOCR-VL-1.5 79.1; dots-ocr-3b 79.1. — [CodeSOTA](https://www.codesota.com/ocr/benchmark/olmocr-bench)
- Hosted comparison on olmOCR-bench (Falcon Perception paper): Mistral OCR 3 81.7, Chandra 82.0, Gemini 3 Pro 80.2. — [arXiv 2603.27365](https://arxiv.org/pdf/2603.27365). Niels Rogge (HF) disputes Mistral's SOTA claim and says Mistral OCR 4 ranks #3 on the HF leaderboard behind open models like Chandra OCR 2. — [X post](https://x.com/NielsRogge/status/2069432947711652210)
- GLM-OCR: 0.9B, handles text, tables, formulas, and structured extraction, and runs via Ollama (`glm-ocr`, ~2.2 GB quantized download) on Apple Silicon. — [Ollama library glm-ocr](https://ollama.com/library/glm-ocr), [buildwithmatija guide](https://www.buildwithmatija.com/blog/run-glm-ocr-macbook-ollama), [GLM-OCR GitHub](https://github.com/zai-org/GLM-OCR)
- In one 2026 comparison, GLM-OCR led, PaddleOCR-VL-1.5 scored 94.5, and DeepSeek-OCR-2 scored 91.09. — [Regolo](https://regolo.ai/deepseek-ocr-vs-glm-ocr-vs-paddleocr-benchmark-2026/)
- DeepSeek-OCR has an MLX conversion, `mlx-community/DeepSeek-OCR-6bit` (converted with mlx-vlm 0.3.5), run via `mlx_vlm`. — [HF](https://huggingface.co/mlx-community/DeepSeek-OCR-6bit/blob/main/README.md)
- oMLX 0.6.4 (Apple Silicon) serves OCR models including chandra-ocr-2 and baidu Unlimited-OCR. — [omlx-ocr-bench](https://github.com/noonkho/omlx-ocr-bench)
- Ollama vision: gemma4 is the most-pulled vision tag (23.1M). `gemma4:e4b` (released 2026-04-02) supports vision and tool calling. Qwen3-VL is available, e.g. `qwen3-vl:4b-instruct`, and can turn mockups into HTML/CSS/JS. — [promptquorum/localaimaster search summary](https://www.promptquorum.com/local-llms/top-open-source-models-ollama), [ollama qwen3-vl](https://ollama.com/library/qwen3-vl)

### Inferences

- Local OCR routes:
  - Fast default: `glm-ocr` (Ollama).
  - Highest open accuracy on PDFs: dots.mocr or LightOnOCR-2-1B, via mlx-vlm conversions where they exist.
  - Complex layouts and tables: PaddleOCR-VL-1.6 or MinerU2.5-Pro.
  - General VQA and screenshots: `qwen3-vl` (8B/30B-A3B class) or `gemma4` (e4b / 26B) through Ollama or mlx-vlm.
- For hosted OCR, Mistral OCR and Gemini 3 Pro score near the open models, so hosted OCR is mainly a convenience and scale choice, not a quality win.

### Gaps

- I did not verify exact mlx-community repo names for PaddleOCR-VL-1.6, dots.mocr, LightOnOCR-2, or olmOCR-2 **[UNVERIFIED]**. Check `huggingface.co/mlx-community` before hard-coding them.
- I found no per-page latency numbers on M-series for these OCR models.
- I did not collect current OCRBench/DocVQA numbers for Qwen3-VL or Gemma 4. I also did not find a 2026 hosted VQA leaderboard (e.g. arena "vision") snapshot.
- I did not verify the full list of Ollama tag sizes (qwen3-vl 2b/4b/8b/30b/32b/235b; gemma4 e2b/e4b/26b/31b) **[UNVERIFIED]**.

## How does OpenRouter support image generation, and which models support it?

### Takeaway

OpenRouter now has a **dedicated Image API** at `POST /api/v1/images` (OpenAI-Images-like). It returns base64 in `data[].b64_json` and supports `resolution`/`aspect_ratio`/`size`/`quality`/`n`/`input_references`. It lists 55 image models at `GET /api/v1/images/models`, with per-endpoint pricing at `/api/v1/images/models/{id}/endpoints`. Eleven chat models with `output_modalities` including `image` (Gemini image, GPT-5 image) remain in `/api/v1/models`. A beta `openrouter:image_generation` server tool lets any chat model generate images.

### Cited Findings

- Request format: `POST /api/v1/images` with `model`, `prompt`, and optional `resolution` ("512"/"1K"/"2K"/"4K"), `aspect_ratio` ("1:1", "16:9", …, "auto"), `size` ("2K" or "2048x2048"; a mismatch with resolution/aspect_ratio gets a 400), `quality` (auto/low/medium/high), `output_format` (png/jpeg/webp/svg), `background`, `output_compression`, `n` (1-10), `input_references: [{type:"image_url", image_url:{url}}]` (HTTP or base64 data URLs), and `provider` routing (`only`, `order`, `ignore`, `sort`, `allow_fallbacks`). Response: `{"created":…, "data":[{"b64_json":"…","media_type":"image/png"}], "usage":{…,"cost":0.04}}`. Billing is all-or-nothing, and failed generations are not billed. Streaming is supported on some models. — [OpenRouter Image Generation guide](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- Discovery: `GET /api/v1/models?output_modalities=image` and `GET /api/v1/images/models`. — [same guide](https://openrouter.ai/docs/guides/overview/multimodal/image-generation.md)
- `/api/v1/images/models` returned 55 models on 2026-09-26, including: openai/gpt-image-2.5-sunburst, openai/gpt-image-2.5-flare, openai/gpt-image-2, openai/gpt-image-1(-mini), openai/gpt-5.4-image-2, openai/gpt-5-image(-mini); google/gemini-3.1-flash-image, google/gemini-3-pro-image, google/gemini-3.1-flash-lite-image, google/gemini-2.5-flash-image; microsoft/mai-image-2.6(-flash), microsoft/mai-image-2.5(-pro); meta/muse-image; x-ai/grok-imagine-image-2.0, x-ai/grok-imagine-image-quality; bytedance-seed/seedream-5-0-pro/-lite, seedream-4.5; qwen/qwen-image-3(-pro); black-forest-labs/flux.2-max/-pro/-flex/-klein-4b; krea/krea-2-large/-medium/-medium-turbo; recraft/recraft-v4.1(-pro/-vector/-utility), recraft-v4-*, recraft-v3; sourceful/riverflow-v2.5-pro/-fast; inclusionai/ming-image-0.1-design(-layer). — [OpenRouter images models API](https://openrouter.ai/api/v1/images/models) (fetched directly)
- `/api/v1/models` chat models with image output (2026-09-26): google/gemini-3.1-flash-lite-image, gemini-3.1-flash-image(-preview), gemini-3-pro-image(-preview), gemini-2.5-flash-image, openai/gpt-5.4-image-2, gpt-5-image, gpt-5-image-mini, plus openrouter/auto. — [OpenRouter models API](https://openrouter.ai/api/v1/models)
- Per-endpoint pricing (fetched 2026-09-26):
  - gpt-image-2 / gpt-image-2.5-sunburst / -flare: input text $5/M tokens, input image $8/M, output image $30/M.
  - gemini-3.1-flash-image: output image $60/M tokens. gemini-3-pro-image: output $120/M. gemini-3.1-flash-lite-image: output $30/M.
  - mai-image-2.6: output $38/M tokens.
  - seedream-5-0-pro: $0.045/image ($0.09 high-res).
  - qwen-image-3-pro: $0.04 (1K) / $0.075 (2K).
  - flux.2-pro: $0.03/MP. flux.2-max: $0.07/MP. flux.2-klein-4b: $0.014/MP.
  - recraft-v4.1-pro: $0.21/image.
  - grok-imagine-image-2.0: $0.04-0.08 by tier.
  - — [OpenRouter endpoints API](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2/endpoints)
- Server tool (beta): add `tools: [{"type":"openrouter:image_generation"}]` to a `/api/v1/chat/completions` call. The model decides when to generate, OpenRouter runs it (default `openai/gpt-5-image`), and the image URL comes back to the model. — [OpenRouter server tool docs](https://openrouter.ai/docs/guides/features/server-tools/image-generation.md)
- **[UNVERIFIED, from prior knowledge]** The older chat-completions path sends `"modalities": ["image","text"]` (optional `image_config: {aspect_ratio, image_size}`) to an image-output chat model. Images come back in `choices[0].message.images[].image_url.url` as base64 `data:image/png;base64,…` URLs. The current guide no longer documents this path. The chat models listed above still advertise image output, so it likely still works, but test it first.

### Inferences

- For pi-gui routing, prefer the `/api/v1/images` endpoint for pure generation and editing (uniform params, per-image cost in `usage.cost`). Use chat + modalities or the server tool only when interleaved text+image conversation is needed.
- Rough cost at 1K: GPT Image 2 medium ~$0.05; FLUX.2 pro ~$0.03; Seedream 5 Pro $0.045; Qwen Image 3 Pro $0.04; FLUX.2 klein 4B ~$0.014.

### Gaps

- Direct vendor prices (BFL API, fal.ai, Replicate, Ideogram API) were not fetched. The OpenRouter pass-through prices above are the proxy.
- Gemini image per-image cost depends on tokens per image. At ~1,120-1,290 output tokens per 1K image, $60/M implies about $0.07 for 3.1 Flash Image **[computed, UNVERIFIED]**. This conflicts with llm-stats' "$0.02" listing ([llm-stats](https://llm-stats.com/leaderboards/best-ai-for-image-generation)).

## What are the best hosted and local image generation and editing models?

### Takeaway

Hosted models lead both LMArena text-to-image and image-edit boards: **OpenAI GPT Image 2.5 (Sunburst/Flare)** and **GPT Image 2**, then **MAI-Image-2.6**, Grok Imagine 2.0, Meta Muse, Seedream 5.0 Pro, and Gemini 3.x image. For local editing, the options are **Qwen-Image-2.1** (unified gen+edit, research license), **Qwen-Image-Edit / -Edit-2511** (Apache 2.0), and **FLUX.2 dev/klein** (edit via references; non-commercial license). All run via mflux, ComfyUI, or Draw Things. mflux also supports FLUX.1 Kontext and FLUX fill inpainting.

### Cited Findings

- LMArena text-to-image (2026-09-24):
  - 1 gpt-image-2.5-sunburst 1424
  - 2 gpt-image-2.5-flare 1401
  - 3 gpt-image-2 (medium) 1383
  - 4 mai-image-2.6 1335
  - 5 reve-2.1 1302
  - 6 grok-imagine-image-2.0 1301
  - 7 muse-image (Meta) 1276
  - 9 gemini-3.1-flash-image 1261
  - 10 seedream-5.0-pro 1256
  - 11 qwen-image-3.0-pro 1256
  - 14 gemini-3-pro-image-2k 1247
  - 17 qwen-image-2.1 (open) 1228
  - 18 ideogram-4.0-quality 1205
  - — [arena.ai](https://arena.ai/leaderboard/text-to-image)
- LMArena image-edit (2026-09-21, 29.9M votes, 56 models):
  - 1 gpt-image-2.5-sunburst 1526
  - 2 gpt-image-2.5-flare 1482
  - 3 gpt-image-2 1461
  - 4 grok-imagine-image-2.0 1430
  - 5 mai-image-2.6 1429
  - 6 muse-image 1402
  - 8 seedream-5.0-pro 1394
  - 9 gemini-3-pro-image-2k 1390
  - 12 gemini-3.1-flash-image 1388
  - 16 qwen-image-2.1 1367
  - Top open-weight: qwen-image-edit #34 (1241, Apache 2.0), qwen-image-edit-2511 #35 (1235), flux-2-dev #38 (1226, non-commercial).
  - — [arena.ai image-edit](https://arena.ai/leaderboard/image-edit)
- The Artificial Analysis image-edit arena has a similar order (GPT Image 2.5 Sunburst 1180, Flare 1161, MAI-Image-2.6 1134). Its open-weight leaders are Qwen-Image-2.1 (1067), HunyuanImage 3.0 Instruct (1028), and Qwen Image Edit Plus 2511 (1023). — [Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/editing) (via search summary)
- llm-stats (2026-09-22) lists Gemini 3.1 Flash Image as the #1 editor by its own arena score (2858), ahead of GPT Image 2 (2785) and Gemini 3 Pro Image (2763). This conflicts with LMArena's ordering because it uses a different vote pool. — [llm-stats editing](https://llm-stats.com/leaderboards/best-ai-for-image-editing)
- OpenAI GPT Image 2 per-image prices at 1024×1024: $0.006 low / $0.053 medium / $0.211 high (1024×1536: $0.005 / $0.041 / $0.165). Token rates are $5/M text in, $8/M image in, $30/M image out. — [aifreeapi, checked Sep 6 2026](https://www.aifreeapi.com/en/posts/openai-image-generation-api-pricing), [costgoat](https://costgoat.com/pricing/openai-images); token rates confirmed via the OpenRouter endpoints API.
- GPT Image 2.5 Sunburst on OpenRouter: quality levels up to `xhigh`/`max`, transparent background, up to 16 reference images, streaming. — [OpenRouter images models API](https://openrouter.ai/api/v1/images/models)
- Qwen-Image-2.1 local editing: up to 10 references, masks, circle/paint annotations, RGBA layer editing. — [MarkTechPost](https://www.marktechpost.com/2026/09/21/alibaba-qwen-releases-qwen-image-2-1/)
- mflux editing support: FLUX.1 Kontext, FLUX.2 edit, Qwen Image edit, FIBO edit, fill/inpainting, multi-image editing, virtual try-on. mflux-paint is a native macOS inpaint/edit app built on mflux ("16 models across edit/inpaint/text-to-image, mask painting"). — [mflux README](https://github.com/filipstrand/mflux)

### Inferences

- **Hosted picks.**
  - Best quality: `openai/gpt-image-2.5-sunburst` (gen and edit).
  - Best value default: `openai/gpt-image-2` at medium (~$0.05).
  - Cheap and fast: `google/gemini-3.1-flash-image` or `-flash-lite-image`, or `black-forest-labs/flux.2-klein-4b` ($0.014/MP).
  - Typography and vector: Recraft v4.1 (`recraft/recraft-v4.1-vector`) or Ideogram 4.
- **Local generation picks:** Z-Image Turbo (speed), FLUX.2 klein 4B (speed + edit, but non-commercial for 9B/dev **[license of 4B UNVERIFIED]**), Qwen-Image-2.1 (quality, research-only).
- **Local editing picks:** Qwen-Image-Edit-2511 (Apache 2.0, the best commercially usable option), Qwen-Image-2.1 (best quality, research-only), FLUX.2 klein (fast). Qwen-Image-Edit (20B base) needs a 64 GB+ Mac for comfortable Q8 use.

### Gaps

- There are no measured M-series timings for Qwen-Image-Edit-2511 or Qwen-Image-2.1 via mflux.
- I did not confirm whether GPT Image 2.5 is on OpenAI's direct Images API with public per-image pricing. OpenRouter lists the same token rates as GPT Image 2.
- The GenEval numbers requested for these models were not collected.
