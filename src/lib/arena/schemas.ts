import { z } from 'zod';
import { ENGINE_SKILL_MAX, ENGINE_SKILL_MIN } from '@/lib/providers/models.config';

export const GameModeSchema = z.enum(['pure', 'assisted', 'engine']);
export const IllegalMovePolicySchema = z.enum(['strict', 'friendly']);
export const PlayerColorSchema = z.enum(['w', 'b']);
export const ProviderIdSchema = z.enum(['anthropic', 'google', 'openai', 'mock', 'engine']);

export const MoveRequestSchema = z.object({
  pgn: z.string().max(16_384, 'PGN exceeds maximum allowed size.'),
  modelId: z.string().min(1).max(100),
  provider: ProviderIdSchema.optional(),
  mode: GameModeSchema,
  policy: IllegalMovePolicySchema.default('strict'),
  skillLevel: z.number().int().min(ENGINE_SKILL_MIN).max(ENGINE_SKILL_MAX).optional(),
  gameSessionId: z.string().uuid().optional(),
  prevReceipt: z.string().max(32_768).optional(),
});

export type MoveRequestInput = z.infer<typeof MoveRequestSchema>;

export const LlmMoveJsonSchema = z.object({
  move: z.string().min(1).max(20),
  comment: z.string().max(240).optional(),
});

export type LlmMoveJson = z.infer<typeof LlmMoveJsonSchema>;

export const AnalyzeRequestSchema = z.object({
  pgn: z.string().min(1).max(16_384),
});

export const SaveMoveInputSchema = z.object({
  ply: z.number().int().min(1),
  san: z.string().min(1).max(20),
  fenAfter: z.string().min(1).max(120),
  by: z.enum(['human', 'model']),
  comment: z.string().max(300).optional().nullable(),
  latencyMs: z.number().int().min(0).optional().nullable(),
  illegalAttempts: z.number().int().min(0).default(0),
});

export const SaveGameRequestSchema = z.object({
  pgn: z.string().min(1).max(16_384),
  modelId: z.string().min(1).max(100),
  provider: ProviderIdSchema.optional(),
  mode: GameModeSchema,
  humanColor: PlayerColorSchema,
  playerHandle: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Handle may only contain letters, numbers, underscores, and hyphens.')
    .optional(),
  playerAvatar: z.string().min(1).max(32).optional(),
  playerToken: z.string().uuid().optional(),
  resignedBy: PlayerColorSchema.optional(),
  forfeitedBy: PlayerColorSchema.optional(),
  timedOutBy: PlayerColorSchema.optional(),
  drawAgreed: z.boolean().optional(),
  usedTakeback: z.boolean().optional(),
  gameSessionId: z.string().uuid().optional(),
  moveReceipt: z.string().max(32_768).optional(),
  illegalAttempts: z.number().int().min(0).default(0),
  fallbackMoves: z.number().int().min(0).default(0),
  totalTokens: z.number().int().min(0).default(0),
  moves: z.array(SaveMoveInputSchema).max(400),
});

export type SaveGameRequestInput = z.infer<typeof SaveGameRequestSchema>;
