export type Suit = "H" | "D" | "C" | "S"; // Hearts, Diamonds, Clubs, Spades
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
  value: number; // 2..14
}

export type HandStage = "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN" | "ENDED";

export interface PlayerState {
  id: "User" | "Computer";
  name: string;
  hand: Card[];
  stack: number;         // Total chips before current round commitments
  currentBet: number;    // Committed to pot in the current betting round
  folded: boolean;
  allIn: boolean;
  acted: boolean;        // In current betting round
}

export interface GameLog {
  id: string;
  timestamp: string;
  player?: "User" | "Computer" | "System" | "Coach";
  text: string;
  type: "info" | "action" | "system" | "coach-positive" | "coach-warning";
}

export interface HandHistoryItem {
  stage: HandStage;
  player: "User" | "Computer";
  action: string;
  amount: number;
}

export interface GTOAdvice {
  recommendedAction: string;
  actionBreakdown: {
    fold: number;
    call: number;
    raise: number;
  };
  evs: {
    fold: number;
    call: number;
    raise: number;
  };
  coachComments: string;
  handStrengthEvaluation: string;
  rangeConcept: string;
  isFallback?: boolean;
  message?: string;
  
  // Range-level statistics (Your Entire Strategy)
  rangeOverallStrategy?: {
    checkFold: number;
    checkCall: number;
    betRaise: number;
  };
  rangeRawEquity?: number; // e.g., 52.4
  rangeEQR?: number; // e.g., 105
  rangeHandCategories?: {
    overpairs: number;
    topPairs: number;
    midPairs: number;
    draws: number;
    air: number;
  };

  // Macro State Stats
  macroStats?: {
    spr: number;
    equityAdvantage: "Hero" | "Villain" | "Equal";
    nutAdvantage: "Hero" | "Villain" | "Equal";
    heroRangeEquity: number;
    villainRangeEquity: number;
  };
}

export interface WinEvaluation {
  winner: "User" | "Computer" | "Split";
  userHandName: string;
  computerHandName: string;
  explanation: string;
}
