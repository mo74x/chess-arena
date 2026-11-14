import 'server-only';
import {
  buildMovePrompts,
  type MovePromptRequest,
  type MoveProviderResult,
  type ProviderAdapter,
} from './types';

export class MockProviderAdapter implements ProviderAdapter {
  async getMove(request: MovePromptRequest): Promise<MoveProviderResult> {
    // Keep buildMovePrompts exercised so prompt regressions are caught in tests.
    buildMovePrompts(request);

    const modelId = request.model.apiModelId;
    const legal = request.legalMovesSan ?? [];

    if (modelId === 'mock-always-illegal') {
      return {
        rawText: JSON.stringify({
          move: 'Ke9',
          comment: 'Mock always-illegal test move.',
        }),
        usage: { inputTokens: 40, outputTokens: 15, totalTokens: 55 },
      };
    }

    if (modelId === 'mock-illegal-once' && !request.retryContext) {
      return {
        rawText: JSON.stringify({
          move: 'Qx9',
          comment: 'Mock illegal first attempt.',
        }),
        usage: { inputTokens: 40, outputTokens: 15, totalTokens: 55 },
      };
    }

    // Deterministic legal selection: prefer captures/checks, otherwise first sorted move.
    const sorted = [...legal].sort();
    const tactical = sorted.find((m) => m.includes('#')) ?? sorted.find((m) => m.includes('+')) ?? sorted.find((m) => m.includes('x')) ?? sorted[0] ?? 'e4';

    return {
      rawText: JSON.stringify({
        move: tactical,
        comment: `Playing ${tactical}.`,
      }),
      usage: { inputTokens: 45, outputTokens: 18, totalTokens: 63 },
    };
  }
}
