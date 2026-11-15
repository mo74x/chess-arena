'use client';

import { Bot, Cpu, Play, ShieldAlert, Target } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n/en';
import {
  ARENA_MODELS,
  ENGINE_SKILL_DEFAULT,
  ENGINE_SKILL_MAX,
  ENGINE_SKILL_MIN,
  type GameMode,
  type IllegalMovePolicy,
} from '@/lib/providers/models.config';
import { ByokKeyInput } from './ByokKeyInput';

export type TimeControlOption = 'none' | 'blitz5' | 'rapid10' | 'rapid15';

export interface MatchConfig {
  modelId: string;
  humanColor: 'w' | 'b';
  mode: GameMode;
  policy: IllegalMovePolicy;
  skillLevel: number;
  timeControl: TimeControlOption;
  apiKey: string;
}

interface ArenaSetupProps {
  config: MatchConfig;
  onChange: (next: MatchConfig) => void;
  onStart: () => void;
  labels: Dictionary['setup'];
}

export function ArenaSetup({ config, onChange, onStart, labels }: ArenaSetupProps) {
  const selectedModel = ARENA_MODELS.find((m) => m.id === config.modelId) ?? ARENA_MODELS[0]!;
  const needsByok =
    config.mode !== 'engine' && !selectedModel.isMock && !selectedModel.isEngine;

  const handleModelSelect = (modelId: string) => {
    const spec = ARENA_MODELS.find((m) => m.id === modelId);
    if (!spec) return;
    if (spec.isEngine) {
      onChange({ ...config, modelId, mode: 'engine' });
    } else if (config.mode === 'engine') {
      onChange({ ...config, modelId, mode: 'pure' });
    } else {
      onChange({ ...config, modelId });
    }
  };

  const handleModeSelect = (mode: GameMode) => {
    if (mode === 'engine') {
      onChange({ ...config, mode, modelId: 'stockfish' });
    } else if (selectedModel.isEngine) {
      onChange({ ...config, mode, modelId: 'mock-legal' });
    } else {
      onChange({ ...config, mode });
    }
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between border-b border-stone-200 pb-4">
        <h1 className="text-xl font-semibold text-stone-900">{labels.title}</h1>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-stone-800">{labels.chooseModel}</label>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {ARENA_MODELS.map((model) => {
            const active = config.modelId === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => handleModelSelect(model.id)}
                data-testid={`model-card-${model.id}`}
                className={`flex flex-col items-start rounded-lg border p-3 text-start transition-colors ${
                  active
                    ? 'border-teal-700 bg-teal-50/70 ring-1 ring-teal-700'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <div className="mb-1 flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-900">{model.displayName}</span>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
                    {model.badge}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-stone-600">{model.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-sm font-medium text-stone-800">{labels.yourColor}</span>
          <div className="grid grid-cols-2 gap-2">
            {(['w', 'b'] as const).map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onChange({ ...config, humanColor: color })}
                data-testid={`color-${color}`}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  config.humanColor === color
                    ? 'border-teal-700 bg-teal-50 text-teal-900'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                {color === 'w' ? labels.white : labels.black}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-stone-800">{labels.policy}</span>
          <div className="grid grid-cols-2 gap-2">
            {(['strict', 'friendly'] as const).map((policy) => (
              <button
                key={policy}
                type="button"
                onClick={() => onChange({ ...config, policy })}
                data-testid={`policy-${policy}`}
                className={`rounded-lg border px-3 py-2 text-start ${
                  config.policy === policy
                    ? 'border-teal-700 bg-teal-50 text-teal-900'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <div className="text-sm font-medium">{labels.policies[policy].label}</div>
                <div className="text-[11px] text-stone-500">{labels.policies[policy].desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium text-stone-800">{labels.mode}</span>
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
                  ? 'border-teal-700 bg-teal-50 text-teal-900'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                <Icon className="h-4 w-4" />
                <span>{labels.modes[id].label}</span>
              </div>
              <p className="text-xs text-stone-600">{labels.modes[id].desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-medium text-stone-800">{labels.timeControl}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(['none', 'blitz5', 'rapid10', 'rapid15'] as const).map((tc) => (
            <button
              key={tc}
              type="button"
              onClick={() => onChange({ ...config, timeControl: tc })}
              data-testid={`time-control-${tc}`}
              className={`rounded-lg border px-3 py-2 text-xs font-medium sm:text-sm ${
                config.timeControl === tc
                  ? 'border-teal-700 bg-teal-50 text-teal-900'
                  : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {labels.timeControls[tc]}
            </button>
          ))}
        </div>
      </div>

      {config.mode === 'engine' ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
          <div className="mb-1 flex items-center justify-between text-sm font-medium text-stone-800">
            <span>{labels.skillLevel}</span>
            <span className="font-mono tabular-nums">{config.skillLevel || ENGINE_SKILL_DEFAULT}</span>
          </div>
          <input
            type="range"
            min={ENGINE_SKILL_MIN}
            max={ENGINE_SKILL_MAX}
            value={config.skillLevel}
            onChange={(e) => onChange({ ...config, skillLevel: Number(e.target.value) })}
            className="w-full accent-teal-700"
          />
        </div>
      ) : null}

      {needsByok ? (
        <ByokKeyInput
          value={config.apiKey}
          onChange={(apiKey) => onChange({ ...config, apiKey })}
          labels={labels}
        />
      ) : null}

      {selectedModel.isMock ? (
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <ShieldAlert className="h-4 w-4 shrink-0 text-stone-500" />
          <span>{selectedModel.description}</span>
        </div>
      ) : null}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onStart}
          data-testid="start-match-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          <Play className="h-4 w-4" />
          <span>{labels.startGame}</span>
        </button>
      </div>
    </section>
  );
}
