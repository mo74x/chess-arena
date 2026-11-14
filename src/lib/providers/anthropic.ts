import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildMovePrompts,
  type MovePromptRequest,
  type MoveProviderResult,
  type ProviderAdapter,
  type ProviderAdapterOptions,
} from './types';

export class AnthropicAdapter implements ProviderAdapter {
  async getMove(request: MovePromptRequest, options: ProviderAdapterOptions): Promise<MoveProviderResult> {
    if (!options.apiKey) {
      throw Object.assign(new Error('Missing Anthropic API key'), { status: 401 });
    }

    const client = new Anthropic({ apiKey: options.apiKey });
    const { system, user } = buildMovePrompts(request);

    const response = await client.messages.create(
      {
        model: request.model.apiModelId,
        max_tokens: request.retryContext ? 120 : request.model.maxOutputTokens,
        system,
        messages: [{ role: 'user', content: user }],
      },
      { signal: options.signal },
    );

    const rawText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    return {
      rawText,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }
}
