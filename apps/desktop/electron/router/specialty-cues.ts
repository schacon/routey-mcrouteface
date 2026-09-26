import type { RunnableSpecialty } from "../../contracts/specialties";

export interface SpecialtyCue {
  readonly kind: RunnableSpecialty;
  readonly reason: string;
}

const AUDIO_FILE = /\S+\.(mp3|wav|m4a|aac|aiff?|flac|ogg|opus|caf)\b/i;
const TRANSCRIBE = /\b(transcribe|transcription|transcript of|speech[- ]to[- ]text|dictation)\b/i;
const AUDIO_QUESTION =
  /\b(what (is|was|do|does|did) .{0,30}(say|said)|summari[sz]e (this|the) (recording|audio|call|meeting|memo|podcast))\b/i;
const SPEAK =
  /\b(text[- ]to[- ]speech|tts|read (this|it|that|them)( [a-z]+)? (aloud|out loud)|say (this|it|that) out loud|voice[- ]?over|narrate|narration|audio version|spoken version|(as|into) (an? )?(audio|mp3|wav|m4a) (file|clip))\b/i;
const IMAGE_NOUN =
  /\b(image|picture|photo|illustration|logo|icon|drawing|painting|poster|wallpaper|artwork|avatar|banner|sticker|mockup|thumbnail|portrait|render)s?\b/i;
const MAKE_VERB =
  /\b(generate|create|make|draw|design|render|paint|sketch|illustrate|produce|imagine)\b/i;
/** "docker image", "an image component": software, not pictures. */
const SOFTWARE_IMAGE =
  /\b(docker|container|disk|iso|base|vm|oci)\s+images?\b|\b(component|css|svg|html|jsx|tsx|react|swiftui|function|class|script|endpoint|api|upload|resize|compress|lazy[- ]?load|<img)\b/i;
const EDIT_VERB =
  /\b(edit|retouch|remove|erase|replace|change|recolou?r|restyle|colou?ri[sz]e|upscale|crop out|blur|make (it|this|the|him|her|them)|turn (it|this) into|add|put)\b/i;
const QUESTION_START =
  /^\s*(what|why|how|who|where|which|when|is|are|does|do|can you (tell|explain|read|describe|see)|describe|explain|read|ocr|extract)\b/i;

/**
 * A narrow media task the prompt asks for, from its wording and whether it
 * carries images. Deterministic so every classifier gets the same answer; the
 * router applies it only when an engine for the specialty is set up.
 */
export function detectSpecialty(prompt: string, hasImages: boolean): SpecialtyCue | undefined {
  const text = prompt.trim();
  if (TRANSCRIBE.test(text) || (AUDIO_FILE.test(text) && AUDIO_QUESTION.test(text))) {
    return { kind: "transcription", reason: "asks to transcribe or listen to a recording" };
  }
  if (SPEAK.test(text)) {
    return { kind: "speech", reason: "asks for text read aloud as audio" };
  }
  if (hasImages && EDIT_VERB.test(text) && !QUESTION_START.test(text)) {
    return { kind: "image-editing", reason: "asks to change an attached image" };
  }
  if (MAKE_VERB.test(text) && IMAGE_NOUN.test(text) && !SOFTWARE_IMAGE.test(text)) {
    return { kind: "image-generation", reason: "asks for a new picture" };
  }
  return undefined;
}
