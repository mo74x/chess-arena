import 'server-only';
import { GoogleGenAI } from '@google/genai';
import {
  buildMovePrompts,
  type MovePromptRequest,
  type MoveProviderResult,
  type ProviderAdapter,
  type ProviderAdapterOptions,
} from './types';

export class GoogleGeminiAdapter implements ProviderAdapter {
  async getMove(request: MovePromptRequest, options: ProviderAdapterOptions): Promise<MoveProviderResult> {
    if (!options.apiKey) {
      throw Object.assign(new Error('Missing Gemini API key'), { status: 401 });
    }

    const ai = new GoogleGenAI({ apiKey: options.apiKey });
    const { system, user } = buildMovePrompts(request);

    const response = await ai.models.generateContent({
      model: request.model.apiModelId,
      contents: user,
      config: {
        systemInstruction: system,
        temperature: request.model.temperature,
        maxOutputTokens: request.retryContext ? 150 : request.model.maxOutputTokens,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: options.signal,
      },
    });

    const rawText = response.text?.trim() ?? '';
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      rawText,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: response.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
      },
    };
  }
}
