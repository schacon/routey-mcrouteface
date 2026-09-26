# Audio and Video Models: Local (Apple-silicon Mac) and Hosted, as of September 2026

Research date: 2026-09-26. Tags used below:

- **[verified]**: confirmed this session against a primary source or live API.
- **[secondary]**: from a blog, aggregator or vendor marketing page, not independently checked.
- **[unverified]**: from background knowledge only, not re-checked this session.

Several 2026 "benchmark" blogs, such as Contra Collective and aggregator ranking sites, look partly machine-generated and disagree with each other. Numbers from them are flagged.

Two limits on this research:

- The live Open ASR Leaderboard table could not be scraped because the HF Space renders client-side.
- The OpenRouter model list was pulled live from `https://openrouter.ai/api/v1/models` on 2026-09-26.

---

## Best transcription accuracy vs speed on Mac today (Whisper large-v3-turbo vs Parakeet TDT vs others; Open ASR leaderboard WER)?

### Takeaway

On a Mac the choice is between three models:

- **Parakeet TDT 0.6B v3** is the fastest. It handles English and 25 European languages and runs through parakeet-mlx or Core ML.
- **Whisper large-v3-turbo** has the widest language coverage (99 languages) and runs through WhisperKit/Core ML, whisper.cpp or mlx-whisper.
- **Qwen3-ASR 1.7B** is the newer accuracy leader on Mac benchmarks.

On the open leaderboard, NVIDIA Canary-Qwen-2.5B and Qwen3-ASR-1.7B hold the top average WER, around 5.1-5.8%. Hosted APIs score much lower on the Artificial Analysis WER metric, around 1.7-2.3%. That metric uses a different test set, so the two sets of numbers can't be compared directly.

**Diarization:**

- Local: pyannote `speaker-diarization-community-1` (pyannote.audio 4.0). Newer mlx-audio options are VibeVoice-ASR (9B, with diarization built in) and MOSS-Transcribe-Diarize.
- Hosted: Deepgram Nova-3 includes diarization in the batch price, and OpenAI has `gpt-4o-transcribe-diarize`.

### Cited Findings

**Open ASR Leaderboard (English, average WER)**

- Canary-Qwen 2.5B is ranked #1 at 5.63% WER, followed by IBM Granite Speech 3.3, Phi-4 Multimodal and Parakeet — [AssemblyAI blog](https://www.assemblyai.com/blog/top-open-source-stt-options-for-voice-applications); [Slator](https://slator.com/nvidia-microsoft-elevenlabs-top-automatic-speech-recognition-leaderboard/) [secondary]
- One secondary source says Qwen3-ASR 1.7B has the lowest mean English WER at 5.76. It also gives Canary-Qwen 5.63, Parakeet TDT 0.6B v3 6.32, and says Parakeet TDT 1.1B reaches RTFx above 2,000 — [search-summarised from MarkTechPost / Northflank / Gladia](https://www.marktechpost.com/2026/07/23/best-open-speech-recognition-asr-models-in-2026-wer-languages-latency-and-license-compared/) [secondary]
- Another source puts Canary-Qwen at **5.1%** in the "July 7 snapshot", which conflicts with 5.63%. The difference may come from a leaderboard revision — [search summary citing Open ASR Leaderboard](https://artificialanalysis.ai/speech-to-text/non-streaming) [secondary, conflicting]

**Apple-silicon benchmark (Soniqo, M5 Pro 48 GB, clean English)** — [Soniqo benchmarks](https://soniqo.audio/benchmarks) [secondary; single vendor]

| Engine          | Model / quant                  | WER% | RTF                          | Peak RSS |
| --------------- | ------------------------------ | ---- | ---------------------------- | -------- |
| Qwen3-ASR       | 1.7B, 5-bit (MLX)              | 1.32 | 0.027                        | 1.92 GB  |
| Qwen3-ASR       | 0.6B, 8-bit                    | 1.82 | 0.015                        | 1.3 GB   |
| WhisperKit      | large-v3-turbo, FP16 (Core ML) | 1.71 | 0.084                        | 0.4 GB   |
| Parakeet        | TDT v3, INT8                   | 2.37 | 0.009 (about 110x real time) | 0.9 GB   |
| Omnilingual CTC | 300M, 4-bit                    | 4.26 | 0.005                        | 0.4 GB   |

**Other Mac speed and accuracy reports**

- Contra Collective (M5 Max, mlx-whisper 0.4, FP16, batch 1) [secondary; possibly synthetic, treat as low confidence] — [Contra Collective](https://contracollective.com/blog/whisper-large-v3-turbo-vs-parakeet-tdt-vs-distil-whisper-m5-max-mlx-2026)
  - Real-time speed: Whisper turbo 42x, Parakeet TDT 68x, Distil-Whisper 96x.
  - Peak memory: Whisper turbo 3.2 GB, Parakeet 4.4 GB, Distil 2.6 GB. With Q4 quantisation: 1.1, 1.6 and 0.9 GB.
  - WER on business calls: Whisper turbo 4.6%, Parakeet 5.2%.
  - WER on meeting cross-talk: Parakeet 7.6%, Whisper turbo 8.4%.
- Other reports put Parakeet under MLX at about 100x real time on M5 Max, Whisper large-v3 at 12-18x and turbo at 20-30x — [Contra Collective M5 Max post](https://contracollective.com/blog/local-speech-to-text-whisper-parakeet-mlx-m5-max-2026) [secondary]
- In one latency test, parakeet-mlx averaged 0.50 s versus 1.02 s for mlx-whisper large-v3-turbo — [mac-whisper-speedtest](https://github.com/anvanvan/mac-whisper-speedtest) [secondary]
- One source says "Parakeet on MLX is 2.6x slower than Whisper on CoreML for the same audio", i.e. the WhisperKit ANE path. It also notes that MLX Parakeet "monopolized the GPU" — [MacParakeet blog](https://macparakeet.com/blog/whisper-to-parakeet-neural-engine/) [secondary]
- Mac speech-to-text has settled into two routes [secondary] — [MacParakeet](https://macparakeet.com/blog/whisper-to-parakeet-neural-engine/)
  - Whisper → WhisperKit (Argmax) → Core ML → Neural Engine
  - Parakeet → parakeet-mlx → MLX → GPU
- Parakeet v3 covers 25 European languages and only transcribes. Whisper covers 99 languages and can translate into English — [Spokenly](https://spokenly.app/blog/parakeet-vs-whisper) [secondary]
- WhisperKit Core ML model repo: `argmaxinc/whisperkit-coreml` — [HF](https://huggingface.co/argmaxinc/whisperkit-coreml) [verified exists]

**mlx-audio speech-to-text models** [verified from README] — [mlx-audio](https://github.com/Blaizzy/mlx-audio)

- Whisper: `mlx_audio.stt.generate --model mlx-community/whisper-large-v3-turbo-asr-fp16 --audio audio.wav`
- Qwen3-ASR
- Parakeet v3
- VibeVoice-ASR: Microsoft, 9B, with diarization and timestamps
- Voxtral Realtime: 4B streaming
- MOSS-Transcribe-Diarize: speaker labels plus timestamps
- Install with `pip install mlx-audio`. Requires Python 3.10+ and ffmpeg. It can serve an OpenAI-compatible REST API.

**Diarization (local)**

- pyannote `speaker-diarization-community-1` ships in pyannote.audio 4.0. It posted the lowest DER in all ten domains of pyannote's public benchmark. It predicted the exact speaker count on 70% of a 250-file internal set, and it clearly beats `speaker-diarization-3.1` — [pyannote blog](https://www.pyannote.ai/blog/community-1); [HF card](https://huggingface.co/pyannote/speaker-diarization-community-1) [vendor]
- Speaker-embedding latency on Mac: CAM++ via Core ML (ANE) 12 ms; WeSpeaker ResNet34 via MLX 64 ms — [Soniqo](https://soniqo.audio/benchmarks) [secondary]
- VAD on Mac: FireRedVAD Core ML scored F1 99.1 at RTF 0.007; Silero v5 Core ML scored F1 95.1 — [Soniqo](https://soniqo.audio/benchmarks) [secondary]

**Hosted speech-to-text**

- Artificial Analysis leaderboard (AA-WER, lower is better, 61 models): StepAudio 3 ASR 1.7%, Fun-Realtime-ASR-preview 1.7%, MAI-Transcribe-2 2.0%, **ElevenLabs Scribe v2 2.2%**, Grok Voice Transcribe 2.0 2.3% — [Artificial Analysis STT](https://artificialanalysis.ai/speech-to-text/non-streaming) [secondary via search summary]
- OpenAI pricing [verified] — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)

  | Model                                                 | Price       |
  | ----------------------------------------------------- | ----------- |
  | `gpt-transcribe`                                      | $0.0045/min |
  | `gpt-4o-transcribe`                                   | $0.006/min  |
  | `gpt-4o-mini-transcribe`                              | $0.003/min  |
  | `gpt-4o-transcribe-diarize`                           | $0.006/min  |
  | `whisper-1`                                           | $0.006/min  |
  | `gpt-live-transcribe` / `gpt-realtime-whisper` (live) | $0.017/min  |
  | `gpt-realtime-translate`                              | $0.034/min  |

- Deepgram Nova-3 [secondary] — [ConvertAudioToText](https://convertaudiototext.com/blog/deepgram-nova-3-explained); [HappyRobot](https://www.happyrobot.ai/hub/deepgram-pricing)
  - $0.0043/min batch (about $0.26/hr), with diarization included.
  - $0.0077/min streaming, plus $0.002/min for diarization.
- AssemblyAI [secondary; sources conflict] — [aibizhub](https://aibizhub.io/articles/deepgram-vs-assemblyai-pricing-2026/)
  - One source gives about $0.21/hr async, $0.45/hr realtime and +$0.02/hr for diarization.
  - Another gives Universal-2 at $0.15/hr with diarization included.

### Inferences

- For a local default, Parakeet TDT v3 suits English and European languages where speed matters, such as dictation and long files. WhisperKit large-v3-turbo suits multilingual audio or translation, and it leaves the GPU free. Qwen3-ASR 1.7B through mlx-audio is the accuracy-first local choice.
- whisper.cpp is still a portable fallback: `ggml-large-v3-turbo.bin`, Metal plus a Core ML encoder. I did not re-benchmark it this session.
- For hosted work, the cheap bulk tier is `gpt-4o-mini-transcribe` or Deepgram Nova-3. For accuracy, use ElevenLabs Scribe v2 or `gpt-4o-transcribe`. For diarized output, use Deepgram (included in the price) or `gpt-4o-transcribe-diarize`.

### Gaps

- Could not read the live Open ASR Leaderboard table (JS-rendered). Top WER values conflict: 5.63 vs 5.1 for Canary-Qwen.
- Found no primary pricing this session for Google Chirp 3 or for ElevenLabs Scribe v2 per-hour cost.
- Found no Mac MPS speed figures for pyannote community-1. Its RTF on Apple silicon is unknown.
- Apple's built-in `SFSpeechRecognizer` / macOS 26 `SpeechAnalyzer` were not benchmarked in any source I found [unverified: SpeechAnalyzer exists as the newer on-device API].
- I did not verify whisper.cpp model names or README changes this session.

---

## Best local TTS quality and speed on Mac?

### Takeaway

- **Kokoro-82M** is the speed and footprint winner on Mac: RTF about 0.17 via Core ML, about 170 MB. It runs through mlx-audio or Core ML, but its quality ranks below the leaders (Elo about 1062 on Artificial Analysis).
- **Qwen3-TTS** and **CosyVoice3** give higher quality and voice cloning at RTF about 0.6-0.8, which is still faster than real time.
- **Fish Audio S2 Pro** is the top open-weights model on the Artificial Analysis arena.
- Hosted TTS leaders are Gemini 3.1 Flash TTS, Cartesia Sonic 3.5 and similar services. OpenAI `gpt-4o-mini-tts` is cheap.

### Cited Findings

**Mac TTS benchmark** — [Soniqo](https://soniqo.audio/benchmarks) [secondary]

| Model                | Size    | Round-trip WER | RTF  |
| -------------------- | ------- | -------------- | ---- |
| CosyVoice3 0.5B      | ~1.9 GB | 3.25%          | 0.59 |
| Qwen3-TTS 1.7B 4-bit | ~2.3 GB | 3.47%          | 0.79 |
| Kokoro-82M Core ML   | ~170 MB | 3.90%          | 0.17 |

- Kokoro Core ML produces 30 s of speech in 379 ms on a Mac Studio, which the source says is 2x faster than MLX on the same hardware — [search summary: kokoro-coreml / Soniqo](https://huggingface.co/mattmireles/kokoro-coreml) [secondary]

**mlx-audio TTS models and commands** [verified from README] — [mlx-audio](https://github.com/Blaizzy/mlx-audio)

- Kokoro: `mlx_audio.tts.generate --model mlx-community/Kokoro-82M-bf16 --text "Hello" --voice af_heart`
- Qwen3-TTS: `mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit`
- Other supported models:
  - KittenTTS
  - OmniVoice (646+ languages, zero-shot cloning)
  - Higgs Audio v3 (voice cloning)
  - VoxCPM2 (2B, 48 kHz)
  - KugelAudio 7B
  - Voxtral TTS 4B
  - MeloTTS
- Quantisation from 3-bit to 8-bit, plus an OpenAI-compatible server.

**Arena rankings**

- Artificial Analysis Speech Arena top 5 by Elo: Gemini 3.1 Flash TTS 1214, "Realtime TTS-2 Research Preview" 1209, Sonic 3.5 1203, Realtime TTS 1.5 Max 1195, xAI TTS 1194 — [Artificial Analysis TTS](https://artificialanalysis.ai/text-to-speech/leaderboard) [secondary via search summary]
- On the same arena, Kokoro 82M v1.0 is cheapest at $0.65/1M characters with Elo 1062. Fish Audio S2 Pro is the top open-weights model at Elo 1123 — [Artificial Analysis TTS](https://artificialanalysis.ai/text-to-speech/leaderboard) [secondary]

**Hosted TTS pricing**

- OpenAI [verified] — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
  - `tts-1`: $15/1M characters
  - `tts-1-hd`: $30/1M characters
  - `gpt-4o-mini-tts`: $0.60/1M text-input tokens and $12/1M audio-output tokens
- OpenRouter lists `openai/gpt-audio` and `openai/gpt-audio-mini` with audio output [verified live API]

### Inferences

- Default local TTS: Kokoro through mlx-audio or Core ML for low latency.
- Offer Qwen3-TTS or CosyVoice3 through mlx-audio when quality or cloning matters. They need about 2 GB.
- Hosted quality tier: Gemini 3.1 Flash TTS, Cartesia Sonic, or ElevenLabs.

### Gaps

- Not verified this session: F5-TTS-MLX, Sesame CSM-1B, Orpheus 3B, Dia 1.6B. They are not in the current mlx-audio README excerpt [unverified: earlier mlx-audio versions supported CSM, Orpheus and Dia; they may still work but were not listed].
- ElevenLabs per-character API pricing was not retrieved from a primary source.
- Where ElevenLabs sits on the 2026 arena is unclear.
- The macOS `say` command still works with no install, but its quality and ranking were not researched [unverified].

---

## Which OpenRouter models accept audio input or video input, and in what request format?

### Takeaway

- **Audio** goes to `/api/v1/chat/completions` as a base64 `input_audio` content part. URLs are not allowed.
- **Video** uses a `video_url` content part, as either a URL or a base64 data URL.
- Gemini 2.5/3.x Flash and Pro accept both audio and video, as do Qwen3.8-Omni-Flash, Xiaomi MiMo v2.5/2.6, Meta Muse Spark and Nemotron-3-Nano-Omni. OpenAI gpt-audio models and Voxtral accept audio only.
- Many Qwen, GLM, Kimi K3, Seed and Gemma 4 models accept video but not audio.

### Cited Findings

**Audio request format** [verified] — [OpenRouter audio docs](https://openrouter.ai/docs/guides/overview/multimodal/audio)

```json
{ "type": "input_audio", "input_audio": { "data": "<base64>", "format": "wav" } }
```

- The part goes inside `messages[].content[]` next to a `{"type":"text"}` part.
- Formats: wav, mp3, aiff, aac, ogg, flac, m4a, pcm16, pcm24. Support varies by model.
- "Audio files must be base64-encoded - direct URLs are not supported."

**Video request format** [verified] — [OpenRouter video docs](https://openrouter.ai/docs/guides/overview/multimodal/videos)

```json
{
  "type": "video_url",
  "video_url": { "url": "https://... or data:video/mp4;base64,...", "processing": "agentic|static" }
}
```

- `processing` applies to Gemini only.
- Formats: mp4, mpeg, mov, webm.
- Gemini via AI Studio accepts only YouTube links. Gemini via Vertex accepts only base64 data URLs.
- Video is API-only, not available in the chatroom.

**Models with audio and/or video input**, from the live `GET https://openrouter.ai/api/v1/models` call on 2026-09-26 [verified]. Prices are per 1M tokens.

Audio and video input:

| Model                                                        | Price (per 1M tokens)                                   |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `google/gemini-3.8-flash`                                    | $0.75 in / $0.75 audio / $3.75 out; `:batch` half price |
| `google/gemini-3.7-flash`, `google/gemini-3.6-flash`         | same pricing as 3.8 Flash                               |
| `google/gemini-3.5-flash`                                    | $1.50 in / $3 audio / $9 out                            |
| `google/gemini-3.5-flash-lite`                               | $0.30 in / $0.30 audio / $2.50 out                      |
| `google/gemini-3.1-flash-lite`                               | $0.25 in / $0.50 audio / $1.50 out                      |
| `google/gemini-3.1-pro-preview`, `~google/gemini-pro-latest` | $2 in / $2 audio / $12 out                              |
| `google/gemini-3-flash-preview`                              | $0.50 in / $1 audio / $3 out                            |
| `google/gemini-2.5-pro`                                      | $1.25 in / $1.25 audio / $10 out                        |
| `google/gemini-2.5-flash`                                    | $0.30 in / $1 audio / $2.50 out                         |
| `google/gemini-2.5-flash-lite`                               | $0.10 in / $0.30 audio / $0.40 out                      |
| `qwen/qwen3.8-omni-flash`                                    | $0.15 in / $0.47 out                                    |
| `xiaomi/mimo-v2.6-flash`                                     | $0.14 / $0.28                                           |
| `xiaomi/mimo-v2.6-pro`                                       | $0.435 / $0.87                                          |
| `xiaomi/mimo-v2.6-pro-ultraspeed`                            | $4.35 / $8.70                                           |
| `xiaomi/mimo-v2.5`                                           | $0.14 / $0.28                                           |
| `meta/muse-spark-1.3` (also 1.2, 1.1)                        | $1.25 / $4.25                                           |
| `perceptron/perceptron-mk1.5`                                | $0.15 / $1.50                                           |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`         | free                                                    |
| `openrouter/auto`, `openrouter/auto-beta`                    | router, not a fixed model                               |

Audio input only:

| Model                                                                       | Price (per 1M tokens)                                     |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `openai/gpt-audio`                                                          | $2.50 text in / $32 audio in / $10 out; also audio output |
| `openai/gpt-audio-mini`                                                     | $0.60 / $0.60 / $2.40; also audio output                  |
| `mistralai/voxtral-small-24b-2507`                                          | $0.10 in / $100 audio field as listed / $0.30 out         |
| `thinkingmachines/inkling`, `thinkingmachines/inkling-small` (plus `:free`) | —                                                         |

Video input only (no audio), selected models:

- `qwen/qwen3.8-max-prime`, `qwen/qwen3.8-max-0902`, `qwen/qwen3.8-flash`, `qwen/qwen3.8-27b(:free)`
- `qwen/qwen3.6-*`, `qwen/qwen3.5-*`
- `moonshotai/kimi-k3`
- `z-ai/glm-5.3-flash`, `z-ai/glm-5.3-flashx`, `z-ai/glm-5v-turbo`, `z-ai/glm-4.6v`
- `bytedance-seed/seed-2-1-turbo`, `bytedance-seed/seed-2.0-lite`, `bytedance-seed/seed-2.0-mini`
- `minimax/minimax-m3`, `stepfun/step-3.7-flash`
- `google/gemma-4-26b-a4b-it(:free)`, `google/gemma-4-31b-it(:free)`
- `amazon/nova-2-lite-v1`, `rekaai/reka-edge`, `inclusionai/ling-3.0-flash-vl`

Audio output: the same query also lists `google/lyria-3-pro-preview` and `google/lyria-3-clip-preview` (music) and the OpenAI gpt-audio models.

### Inferences

- For "Q&A over audio" through OpenRouter, a cheap default is `google/gemini-3.1-flash-lite` or `google/gemini-3.5-flash-lite`. Use Gemini 3.x Pro or Flash for quality. `qwen/qwen3.8-omni-flash` or `xiaomi/mimo-v2.6-flash` are cheaper non-Google options.
- For video understanding, use Gemini, since it is the only family that also hears the audio track at scale. Qwen3.8 or Kimi K3 work for visual-only analysis.
- A router must base64-encode local audio, while video can be sent as a URL.

### Gaps

- The `audio` price field for Voxtral ($0.0001 per token, i.e. $100/1M) looks anomalous or per-second. Check it before relying on it.
- Per-model limits on audio and video length, and token accounting per second of media, were not collected.

---

## Which video generation models can run on a Mac at all, and which hosted ones lead quality leaderboards?

### Takeaway

**Local video generation** is possible on Apple silicon through MLX ports:

- LTX-2 / LTX-2.3 (19-22B) via `mlx-video` or `ltx-2-mlx`, needing about 19-20 GB at Q4.
- Wan 2.1 (1.3B / 14B) and Wan 2.2 (TI2V-5B, T2V/I2V-14B). The 14B models need about 32 GB even at Q4.

These are practical on 32 GB+ Macs, and comfortable on 64 GB+.

**Hosted video leaderboards (Artificial Analysis Video Arena, Sep 2026):**

- With audio: Gemini Omni Flash leads, then Wan 3.0, MiniMax H3 Max and Seedance 2.0.
- Without audio: Wan 3.0 leads, then Gemini Omni Flash and MiniMax H3.

OpenAI's Sora API (`sora-2`, `sora-2-pro`) was **removed on 2026-09-24**.

### Cited Findings

**Local on Mac**

- `mlx-video` supports three model families [verified from README] — [mlx-video](https://github.com/Blaizzy/mlx-video)
  - LTX-2 (19B)
  - Wan2.1 (1.3B / 14B T2V)
  - Wan2.2 (T2V-14B, TI2V-5B, I2V-14B)

  Install and commands:
  - `pip install git+https://github.com/Blaizzy/mlx-video.git`
  - `uv run mlx_video.ltx_2.generate --prompt "..." -n 97 --width 768`
  - `python -m mlx_video.wan_2.generate --model-dir wan21_mlx --prompt "..."`
  - Requires Python ≥3.11 and MLX ≥0.22. The README states no memory or speed figures.

- Other MLX ports and apps [verified exist via search] — [dgrauet/ltx-2-mlx](https://github.com/dgrauet/ltx-2-mlx); [ltx-video-mac](https://github.com/james-see/ltx-video-mac)
  - `dgrauet/ltx-2-mlx`: LTX-2.3 and LTX-2.5, text/image/audio-to-video with audio.
  - `james-see/ltx-video-mac`: a native macOS app for LTX-2, 2.3 and 2.5 plus MiniMax H3.
- Memory [secondary] — [note.com mlx-video guide](https://note.com/mikai_daichi/n/nab2a5d452f83?hl=en)
  - LTX-2.3 Q4 uses about 19.4 GB.
  - Wan2.2 14B uses nearly all of 32 GB even at Q4.
  - Wan2.2-Lightning LoRA cuts sampling from 50 steps to 4.

**Hosted leaderboards** — [Artificial Analysis T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video) [secondary via search summary]

- Text-to-video with audio, by Elo: Gemini Omni Flash 1233, Wan 3.0 1229, MiniMax H3 Max 1227, MiniMax H3 1220, Dreamina Seedance 2.0 720p 1210.
- Text-to-video without audio, by Elo: Wan 3.0 1335, Gemini Omni Flash 1332, MiniMax H3 1302, HappyHorse-1.0 1286, HappyHorse-1.1 1272.

**Hosted video pricing** [secondary; aggregator blogs, verify before quoting] — [CometAPI](https://www.cometapi.com/ai-video-api-pricing/); [buildmvpfast](https://www.buildmvpfast.com/api-costs/ai-video)

- Veo 3.1: Lite about $0.05/s, Fast about $0.15/s, Standard about $0.40/s.
- Kling 3.0: about $0.09-0.14/s.
- Sora 2: $0.10/s; Sora 2 Pro up to $0.70/s.

**Sora shutdown** — [OpenAI Help Center](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation); [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) [secondary via search summary of primary pages]

- Announced 2026-03-24.
- Sora app and web closed 2026-04-26.
- The Videos API and `sora-2`, `sora-2-pro` and their dated snapshots were removed 2026-09-24.
- OpenAI names no replacement.

### Inferences

- A router should treat local video generation as opt-in and tied to hardware. Check for about 24 GB+ free unified memory for LTX-2.3 Q4, or 32 GB+ for Wan 14B. Expect minutes per clip (speed not verified).
- For hosted generation: Veo 3.1 / Gemini Omni Flash for quality with audio, Kling 3.0 for cost, Wan 3.0 or MiniMax H3 as strong alternatives.
- Drop Sora from any routing table.

### Gaps

- No verified per-clip generation times on M-series for LTX-2 or Wan.
- Runway Gen-4.x pricing and rank, and Veo model ids and official Google pricing, were not verified from primary pages.
- The model ids and pricing for "Gemini Omni Flash" were not confirmed.

---

## Additional task areas (audio understanding local, video understanding, music generation)

### Takeaway

- **Local audio Q&A:** use an omni model. Qwen3-Omni / Qwen2.5-Omni via MLX or llama.cpp was not verified this session. In practice, speech-to-text plus a text LLM is the reliable local route.
- **Local video understanding:** Qwen3-VL-class models via mlx-vlm (unverified this session).
- **Hosted:** Gemini leads both audio and video understanding.
- **Music, local:** ACE-Step 1.5 supports Mac officially. mlx-audio lists MiniMax Music 3.
- **Music, hosted:** Suno v5.5 (no official public API), ElevenLabs Eleven Music (API), Google Lyria 3 (on OpenRouter).

### Cited Findings

- ACE-Step 1.5 is an open music foundation model. It supports Mac, AMD, Intel and CUDA, and generates a full song in under 2 s on an A100 or under 10 s on an RTX 3090 — [ACE-Step-1.5 GitHub](https://github.com/ace-step/ACE-Step-1.5) [vendor]
- mlx-audio lists "MiniMax Music 3", 44.1 kHz stereo music generation with lyrics — [mlx-audio](https://github.com/Blaizzy/mlx-audio) [verified README]
- Suno v5.5 is the current model, released 2026-03-26. Plans: Pro $10/mo (2,500 credits), Premier $30/mo (10,000 credits) — [techjacksolutions](https://techjacksolutions.com/ai-tools/suno/suno-pricing/) [secondary]
- The top AI music models ranked by aggregators are Suno v5.5, Udio v1.5, Lyria 3 Pro, Eleven Music and Stable Audio 2.5 — [Apiframe](https://apiframe.ai/rankings/best-ai-music-model) [secondary, low confidence]
- ElevenLabs Music API: one source quotes $0.15/min, while a reseller lists $0.64/min — [ElevenLabs pricing](https://elevenlabs.io/pricing/api); [PoYo](https://poyo.ai/models/elevenlabs-music) [conflicting]. ElevenLabs has launched "Music v2" — [ElevenLabs blog](https://elevenlabs.io/blog/introducing-music-v2)
- OpenRouter exposes `google/lyria-3-pro-preview` and `google/lyria-3-clip-preview`, both with audio output [verified live API]
- Gemini models on OpenRouter take both audio and video input. The prices are listed in the OpenRouter section above [verified]

### Inferences

- A pragmatic local "audio understanding" pipeline is Parakeet or Whisper for speech-to-text, plus pyannote for speaker turns, then a local text LLM.
- Hosted, send the audio directly to Gemini Flash-Lite or Flash on OpenRouter.

### Gaps

- Not verified this session:
  - Qwen3-Omni or Qwen2.5-Omni running on a Mac (MLX or GGUF availability, memory).
  - Qwen3-VL video input through mlx-vlm.
  - MusicGen and Stable Audio Open on Mac.
- MusicGen and Stable Audio Open are likely superseded by ACE-Step 1.5 for local quality [unverified inference].
- Udio API availability and Suno API status were not confirmed.
