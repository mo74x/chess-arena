export interface BuiltinAvatar {
  id: string;
  label: string;
  bgClass: string;
  fgClass: string;
}

export const BUILTIN_AVATARS: readonly BuiltinAvatar[] = [
  { id: 'king', label: 'King', bgClass: 'bg-teal-900/60 border-teal-600/50', fgClass: 'text-teal-300' },
  { id: 'queen', label: 'Queen', bgClass: 'bg-amber-900/50 border-amber-600/50', fgClass: 'text-amber-300' },
  { id: 'rook', label: 'Rook', bgClass: 'bg-stone-800 border-stone-600/60', fgClass: 'text-stone-200' },
  { id: 'knight', label: 'Knight', bgClass: 'bg-emerald-900/50 border-emerald-600/50', fgClass: 'text-emerald-300' },
  { id: 'bishop', label: 'Bishop', bgClass: 'bg-sky-900/50 border-sky-600/50', fgClass: 'text-sky-300' },
  { id: 'pawn', label: 'Pawn', bgClass: 'bg-orange-900/50 border-orange-600/50', fgClass: 'text-orange-300' },
  { id: 'crown', label: 'Crown', bgClass: 'bg-rose-900/50 border-rose-600/50', fgClass: 'text-rose-300' },
  { id: 'owl', label: 'Sentinel', bgClass: 'bg-cyan-900/50 border-cyan-600/50', fgClass: 'text-cyan-300' },
] as const;

export interface PlayerIdentity {
  handle: string;
  avatarId: string;
  playerToken: string;
}

const STORAGE_KEY = 'chess-arena:player';
export const HANDLE_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;

export function getOrCreatePlayerIdentity(): PlayerIdentity {
  if (typeof window === 'undefined') {
    return { handle: '', avatarId: 'knight', playerToken: '' };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (parsed.playerToken && typeof parsed.playerToken === 'string') {
        return {
          handle: typeof parsed.handle === 'string' ? parsed.handle : '',
          avatarId:
            typeof parsed.avatarId === 'string' &&
            BUILTIN_AVATARS.some((a) => a.id === parsed.avatarId)
              ? parsed.avatarId
              : 'knight',
          playerToken: parsed.playerToken,
        };
      }
    }
  } catch {
    // ignore storage errors
  }

  const fresh: PlayerIdentity = {
    handle: '',
    avatarId: 'knight',
    playerToken: window.crypto.randomUUID(),
  };
  savePlayerIdentity(fresh);
  return fresh;
}

export function savePlayerIdentity(identity: PlayerIdentity): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore storage errors
  }
}
