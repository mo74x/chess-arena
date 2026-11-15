export interface OpeningInfo {
  eco: string;
  name: string;
}

const OPENINGS: Array<{ moves: string[]; eco: string; name: string }> = [
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], eco: 'B90', name: 'Sicilian Defense: Najdorf' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'], eco: 'B34', name: 'Sicilian Defense: Accelerated Dragon' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], eco: 'B70', name: 'Sicilian Defense: Dragon' },
  { moves: ['e4', 'c5', 'c3'], eco: 'B22', name: 'Sicilian Defense: Alapin' },
  { moves: ['e4', 'c5'], eco: 'B20', name: 'Sicilian Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], eco: 'C70', name: 'Ruy Lopez: Morphy Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], eco: 'C60', name: 'Ruy Lopez' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], eco: 'C50', name: 'Italian Game: Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], eco: 'C55', name: 'Italian Game: Two Knights Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], eco: 'C50', name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], eco: 'C44', name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], eco: 'C42', name: 'Petrov Defense' },
  { moves: ['e4', 'e5', 'f4'], eco: 'C30', name: "King's Gambit" },
  { moves: ['e4', 'e5', 'Nc3'], eco: 'C25', name: 'Vienna Game' },
  { moves: ['e4', 'e5'], eco: 'C20', name: "King's Pawn Game" },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], eco: 'C11', name: 'French Defense: Classical' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], eco: 'C02', name: 'French Defense: Advance' },
  { moves: ['e4', 'e6'], eco: 'C00', name: 'French Defense' },
  { moves: ['e4', 'c6', 'd4', 'd5'], eco: 'B12', name: 'Caro-Kann Defense' },
  { moves: ['e4', 'c6'], eco: 'B10', name: 'Caro-Kann Defense' },
  { moves: ['e4', 'd5'], eco: 'B01', name: 'Scandinavian Defense' },
  { moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'], eco: 'B07', name: 'Pirc Defense' },
  { moves: ['e4', 'Nf6'], eco: 'B02', name: 'Alekhine Defense' },
  { moves: ['d4', 'd5', 'c4', 'e6'], eco: 'D30', name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'c6'], eco: 'D10', name: 'Slav Defense' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], eco: 'D20', name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'c4'], eco: 'D06', name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'Bf4'], eco: 'D00', name: 'London System' },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], eco: 'E60', name: "King's Indian Defense" },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], eco: 'E20', name: 'Nimzo-Indian Defense' },
  { moves: ['d4', 'Nf6', 'c4', 'c5'], eco: 'A56', name: 'Benoni Defense' },
  { moves: ['d4', 'f5'], eco: 'A80', name: 'Dutch Defense' },
  { moves: ['d4', 'd5'], eco: 'D00', name: "Queen's Pawn Game" },
  { moves: ['c4'], eco: 'A10', name: 'English Opening' },
  { moves: ['Nf3'], eco: 'A04', name: 'Reti Opening' },
];

/**
 * Matches the longest known opening prefix from a sequence of SAN moves.
 */
export function detectOpening(historySan: string[]): OpeningInfo | null {
  if (historySan.length === 0) return null;

  let best: OpeningInfo | null = null;
  let bestLen = 0;

  for (const entry of OPENINGS) {
    if (entry.moves.length > historySan.length || entry.moves.length <= bestLen) {
      continue;
    }
    let matches = true;
    for (let i = 0; i < entry.moves.length; i += 1) {
      if (historySan[i] !== entry.moves[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      best = { eco: entry.eco, name: entry.name };
      bestLen = entry.moves.length;
    }
  }

  return best;
}
