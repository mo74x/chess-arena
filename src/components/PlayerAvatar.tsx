'use client';

import { Crown, Eye, Gem, Shield, Swords } from 'lucide-react';
import { BUILTIN_AVATARS } from '@/lib/player/identity';

interface PlayerAvatarProps {
  avatarId?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

function AvatarGlyph({ id, className }: { id: string; className: string }) {
  switch (id) {
    case 'king':
    case 'crown':
      return <Crown className={className} />;
    case 'queen':
      return <Gem className={className} />;
    case 'rook':
      return <Shield className={className} />;
    case 'owl':
      return <Eye className={className} />;
    case 'knight':
    case 'bishop':
    case 'pawn':
    default:
      return <Swords className={className} />;
  }
}

export function PlayerAvatar({ avatarId, size = 'md' }: PlayerAvatarProps) {
  const avatar = BUILTIN_AVATARS.find((a) => a.id === avatarId) ?? BUILTIN_AVATARS[3]!;
  const sizeClass =
    size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const iconClass =
    size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${sizeClass} ${avatar.bgClass} ${avatar.fgClass}`}
      aria-label={avatar.label}
    >
      <AvatarGlyph id={avatar.id} className={iconClass} />
    </span>
  );
}
