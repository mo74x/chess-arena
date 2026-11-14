import 'server-only';
import OpenAI from 'openai';
import {
  buildMovePrompts,
  type MovePromptRequest,
  type MoveProviderResult,
  type ProviderAdapter,
  type ProviderAdapterOptions,
} from './types';

export class OpenAIAdapter implements ProviderAdapter {
  async getMove(request: MovePromptRequest, options: ProviderAdapterOptions): Promise<MoveProviderResult> {
    if (!options.apiKey) {
      throw Object.assign(new Error('Missing OpenAI API key'), { status: 401 });
    }

    const client = new OpenAI({ apiKey: options.apiKey });
    const { system, user } = buildMovePrompts(request);

    const response = await client.chat.completions.create(
      {
        model: request.model.apiModelId,
        max_tokens: request.retryContext ? 120 : request.model.maxOutputTokens,
        temperature: request.model.temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      { signal: options.signal },
    );

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
