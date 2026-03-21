import type { SemanticEmbeddingProvider, SemanticEmbeddingRequest, SemanticEmbeddingResult } from "./types.js";

const LOCAL_NGRAM_DIMENSION = 384;
const LEGACY_DETERMINISTIC_PROVIDER = "deterministic";
const LOCAL_NGRAM_PROVIDER = "local-ngram";
const LOCAL_NGRAM_MODEL = "chargram-v1";

class LocalNgramEmbeddingProvider implements SemanticEmbeddingProvider {
  constructor(
    readonly provider = LOCAL_NGRAM_PROVIDER,
    readonly model = LOCAL_NGRAM_MODEL
  ) {}

  readonly version = "2";

  async embedBatch(input: SemanticEmbeddingRequest[]): Promise<SemanticEmbeddingResult[]> {
    return input.map((item) => ({
      nodeId: item.nodeId,
      chunkOrdinal: item.chunkOrdinal,
      contentHash: item.contentHash,
      vector: localNgramVector(item.text, LOCAL_NGRAM_DIMENSION),
      dimension: LOCAL_NGRAM_DIMENSION,
    }));
  }
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function forEachCharacterNgram(text: string, callback: (gram: string) => void) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return;
  }

  const source = ` ${normalized} `;
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= source.length - size; index += 1) {
      const gram = source.slice(index, index + size);
      // Keep boundary grams that contain spaces, but drop grams that are only whitespace.
      if (gram.trim()) {
        callback(gram);
      }
    }
  }
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    hash ^= codePoint & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= codePoint >>> 8;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function avalanche32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function localNgramVector(text: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0);
  let sawGram = false;

  forEachCharacterNgram(text, (gram) => {
    sawGram = true;
    const hash = fnv1a32(gram);
    const bucket = hash % dimension;
    const sign = (avalanche32(hash ^ 0x9e3779b9) & 1) === 0 ? 1 : -1;
    vector[bucket] += sign;
  });

  if (!sawGram) {
    return vector;
  }

  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];
    vector[index] = Math.sign(value) * Math.log1p(Math.abs(value));
  }

  return normalizeVector(vector);
}

export function resolveSemanticEmbeddingProvider(input: {
  provider: string | null;
  model: string | null;
}): SemanticEmbeddingProvider | null {
  const normalized = normalizeSemanticProviderConfig(input);
  if (!normalized.provider || normalized.provider === "disabled" || !normalized.model || normalized.model === "none") {
    return null;
  }

  if (normalized.provider === LOCAL_NGRAM_PROVIDER) {
    return new LocalNgramEmbeddingProvider();
  }

  return null;
}

export async function embedSemanticQueryText(input: {
  provider: string | null;
  model: string | null;
  text: string;
}): Promise<SemanticEmbeddingResult | null> {
  const provider = resolveSemanticEmbeddingProvider({
    provider: input.provider,
    model: input.model
  });
  if (!provider || !input.text.trim()) {
    return null;
  }

  const [result] = await provider.embedBatch([
    {
      nodeId: "__query__",
      chunkOrdinal: 0,
      contentHash: "__query__",
      text: input.text,
    }
  ]);
  return result ?? null;
}

export function normalizeSemanticProviderConfig(input: {
  provider: string | null;
  model: string | null;
}): {
  provider: string | null;
  model: string | null;
} {
  if (input.provider === LEGACY_DETERMINISTIC_PROVIDER) {
    return {
      provider: LOCAL_NGRAM_PROVIDER,
      model: LOCAL_NGRAM_MODEL,
    };
  }

  return input;
}
