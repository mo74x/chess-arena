import 'server-only';
import OpenAI from 'openai';
import {
  buildMovePrompts,
  type MovePromptRequest,
  type MoveProviderResult,
  type ProviderAdapter,
  type ProviderAdapterOptions,
} from './types';

/**
 * Detects OpenAI reasoning-family models (`o1`, `o3`, `o4`, `gpt-5`, etc.)
 * which require `max_completion_tokens` instead of `max_tokens` and disallow
 * custom `temperature` values.
 */
export function isOpenAIReasoningModel(apiModelId: string): boolean {
  const normalized = apiModelId.trim().toLowerCase();
  return /^(o\d+|gpt-5)([-._:]|$)/.test(normalized);
}

export class OpenAIAdapter implements ProviderAdapter {
  async getMove(request: MovePromptRequest, options: ProviderAdapterOptions): Promise<MoveProviderResult> {
    if (!options.apiKey) {
      throw Object.assign(new Error('Missing OpenAI API key'), { status: 401 });
    }

    const client = new OpenAI({ apiKey: options.apiKey });
    const { system, user } = buildMovePrompts(request);
    const reasoning = isOpenAIReasoningModel(request.model.apiModelId);
    const baseTokens = request.retryContext ? 120 : request.model.maxOutputTokens;

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = reasoning
      ? {
          model: request.model.apiModelId,
          // Reasoning tokens share max_completion_tokens; budget extra headroom so JSON output isn't truncated.
          max_completion_tokens: Math.max(request.retryContext ? 800 : 1500, baseTokens * 4),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }
      : {
          model: request.model.apiModelId,
          max_tokens: baseTokens,
          temperature: request.model.temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        };

    const response = await client.chat.completions.create(params, { signal: options.signal });

    const rawText = response.choices[0]?.message?.content?.trim() ?? '';
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    return {
      rawText,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
      },
    };
  }
}
