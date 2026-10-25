export type Provider = 'anthropic' | 'openai';

export interface AiConfig { provider: Provider; model: string; apiKey: string }

export type AiErrorKind =
  | 'no_key' | 'unauthorized' | 'rate_limited' | 'model_not_found' | 'network'
  | 'refused' | 'truncated' | 'invalid_output' | 'server';

export type AiResult<T> = { ok: true; data: T } | { ok: false; kind: AiErrorKind; message: string };

/** One structured-output request: text (and optionally photos) in, JSON out. */
export interface StructuredRequest {
  system: string;
  text: string;
  /** Base64 JPEG payloads (no data: prefix). */
  imagesBase64?: string[];
  /** JSON Schema the reply must match. */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
}
