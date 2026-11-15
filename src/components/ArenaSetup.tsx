'use client';

import { Bot, Cpu, Play, ShieldAlert, Target, User } from 'lucide-react';
import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n/en';
import {
  BUILTIN_AVATARS,
  HANDLE_REGEX,
  type PlayerIdentity,
} from '@/lib/player/identity';
import {
  ARENA_MODELS,
  BYOK_PROVIDERS,
  ENGINE_SKILL_DEFAULT,
  ENGINE_SKILL_MAX,
  ENGINE_SKILL_MIN,
  type GameMode,
  type IllegalMovePolicy,
  type ProviderId,
} from '@/lib/providers/models.config';
import { ByokKeyInput } from './ByokKeyInput';
import { PlayerAvatar } from './PlayerAvatar';

export type TimeControlOption = 'none' | 'blitz5' | 'rapid10' | 'rapid15';

export interface MatchConfig {
  provider: ProviderId;
  modelId: string;
  customModelId: string;
  humanColor: 'w' | 'b';
  mode: GameMode;
  policy: IllegalMovePolicy;
  skillLevel: number;
  timeControl: TimeControlOption;
  apiKey: string;
}

interface ArenaSetupProps {
  config: MatchConfig;
  player: PlayerIdentity;
  onPlayerChange: (next: PlayerIdentity) => void;
  onChange: (next: MatchConfig) => void;
  onStart: () => void;
  labels: Dictionary['setup'];
}

export function loadSessionByokKey(provider: ProviderId): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(`chess-arena:byok:${provider}`) ?? '';
  } catch {
    return '';
  }
}

export function saveSessionByokKey(provider: ProviderId, key: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (key.trim()) {
      window.sessionStorage.setItem(`chess-arena:byok:${provider}`, key);
    } else {
      window.sessionStorage.removeItem(`chess-arena:byok:${provider}`);
    }
  } catch {
    // ignore storage errors
  }
}

export function ArenaSetup({
  config,
  player,
  onPlayerChange,
  onChange,
  onStart,
  labels,
}: ArenaSetupProps) {
  const [providerFilter, setProviderFilter] = useState<'all' | ProviderId>('all');

  const selectedPreset = ARENA_MODELS.find((m) => m.id === config.modelId);
  const usingCustomModel = config.customModelId.trim().length > 0;
  const activeProvider: ProviderId = usingCustomModel
    ? config.provider
    : (selectedPreset?.provider ?? config.provider);

  const isMock = !usingCustomModel && Boolean(selectedPreset?.isMock);
  const isEngine = !usingCustomModel && (Boolean(selectedPreset?.isEngine) || config.mode === 'engine');
  const needsByok = !isMock && !isEngine;

  const visibleModels =
    providerFilter === 'all'
      ? ARENA_MODELS
      : ARENA_MODELS.filter((m) => m.provider === providerFilter);

  const handleModelSelect = (modelId: string) => {
    const spec = ARENA_MODELS.find((m) => m.id === modelId);
    if (!spec) return;
    const savedKey = loadSessionByokKey(spec.provider);
    if (spec.isEngine) {
      onChange({
        ...config,
        provider: spec.provider,
        modelId,
        customModelId: '',
        mode: 'engine',
        apiKey: savedKey,
      });
    } else if (config.mode === 'engine') {
      onChange({
        ...config,
        provider: spec.provider,
        modelId,
        customModelId: '',
        mode: 'pure',
        apiKey: savedKey,
      });
    } else {
      onChange({
        ...config,
        provider: spec.provider,
        modelId,
        customModelId: '',
        apiKey: savedKey,
      });
    }
  };

  const handleCustomProviderChange = (
    provider: Extract<ProviderId, 'anthropic' | 'google' | 'openai'>,
  ) => {
    const savedKey = loadSessionByokKey(provider);
    onChange({
      ...config,
      provider,
      mode: config.mode === 'engine' ? 'pure' : config.mode,
      apiKey: savedKey,
    });
  };

  const handleModeSelect = (mode: GameMode) => {
    if (mode === 'engine') {
      onChange({ ...config, mode, provider: 'engine', modelId: 'stockfish', customModelId: '' });
    } else if (isEngine) {
      onChange({ ...config, mode, provider: 'mock', modelId: 'mock-legal', customModelId: '' });
    } else {
      onChange({ ...config, mode });
    }
  };

  const handleValidOrEmpty =
    player.handle.trim().length === 0 || HANDLE_REGEX.test(player.handle.trim());

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-4 dark:border-stone-800">
        <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100">{labels.title}</h1>
        {player.handle.trim() ? (
          <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs dark:border-stone-700 dark:bg-stone-800">
            <PlayerAvatar avatarId={player.avatarId} size="sm" />
            <span className="font-medium text-stone-800 dark:text-stone-200">
              {player.handle.trim()}
            </span>
          </div>
        ) : null}
      </div>

      {/* Player Handle & Built-in Avatar */}
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-800 dark:bg-stone-950/60 md:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="player-handle-input"
            className="flex items-center gap-1.5 text-sm font-medium text-stone-800 dark:text-stone-200"
          >
            <User className="h-4 w-4 text-stone-500 dark:text-stone-400" />
            <span>{labels.playerHandle}</span>
          </label>
          <input
            id="player-handle-input"
            type="text"
            maxLength={24}
            value={player.handle}
            onChange={(e) => onPlayerChange({ ...player, handle: e.target.value })}
            placeholder={labels.playerHandlePlaceholder}
            data-testid="player-handle-input"
            className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 ${
              handleValidOrEmpty
                ? 'border-stone-300 focus:border-teal-700 dark:border-stone-700 dark:focus:border-teal-500'
                : 'border-red-500'
            }`}
          />
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-stone-800 dark:text-stone-200">
            {labels.playerAvatar}
          </span>
          <div className="flex flex-wrap gap-2">
            {BUILTIN_AVATARS.map((av) => {
              const active = player.avatarId === av.id;
              return (
                <button
                  key={av.id}
                  type="button"
                  onClick={() => onPlayerChange({ ...player, avatarId: av.id })}
                  title={av.label}
                  data-testid={`avatar-${av.id}`}
                  className={`rounded-full p-0.5 transition-transform ${
                    active ? 'ring-2 ring-teal-600 ring-offset-2 dark:ring-teal-500 dark:ring-offset-stone-950' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <PlayerAvatar avatarId={av.id} size="md" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="block text-sm font-medium text-stone-800 dark:text-stone-200">
            {labels.chooseModel}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'anthropic', 'google', 'openai', 'engine', 'mock'] as const).map((pf) => (
              <button
                key={pf}
                type="button"
                onClick={() => setProviderFilter(pf)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  providerFilter === pf
                    ? 'bg-teal-700 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
                }`}
              >
                {pf}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModels.map((model) => {
            const active = !usingCustomModel && config.modelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => handleModelSelect(model.id)}
                data-testid={`model-card-${model.id}`}
                className={`flex flex-col items-start rounded-lg border p-3 text-start transition-colors ${
                  active
                    ? 'border-teal-700 bg-teal-50/70 ring-1 ring-teal-700 dark:border-teal-500 dark:bg-teal-950/40 dark:ring-teal-500'
                    : 'border-stone-200 bg-white hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800/70'
                }`}
              >
                <div className="mb-1 flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {model.displayName}
                  </span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    {model.badge}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                  {model.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Custom Provider + Any Model ID */}
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-950/60 sm:grid-cols-[180px_1fr]">
          <div className="space-y-1">
            <label
              htmlFor="custom-provider-select"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300"
            >
              {labels.providerLabel}
            </label>
            <select
              id="custom-provider-select"
              value={
                activeProvider === 'anthropic' ||
                activeProvider === 'google' ||
                activeProvider === 'openai'
                  ? activeProvider
                  : 'anthropic'
              }
              onChange={(e) =>
                handleCustomProviderChange(
                  e.target.value as Extract<ProviderId, 'anthropic' | 'google' | 'openai'>,
                )
              }
              data-testid="custom-provider-select"
              className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-xs font-medium text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            >
              {BYOK_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="custom-model-input"
              className="block text-xs font-medium text-stone-700 dark:text-stone-300"
            >
              {labels.customModelLabel}
            </label>
            <input
              id="custom-model-input"
              type="text"
              value={config.customModelId}
              onChange={(e) => {
                const nextProvider =
                  activeProvider === 'anthropic' ||
                  activeProvider === 'google' ||
                  activeProvider === 'openai'
                    ? activeProvider
                    : 'anthropic';
                onChange({
                  ...config,
                  provider: nextProvider,
                  mode: config.mode === 'engine' ? 'pure' : config.mode,
                  customModelId: e.target.value,
                });
              }}
              placeholder={labels.customModelPlaceholder}
              data-testid="custom-model-input"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 placeholder:text-stone-400 focus:border-teal-700 focus:outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Color & Policy */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-sm font-medium text-stone-800 dark:text-stone-200">
            {labels.yourColor}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['w', 'b'] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange({ ...config, humanColor: color })}
                data-testid={`color-${color}`}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  config.humanColor === color
                    ? 'border-teal-700 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                }`}
              >
                {color === 'w' ? labels.white : labels.black}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-stone-800 dark:text-stone-200">
            {labels.policy}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['strict', 'friendly'] as const).map((policy) => (
              <button
                key={policy}
                type="button"
                onClick={() => onChange({ ...config, policy })}
                data-testid={`policy-${policy}`}
                className={`rounded-lg border px-3 py-2 text-start ${
                  config.policy === policy
                    ? 'border-teal-700 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
                }`}
              >
                <div className="text-sm font-medium">{labels.policies[policy].label}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
                  {labels.policies[policy].desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mode */}
      <div className="space-y-2">
        <span className="block text-sm font-medium text-stone-800 dark:text-stone-200">
          {labels.mode}
        </span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              { id: 'pure', Icon: Bot },
              { id: 'assisted', Icon: Target },
              { id: 'engine', Icon: Cpu },
            ] as const
          ).map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleModeSelect(id)}
              data-testid={`mode-${id}`}
              className={`flex flex-col items-start rounded-lg border p-3 text-start ${
                config.mode === id
                  ? 'border-teal-700 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                <Icon className="h-4 w-4" />
                <span>{labels.modes[id].label}</span>
              </div>
              <p className="text-xs text-stone-600 dark:text-stone-400">{labels.modes[id].desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Time Control */}
      <div className="space-y-2">
        <span className="block text-sm font-medium text-stone-800 dark:text-stone-200">
          {labels.timeControl}
        </span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['none', 'blitz5', 'rapid10', 'rapid15'] as const).map((tc) => (
            <button
              key={tc}
              type="button"
              onClick={() => onChange({ ...config, timeControl: tc })}
              data-testid={`time-control-${tc}`}
              className={`rounded-lg border px-3 py-2 text-xs font-medium sm:text-sm ${
                config.timeControl === tc
                  ? 'border-teal-700 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
            >
              {labels.timeControls[tc]}
            </button>
          ))}
        </div>
      </div>

      {config.mode === 'engine' ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/60">
          <div className="mb-1 flex items-center justify-between text-sm font-medium text-stone-800 dark:text-stone-200">
            <span>{labels.skillLevel}</span>
            <span className="font-mono tabular-nums">
              {config.skillLevel || ENGINE_SKILL_DEFAULT}
            </span>
          </div>
          <input
            type="range"
            min={ENGINE_SKILL_MIN}
            max={ENGINE_SKILL_MAX}
            value={config.skillLevel}
            onChange={(e) => onChange({ ...config, skillLevel: Number(e.target.value) })}
            className="w-full accent-teal-700 dark:accent-teal-500"
          />
        </div>
      ) : null}

      {needsByok ? (
        <ByokKeyInput
          value={config.apiKey}
          onChange={(apiKey) => {
            saveSessionByokKey(activeProvider, apiKey);
            onChange({ ...config, apiKey });
          }}
          labels={labels}
        />
      ) : null}

      {isMock ? (
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-400">
          <ShieldAlert className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" />
          <span>{labels.unrankedNotice}</span>
        </div>
      ) : null}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onStart}
          disabled={!handleValidOrEmpty}
          data-testid="start-match-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500"
        >
          <Play className="h-4 w-4" />
          <span>{labels.startGame}</span>
        </button>
      </div>
    </section>
  );
}
