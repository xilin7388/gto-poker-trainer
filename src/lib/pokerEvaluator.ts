import { Card, Suit, Rank } from "../types";

export interface EvaluatedHand {
  rankType: number; // 0..8
  rankName: string;
  tiebreakers: number[]; // Sorted values to break ties
}

// Generate all combinations of k items from array
function getCombinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, combo: T[]) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

export function getRankPlural(value: number): string {
  const plurals: Record<number, string> = {
    2: "2s", 3: "3s", 4: "4s", 5: "5s", 6: "6s", 7: "7s", 8: "8s", 9: "9s",
    10: "10s", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces"
  };
  return plurals[value] || value.toString();
}

export function getRankSingular(value: number): string {
  const singulars: Record<number, string> = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
    10: "10", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace"
  };
  return singulars[value] || value.toString();
}

// Evaluates exactly 5 cards
export function evaluate5Cards(cards: Card[]): EvaluatedHand {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  
  // Check Flush
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  
  // Check Straight
  let isStraight = false;
  let straightHigh = 0;
  
  const values = sorted.map(c => c.value);
  const uniqueValues = Array.from(new Set(values));
  
  if (uniqueValues.length === 5) {
    if (values[0] - values[4] === 4) {
      isStraight = true;
      straightHigh = values[0];
    } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
      // Ace-low straight (A, 2, 3, 4, 5)
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Count rank frequencies
  const counts: { [key: number]: number } = {};
  for (const c of cards) {
    counts[c.value] = (counts[c.value] || 0) + 1;
  }
  
  const freqPairs = Object.entries(counts).map(([val, freq]) => ({
    val: parseInt(val, 10),
    freq
  })).sort((a, b) => b.freq - a.freq || b.val - a.val);

  // Group by frequency
  const freqs = freqPairs.map(p => p.freq);
  const valOrdering = freqPairs.map(p => p.val);

  // 1. Straight Flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return {
        rankType: 8,
        rankName: "Royal Flush",
        tiebreakers: [straightHigh]
      };
    }
    return {
      rankType: 8,
      rankName: `${getRankSingular(straightHigh)}-High Straight Flush`,
      tiebreakers: [straightHigh]
    };
  }

  // 2. Four of a Kind
  if (freqs[0] === 4) {
    return {
      rankType: 7,
      rankName: `Four of a Kind, ${getRankPlural(valOrdering[0])}`,
      tiebreakers: [valOrdering[0], valOrdering[1]]
    };
  }

  // 3. Full House
  if (freqs[0] === 3 && freqs[1] === 2) {
    return {
      rankType: 6,
      rankName: `Full House, ${getRankPlural(valOrdering[0])} full of ${getRankPlural(valOrdering[1])}`,
      tiebreakers: [valOrdering[0], valOrdering[1]]
    };
  }

  // 4. Flush
  if (isFlush) {
    return {
      rankType: 5,
      rankName: `Flush, ${getRankSingular(sorted[0].value)}-High`,
      tiebreakers: sorted.map(c => c.value)
    };
  }

  // 5. Straight
  if (isStraight) {
    return {
      rankType: 4,
      rankName: `Straight, ${getRankSingular(straightHigh)}-High`,
      tiebreakers: [straightHigh]
    };
  }

  // 6. Three of a Kind
  if (freqs[0] === 3) {
    return {
      rankType: 3,
      rankName: `Three of a Kind, ${getRankPlural(valOrdering[0])}`,
      tiebreakers: [valOrdering[0], valOrdering[1], valOrdering[2]]
    };
  }

  // 7. Two Pair
  if (freqs[0] === 2 && freqs[1] === 2) {
    return {
      rankType: 2,
      rankName: `Two Pair, ${getRankPlural(valOrdering[0])} and ${getRankPlural(valOrdering[1])}`,
      tiebreakers: [valOrdering[0], valOrdering[1], valOrdering[2]]
    };
  }

  // 8. One Pair
  if (freqs[0] === 2) {
    return {
      rankType: 1,
      rankName: `Pair of ${getRankPlural(valOrdering[0])}`,
      tiebreakers: [valOrdering[0], valOrdering[1], valOrdering[2], valOrdering[3]]
    };
  }

  // 9. High Card
  return {
    rankType: 0,
    rankName: `${getRankSingular(sorted[0].value)}-High Card`,
    tiebreakers: sorted.map(c => c.value)
  };
}

// Evaluates up to 7 cards and selects the absolute best combination of 5
export function evaluate7Cards(hole: Card[], board: Card[]): EvaluatedHand {
  const allCards = [...hole, ...board];
  
  if (allCards.length < 5) {
    // Fallback pocket strength if less than Flop
    const sorted = [...allCards].sort((a,b) => b.value - a.value);
    const hasPair = allCards.length === 2 && allCards[0].value === allCards[1].value;
    return {
      rankType: hasPair ? 1 : 0,
      rankName: hasPair ? `Pair of ${allCards[0].rank}s` : `High Card ${sorted[0]?.rank || ""}`,
      tiebreakers: sorted.map(c => c.value)
    };
  }
  
  const combos = getCombinations(allCards, 5);
  let bestHand: EvaluatedHand | null = null;

  for (const combo of combos) {
    const evaluated = evaluate5Cards(combo);
    if (!bestHand) {
      bestHand = evaluated;
    } else {
      // Compare evaluated vs bestHand
      if (evaluated.rankType > bestHand.rankType) {
        bestHand = evaluated;
      } else if (evaluated.rankType === bestHand.rankType) {
        // Break ties
        for (let i = 0; i < evaluated.tiebreakers.length; i++) {
          const evTb = evaluated.tiebreakers[i] || 0;
          const bhTb = bestHand.tiebreakers[i] || 0;
          if (evTb > bhTb) {
            bestHand = evaluated;
            break;
          } else if (evTb < bhTb) {
            break;
          }
        }
      }
    }
  }

  return bestHand || { rankType: 0, rankName: "Folded or Error", tiebreakers: [] };
}

// Set up a standard 52 deck
export function createDeck(): Card[] {
  const suits: Suit[] = ["H", "D", "C", "S"];
  const ranks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const deck: Card[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      let value = parseInt(rank, 10);
      if (rank === "T") value = 10;
      else if (rank === "J") value = 11;
      else if (rank === "Q") value = 12;
      else if (rank === "K") value = 13;
      else if (rank === "A") value = 14;
      
      deck.push({ suit, rank, value });
    }
  }
  return deck;
}

// Standard Fisher-Yates element shuffle
export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Maps card details to custom beautiful character string
export function getCardDisplay(card: Card): string {
  const suitSymbols: { [key in Suit]: string } = {
    H: "♥️",
    D: "♦️",
    C: "♣️",
    S: "♠️"
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}
