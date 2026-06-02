import React, { useState, useEffect, useRef } from "react";
import {
  Coins,
  RotateCcw,
  Check,
  Plus,
  Play,
  ArrowRight,
  Info,
  HelpCircle,
  HelpCircle as HelpIcon,
  Crown,
  History,
  CheckCircle,
  Volume2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, PlayerState, GameLog, HandStage, GTOAdvice, WinEvaluation } from "./types";
import {
  evaluate7Cards,
  createDeck,
  shuffleDeck,
  getCardDisplay
} from "./lib/pokerEvaluator";
import MarkdownRenderer from "./components/MarkdownRenderer";
import pokerBg from "./assets/images/poker_bg_1780290735921.png";
import { playCheckSound, playRaiseSound, playCardFlipSound } from "./lib/soundEffects";

function hasPostflopDraws(cards: Card[]): boolean {
  if (cards.length < 4) return false;
  // Check flush draw (4 cards of same suit)
  const suits = cards.map(c => c.suit);
  const suitCounts: Record<string, number> = {};
  for (const s of suits) {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
    if (suitCounts[s] >= 4) return true;
  }

  // Check straight draw (4 cards with consecutive difference <= 4)
  const values = Array.from(new Set(cards.map(c => c.value))).sort((a, b) => a - b);
  for (let i = 0; i <= values.length - 4; i++) {
    if (values[i + 3] - values[i] <= 4) return true;
  }
  if (values.includes(14)) {
    const aceLowVals = values.filter(v => v <= 5 || v === 14).map(v => v === 14 ? 1 : v).sort((a,b) => a-b);
    for (let i = 0; i <= aceLowVals.length - 4; i++) {
      if (aceLowVals[i + 3] - aceLowVals[i] <= 4) return true;
    }
  }
  return false;
}

const CHIP_STYLES: Record<string, { bg: string, border: string, ring: string, text: string, stripes: string }> = {
  blue: {
    bg: "bg-blue-600",
    border: "border-blue-500",
    ring: "ring-blue-300/30",
    text: "text-white",
    stripes: "border-blue-400"
  },
  red: {
    bg: "bg-rose-600",
    border: "border-rose-500",
    ring: "ring-rose-300/30",
    text: "text-white",
    stripes: "border-rose-400"
  },
  green: {
    bg: "bg-emerald-600",
    border: "border-emerald-500",
    ring: "ring-emerald-300/30",
    text: "text-white",
    stripes: "border-emerald-400"
  },
  black: {
    bg: "bg-zinc-800",
    border: "border-zinc-700",
    ring: "ring-zinc-600/30",
    text: "text-white",
    stripes: "border-zinc-500"
  },
  purple: {
    bg: "bg-purple-600",
    border: "border-purple-500",
    ring: "ring-purple-300/30",
    text: "text-white",
    stripes: "border-purple-400"
  }
};

const PokerChipSingle: React.FC<{
  color: 'blue' | 'red' | 'green' | 'black' | 'purple';
  value?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ color, className = "", style }) => {
  const styles = CHIP_STYLES[color] || CHIP_STYLES.blue;
  return (
    <div
      style={style}
      className={`relative w-8 h-8 rounded-full ${styles.bg} border border-black/40 shadow-md ${className} select-none transition-all duration-300 flex items-center justify-center`}
    >
      {/* 3D-effect edge accent ring */}
      <div className="absolute inset-[1.5px] rounded-full border border-white/20" />

      {/* Aesthetic radial edge stripes representing standard casino chip edge markings */}
      <div className="absolute inset-x-0 h-1 my-auto bg-white/15 pointer-events-none" />
      <div className="absolute inset-y-0 w-1 mx-auto bg-white/15 pointer-events-none" />
      <div className="absolute inset-0 rotate-45 pointer-events-none">
        <div className="absolute inset-x-0 h-1 my-auto bg-white/15" />
        <div className="absolute inset-y-0 w-1 mx-auto bg-white/15" />
      </div>

      {/* Elegant inner concentric ring */}
      <div className="absolute inset-1.5 rounded-full border border-dashed border-white/35 flex items-center justify-center bg-black/10">
        {/* Centered micro-logo key element instead of ugly text figures */}
        <div className="w-2.5 h-2.5 rounded-full bg-[#0f172a]/20 flex items-center justify-center border border-white/10 shadow-inner">
          <span className="text-[6.5px] font-black text-white/50 leading-none select-none">★</span>
        </div>
      </div>

      {/* Realistic volumetric glass/gloss lighting shadow overlays */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/25 via-transparent to-white/15 pointer-events-none" />
    </div>
  );
};

const getChipBreakdown = (amount: number): Array<{ color: 'blue' | 'red' | 'green' | 'black' | 'purple', value: number, count: number }> => {
  if (amount <= 0) return [];
  let remaining = amount;
  
  const denoms: Array<{ color: 'blue' | 'red' | 'green' | 'black' | 'purple', value: number }> = [
    { color: 'purple', value: 500 },
    { color: 'black', value: 100 },
    { color: 'green', value: 25 },
    { color: 'red', value: 5 },
    { color: 'blue', value: 1 }
  ];

  const breakdown: Array<{ color: 'blue' | 'red' | 'green' | 'black' | 'purple', value: number, count: number }> = [];

  for (const item of denoms) {
    if (remaining >= item.value) {
      const count = Math.floor(remaining / item.value);
      remaining %= item.value;
      breakdown.push({ color: item.color, value: item.value, count });
    }
  }

  return breakdown;
};

const PokerChipStack: React.FC<{
  color: 'blue' | 'red' | 'green' | 'black' | 'purple';
  value: number;
  count: number;
}> = ({ color, value, count }) => {
  // Cap at 8 visual chips for the vertical stack to keep visual balance
  const visualCount = Math.min(8, count);
  
  return (
    <div className="flex flex-col items-center justify-end relative select-none" style={{ minHeight: "72px" }}>
      {/* 2D vertical stack of circular chips, stacked from bottom to top with a nice overlapping offset */}
      <div className="relative w-10 flex flex-col items-center" style={{ height: `${32 + (visualCount - 1) * 6}px` }}>
        {Array.from({ length: visualCount }).map((_, idx) => {
          const offsetBottom = idx * 6; // stack offset in pixels
          return (
            <PokerChipSingle
              key={`stack-chip-${idx}`}
              color={color}
              className="absolute shadow-[0_2px_4px_rgba(0,0,0,0.4)] hover:scale-105 transition-transform"
              style={{
                bottom: `${offsetBottom}px`,
                zIndex: idx + 1,
              }}
            />
          );
        })}
      </div>
      
      {/* Info label underneath the stack */}
      <div className="mt-1.5 text-center flex flex-col items-center">
        <span className="text-[9px] font-extrabold text-slate-400 font-mono tracking-tight leading-none uppercase">
          ${value}
        </span>
        <span className="text-[10px] font-mono leading-none bg-slate-900 border border-slate-800 text-amber-400 font-bold px-1.5 py-0.5 rounded mt-1 shadow-md whitespace-nowrap">
          {count}x (${value * count})
        </span>
      </div>
    </div>
  );
};

const PokerChipsVisual: React.FC<{ amount: number }> = ({ amount }) => {
  const breakdown = getChipBreakdown(amount);
  
  if (breakdown.length === 0) {
    return (
      <div className="text-[10px] text-slate-600 font-mono italic select-none">
        No chips in pot
      </div>
    );
  }

  return (
    <div className="flex gap-4 items-end justify-center min-h-[64px] px-3 pt-1 pb-4">
      {breakdown.map((stack) => (
        <PokerChipStack
          key={`pot-stack-${stack.value}`}
          color={stack.color}
          value={stack.value}
          count={stack.count}
        />
      ))}
    </div>
  );
};

export default function App() {
  // Game persistent statistics
  const [handsPlayed, setHandsPlayed] = useState<number>(1);
  const [userWinCount, setUserWinCount] = useState<number>(0);
  const [computerWinCount, setComputerWinCount] = useState<number>(0);
  const [splitCount, setSplitCount] = useState<number>(0);

  // Player playstyle tracking states
  const [userVpipCount, setUserVpipCount] = useState<number>(0);
  const [userPostflopPlays, setUserPostflopPlays] = useState<number>(0);
  const [userPostflopRaises, setUserPostflopRaises] = useState<number>(0);
  const [userPostflopBluffs, setUserPostflopBluffs] = useState<number>(0);
  const [userPostflopCalls, setUserPostflopCalls] = useState<number>(0);
  const [userPostflopFolds, setUserPostflopFolds] = useState<number>(0);
  const [computerAdaptationStyle, setComputerAdaptationStyle] = useState<"STANDARD_GTO" | "HERO_CALLER" | "VALUE_EXPLOITER" | "BULLY">("STANDARD_GTO");

  // Deck and table layout states
  const [deck, setDeck] = useState<Card[]>([]);
  const [board, setBoard] = useState<Card[]>([]);
  
  // Players state
  const [userHand, setUserHand] = useState<Card[]>([]);
  const [computerHand, setComputerHand] = useState<Card[]>([]);
  
  const [userStack, setUserStack] = useState<number>(98); // starts $100 minus $2 (User is BB, Computer is SB/Dealer)
  const [computerStack, setComputerStack] = useState<number>(99); // starts $100 minus $1
  
  const [userCurrentBet, setUserCurrentBet] = useState<number>(2); // BB
  const [computerCurrentBet, setComputerCurrentBet] = useState<number>(1); // SB
  const [potSize, setPotSize] = useState<number>(0); // starting preflop pot size (active blinds $1 + $2 are counted in user/computer bet)

  const [dealer, setDealer] = useState<"User" | "Computer">("Computer"); // Dealer button on Computer. User is BB.
  const [stage, setStage] = useState<HandStage>("PREFLOP");
  const [turn, setTurn] = useState<"User" | "Computer" | null>("User"); // SB / Computer acts first preflop, wait: in heads up, dealer (SB) is FIRST to act preflop! So Computer acts first! Wait, let's make dealer Computer (posts $1), User BB (posts $2). Computer (dealer) acts first preflop.
  
  // Track hasActed for the current betting round
  const [userActed, setUserActed] = useState<boolean>(false);
  const [computerActed, setComputerActed] = useState<boolean>(false);

  // Betting Controls
  const [betChangeSlider, setBetChangeSlider] = useState<number>(4); // default min raise to $4 (2x BB)
  
  // --- DYNAMIC VIEWPORT AUTOMATIC SCALING & ENLARGING LOGIC (For laptops, external monitors to utilize empty margins) ---
  const [zoomMode, setZoomMode] = useState<"auto" | "100" | "110" | "120" | "130" | "140">("auto");
  const [zoomFactor, setZoomFactor] = useState<number>(1.0);

  useEffect(() => {
    const handleResize = () => {
      if (zoomMode !== "auto") {
        setZoomFactor(parseInt(zoomMode) / 100);
        return;
      }
      
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Compute responsive ideal scale to prevent tiny text on big monitors
      if (width >= 1900 && height >= 1000) {
        setZoomFactor(1.30); // 130% scale
      } else if (width >= 1600 && height >= 900) {
        setZoomFactor(1.20); // 120% scale
      } else if (width >= 1400 && height >= 820) {
        setZoomFactor(1.10); // 110% scale
      } else if (width >= 1200 && height >= 750) {
        setZoomFactor(1.05); // 105% scale
      } else {
        setZoomFactor(1.00); // Standard 100% scale
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [zoomMode]);

  // Custom GTO analysis states
  const [coachSidebarTab, setCoachSidebarTab] = useState<"SOLVER" | "RANGE" | "MACRO">("SOLVER");
  const [userRngRoll, setUserRngRoll] = useState<number>(55);
  const [reviewFeedback, setReviewFeedback] = useState<{
    chosenAction: "Fold" | "Call/Check" | "Raise/Bet";
    chosenActionLabel: string;
    bestAction: "Fold" | "Call/Check" | "Raise/Bet";
    bestActionLabel: string;
    chosenEV: number;
    bestEV: number;
    regret: number;
    actionRegret: number;
    actionBreakdown: { fold: number; call: number; raise: number };
    evs: { fold: number; call: number; raise: number };
    rngRoll: number;
    rngChoice: "Fold" | "Call/Check" | "Raise/Bet";
    comments: string;
    sizingFeedback?: {
      userSizing: number;
      optimalSizing: number;
      status: "perfect" | "too_little" | "too_much";
      analysis: string;
    };
    onContinue: () => void;
  } | null>(null);

  // GTO Regret Tracking and Hand Reviews State
  const [currentHandRegretSum, setCurrentHandRegretSum] = useState<number>(0);
  const [currentHandMovesCount, setCurrentHandMovesCount] = useState<number>(0);
  const [handReview, setHandReview] = useState<{
    summaryAnalysis: string;
    goodPlay: string;
    badPlay: string;
    gtoMainTakeaway: string;
    isFallback?: boolean;
  } | null>(null);
  const [isFetchingHandReview, setIsFetchingHandReview] = useState<boolean>(false);

  const [lastUserBet, setLastUserBet] = useState<number>(2);
  const [lastComputerBet, setLastComputerBet] = useState<number>(1);
  const [flyingChips, setFlyingChips] = useState<Array<{ id: string; from: "User" | "Computer"; value: number; index: number }>>([]);
  const [prevStage, setPrevStage] = useState<HandStage>("PREFLOP");

  // Helper to analyze user's pair/combos relative to board, kicker strength and suit/draw effects
  const describeHandRelation = (
    hand: Card[], 
    board: Card[], 
    stage: HandStage, 
    evalName: string, 
    rankType: number
  ): { description: string; assessment: string } => {
    if (hand.length < 2) {
      return { description: evalName, assessment: "Waiting for cards to deal." };
    }

    const suitsDisplay: Record<string, string> = { H: "♥️", D: "♦️", C: "♣️", S: "♠️" };
    const getCardStr = (c: Card) => `${c.rank}${suitsDisplay[c.suit] || c.suit}`;

    const c1 = hand[0];
    const c2 = hand[1];

    if (board.length === 0) {
      if (c1.value === c2.value) {
        const pocketStr = `${c1.rank}${suitsDisplay[c1.suit]}${c2.rank}${suitsDisplay[c2.suit]}`;
        return {
          description: `Pocket Pair of ${c1.rank}s (${pocketStr})`,
          assessment: `An extremely strong preflop pocket pair. Preflop GTO models heavily favor raising to isolate opponents and extract pure range equity.`
        };
      }
      const gap = Math.abs(c1.value - c2.value);
      const connectedText = gap === 1 ? "connected" : gap <= 4 ? "semi-connected speculative" : "unconnected";
      const pocketStr = `${c1.rank}${suitsDisplay[c1.suit]}${c2.rank}${suitsDisplay[c2.suit]}`;
      return {
        description: `${c1.rank}${c2.rank}${c1.suit === c2.suit ? 's' : 'o'} (${pocketStr})`,
        assessment: `A ${connectedText} pre-flop holding. Standard GTO opening structures utilize combinations of this range pocket.`
      };
    }

    const boardVals = board.map(c => c.value).sort((a,b) => b-a);
    const maxBoardVal = boardVals[0] || 0;
    const minBoardVal = boardVals[boardVals.length - 1] || 0;
    const isPocketPair = c1.value === c2.value;

    const boardSuits = board.map(c => c.suit);
    const handSuits = hand.map(c => c.suit);

    let suitEffect = "";
    const suits = ["H", "D", "C", "S"];
    for (const s of suits) {
      const boardCount = boardSuits.filter(x => x === s).length;
      const handCount = handSuits.filter(x => x === s).length;
      if (boardCount + handCount >= 4 && boardCount < 5) {
        const suitEmoji = suitsDisplay[s];
        suitEffect = ` Note: Active flush draw blocker with ${suitEmoji} cards provides powerful semi-bluff equity and fold leverage.`;
      } else if (boardCount + handCount === 3 && boardCount >= 1 && stage !== "RIVER") {
        const suitEmoji = suitsDisplay[s];
        suitEffect = ` Note: Backdoor ${suitEmoji} flush possibility is active, adding valuable backdoor equity realization.`;
      }
    }

    if (rankType === 1) { // One Pair
      let pairValue = 0;
      if (isPocketPair) {
        pairValue = c1.value;
      } else {
        const hasC1 = boardVals.includes(c1.value);
        const hasC2 = boardVals.includes(c2.value);
        if (hasC1) pairValue = c1.value;
        else if (hasC2) pairValue = c2.value;
      }

      if (pairValue === 0) {
        return {
          description: `High Card (with a ${evalName})`,
          assessment: `The pair rests entirely on the board. You are playing high card air here; exercise caution.${suitEffect}`
        };
      }

      const rankChar = c1.value === pairValue ? c1.rank : c2.rank;
      const kickerVal = c1.value === pairValue ? c2.value : c1.value;
      const kickerRank = c1.value === pairValue ? c2.rank : c1.rank;
      const kickerStrength = kickerVal >= 11 ? `strong ${kickerRank} kicker` : `weak ${kickerRank} kicker`;

      let classification = "Pair";
      if (isPocketPair) {
        if (pairValue > maxBoardVal) {
          classification = `Overpair (${rankChar}s)`;
        } else if (pairValue < minBoardVal) {
          classification = `Underpair (${rankChar}s)`;
        } else {
          classification = `Pocket Pair of ${rankChar}s`;
        }
      } else {
        if (pairValue === maxBoardVal) {
          classification = `Top Pair of ${rankChar}s`;
        } else if (pairValue === minBoardVal) {
          classification = `Bottom Pair of ${rankChar}s`;
        } else {
          classification = `Middle Pair of ${rankChar}s`;
        }
      }

      return {
        description: `${classification} (${kickerStrength})`,
        assessment: `Your ${classification} is a solid showdown-bound holding on this board. It serves as a decent mid-strength bluff-catcher or thin value bet candidate.${suitEffect}`
      };
    }

    if (rankType === 2) { // Two Pair
      const matchingHoleCards = hand.filter(c => boardVals.includes(c.value));
      if (matchingHoleCards.length === 2) {
        return {
          description: `Top and Bottom Two Pair (${c1.rank}s and ${c2.rank}s)`,
          assessment: `Extremely strong made Two Pair. You hold robust structural equity. Bet or raise aggressively to protect against drawing cards.${suitEffect}`
        };
      } else if (isPocketPair) {
        return {
          description: `Two Pair (Pocket ${c1.rank}s matched with a board pair)`,
          assessment: `Pocket pair over board pairs offers high stability. Mix raising and trapping down future turn/river cards.${suitEffect}`
        };
      } else {
        return {
          description: `Two Pair (${evalName})`,
          assessment: `Highly favorable Two Pair. Strong GTO play demands active value-betting to charge speculative drawing ranges.${suitEffect}`
        };
      }
    }

    if (rankType === 3) { // Three of a Kind
      if (isPocketPair) {
        return {
          description: `Flopped Set of ${c1.rank}s`,
          assessment: `A highly disguised and premium GTO value monster. Block opponents' top-pairs; check-raise or bet big sizes to secure maximum stacks.${suitEffect}`
        };
      } else {
        return {
          description: `Trips of ${c1.rank}s`,
          assessment: `Powerful trips combination. Keep a close eye on full-house redraws but target large sizing value-extraction.${suitEffect}`
        };
      }
    }

    return {
      description: evalName,
      assessment: `Premium value holding (${evalName}). You hold absolute range dominance. Execute high value-betting schemes to maximize profit metrics.${suitEffect}`
    };
  };

  // Client fallback helper for instant GTO responses
  const getClientGTOAdvice = (
    hand: Card[],
    b: Card[],
    stg: HandStage,
    oppBet: number,
    pot: number
  ): GTOAdvice => {
    const sprValue = pot > 0 ? parseFloat((100 / pot).toFixed(1)) : 50.0;
    
    if (stg === "PREFLOP") {
      if (hand.length < 2) {
        return {
          recommendedAction: "Check",
          actionBreakdown: { fold: 10, call: 90, raise: 0 },
          evs: { fold: 0.0, call: 0.1, raise: 0.0 },
          coachComments: "Waiting for cards to deal.",
          handStrengthEvaluation: "No cards dealt",
          rangeConcept: "Idle Check",
          rangeOverallStrategy: { checkFold: 20, checkCall: 60, betRaise: 20 },
          rangeRawEquity: 50,
          rangeEQR: 100,
          rangeHandCategories: { overpairs: 2, topPairs: 10, midPairs: 15, draws: 15, air: 58 },
          macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 50, villainRangeEquity: 50 }
        };
      }
      const c1 = hand[0];
      const c2 = hand[1];
      const hi = Math.max(c1.value, c2.value);
      const lo = Math.min(c1.value, c2.value);
      const isPair = c1.value === c2.value;
      const isSuited = c1.suit === c2.suit;

      if (isPair) {
        if (hi >= 10) {
          return {
            recommendedAction: "Raise to $6",
            actionBreakdown: { fold: 0, call: 15, raise: 85 },
            evs: { fold: 0.0, call: 4.8, raise: 7.2 },
            coachComments: "Premium pocket pairs represent our highest value preflop opening values. We should raise to build a pot immediately.",
            handStrengthEvaluation: `Premium Pocket Pair of ${c1.rank}s`,
            rangeConcept: "Linear Value Opening Advantage",
            rangeOverallStrategy: { checkFold: 10, checkCall: 45, betRaise: 45 },
            rangeRawEquity: 58.7,
            rangeEQR: 112,
            rangeHandCategories: { overpairs: 15, topPairs: 10, midPairs: 10, draws: 10, air: 55 },
            macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Hero", heroRangeEquity: 58.7, villainRangeEquity: 41.3 }
          };
        } else {
          return {
            recommendedAction: "Call $2",
            actionBreakdown: { fold: 5, call: 70, raise: 25 },
            evs: { fold: 0.0, call: 2.1, raise: 1.8 },
            coachComments: "Medium Pocket pairs have high set-mining potential. We want to play these to see flops cheap.",
            handStrengthEvaluation: `Mid Pocket Pair of ${c1.rank}s`,
            rangeConcept: "Set Mining Speculating Range",
            rangeOverallStrategy: { checkFold: 15, checkCall: 55, betRaise: 30 },
            rangeRawEquity: 52.4,
            rangeEQR: 102,
            rangeHandCategories: { overpairs: 5, topPairs: 12, midPairs: 18, draws: 10, air: 55 },
            macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Equal", heroRangeEquity: 52.4, villainRangeEquity: 47.6 }
          };
        }
      }

      if (hi === 14 || (hi >= 12 && lo >= 10)) {
        return {
          recommendedAction: "Raise to $5",
          actionBreakdown: { fold: 5, call: 35, raise: 60 },
          evs: { fold: 0.0, call: 1.8, raise: 3.4 },
          coachComments: "Strong broadways represent excellent high-card advantage pre-flop. We raise to take the initiative.",
          handStrengthEvaluation: `Strong Broadway ${c1.rank}${c2.rank}`,
          rangeConcept: "Broadway Dominance Strategy",
          rangeOverallStrategy: { checkFold: 12, checkCall: 48, betRaise: 40 },
          rangeRawEquity: 55.2,
          rangeEQR: 106,
          rangeHandCategories: { overpairs: 3, topPairs: 20, midPairs: 15, draws: 12, air: 50 },
          macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Equal", heroRangeEquity: 55.2, villainRangeEquity: 44.8 }
        };
      }

      if (isSuited && hi - lo <= 4) {
        return {
          recommendedAction: "Call $2",
          actionBreakdown: { fold: 10, call: 70, raise: 20 },
          evs: { fold: 0.0, call: 1.5, raise: 1.1 },
          coachComments: "Suited connectors work incredibly well in heads-up play due to postflop flexibility.",
          handStrengthEvaluation: `Suited Connected ${c1.rank}${c2.rank}s`,
          rangeConcept: "Implied Odds Speculative Range",
          rangeOverallStrategy: { checkFold: 18, checkCall: 52, betRaise: 30 },
          rangeRawEquity: 51.1,
          rangeEQR: 108,
          rangeHandCategories: { overpairs: 1, topPairs: 8, midPairs: 12, draws: 25, air: 54 },
          macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 51.1, villainRangeEquity: 48.9 }
        };
      }

      if (hi <= 8) {
        return {
          recommendedAction: "Fold",
          actionBreakdown: { fold: 85, call: 10, raise: 5 },
          evs: { fold: 0.0, call: -1.2, raise: -2.0 },
          coachComments: "Low unsuited trash represents negative equity in Heads-Up. GTO folds these values to minimize out-of-position leakages.",
          handStrengthEvaluation: `Trashy Offsuit ${c1.rank}${c2.rank}o`,
          rangeConcept: "Range Restructuring Folds",
          rangeOverallStrategy: { checkFold: 45, checkCall: 40, betRaise: 15 },
          rangeRawEquity: 38.5,
          rangeEQR: 82,
          rangeHandCategories: { overpairs: 0, topPairs: 4, midPairs: 10, draws: 8, air: 78 },
          macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 38.5, villainRangeEquity: 61.5 }
        };
      }

      if (oppBet > 0) {
        // Only call/raise with playable hands when facing a raise/bet preflop in Heads Up.
        const isStrongHUOffsuit = !isSuited && (hi >= 10 && lo >= 7 || hi >= 12);
        const isSuitedHUSpeculative = isSuited && (hi >= 5);
        const isConnectedHU = hi - lo <= 2 && hi >= 5;
        const isPlayableHU = isPair || isStrongHUOffsuit || isSuitedHUSpeculative || isConnectedHU;

        if (!isPlayableHU) {
          return {
            recommendedAction: "Fold",
            actionBreakdown: { fold: 100, call: 0, raise: 0 },
            evs: { fold: 0.0, call: -1.5, raise: -2.8 },
            coachComments: `Holding weak disconnected values like ${c1.rank}${c2.rank}o facing an active raise is a fold in GTO preflop heads-up strategy. Fold to conserve chips.`,
            handStrengthEvaluation: `Weak Offsuit Trash ${c1.rank}${c2.rank}o`,
            rangeConcept: "HU Preflop Standard Fold",
            rangeOverallStrategy: { checkFold: 100, checkCall: 0, betRaise: 0 },
            rangeRawEquity: 25.5,
            rangeEQR: 70,
            rangeHandCategories: { overpairs: 0, topPairs: 2, midPairs: 4, draws: 6, air: 88 },
            macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 25.5, villainRangeEquity: 74.5 }
          };
        }
      }

      if (oppBet === 0) {
        return {
          recommendedAction: "Check",
          actionBreakdown: { fold: 0, call: 100, raise: 0 },
          evs: { fold: 0.0, call: 0.0, raise: 0.0 },
          coachComments: "Checking is free and logical preflop since there is no raise to call. See the flop for free from the Big Blind.",
          handStrengthEvaluation: `Free play with ${c1.rank}${c2.rank}`,
          rangeConcept: "Free Big Blind Check",
          rangeOverallStrategy: { checkFold: 0, checkCall: 100, betRaise: 0 },
          rangeRawEquity: 32.5,
          rangeEQR: 80,
          rangeHandCategories: { overpairs: 0, topPairs: 4, midPairs: 8, draws: 10, air: 78 },
          macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 32.5, villainRangeEquity: 67.5 }
        };
      }

      return {
        recommendedAction: "Call $2",
        actionBreakdown: { fold: 20, call: 60, raise: 20 },
        evs: { fold: 0.0, call: 0.8, raise: 0.5 },
        coachComments: "This hand falls in the moderate class. Calling or flatting are standard options to keep the range wide.",
        handStrengthEvaluation: `Offsuit high card ${c1.rank}${c2.rank}o`,
        rangeConcept: "Default Marginal Defense",
        rangeOverallStrategy: { checkFold: 20, checkCall: 55, betRaise: 25 },
        rangeRawEquity: 48.2,
        rangeEQR: 95,
        rangeHandCategories: { overpairs: 1, topPairs: 12, midPairs: 14, draws: 10, air: 63 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 48.2, villainRangeEquity: 51.8 }
      };
    }

    // Postflop client defaults
    const hasOpponentBet = oppBet > 0;
    const postflopEval = evaluate7Cards(hand, b);
    let rank = postflopEval.rankType; // 0..8
    let rankName = postflopEval.rankName;

    // Check if the made hand is purely from board cards
    if (b.length >= 3) {
      const counts: { [key: number]: number } = {};
      for (const card of b) {
        counts[card.value] = (counts[card.value] || 0) + 1;
      }
      const freqs = Object.values(counts).sort((x, y) => y - x);
      const boardMaxFreq = freqs[0] || 0;
      const boardNumPairs = freqs.filter(f => f >= 2).length;

      if (rank === 1 && boardMaxFreq >= 2) {
        rank = 0;
        rankName = "High Card (Paired Board)";
      } else if (rank === 2 && boardNumPairs >= 2) {
        rank = 0;
        rankName = "High Card (Board Two Pair)";
      } else if (rank === 3 && boardMaxFreq >= 3) {
        rank = 0;
        rankName = "High Card (Board Trips)";
      } else if (b.length >= 5) {
        const boardEval = evaluate7Cards([], b);
        if (rank <= boardEval.rankType) {
          rank = 0;
          rankName = `High Card (Board has ${boardEval.rankName})`;
        }
      }
    }

    const isVeryStrong = rank >= 4; // Straight, Flush, Full House, Quads, Straight Flush
    const isModerate = rank >= 1 && rank <= 3; // One Pair, Two Pair, Three of a Kind

    const handAnalysis = describeHandRelation(hand, b, stg, rankName, rank);

    if (isVeryStrong) {
      return {
        recommendedAction: hasOpponentBet ? `Raise/Bet to $${Math.round(pot * 0.75 + oppBet)}` : "Bet/Raise",
        actionBreakdown: { fold: 0, call: 20, raise: 80 },
        evs: { fold: 0.0, call: 6.5, raise: 8.5 },
        coachComments: `You made ${handAnalysis.description}. ${handAnalysis.assessment}`,
        handStrengthEvaluation: handAnalysis.description,
        rangeConcept: "Polarized Range Value Bet",
        rangeOverallStrategy: { checkFold: 5, checkCall: 25, betRaise: 70 },
        rangeRawEquity: 88.5,
        rangeEQR: 120,
        rangeHandCategories: { overpairs: 25, topPairs: 30, midPairs: 10, draws: 5, air: 30 },
        macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Hero", heroRangeEquity: 88.5, villainRangeEquity: 11.5 }
      };
    }

    if (isModerate) {
      return {
        recommendedAction: hasOpponentBet ? "Call" : "Check",
        actionBreakdown: hasOpponentBet ? { fold: 10, call: 70, raise: 20 } : { fold: 0, call: 80, raise: 20 },
        evs: hasOpponentBet ? { fold: 0.0, call: 2.2, raise: 1.5 } : { fold: 0.0, call: 2.5, raise: 2.0 },
        coachComments: `Holding ${handAnalysis.description}. ${handAnalysis.assessment}`,
        handStrengthEvaluation: handAnalysis.description,
        rangeConcept: "Showdown Value Bluff Catcher",
        rangeOverallStrategy: { checkFold: 15, checkCall: 65, betRaise: 20 },
        rangeRawEquity: 62.1,
        rangeEQR: 105,
        rangeHandCategories: { overpairs: 10, topPairs: 25, midPairs: 25, draws: 15, air: 25 },
        macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Equal", heroRangeEquity: 62.1, villainRangeEquity: 37.9 }
      };
    }

    // High Card block - check for draws
    const isRiverOrLater = stg === "RIVER" || stg === "SHOWDOWN" || stg === "ENDED";
    const hasDraw = !isRiverOrLater && hasPostflopDraws([...hand, ...b]);
    if (hasDraw) {
      return {
        recommendedAction: hasOpponentBet ? "Call" : "Check",
        actionBreakdown: hasOpponentBet ? { fold: 20, call: 65, raise: 15 } : { fold: 0, call: 75, raise: 25 },
        evs: hasOpponentBet ? { fold: 0.0, call: 1.1, raise: 0.5 } : { fold: 0.0, call: 1.4, raise: 1.0 },
        coachComments: `You hold a speculative draw. Since you have high card, this represents a strong semi-bluff raising or cheap calling candidate to realize draw equity.`,
        handStrengthEvaluation: `High Card Draw (${rankName})`,
        rangeConcept: "Equity Realization Draw Node",
        rangeOverallStrategy: { checkFold: 20, checkCall: 55, betRaise: 25 },
        rangeRawEquity: 49.5,
        rangeEQR: 110,
        rangeHandCategories: { overpairs: 2, topPairs: 10, midPairs: 10, draws: 40, air: 38 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 49.5, villainRangeEquity: 50.5 }
      };
    }

    if (isRiverOrLater && hasPostflopDraws([...hand, ...b])) {
      return {
        recommendedAction: hasOpponentBet ? "Fold" : "Check",
        actionBreakdown: hasOpponentBet ? { fold: 100, call: 0, raise: 0 } : { fold: 0, call: 95, raise: 5 },
        evs: hasOpponentBet ? { fold: 0.0, call: -3.5, raise: -4.0 } : { fold: 0.0, call: 0.1, raise: 0.0 },
        coachComments: hasOpponentBet
          ? `You held a speculative flush or straight draw, but the final River card did not complete your holding. You are left with high card ${rankName}, which represents absolute air on the river. Calling a bet here with zero showdown value is a massive negative-EV leak. While folding might feel "predictable", GTO solver strategy dictates folding these near-zero equity hands because our opponent's betting range is highly polarized (nuts or bluffs). Doing so doesn't make us exploitable, because we protect ourselves from exploit by calling with actual bluff-catchers (like pairs) rather than bleeding chips with ace/king-high air.`
          : `You held a speculative flush or straight draw, but the River card did not complete it. Since there is no active bet, checking along is the standard, positive-EV play. Never fold when you can check for free!`,
        handStrengthEvaluation: `Missed Speculative Draw (${rankName})`,
        rangeConcept: "Missed Draw Fold Spot",
        rangeOverallStrategy: { checkFold: 100, checkCall: 0, betRaise: 0 },
        rangeRawEquity: 1.0,
        rangeEQR: 10,
        rangeHandCategories: { overpairs: 0, topPairs: 0, midPairs: 0, draws: 0, air: 100 },
        macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 1.0, villainRangeEquity: 99.0 }
      };
    }

    return {
      recommendedAction: hasOpponentBet ? "Fold" : "Check",
      actionBreakdown: hasOpponentBet ? { fold: 100, call: 0, raise: 0 } : { fold: 0, call: 85, raise: 15 },
      evs: hasOpponentBet ? { fold: 0.0, call: -2.5, raise: -3.5 } : { fold: 0.0, call: 0.3, raise: 0.1 },
      coachComments: hasOpponentBet
        ? `You have absolute air here on a board texture that misses your range entirely. GTO recommends folding to any active bet. We prevent bleeding stack by refusing to bluff-catch with low high-card absolute trash against river bets.`
        : `You have unimproved high card air here. Since there is no active bet, checking is 100% standard and correct. We check along for a free showdown or street.`,
      handStrengthEvaluation: "Absolute Trash / Air",
      rangeConcept: "Range Capping Fold Spot",
      rangeOverallStrategy: { checkFold: 100, checkCall: 0, betRaise: 0 },
      rangeRawEquity: 1.0,
      rangeEQR: 10,
      rangeHandCategories: { overpairs: 0, topPairs: 0, midPairs: 0, draws: 0, air: 100 },
      macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 1.0, villainRangeEquity: 99.0 }
    };
  };

  const getRngSelection = (
    roll: number,
    breakdown: { fold: number; call: number; raise: number }
  ): "Fold" | "Call/Check" | "Raise/Bet" => {
    const f = breakdown.fold;
    const c = breakdown.call;
    if (roll <= f) return "Fold";
    if (roll <= f + c) return "Call/Check";
    return "Raise/Bet";
  };

  // Roll a new RNG roll on User's turn
  useEffect(() => {
    if (turn === "User" && stage !== "SHOWDOWN" && stage !== "ENDED") {
      setUserRngRoll(Math.floor(Math.random() * 100) + 1);
    }
  }, [turn, stage]);

  // UI States
  const [isComputerThinking, setIsComputerThinking] = useState<boolean>(false);
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [historyTranscript, setHistoryTranscript] = useState<string[]>([]);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

  // GTO Coach integration
  const [autoCoach, setAutoCoach] = useState<boolean>(false);
  const [gtoAdvice, setGtoAdvice] = useState<GTOAdvice | null>(null);
  const [isAnalysingGto, setIsAnalysingGto] = useState<boolean>(false);
  const [gtoCoachError, setGtoCoachError] = useState<string | null>(null);

  // Hand completed Showdown evaluations
  const [winEvaluation, setWinEvaluation] = useState<WinEvaluation | null>(null);

  // --- 5-PLAYER SECTOR STATE DECLARATIONS ---
  const [gameMode, setGameMode] = useState<"1v1" | "5player">("5player");

  interface Player5 {
    id: string; // "User", "AlphaBot", etc.
    name: string;
    isHero: boolean;
    hand: Card[];
    stack: number;
    currentBet: number;
    folded: boolean;
    allIn: boolean;
    acted: boolean;
    role: "BTN" | "SB" | "BB" | "UTG" | "HJ";
    lastAction: string;
  }

  const [players5, setPlayers5] = useState<Player5[]>([]);
  const [stage5, setStage5] = useState<HandStage>("PREFLOP");
  const [dealerIndex5, setDealerIndex5] = useState<number>(0);
  const [activePosition5, setActivePosition5] = useState<number>(3); // index currently acting
  const [board5, setBoard5] = useState<Card[]>([]);
  const [potSize5, setPotSize5] = useState<number>(0);
  const [currentBetToCall5, setCurrentBetToCall5] = useState<number>(2);
  const [logs5, setLogs5] = useState<GameLog[]>([]);
  const [deck5, setDeck5] = useState<Card[]>([]);
  const [handsPlayed5, setHandsPlayed5] = useState<number>(1);
  const [currentHandRegretSum5, setCurrentHandRegretSum5] = useState<number>(0);
  const [currentHandMovesCount5, setCurrentHandMovesCount5] = useState<number>(0);
  const [handReview5, setHandReview5] = useState<{
    summaryAnalysis: string;
    goodPlay: string;
    badPlay: string;
    gtoMainTakeaway: string;
    isFallback: boolean;
  } | null>(null);
  const [isFetchingHandReview5, setIsFetchingHandReview5] = useState<boolean>(false);
  const [reviewFeedback5, setReviewFeedback5] = useState<{
    chosenAction: "Fold" | "Call/Check" | "Raise/Bet";
    chosenActionLabel: string;
    bestAction: "Fold" | "Call/Check" | "Raise/Bet";
    bestActionLabel: string;
    chosenEV: number;
    bestEV: number;
    regret: number;
    actionRegret: number;
    actionBreakdown: { fold: number; call: number; raise: number };
    evs: { fold: number; call: number; raise: number };
    rngRoll: number;
    rngChoice: "Fold" | "Call/Check" | "Raise/Bet";
    comments: string;
    sizingFeedback?: {
      userSizing: number;
      optimalSizing: number;
      status: "perfect" | "too_little" | "too_much";
      analysis: string;
    };
    onContinue: () => void;
  } | null>(null);

  // --- STEP-BY-STEP HAND HISTORY AND AUDIT REPLAYER STATES ---
  const [currentHandSteps, setCurrentHandSteps] = useState<any[]>([]);
  const [lastHandSteps, setLastHandSteps] = useState<any[]>([]);
  const [reviewStepIndex, setReviewStepIndex] = useState<number>(-1);
  const [reviewingCurrentHand, setReviewingCurrentHand] = useState<boolean>(true);
  const [redoConfirmIdx, setRedoConfirmIdx] = useState<{ index: number; isCurrent: boolean } | null>(null);

  const handleRedoFromStep = (step: any, stepIndex: number, isCurrentHand: boolean) => {
    // Shut off replayers and reviews
    setReviewStepIndex(-1);
    setReviewFeedback(null);
    setReviewFeedback5(null);
    setRedoConfirmIdx(null);

    // Truncate currentHandSteps up to this step
    const originalSteps = isCurrentHand ? currentHandSteps : lastHandSteps;
    const truncatedSteps = originalSteps.slice(0, stepIndex + 1);
    setCurrentHandSteps(truncatedSteps);
    setLastHandSteps([]); // we are actively playing this hand now

    // Restore state
    if (step.gameMode === "1v1") {
      setGameMode("1v1");
      setStage(step.stage);
      setBoard(step.board);
      if (step.deck) setDeck(step.deck);
      setPotSize(step.potSize);
      setUserStack(step.userStack);
      setComputerStack(step.computerStack);
      setUserCurrentBet(step.userCurrentBet);
      setComputerCurrentBet(step.computerCurrentBet);
      setUserHand(step.userCards);
      setComputerHand(step.computerCards);
      if (step.dealer) setDealer(step.dealer);
      if (step.turn) setTurn(step.turn);
      if (step.userActed !== undefined) setUserActed(step.userActed);
      if (step.computerActed !== undefined) setComputerActed(step.computerActed);
      if (step.logs) setLogs(step.logs);
      if (step.currentHandRegretSum !== undefined) setCurrentHandRegretSum(step.currentHandRegretSum);
      if (step.currentHandMovesCount !== undefined) setCurrentHandMovesCount(step.currentHandMovesCount);
      
      setWinEvaluation(null);
      setHandReview(null);
      addTableLog(`System: Rewound game to ${step.stage} for replay.`, "system");
    } else {
      setGameMode("5player");
      setStage5(step.stage);
      setBoard5(step.board);
      if (step.deck) setDeck5(step.deck);
      setPotSize5(step.potSize);
      setCurrentBetToCall5(step.currentBetToCall);
      if (step.players) setPlayers5(step.players.map((p: any) => ({ ...p })));
      if (step.activePosition5 !== undefined) setActivePosition5(step.activePosition5);
      if (step.dealerIndex5 !== undefined) setDealerIndex5(step.dealerIndex5);
      if (step.logs) setLogs5(step.logs);
      if (step.currentHandRegretSum5 !== undefined) setCurrentHandRegretSum5(step.currentHandRegretSum5);
      if (step.currentHandMovesCount5 !== undefined) setCurrentHandMovesCount5(step.currentHandMovesCount5);

      setHandReview5(null);
      addLog5(`System: Rewound game to ${step.stage} for replay.`, "system");
    }
  };

  const recordStep1v1 = (feedback: any) => {
    const snap = {
      gameMode: "1v1" as const,
      handNumber: handsPlayed,
      stage: stage,
      board: [...board],
      deck: [...deck],
      potSize: potSize,
      currentBetToCall: computerCurrentBet > userCurrentBet ? computerCurrentBet - userCurrentBet : 0,
      userStack,
      computerStack,
      userCurrentBet,
      computerCurrentBet,
      userCards: [...userHand],
      computerCards: [...computerHand],
      dealer,
      turn,
      userActed,
      computerActed,
      logs: [...logs],
      reviewFeedback: { ...feedback },
      currentHandRegretSum,
      currentHandMovesCount
    };
    setCurrentHandSteps((prev) => [...prev, snap]);
    setReviewingCurrentHand(true);
  };

  const recordStep5player = (feedback: any) => {
    const snap = {
      gameMode: "5player" as const,
      handNumber: handsPlayed5,
      stage: stage5,
      board: [...board5],
      deck: [...deck5],
      potSize: potSize5,
      currentBetToCall: currentBetToCall5,
      userStack: players5[0]?.stack || 100,
      players: players5.map(p => ({ ...p })),
      userCards: [...(players5[0]?.hand || [])],
      activePosition5,
      dealerIndex5,
      logs: [...logs5],
      reviewFeedback: { ...feedback },
      currentHandRegretSum5,
      currentHandMovesCount5
    };
    setCurrentHandSteps((prev) => [...prev, snap]);
    setReviewingCurrentHand(true);
  };

  const addLog5 = (text: string, type: "info" | "action" | "system" | "coach-positive" | "coach-warning" = "info", player?: "User" | "Computer" | "System") => {
    const newLog: GameLog = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text,
      type,
      player
    };
    setLogs5((prev) => [...prev, newLog]);
  };

  const handleGameModeChange = (mode: "1v1" | "5player") => {
    setGameMode(mode);
    setReviewFeedback(null);
    setReviewFeedback5(null);
    if (mode === "5player") {
      if (players5.length === 0) {
        const fullDeck = shuffleDeck(createDeck());
        const userHole = [fullDeck[0], fullDeck[1]];
        const alphaHole = [fullDeck[2], fullDeck[3]];
        const betaHole = [fullDeck[4], fullDeck[5]];
        const gammaHole = [fullDeck[6], fullDeck[7]];
        const deltaHole = [fullDeck[8], fullDeck[9]];
        const remainingDeck = fullDeck.slice(10);

        const defaultNames = ["You", "AlphaBot", "BetaBot", "GammaBot", "DeltaBot"];
        const hands = [userHole, alphaHole, betaHole, gammaHole, deltaHole];
        const roles: Array<"BTN" | "SB" | "BB" | "UTG" | "HJ"> = ["BTN", "SB", "BB", "UTG", "HJ"];
        
        const tempPlayers = defaultNames.map((name, i) => {
          let commitment = 0;
          if (i === 1) commitment = 1; // AlphaBot (SB)
          if (i === 2) commitment = 2; // BetaBot (BB)
          return {
            id: i === 0 ? "User" : name,
            name,
            isHero: i === 0,
            hand: hands[i],
            stack: i === 1 ? 99 : i === 2 ? 98 : 100,
            currentBet: commitment,
            folded: false,
            allIn: false,
            acted: false,
            role: roles[i],
            lastAction: roles[i] === "SB" ? "Small Blind $1" : roles[i] === "BB" ? "Big Blind $2" : ""
          };
        });

        playCardFlipSound();

        setPlayers5(tempPlayers);
        setBoard5([]);
        setDeck5(remainingDeck);
        setStage5("PREFLOP");
        setPotSize5(0);
        setCurrentBetToCall5(2);
        setActivePosition5(3); // UTG acts first
        setDealerIndex5(0);
        setLogs5([
          {
            id: Math.random().toString(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            text: `*** Switched to 5-Player Simulation training ***`,
            type: "system"
          },
          {
            id: Math.random().toString(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            text: `Blinds: SB $1 (AlphaBot), BB $2 (BetaBot). You are on the Button. UTG acts first.`,
            type: "info"
          }
        ]);
      } else {
        addLog5("Switched back to 5-Player Simulation.", "system");
      }
    } else {
      addTableLog("Switched back to Heads-Up 1v1 Sandbox.", "system");
    }
  };

  const startNewHand5 = (forcedStacks?: number[]) => {
    if (currentHandSteps.length > 0) {
      setLastHandSteps(currentHandSteps);
    }
    setCurrentHandSteps([]);
    setReviewStepIndex(-1);
    setReviewingCurrentHand(false);

    const fullDeck = shuffleDeck(createDeck());
    const userHole = [fullDeck[0], fullDeck[1]];
    const alphaHole = [fullDeck[2], fullDeck[3]];
    const betaHole = [fullDeck[4], fullDeck[5]];
    const gammaHole = [fullDeck[6], fullDeck[7]];
    const deltaHole = [fullDeck[8], fullDeck[9]];
    const remainingDeck = fullDeck.slice(10);

    playCardFlipSound();

    const nextDealerIndex = (dealerIndex5 + 1) % 5;
    setDealerIndex5(nextDealerIndex);

    const roles: Array<"BTN" | "SB" | "BB" | "UTG" | "HJ"> = [];
    roles[nextDealerIndex] = "BTN";
    roles[(nextDealerIndex + 1) % 5] = "SB";
    roles[(nextDealerIndex + 2) % 5] = "BB";
    roles[(nextDealerIndex + 3) % 5] = "UTG";
    roles[(nextDealerIndex + 4) % 5] = "HJ";

    const defaultNames = ["You", "AlphaBot", "BetaBot", "GammaBot", "DeltaBot"];
    const hands = [userHole, alphaHole, betaHole, gammaHole, deltaHole];

    const prevPlayers = players5;
    const initialStacks = forcedStacks || prevPlayers.map((p) => (p.stack > 2 ? p.stack : 100));

    if (initialStacks.length < 5) {
      for (let i = initialStacks.length; i < 5; i++) {
        initialStacks.push(100);
      }
    }

    const updatedPlayers = defaultNames.map((name, i) => {
      const role = roles[i];
      let blindCommitment = 0;
      if (role === "SB") blindCommitment = 1;
      if (role === "BB") blindCommitment = 2;

      return {
        id: i === 0 ? "User" : name,
        name,
        isHero: i === 0,
        hand: hands[i],
        stack: initialStacks[i] - blindCommitment,
        currentBet: blindCommitment,
        folded: false,
        allIn: false,
        acted: false,
        role: role,
        lastAction: role === "SB" ? "Small Blind $1" : role === "BB" ? "Big Blind $2" : ""
      };
    });

    setPlayers5(updatedPlayers);
    setBoard5([]);
    setDeck5(remainingDeck);
    setStage5("PREFLOP");
    setPotSize5(0);
    setCurrentBetToCall5(2);
    setReviewFeedback5(null);
    setCurrentHandRegretSum5(0);
    setCurrentHandMovesCount5(0);
    setHandReview5(null);

    const utgIndex = (nextDealerIndex + 3) % 5;
    setActivePosition5(utgIndex);

    setLogs5([
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text: `--- Hand #${handsPlayed5} started (5-Player Sim) ---`,
        type: "system"
      },
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text: `Blinds set at $1/$2. Dealer Button shifts clockwise to: ${defaultNames[nextDealerIndex]}.`,
        type: "info"
      }
    ]);
  };

  const advanceStreet5 = (currentPlayers: Player5[]) => {
    const totalBetsCommitted = currentPlayers.reduce((sum, p) => sum + p.currentBet, 0);
    const newPot = potSize5 + totalBetsCommitted;
    setPotSize5(newPot);

    const resetPlayers = currentPlayers.map((p) => ({
      ...p,
      currentBet: 0,
      acted: false,
      lastAction: p.folded ? "Fold" : ""
    }));

    setCurrentBetToCall5(0);

    if (stage5 === "PREFLOP") {
      const card1 = deck5[0];
      const card2 = deck5[1];
      const card3 = deck5[2];
      setBoard5([card1, card2, card3]);
      setDeck5(deck5.slice(3));
      setStage5("FLOP");
      addLog5(`Flop dealt: ${card1.rank}${card1.suit} ${card2.rank}${card2.suit} ${card3.rank}${card3.suit}`, "system");
      playCardFlipSound();

      const sbIndex = (dealerIndex5 + 1) % 5;
      let nextIndex = sbIndex;
      while (resetPlayers[nextIndex].folded || resetPlayers[nextIndex].allIn) {
        nextIndex = (nextIndex + 1) % 5;
      }
      setActivePosition5(nextIndex);
      setPlayers5(resetPlayers);

    } else if (stage5 === "FLOP") {
      const turnCard = deck5[0];
      setBoard5((prev) => [...prev, turnCard]);
      setDeck5(deck5.slice(1));
      setStage5("TURN");
      addLog5(`Turn dealt: ${turnCard.rank}${turnCard.suit}`, "system");
      playCardFlipSound();

      const sbIndex = (dealerIndex5 + 1) % 5;
      let nextIndex = sbIndex;
      while (resetPlayers[nextIndex].folded || resetPlayers[nextIndex].allIn) {
        nextIndex = (nextIndex + 1) % 5;
      }
      setActivePosition5(nextIndex);
      setPlayers5(resetPlayers);

    } else if (stage5 === "TURN") {
      const riverCard = deck5[0];
      setBoard5((prev) => [...prev, riverCard]);
      setDeck5(deck5.slice(1));
      setStage5("RIVER");
      addLog5(`River dealt: ${riverCard.rank}${riverCard.suit}`, "system");
      playCardFlipSound();

      const sbIndex = (dealerIndex5 + 1) % 5;
      let nextIndex = sbIndex;
      while (resetPlayers[nextIndex].folded || resetPlayers[nextIndex].allIn) {
        nextIndex = (nextIndex + 1) % 5;
      }
      setActivePosition5(nextIndex);
      setPlayers5(resetPlayers);

    } else if (stage5 === "RIVER") {
      setStage5("SHOWDOWN");
      resolveShowdown5(resetPlayers);
    }
  };

  const resolveShowdown5 = (currentPlayers: Player5[]) => {
    const activePlayers = currentPlayers.filter((p) => !p.folded);
    
    const playerEvaluations = activePlayers.map((p) => {
      const evalResult = evaluate7Cards(p.hand, board5);
      return {
        player: p,
        evaluation: evalResult
      };
    });

    playerEvaluations.sort((a, b) => {
      if (a.evaluation.rankType !== b.evaluation.rankType) {
        return b.evaluation.rankType - a.evaluation.rankType;
      }
      const len = Math.max(a.evaluation.tiebreakers.length, b.evaluation.tiebreakers.length);
      for (let i = 0; i < len; i++) {
        const valA = a.evaluation.tiebreakers[i] || 0;
        const valB = b.evaluation.tiebreakers[i] || 0;
        if (valA !== valB) {
          return valB - valA;
        }
      }
      return 0;
    });

    const winnerEval = playerEvaluations[0];
    const winnersList = playerEvaluations.filter((pe) => {
      if (pe.evaluation.rankType !== winnerEval.evaluation.rankType) return false;
      const len = Math.max(pe.evaluation.tiebreakers.length, winnerEval.evaluation.tiebreakers.length);
      for (let i = 0; i < len; i++) {
        if ((pe.evaluation.tiebreakers[i] || 0) !== (winnerEval.evaluation.tiebreakers[i] || 0)) {
          return false;
        }
      }
      return true;
    });

    const potToShare = potSize5;
    const prizePerWinner = Math.floor(potToShare / winnersList.length);

    const updatedPlayers = currentPlayers.map((p) => {
      const isWinner = winnersList.some((w) => w.player.id === p.id);
      if (isWinner) {
        return {
          ...p,
          stack: p.stack + prizePerWinner,
          lastAction: `Won $${prizePerWinner} with ${evaluate7Cards(p.hand, board5).rankName}`
        };
      } else if (!p.folded) {
        return {
          ...p,
          lastAction: `Revealed ${evaluate7Cards(p.hand, board5).rankName}`
        };
      }
      return p;
    });

    setPlayers5(updatedPlayers);
    setPotSize5(0);

    const heroIsWinner = winnersList.some((w) => w.player.isHero);
    if (heroIsWinner) {
      if (winnersList.length > 1) {
        setSplitCount((prev) => prev + 1);
      } else {
        setUserWinCount((prev) => prev + 1);
      }
    } else {
      setComputerWinCount((prev) => prev + 1);
    }

    winnersList.forEach((w) => {
      addLog5(`🏆 ${w.player.name} wins $${prizePerWinner} with ${w.evaluation.rankName}!`, "coach-positive");
    });

    setHandsPlayed5((prev) => prev + 1);
    setStage5("ENDED");
  };

  const awardWinnerUncontested5 = (currentPlayers: Player5[], winner: Player5) => {
    const potToWin = potSize5 + currentPlayers.reduce((sum, p) => sum + p.currentBet, 0);

    const updatedPlayers = currentPlayers.map((p) => {
      if (p.id === winner.id) {
        return {
          ...p,
          stack: p.stack + potToWin,
          currentBet: 0,
          lastAction: `Won uncontested pot of $${potToWin}`
        };
      }
      return { ...p, currentBet: 0 };
    });

    setPlayers5(updatedPlayers);
    setPotSize5(0);
    setCurrentBetToCall5(0);

    if (winner.isHero) {
      setUserWinCount((prev) => prev + 1);
      addLog5(`🏆 You won uncontested pot of $${potToWin}!`, "coach-positive");
    } else {
      setComputerWinCount((prev) => prev + 1);
      addLog5(`🏆 ${winner.name} won uncontested pot of $${potToWin}!`, "system");
    }

    setHandsPlayed5((prev) => prev + 1);
    setStage5("ENDED");
  };

  const executeBotDecision5 = (position: number) => {
    const player = players5[position];
    if (!player || player.folded || player.allIn) return;

    const toCall = currentBetToCall5 - player.currentBet;
    const currentStack = player.stack;

    let action: "FOLD" | "CHECK" | "CALL" | "RAISE" = "CHECK";
    let betAmt = 0;

    if (stage5 === "PREFLOP") {
      const c1 = player.hand[0];
      const c2 = player.hand[1];
      const highVal = Math.max(c1.value, c2.value);
      const lowVal = Math.min(c1.value, c2.value);
      const isPair = c1.value === c2.value;
      const isSuited = c1.suit === c2.suit;

      if (isPair && highVal >= 10) {
        if (toCall === 0) {
          action = "RAISE";
          betAmt = 6;
        } else {
          action = "RAISE";
          betAmt = currentBetToCall5 * 2.5;
        }
      } else if (highVal >= 12 || isPair || (isSuited && highVal - lowVal <= 3)) {
        action = toCall === 0 ? "CHECK" : "CALL";
        betAmt = toCall;
      } else {
        if (toCall === 0) {
          action = "CHECK";
          betAmt = 0;
        } else {
          if (toCall <= 2 && (player.role === "SB" || player.role === "BB" || player.role === "BTN")) {
            action = "CALL";
            betAmt = toCall;
          } else {
            action = "FOLD";
            betAmt = 0;
          }
        }
      }
    } else {
      const pEval = evaluate7Cards(player.hand, board5);
      if (pEval.rankType >= 3) {
        if (toCall === 0) {
          action = "RAISE";
          betAmt = Math.max(4, Math.round(potSize5 * 0.5));
        } else {
          action = "RAISE";
          betAmt = currentBetToCall5 + Math.max(6, Math.round(potSize5 * 0.5));
        }
      } else if (pEval.rankType >= 1) {
        if (toCall === 0) {
          action = Math.random() < 0.4 ? "RAISE" : "CHECK";
          betAmt = action === "RAISE" ? Math.max(4, Math.round(potSize5 * 0.4)) : 0;
        } else {
          if (toCall <= potSize5 * 0.5 || pEval.rankType >= 2) {
            action = "CALL";
            betAmt = toCall;
          } else {
            action = "FOLD";
            betAmt = 0;
          }
        }
      } else {
        if (toCall === 0) {
          action = "CHECK";
          betAmt = 0;
        } else {
          action = "FOLD";
          betAmt = 0;
        }
      }
    }

    if (action === "RAISE" && betAmt > currentStack) {
      betAmt = currentStack;
    }
    if (action === "CALL" && betAmt > currentStack) {
      betAmt = currentStack;
    }

    const updatedPlayers = players5.map((p, idx) => {
      if (idx === position) {
        const nextBet = action === "RAISE" ? betAmt : action === "CALL" ? p.currentBet + betAmt : p.currentBet;
        const stackDeduction = action === "RAISE" ? (betAmt - p.currentBet) : action === "CALL" ? betAmt : 0;
        
        let label = "";
        if (action === "FOLD") label = "Fold";
        else if (action === "CHECK") label = "Check";
        else if (action === "CALL") label = `Call $${betAmt}`;
        else if (action === "RAISE") label = `Raise to $${betAmt}`;

        return {
          ...p,
          folded: action === "FOLD" ? true : p.folded,
          stack: p.stack - stackDeduction,
          currentBet: nextBet,
          acted: true,
          allIn: (action === "RAISE" || action === "CALL") && betAmt === currentStack ? true : p.allIn,
          lastAction: label
        };
      }
      return p;
    });

    let newBetToCall = currentBetToCall5;
    if (action === "RAISE") {
      newBetToCall = betAmt;
      updatedPlayers.forEach((p, idx) => {
        if (idx !== position && !p.folded && !p.allIn) {
          p.acted = false;
        }
      });
    }

    const playerName = player.name;
    let textLog = "";
    if (action === "FOLD") textLog = `${playerName} folds.`;
    else if (action === "CHECK") {
      textLog = `${playerName} checks.`;
      playCheckSound();
    }
    else if (action === "CALL") textLog = `${playerName} calls $${betAmt}.`;
    else if (action === "RAISE") {
      textLog = `${playerName} raises to $${betAmt}.`;
      playRaiseSound();
    }

    const newLog: GameLog = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      player: "Computer",
      text: textLog,
      type: "action"
    };

    setLogs5((prev) => [...prev, newLog]);
    setCurrentBetToCall5(newBetToCall);
    moveToNextPlayerOrStreet5(updatedPlayers, action, betAmt);
  };

  const getClientGTOAdvice5 = (
    hand: Card[],
    b: Card[],
    stg: HandStage,
    toCall: number,
    pot: number
  ): GTOAdvice => {
    const sprValue = pot > 0 ? parseFloat((100 / pot).toFixed(1)) : 50.0;
    
    if (hand.length < 2) {
      return {
        recommendedAction: "Check",
        actionBreakdown: { fold: 10, call: 90, raise: 0 },
        evs: { fold: 0.0, call: 0.1, raise: 0.0 },
        coachComments: "Waiting for cards to deal in 5-Player Simulation.",
        handStrengthEvaluation: "No cards",
        rangeConcept: "Idle Position Strategy",
        rangeOverallStrategy: { checkFold: 30, checkCall: 50, betRaise: 20 },
        rangeRawEquity: 50,
        rangeEQR: 100,
        rangeHandCategories: { overpairs: 0, topPairs: 0, midPairs: 0, draws: 0, air: 100 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 50, villainRangeEquity: 50 }
      };
    }

    const c1 = hand[0];
    const c2 = hand[1];
    const hi = Math.max(c1.value, c2.value);
    const lo = Math.min(c1.value, c2.value);
    const isPair = c1.value === c2.value;
    const isSuited = c1.suit === c2.suit;

    if (stg === "PREFLOP") {
      if (isPair) {
        if (hi >= 10) {
          return {
            recommendedAction: "Raise to $6",
            actionBreakdown: { fold: 0, call: 10, raise: 90 },
            evs: { fold: 0.0, call: 3.5, raise: 6.2 },
            coachComments: "In 5-player simulation, premium pocket pairs represent highly advantageous opportunities. Raise to narrow fields and extract preflop isolation value.",
            handStrengthEvaluation: `Premium Pocket Pair of ${c1.rank}s`,
            rangeConcept: "Isolation Value Range",
            rangeOverallStrategy: { checkFold: 5, checkCall: 25, betRaise: 70 },
            rangeRawEquity: 69.4,
            rangeEQR: 114,
            rangeHandCategories: { overpairs: 18, topPairs: 12, midPairs: 10, draws: 10, air: 50 },
            macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Hero", heroRangeEquity: 69.4, villainRangeEquity: 30.6 }
          };
        } else {
          return {
            recommendedAction: toCall > 0 ? "Call" : "Check",
            actionBreakdown: { fold: 10, call: 75, raise: 15 },
            evs: { fold: 0.0, call: 1.4, raise: 0.5 },
            coachComments: "Set-mining smaller pairs is lucrative multi-way. Check or call cheap bets to hit sets on the flop.",
            handStrengthEvaluation: `Pocket Pair of ${c1.rank}s`,
            rangeConcept: "Speculative Implied Value Strategy",
            rangeOverallStrategy: { checkFold: 20, checkCall: 65, betRaise: 15 },
            rangeRawEquity: 50.8,
            rangeEQR: 94,
            rangeHandCategories: { overpairs: 1, topPairs: 4, midPairs: 18, draws: 10, air: 67 },
            macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 50.8, villainRangeEquity: 49.2 }
          };
        }
      }

      if (hi >= 13 && lo >= 10) {
        return {
          recommendedAction: "Raise to $6",
          actionBreakdown: { fold: 0, call: 25, raise: 75 },
          evs: { fold: 0.0, call: 1.8, raise: 2.8 },
          coachComments: "Strong high-card broadway broadens range isolation options. Open-raise to build momentum and extract equity advantages early.",
          handStrengthEvaluation: `Broadway High Card ${c1.rank}${c2.rank}`,
          rangeConcept: "Initiative Range Advantage",
          rangeOverallStrategy: { checkFold: 15, checkCall: 50, betRaise: 35 },
          rangeRawEquity: 57.3,
          rangeEQR: 104,
          rangeHandCategories: { overpairs: 0, topPairs: 28, midPairs: 8, draws: 10, air: 54 },
          macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Equal", heroRangeEquity: 57.3, villainRangeEquity: 42.7 }
        };
      }

      if (isSuited && hi - lo <= 3 && hi >= 7) {
        return {
          recommendedAction: toCall > 0 ? (toCall <= 4 ? "Call" : "Fold") : "Raise to $5",
          actionBreakdown: toCall > 0 ? { fold: 35, call: 55, raise: 10 } : { fold: 0, call: 60, raise: 40 },
          evs: toCall > 0 ? { fold: 0.0, call: 0.4, raise: -0.1 } : { fold: 0.0, call: 0.9, raise: 0.6 },
          coachComments: "Suited connectors hold powerful flush and straight potential against multi-way cards. Enter cheaply or open raise from late position.",
          handStrengthEvaluation: `Suited Card Connector ${c1.rank}${c2.rank}s`,
          rangeConcept: "Multi-way Draw Strategy",
          rangeOverallStrategy: { checkFold: 20, checkCall: 60, betRaise: 20 },
          rangeRawEquity: 46.8,
          rangeEQR: 106,
          rangeHandCategories: { overpairs: 0, topPairs: 6, midPairs: 12, draws: 42, air: 40 },
          macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 46.8, villainRangeEquity: 53.2 }
        };
      }

      if (toCall > 2) {
        return {
          recommendedAction: "Fold",
          actionBreakdown: { fold: 95, call: 5, raise: 0 },
          evs: { fold: 0.0, call: -1.2, raise: -2.8 },
          coachComments: "In 5-player simulations, folding raw marginal values preserves capital. Playing secondary high-cards facing multi-way bets leaks expectation.",
          handStrengthEvaluation: `Marginal Holding ${c1.rank}${c2.rank}`,
          rangeConcept: "Capital Preservation Fold",
          rangeOverallStrategy: { checkFold: 90, checkCall: 5, betRaise: 5 },
          rangeRawEquity: 22.4,
          rangeEQR: 64,
          rangeHandCategories: { overpairs: 0, topPairs: 2, midPairs: 4, draws: 5, air: 89 },
          macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 22.4, villainRangeEquity: 77.6 }
        };
      }

      if (toCall > 0) {
        const isStrongOffsuit = !isSuited && hi >= 11 && lo >= 8;
        const isMiddleSuitedOrConnected = (isSuited && hi >= 7) || (hi - lo <= 1 && hi >= 6);
        const isPlayable = isStrongOffsuit || isMiddleSuitedOrConnected;
        
        if (!isPlayable) {
          return {
            recommendedAction: "Fold",
            actionBreakdown: { fold: 100, call: 0, raise: 0 },
            evs: { fold: 0.0, call: -2.0, raise: -3.5 },
            coachComments: `Holding weak unsuited or low values like ${c1.rank}${c2.rank}o in a multi-party game represents strongly negative EV if you call. Correct GTO play is to fold to preserve chips.`,
            handStrengthEvaluation: `Weak Offsuit Trash ${c1.rank}${c2.rank}o`,
            rangeConcept: "Standard Preflop Fold",
            rangeOverallStrategy: { checkFold: 100, checkCall: 0, betRaise: 0 },
            rangeRawEquity: 18.5,
            rangeEQR: 54,
            rangeHandCategories: { overpairs: 0, topPairs: 1, midPairs: 3, draws: 4, air: 92 },
            macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 18.5, villainRangeEquity: 81.5 }
          };
        }
      }

      if (toCall === 0) {
        return {
          recommendedAction: "Check",
          actionBreakdown: { fold: 0, call: 100, raise: 0 },
          evs: { fold: 0.0, call: 0.0, raise: 0.0 },
          coachComments: "Checking is free and logical preflop since there is no raise to call. See the flop for free from the Big Blind.",
          handStrengthEvaluation: `Free play with ${c1.rank}${c2.rank}`,
          rangeConcept: "Free Big Blind Check",
          rangeOverallStrategy: { checkFold: 0, checkCall: 100, betRaise: 0 },
          rangeRawEquity: 32.5,
          rangeEQR: 80,
          rangeHandCategories: { overpairs: 0, topPairs: 4, midPairs: 8, draws: 10, air: 78 },
          macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 32.5, villainRangeEquity: 67.5 }
        };
      }

      return {
        recommendedAction: toCall > 0 ? "Call" : "Check",
        actionBreakdown: { fold: 15, call: 80, raise: 5 },
        evs: { fold: 0.0, call: 0.4, raise: 0.1 },
        coachComments: `Marginal preflop hand. Standard play is to ${toCall > 0 ? "call" : "check"} to see a cheap flop with wide range.`,
        handStrengthEvaluation: `Marginal ${c1.rank}${c2.rank}`,
        rangeConcept: "Marginal Default Hold",
        rangeOverallStrategy: { checkFold: 25, checkCall: 70, betRaise: 5 },
        rangeRawEquity: 45.0,
        rangeEQR: 90,
        rangeHandCategories: { overpairs: 0, topPairs: 6, midPairs: 8, draws: 14, air: 72 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 45.0, villainRangeEquity: 55.0 }
      };
    }

    const pEval = evaluate7Cards(hand, b);
    let pEvalRankType = pEval.rankType;
    let rankName = pEval.rankName;

    // Check if the made hand is purely from board cards
    if (b.length >= 3) {
      const counts: { [key: number]: number } = {};
      for (const card of b) {
        counts[card.value] = (counts[card.value] || 0) + 1;
      }
      const freqs = Object.values(counts).sort((x, y) => y - x);
      const boardMaxFreq = freqs[0] || 0;
      const boardNumPairs = freqs.filter(f => f >= 2).length;

      if (pEvalRankType === 1 && boardMaxFreq >= 2) {
        pEvalRankType = 0;
        rankName = "High Card (Paired Board)";
      } else if (pEvalRankType === 2 && boardNumPairs >= 2) {
        pEvalRankType = 0;
        rankName = "High Card (Board Two Pair)";
      } else if (pEvalRankType === 3 && boardMaxFreq >= 3) {
        pEvalRankType = 0;
        rankName = "High Card (Board Trips)";
      } else if (b.length >= 5) {
        const boardEval = evaluate7Cards([], b);
        if (pEvalRankType <= boardEval.rankType) {
          pEvalRankType = 0;
          rankName = `High Card (Board has ${boardEval.rankName})`;
        }
      }
    }

    const handAnalysis = describeHandRelation(hand, b, stg, rankName, pEvalRankType);

    if (pEvalRankType >= 3) {
      return {
        recommendedAction: "Raise/Bet",
        actionBreakdown: { fold: 0, call: 15, raise: 85 },
        evs: { fold: 0.0, call: 4.8, raise: 8.9 },
        coachComments: `You made ${handAnalysis.description}. ${handAnalysis.assessment}`,
        handStrengthEvaluation: handAnalysis.description,
        rangeConcept: "Value Fast-Play Block",
        rangeOverallStrategy: { checkFold: 3, checkCall: 12, betRaise: 85 },
        rangeRawEquity: 89.2,
        rangeEQR: 128,
        rangeHandCategories: { overpairs: 8, topPairs: 22, midPairs: 4, draws: 0, air: 66 },
        macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Hero", heroRangeEquity: 89.2, villainRangeEquity: 10.8 }
      };
    }

    if (pEvalRankType >= 1) {
      return {
        recommendedAction: toCall > 0 ? "Call" : "Check",
        actionBreakdown: toCall > 0 ? { fold: 22, call: 68, raise: 10 } : { fold: 0, call: 78, raise: 22 },
        evs: toCall > 0 ? { fold: 0.0, call: 2.2, raise: 0.6 } : { fold: 0.0, call: 1.9, raise: 1.2 },
        coachComments: `Holding ${handAnalysis.description}. ${handAnalysis.assessment}`,
        handStrengthEvaluation: handAnalysis.description,
        rangeConcept: "Postflop Control Play",
        rangeOverallStrategy: { checkFold: 18, checkCall: 68, betRaise: 14 },
        rangeRawEquity: 59.4,
        rangeEQR: 97,
        rangeHandCategories: { overpairs: 1, topPairs: 28, midPairs: 22, draws: 8, air: 41 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 59.4, villainRangeEquity: 40.6 }
      };
    }

    const hasDraw = stg !== "RIVER" && hasPostflopDraws([...hand, ...b]);
    if (hasDraw) {
      return {
        recommendedAction: toCall > 0 ? "Call" : "Check",
        actionBreakdown: toCall > 0 ? { fold: 10, call: 75, raise: 15 } : { fold: 0, call: 70, raise: 30 },
        evs: toCall > 0 ? { fold: 0.0, call: 1.4, raise: 0.5 } : { fold: 0.0, call: 1.6, raise: 1.0 },
        coachComments: "Holding a solid speculative draw. Calling matches optimal expectancy index while keeping risk ratios balanced.",
        handStrengthEvaluation: `Speculative Draw (${rankName})`,
        rangeConcept: "Semi-Bluff Draw",
        rangeOverallStrategy: { checkFold: 8, checkCall: 62, betRaise: 30 },
        rangeRawEquity: 49.2,
        rangeEQR: 104,
        rangeHandCategories: { overpairs: 0, topPairs: 4, midPairs: 8, draws: 48, air: 40 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 49.2, villainRangeEquity: 50.8 }
      };
    }

    return {
      recommendedAction: toCall > 0 ? "Fold" : "Check",
      actionBreakdown: toCall > 0 ? { fold: 95, call: 5, raise: 0 } : { fold: 0, call: 88, raise: 12 },
      evs: toCall > 0 ? { fold: 0.0, call: -2.0, raise: -3.5 } : { fold: 0.0, call: 0.1, raise: 0.0 },
      coachComments: toCall > 0
        ? `Folding is mandatory here. Holding zero value air (${rankName}) makes defensive preservation the correct solver strategy.`
        : `Checking is completely standard. We hold unimproved air (${rankName}), so checking along protects our options without wasting chips.`,
      handStrengthEvaluation: `Unimproved Air (${rankName})`,
      rangeConcept: "Clean Fold Spot",
      rangeOverallStrategy: { checkFold: 92, checkCall: 5, betRaise: 3 },
      rangeRawEquity: 11.5,
      rangeEQR: 45,
      rangeHandCategories: { overpairs: 0, topPairs: 3, midPairs: 2, draws: 0, air: 95 },
      macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 11.5, villainRangeEquity: 88.5 }
    };
  };

  const submitUserAction5 = (actionType: "FOLD" | "CHECK" | "CALL" | "RAISE", userRaiseSize: number = 0) => {
    const userIndex = 0;
    const player = players5[userIndex];
    if (!player || activePosition5 !== userIndex) return;

    const toCall = currentBetToCall5 - player.currentBet;

    let reviewBestAction: "Fold" | "Call/Check" | "Raise/Bet" = "Fold";
    const advice = getClientGTOAdvice5(player.hand, board5, stage5, toCall, potSize5);
    const foldEV = advice.evs.fold;
    const callEV = advice.evs.call;
    const raiseEV = advice.evs.raise;
    const bestEV = Math.max(foldEV, callEV, raiseEV);

    if (bestEV === callEV) reviewBestAction = "Call/Check";
    else if (bestEV === raiseEV) reviewBestAction = "Raise/Bet";

    let chosenActionEnum: "Fold" | "Call/Check" | "Raise/Bet" = "Call/Check";
    if (actionType === "FOLD") chosenActionEnum = "Fold";
    else if (actionType === "RAISE") chosenActionEnum = "Raise/Bet";

    const chosenEVKey = actionType === "FOLD" ? "fold" : actionType === "RAISE" ? "raise" : "call";
    const regret = Math.max(0, bestEV - (advice.evs[chosenEVKey] ?? 0));

    let sizingFeedback: any = undefined;
    let totalRegret = regret;

    if (actionType === "RAISE") {
      const userEval = evaluate7Cards(player.hand, board5);
      const handEvalName = userEval.rankName;
      const isActionOptimal = regret === 0;

      sizingFeedback = computeSizingFeedback(
        userRaiseSize,
        advice.recommendedAction,
        potSize5,
        currentBetToCall5,
        stage5,
        handEvalName,
        isActionOptimal,
        regret
      );

      if (sizingFeedback.status !== "perfect") {
        const difference = Math.abs(userRaiseSize - sizingFeedback.optimalSizing);
        const percentDiff = sizingFeedback.optimalSizing > 0 ? (difference / sizingFeedback.optimalSizing) : 0;
        const sizingPenalty = parseFloat(Math.min(1.5, 0.25 + percentDiff * 0.35).toFixed(2));
        totalRegret = parseFloat((regret + sizingPenalty).toFixed(2));
      } else if (regret > 0) {
        // Intentionally aggressive, perfectly sized raise receives a 75% regret discount to support practice
        totalRegret = parseFloat((regret * 0.25).toFixed(2));
      }
    }

    const feedbackObj5 = {
      chosenAction: chosenActionEnum,
      chosenActionLabel: actionType === "FOLD" ? "Fold" : actionType === "CHECK" ? "Check" : actionType === "CALL" ? `Call $${toCall}` : `Raise to $${userRaiseSize}`,
      bestAction: reviewBestAction,
      bestActionLabel: reviewBestAction === "Fold" ? "Fold" : reviewBestAction === "Call/Check" ? (toCall > 0 ? "Call" : "Check") : "Raise/Bet",
      chosenEV: advice.evs[chosenEVKey] ?? 0,
      bestEV,
      regret: parseFloat(totalRegret.toFixed(2)),
      actionRegret: parseFloat(regret.toFixed(2)),
      actionBreakdown: advice.actionBreakdown,
      evs: advice.evs,
      rngRoll: Math.floor(Math.random() * 100) + 1,
      rngChoice: chosenActionEnum,
      comments: advice.coachComments,
      sizingFeedback,
      onContinue: () => {
        setReviewFeedback5(null);
        setCurrentHandMovesCount5((prev) => prev + 1);
        setCurrentHandRegretSum5((prev) => prev + totalRegret);
        applyUserActionToGame5(actionType, userRaiseSize);
      }
    };

    recordStep5player(feedbackObj5);
    setReviewFeedback5(feedbackObj5);
  };

  const fastForwardHand5 = (updatedPlayers: Player5[]) => {
    // 1. Filter out only players that are active and have not folded
    const activeUnfoldedPlayers = updatedPlayers.filter((p) => !p.folded);
    
    if (activeUnfoldedPlayers.length === 1) {
      // Award winner uncontested immediately
      awardWinnerUncontested5(updatedPlayers, activeUnfoldedPlayers[0]);
      return;
    }

    // 2. Complete the board to 5 cards from deck
    let currentBoard = [...board5];
    let currentDeck = [...deck5];
    while (currentBoard.length < 5 && currentDeck.length > 0) {
      currentBoard.push(currentDeck[0]);
      currentDeck = currentDeck.slice(1);
    }
    setBoard5(currentBoard);
    setDeck5(currentDeck);

    // 3. Resolve the showdown with active players
    // All remaining players show down
    const playerEvaluations = activeUnfoldedPlayers.map((p) => {
      const evalResult = evaluate7Cards(p.hand, currentBoard);
      return {
        player: p,
        evaluation: evalResult
      };
    });

    playerEvaluations.sort((a, b) => {
      if (a.evaluation.rankType !== b.evaluation.rankType) {
        return b.evaluation.rankType - a.evaluation.rankType;
      }
      const len = Math.max(a.evaluation.tiebreakers.length, b.evaluation.tiebreakers.length);
      for (let i = 0; i < len; i++) {
        const valA = a.evaluation.tiebreakers[i] || 0;
        const valB = b.evaluation.tiebreakers[i] || 0;
        if (valA !== valB) {
          return valB - valA;
        }
      }
      return 0;
    });

    const winnerEval = playerEvaluations[0];
    const winnersList = playerEvaluations.filter((pe) => {
      if (pe.evaluation.rankType !== winnerEval.evaluation.rankType) return false;
      const len = Math.max(pe.evaluation.tiebreakers.length, winnerEval.evaluation.tiebreakers.length);
      for (let i = 0; i < len; i++) {
        if ((pe.evaluation.tiebreakers[i] || 0) !== (winnerEval.evaluation.tiebreakers[i] || 0)) {
          return false;
        }
      }
      return true;
    });

    // Compute total pot to win
    const totalBetsCommitted = updatedPlayers.reduce((sum, p) => sum + p.currentBet, 0);
    const finalPot = potSize5 + totalBetsCommitted;
    const prizePerWinner = Math.floor(finalPot / winnersList.length);

    const finalPlayers = updatedPlayers.map((p) => {
      const isWinner = winnersList.some((w) => w.player.id === p.id);
      if (isWinner) {
        return {
          ...p,
          stack: p.stack + prizePerWinner,
          currentBet: 0,
          lastAction: `Won $${prizePerWinner} with ${evaluate7Cards(p.hand, currentBoard).rankName}`
        };
      } else if (!p.folded) {
        return {
          ...p,
          currentBet: 0,
          lastAction: `Revealed ${evaluate7Cards(p.hand, currentBoard).rankName}`
        };
      }
      return { ...p, currentBet: 0 };
    });

    setPlayers5(finalPlayers);
    setPotSize5(0);
    setCurrentBetToCall5(0);

    // Hero is folded, so Hero is not a winner
    setComputerWinCount((prev) => prev + 1);

    winnersList.forEach((w) => {
      addLog5(`🏆 ${w.player.name} wins $${prizePerWinner} with ${w.evaluation.rankName}!`, "coach-positive");
    });

    addLog5(`System: Folded pre-flop. Let remaining bots showdown on actual board runout.`, "info");

    setHandsPlayed5((prev) => prev + 1);
    setStage5("ENDED");
  };

  const applyUserActionToGame5 = (actionType: "FOLD" | "CHECK" | "CALL" | "RAISE", userRaiseSize: number = 0) => {
    const userIndex = 0;
    const player = players5[userIndex];
    const toCall = currentBetToCall5 - player.currentBet;

    let commitment = player.currentBet;
    let textLog = "";
    let finalRaiseBet = currentBetToCall5;

    const currentPlayers = players5.map((p, idx) => {
      if (idx === userIndex) {
        if (actionType === "FOLD") {
          textLog = "You fold.";
          return {
            ...p,
            folded: true,
            acted: true,
            lastAction: "Fold"
          };
        } else if (actionType === "CHECK") {
          textLog = "You check.";
          playCheckSound();
          return {
            ...p,
            acted: true,
            lastAction: "Check"
          };
        } else if (actionType === "CALL") {
          commitment = p.currentBet + toCall;
          const isAllIn = toCall >= p.stack;
          const actualDeduct = isAllIn ? p.stack : toCall;
          textLog = `You call $${actualDeduct}.`;
          return {
            ...p,
            stack: p.stack - actualDeduct,
            currentBet: p.currentBet + actualDeduct,
            allIn: isAllIn || p.allIn,
            acted: true,
            lastAction: `Call $${actualDeduct}`
          };
        } else {
          const raiseAdded = userRaiseSize - p.currentBet;
          const isAllIn = raiseAdded >= p.stack;
          const actualDeduct = isAllIn ? p.stack : raiseAdded;
          const finalBet = p.currentBet + actualDeduct;
          finalRaiseBet = finalBet;
          textLog = `You raise to $${finalBet}.`;
          playRaiseSound();

          return {
            ...p,
            stack: p.stack - actualDeduct,
            currentBet: finalBet,
            allIn: isAllIn || p.allIn,
            acted: true,
            lastAction: `Raise to $${finalBet}`
          };
        }
      }
      return p;
    });

    let newBetToCall = currentBetToCall5;
    if (actionType === "RAISE") {
      newBetToCall = finalRaiseBet;
      currentPlayers.forEach((p, idx) => {
        if (idx !== userIndex && !p.folded && !p.allIn) {
          p.acted = false;
        }
      });
    }

    const newLog: GameLog = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      player: "User",
      text: textLog,
      type: "action"
    };

    if (actionType === "FOLD") {
      setLogs5((prev) => [...prev, newLog]);
      setCurrentBetToCall5(newBetToCall);
      fastForwardHand5(currentPlayers);
    } else {
      setLogs5((prev) => [...prev, newLog]);
      setCurrentBetToCall5(newBetToCall);
      moveToNextPlayerOrStreet5(currentPlayers, actionType, userRaiseSize);
    }
  };

  const moveToNextPlayerOrStreet5 = (updatedPlayers: Player5[], lastActionType: string, betAmount: number) => {
    const activeUnfoldedPlayers = updatedPlayers.filter((p) => !p.folded);
    if (activeUnfoldedPlayers.length === 1) {
      awardWinnerUncontested5(updatedPlayers, activeUnfoldedPlayers[0]);
      return;
    }

    const eligibleToAct = updatedPlayers.filter((p) => !p.folded && !p.allIn);
    const highestBet = Math.max(...updatedPlayers.map((p) => p.currentBet));
    const allActed = eligibleToAct.every((p) => p.acted);
    const equalizedBets = eligibleToAct.every((p) => p.currentBet === highestBet);

    if (allActed && equalizedBets) {
      advanceStreet5(updatedPlayers);
    } else {
      let nextIndex = (activePosition5 + 1) % 5;
      while (updatedPlayers[nextIndex].folded || updatedPlayers[nextIndex].allIn) {
        nextIndex = (nextIndex + 1) % 5;
      }
      setActivePosition5(nextIndex);
      setPlayers5(updatedPlayers);
    }
  };

  const handleTopUp5 = () => {
    const freshStacks = [100, 100, 100, 100, 100];
    setHandsPlayed5(1);
    setUserWinCount(0);
    setComputerWinCount(0);
    setSplitCount(0);
    startNewHand5(freshStacks);
    addLog5("Re-bought all 5 table seats with classic $100 depth.", "system");
  };

  useEffect(() => {
    if (gameMode === "5player" && stage5 !== "SHOWDOWN" && stage5 !== "ENDED") {
      const activePlayer = players5[activePosition5];
      if (activePlayer && !activePlayer.isHero && !activePlayer.folded && !activePlayer.allIn) {
        const delay = setTimeout(() => {
          executeBotDecision5(activePosition5);
        }, 1100);
        return () => clearTimeout(delay);
      }
    }
  }, [gameMode, stage5, activePosition5, players5]);
  // --- 5-PLAYER SECTOR END ---

  // Scroll ref for dealer table logs
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Initialize first game hand on mount
  useEffect(() => {
    resetGameHand(100, 100);

    const fullDeck = shuffleDeck(createDeck());
    const userHole = [fullDeck[0], fullDeck[1]];
    const alphaHole = [fullDeck[2], fullDeck[3]];
    const betaHole = [fullDeck[4], fullDeck[5]];
    const gammaHole = [fullDeck[6], fullDeck[7]];
    const deltaHole = [fullDeck[8], fullDeck[9]];
    const remainingDeck = fullDeck.slice(10);

    const defaultNames = ["You", "AlphaBot", "BetaBot", "GammaBot", "DeltaBot"];
    const hands = [userHole, alphaHole, betaHole, gammaHole, deltaHole];
    const roles: Array<"BTN" | "SB" | "BB" | "UTG" | "HJ"> = ["BTN", "SB", "BB", "UTG", "HJ"];
    
    const tempPlayers = defaultNames.map((name, i) => {
      let commitment = 0;
      if (i === 1) commitment = 1; // AlphaBot (SB)
      if (i === 2) commitment = 2; // BetaBot (BB)
      return {
        id: i === 0 ? "User" : name,
        name,
        isHero: i === 0,
        hand: hands[i],
        stack: i === 1 ? 99 : i === 2 ? 98 : 100,
        currentBet: commitment,
        folded: false,
        allIn: false,
        acted: false,
        role: roles[i],
        lastAction: roles[i] === "SB" ? "Small Blind $1" : roles[i] === "BB" ? "Big Blind $2" : ""
      };
    });

    setPlayers5(tempPlayers);
    setBoard5([]);
    setDeck5(remainingDeck);
    setStage5("PREFLOP");
    setPotSize5(0);
    setCurrentBetToCall5(2);
    setActivePosition5(3); // UTG acts first
    setDealerIndex5(0);
    setLogs5([
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text: `*** Switched to 5-Player Simulation training ***`,
        type: "system"
      },
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        text: `Blinds: SB $1 (AlphaBot), BB $2 (BetaBot). You are on the Button. UTG acts first.`,
        type: "info"
      }
    ]);

    addTableLog("Standard play assumptions initialized. $1/$2 HUD blinds, $100 starting stacks.", "system");
  }, []);

  // Scroll to bottom of game log whenever log updates
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, logs5]);

  // Trigger automated Computer decision whenever it's Computer's turn
  useEffect(() => {
    if (turn === "Computer" && stage !== "SHOWDOWN" && stage !== "ENDED" && !isComputerThinking) {
      const delay = setTimeout(() => {
        executeComputerDecision();
      }, 1100); // realistic think timer
      return () => clearTimeout(delay);
    }
  }, [turn, stage, userCurrentBet, computerCurrentBet, userStack, computerStack]);

  // Auto-coach GTO analyze whenever users turn is activated and autoCoach is checked
  useEffect(() => {
    if (turn === "User" && autoCoach && stage !== "SHOWDOWN" && stage !== "ENDED" && !isAnalysingGto) {
      fetchGTOAdvice();
    }
  }, [turn, stage, autoCoach, board, userHand, computerHand, potSize, computerCurrentBet, userStack, computerStack]);

  // Fetch full hand review summary when hand concludes
  useEffect(() => {
    if (stage === "ENDED") {
      fetchHandReview();
    }
  }, [stage]);

  // Fetch 5-player hand review summary when hand concludes
  useEffect(() => {
    if (gameMode === "5player" && stage5 === "ENDED") {
      fetchHandReview5();
    }
  }, [stage5, gameMode]);

  // Track changes in bets and spawn flying animations
  useEffect(() => {
    if (userCurrentBet > lastUserBet) {
      const diff = userCurrentBet - lastUserBet;
      const numChips = Math.min(6, Math.max(1, Math.ceil(diff / 5)));
      const newChips = Array.from({ length: numChips }).map((_, i) => ({
        id: `user-bet-${Date.now()}-${i}-${Math.random()}`,
        from: "User" as const,
        value: Math.max(1, Math.round(diff / numChips)),
        index: i
      }));
      setFlyingChips((prev) => [...prev, ...newChips]);
    }
    setLastUserBet(userCurrentBet);
  }, [userCurrentBet, lastUserBet]);

  useEffect(() => {
    if (computerCurrentBet > lastComputerBet) {
      const diff = computerCurrentBet - lastComputerBet;
      const numChips = Math.min(6, Math.max(1, Math.ceil(diff / 5)));
      const newChips = Array.from({ length: numChips }).map((_, i) => ({
        id: `computer-bet-${Date.now()}-${i}-${Math.random()}`,
        from: "Computer" as const,
        value: Math.max(1, Math.round(diff / numChips)),
        index: i
      }));
      setFlyingChips((prev) => [...prev, ...newChips]);
    }
    setLastComputerBet(computerCurrentBet);
  }, [computerCurrentBet, lastComputerBet]);

  // Sweep animation: When the hand stage advances, sweep side pool bets into the main pot
  useEffect(() => {
    if (stage !== prevStage) {
      if (lastUserBet > 0 || lastComputerBet > 0) {
        const sweepChips: Array<{ id: string; from: "User" | "Computer"; value: number; index: number }> = [];
        
        if (lastUserBet > 0) {
          const numChips = Math.min(4, Math.max(1, Math.ceil(lastUserBet / 10)));
          for (let i = 0; i < numChips; i++) {
            sweepChips.push({
              id: `sweep-user-${Date.now()}-${i}-${Math.random()}`,
              from: "User",
              value: Math.max(1, Math.round(lastUserBet / numChips)),
              index: i
            });
          }
        }

        if (lastComputerBet > 0) {
          const numChips = Math.min(4, Math.max(1, Math.ceil(lastComputerBet / 10)));
          for (let i = 0; i < numChips; i++) {
            sweepChips.push({
              id: `sweep-comp-${Date.now()}-${i}-${Math.random()}`,
              from: "Computer",
              value: Math.max(1, Math.round(lastComputerBet / numChips)),
              index: i
            });
          }
        }

        if (sweepChips.length > 0) {
          setFlyingChips((prev) => [...prev, ...sweepChips]);
        }
      }
      setPrevStage(stage);
    }
  }, [stage, prevStage, lastUserBet, lastComputerBet]);

  // Log helper
  const addTableLog = (text: string, type: GameLog["type"], player?: GameLog["player"]) => {
    const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newLog: GameLog = {
      id: "log-" + Math.random().toString(36).substr(2, 9),
      timestamp: formattedTime,
      player,
      text,
      type
    };
    setLogs((prev) => [...prev, newLog]);
  };

  // Completely reset hand and carry over stack sizes continuously
  const resetGameHand = (forcedUserStack?: number, forcedComputerStack?: number) => {
    if (currentHandSteps.length > 0) {
      setLastHandSteps(currentHandSteps);
    }
    setCurrentHandSteps([]);
    setReviewStepIndex(-1);
    setReviewingCurrentHand(false);

    const fullDeck = shuffleDeck(createDeck());
    const userHole = [fullDeck[0], fullDeck[1]];
    const compHole = [fullDeck[2], fullDeck[3]];
    const remainingDeck = fullDeck.slice(4);

    playCardFlipSound();

    setCurrentHandRegretSum(0);
    setCurrentHandMovesCount(0);
    setHandReview(null);
    setIsFetchingHandReview(false);

    // Toggle dealer button
    const nextDealer = dealer === "User" ? "Computer" : "User";
    setDealer(nextDealer);

    // Set blinds
    let userBlind = 0;
    let compBlind = 0;
    
    if (nextDealer === "User") {
      // User is Dealer / SB (posts $1), Computer is BB (posts $2)
      userBlind = 1;
      compBlind = 2;
    } else {
      // Computer is Dealer / SB (posts $1), User is BB (posts $2)
      userBlind = 2;
      compBlind = 1;
    }

    setUserHand(userHole);
    setComputerHand(compHole);
    setDeck(remainingDeck);
    setBoard([]);
    
    // Determine target carrying-over stacks
    // If we have forced values, use them. If not, use current active state balances directly
    let newUserStack = forcedUserStack !== undefined ? forcedUserStack : userStack;
    let newComputerStack = forcedComputerStack !== undefined ? forcedComputerStack : computerStack;

    if (newUserStack <= 2 || newComputerStack <= 2) {
      // Automatic Top Up to keep the training continuous if someone goes broke or cannot afford blinds!
      newUserStack = 100;
      newComputerStack = 100;
      addTableLog("Table Notice: Stacks have been automatically topped up to $100 depth.", "info");
    }

    // Deduct blind commitments safely from the carry-over stacks!
    setUserStack(newUserStack - userBlind);
    setComputerStack(newComputerStack - compBlind);
    setUserCurrentBet(userBlind);
    setComputerCurrentBet(compBlind);
    setPotSize(0);
    
    // Preflop actor setup: SB (Dealer) acts first preflop in Heads-up!
    const preflopStarter = nextDealer;
    setTurn(preflopStarter);

    // Resets acted state
    setUserActed(false);
    setComputerActed(false);
    setStage("PREFLOP");
    setGtoAdvice(null);
    setWinEvaluation(null);
    setGtoCoachError(null);

    setHistoryTranscript([
      `Preflop begins. Blinds at $1/$2.`,
      `Dealer Button is with ${nextDealer === "User" ? "You" : "Computer"}.`,
      `${nextDealer === "User" ? "You post" : "Computer posts"} Small Blind $1.`,
      `${nextDealer === "User" ? "Computer posts" : "You post"} Big Blind $2.`
    ]);

    setLogs([]);
    addTableLog(`--- HAND #${handsPlayed} STARTED ---`, "system");
    addTableLog(`${nextDealer === "User" ? "You active" : "Computer active"} as Button (Dealer / Small Blind).`, "info");
    addTableLog(`${nextDealer === "User" ? "You post $1. Computer posts $2." : "Computer posts $1. You post $2."}`, "info");
    
    // Set default raise slider
    setBetChangeSlider(4); // standard raise to $4
  };

  // Top Up Chips if a player runs completely dry
  const handleTopUp = () => {
    setHandsPlayed(1);
    setUserWinCount(0);
    setComputerWinCount(0);
    setSplitCount(0);

    // Clear user adaptation and tracking stats
    setUserVpipCount(0);
    setUserPostflopPlays(0);
    setUserPostflopRaises(0);
    setUserPostflopBluffs(0);
    setUserPostflopCalls(0);
    setUserPostflopFolds(0);
    setComputerAdaptationStyle("STANDARD_GTO");

    resetGameHand(100, 100);
    addTableLog("Re-bought original training stacks. Game restarted with 100BB.", "system");
  };

  // Perform Gemini GTO advice fetch
  const fetchGTOAdvice = async () => {
    setIsAnalysingGto(true);
    setGtoCoachError(null);
    try {
      const userEval = evaluate7Cards(userHand, board);
      const compEval = evaluate7Cards(computerHand, board);

      const resp = await fetch("/api/poker-gto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userHand: userHand,
          userHandEvalName: userEval.rankName,
          userHandRankType: userEval.rankType,
          opponentHand: computerHand,
          opponentHandEvalName: compEval.rankName,
          opponentHandRankType: compEval.rankType,
          board: board,
          actions: historyTranscript,
          potSize: potSize,
          userStack: userStack,
          computerStack: computerStack,
          currentBet: computerCurrentBet,
          stage: stage,
          actionSpot: "COACH_ADVICE"
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "GTO synthesis offline");
      }
      setGtoAdvice(data);
      if (data.isFallback) {
        setGtoCoachError("Offline Engine active.");
      }
    } catch (err: any) {
      console.error(err);
      setGtoCoachError("Unable to retrieve live AI coach analytics.");
    } finally {
      setIsAnalysingGto(false);
    }
  };

  const calculateFinalReviewScore5 = () => {
    if (currentHandMovesCount5 === 0) return 100;
    return Math.max(0, Math.min(100, Math.round(100 - (currentHandRegretSum5 * 12))));
  };

  const getLocalHandReview5 = (score: number) => {
    let summaryAnalysis = "";
    let goodPlay = "";
    let badPlay = "";
    let gtoMainTakeaway = "";

    const hero = players5[0];
    const userEval = hero ? evaluate7Cards(hero.hand, board5) : null;
    const handStrName = userEval ? userEval.rankName : "folded cards";

    if (score >= 90) {
      summaryAnalysis = `Excellent GTO line match in 5-player combat! You played your ${handStrName} with high accuracy (${score}% accuracy), choosing solid fold or raise ratios.`;
      goodPlay = "- **Disciplined Frequencies**: Avoided overplaying marginal hands in multi-way dynamics.\n- **Excellent Posture**: Maintained range checking-protection when in active showdown positions.";
      badPlay = "- **None**: No severe GTO blunders detected.";
      gtoMainTakeaway = "Multi-way pots are inherently high variance; protecting your ranges and sizing down is vital for solid ring game GTO execution.";
    } else if (score >= 70) {
      summaryAnalysis = `Strong attempt at navigating the 5-player table. You managed your ${handStrName} decently, but had several suboptimal lines resulting in minor EV loss.`;
      goodPlay = "- **Patience**: Resisted loose traps and suited connector vanity preflop.\n- **Standard Defenses**: Folded correctly against large multiway sizes.";
      badPlay = "- **Inexact Sizings**: Missed optimal blocker-bet sizes on the flop or turn.\n- **Loose Float**: Oversold calls on speculative draws without range coverage.";
      gtoMainTakeaway = "In a 5-player ring sim, opponents hold higher cumulative equity. Tighten range thresholds and respect aggressive multi-way raisers.";
    } else {
      summaryAnalysis = `Critical GTO errors detected with ${handStrName} (${score}% accuracy), leaking key big blinds (accumulated regret: ${currentHandRegretSum5.toFixed(2)} bb).`;
      goodPlay = "- **Check-patience**: Found occasional checks when out of position.";
      badPlay = "- **Blunder actions**: Suboptimal checks, folds or costly calls against tight GTO bots.\n- **Sizing oversight**: Allowed opponents cheap realization of board equity.";
      gtoMainTakeaway = "Discipline is key in 5-player tables. Fold early on flop or preflop before getting trapped in bloated side-pots with second best.";
    }

    return { summaryAnalysis, goodPlay, badPlay, gtoMainTakeaway, isFallback: true };
  };

  const fetchHandReview5 = async () => {
    setIsFetchingHandReview5(true);
    setHandReview5(null);
    const calculatedScore = calculateFinalReviewScore5();
    
    try {
      const hero = players5[0];
      const userEval = hero ? evaluate7Cards(hero.hand, board5) : null;
      const handStrName = userEval ? userEval.rankName : "folded cards";

      const resp = await fetch("/api/poker-gto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userHand: hero ? hero.hand : [],
          userHandEvalName: handStrName,
          userHandRankType: userEval ? userEval.rankType : 0,
          opponentHand: [],
          opponentHandEvalName: "Multi-way bots",
          opponentHandRankType: 0,
          board: board5,
          actions: logs5.map(l => l.text),
          potSize: potSize5,
          userStack: hero ? hero.stack : 100,
          computerStack: 100,
          stage: stage5,
          actionSpot: "HAND_REVIEW",
          score: calculatedScore,
          regret: currentHandRegretSum5
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Review offline");
      }
      setHandReview5(data);
    } catch (err) {
      console.error("Failed to fetch 5player hand review:", err);
      setHandReview5(getLocalHandReview5(calculatedScore));
    } finally {
      setIsFetchingHandReview5(false);
    }
  };

  const calculateFinalReviewScore = () => {
    if (currentHandMovesCount === 0) return 100;
    const calculated = Math.max(0, Math.min(100, Math.round(100 - (currentHandRegretSum * 12))));
    return calculated;
  };

  const getLocalHandReview = (score: number) => {
    let summaryAnalysis = "";
    let goodPlay = "";
    let badPlay = "";
    let gtoMainTakeaway = "";

    // Obtain actual hand combination name for Hero using suit emojis
    const userEval = evaluate7Cards(userHand, board);
    const handStrName = userEval.rankName;

    if (score >= 90) {
      summaryAnalysis = `Navigated the hand beautifully holding ${handStrName} with high tactical GTO accuracy.`;
      goodPlay = "- **GTO Line Match**: Strong frequency balance.\n- **Excellent Sizings**: Max value extraction.";
      badPlay = "- **None**: No high-regret deviations found.";
      gtoMainTakeaway = "Strong check-ranges protect your marginal stack exposures on future textures.";
    } else if (score >= 70) {
      summaryAnalysis = `Played decent standard lines holding ${handStrName} with minor positional inaccuracies.`;
      goodPlay = "- **Sufficient Defense**: Defended adequately against aggressive ranges.";
      badPlay = "- **Marginal Merging**: Over-called with minor showdown value when checking holds higher EV.";
      gtoMainTakeaway = "Avoid over-merging secondary pairs; build clear value branches and folds.";
    } else {
      summaryAnalysis = `Faced major strategic errors holding ${handStrName} leading to dramatic EV degradation.`;
      goodPlay = "- **Passive Preservation**: Checked occasionally to control total budget size.";
      badPlay = "- **Blunder Nodes**: folded strong made combinations, or over-committed marginal hands.";
      gtoMainTakeaway = "Discipline beats ego. Fold loose speculative cards preflop to save future stacks.";
    }

    return { summaryAnalysis, goodPlay, badPlay, gtoMainTakeaway, isFallback: true };
  };

  const fetchHandReview = async () => {
    setIsFetchingHandReview(true);
    setHandReview(null);
    const calculatedScore = calculateFinalReviewScore();
    
    try {
      const userEval = evaluate7Cards(userHand, board);
      const compEval = evaluate7Cards(computerHand, board);

      const resp = await fetch("/api/poker-gto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userHand: userHand,
          userHandEvalName: userEval.rankName,
          userHandRankType: userEval.rankType,
          opponentHand: computerHand,
          opponentHandEvalName: compEval.rankName,
          opponentHandRankType: compEval.rankType,
          board: board,
          actions: historyTranscript,
          potSize: potSize,
          userStack: userStack,
          computerStack: computerStack,
          stage: stage,
          actionSpot: "HAND_REVIEW",
          score: calculatedScore,
          regret: currentHandRegretSum
        })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Review offline");
      }
      setHandReview(data);
    } catch (err) {
      console.error("Failed to fetch hand review:", err);
      setHandReview(getLocalHandReview(calculatedScore));
    } finally {
      setIsFetchingHandReview(false);
    }
  };

  // Evaluate final winner of the hand at showdown
  const handleShowdownEvaluation = (currentBoard: Card[]) => {
    const userEvaluation = evaluate7Cards(userHand, currentBoard);
    const compEvaluation = evaluate7Cards(computerHand, currentBoard);

    let winnerName: "User" | "Computer" | "Split" = "Split";
    let explanationText = "";

    if (userEvaluation.rankType > compEvaluation.rankType) {
      winnerName = "User";
      explanationText = `Your ${userEvaluation.rankName} beats Computer's ${compEvaluation.rankName}.`;
    } else if (compEvaluation.rankType > userEvaluation.rankType) {
      winnerName = "Computer";
      explanationText = `Computer's ${compEvaluation.rankName} beats your ${userEvaluation.rankName}.`;
    } else {
      // Equal rank classifications - check tiebreakers
      let tied = true;
      const maxLength = Math.max(userEvaluation.tiebreakers.length, compEvaluation.tiebreakers.length);
      for (let i = 0; i < maxLength; i++) {
        const userTb = userEvaluation.tiebreakers[i] || 0;
        const compTb = compEvaluation.tiebreakers[i] || 0;
        if (userTb > compTb) {
          winnerName = "User";
          explanationText = `High card tiebreaker wins: your ${userEvaluation.rankName} edges past with superior kicker.`;
          tied = false;
          break;
        } else if (compTb > userTb) {
          winnerName = "Computer";
          explanationText = `Computer's ${compEvaluation.rankName} contains superior kicker value.`;
          tied = false;
          break;
        }
      }
      if (tied) {
        winnerName = "Split";
        explanationText = `Both players hold equivalent five-card hands: ${userEvaluation.rankName}. Pot is split.`;
      }
    }

    // Award chips
    if (winnerName === "User") {
      setUserStack((prev) => prev + potSize);
      setUserWinCount((prev) => prev + 1);
      addTableLog(`SHOWDOWN: You win a pot of $${potSize} with ${userEvaluation.rankName}!`, "coach-positive");
    } else if (winnerName === "Computer") {
      setComputerStack((prev) => prev + potSize);
      setComputerWinCount((prev) => prev + 1);
      addTableLog(`SHOWDOWN: Computer wins a pot of $${potSize} with ${compEvaluation.rankName}!`, "coach-warning");
    } else {
      const halfPot = Math.floor(potSize / 2);
      setUserStack((prev) => prev + halfPot);
      setComputerStack((prev) => prev + (potSize - halfPot));
      setSplitCount((prev) => prev + 1);
      addTableLog(`SHOWDOWN SPLIT: equivalent ${userEvaluation.rankName}. Standard split applied.`, "info");
    }

    setWinEvaluation({
      winner: winnerName,
      userHandName: userEvaluation.rankName,
      computerHandName: compEvaluation.rankName,
      explanation: explanationText
    });

    setUserCurrentBet(0);
    setComputerCurrentBet(0);
    setStage("ENDED");
    setTurn(null);
  };

  // Progress to next bidding street (Preflop -> Flop -> Turn -> River -> Showdown)
  const proceedToNextStreet = (
    currentStage: HandStage,
    currentBoard: Card[],
    currentDeck: Card[],
    committedPot: number
  ) => {
    // Determine next stage
    let nextStage: HandStage = "PREFLOP";
    let nextBoard = [...currentBoard];
    let nextDeck = [...currentDeck];

    // Accruecommitted bets into total pot
    setPotSize(committedPot);
    setUserCurrentBet(0);
    setComputerCurrentBet(0);
    setUserActed(false);
    setComputerActed(false);

    if (currentStage === "PREFLOP") {
      nextStage = "FLOP";
      nextBoard = [nextDeck[0], nextDeck[1], nextDeck[2]];
      nextDeck = nextDeck.slice(3);
      addTableLog(`FLOP DEALT: [ ${getCardHtmlDisplay(nextBoard[0])} ${getCardHtmlDisplay(nextBoard[1])} ${getCardHtmlDisplay(nextBoard[2])} ]`, "info");
      playCardFlipSound();
    } else if (currentStage === "FLOP") {
      nextStage = "TURN";
      nextBoard = [...currentBoard, nextDeck[0]];
      nextDeck = nextDeck.slice(1);
      addTableLog(`TURN DEALT: [ ${getCardHtmlDisplay(nextBoard[3])} ]`, "info");
      playCardFlipSound();
    } else if (currentStage === "TURN") {
      nextStage = "RIVER";
      nextBoard = [...currentBoard, nextDeck[0]];
      nextDeck = nextDeck.slice(1);
      addTableLog(`RIVER DEALT: [ ${getCardHtmlDisplay(nextBoard[4])} ]`, "info");
      playCardFlipSound();
    } else if (currentStage === "RIVER") {
      nextStage = "SHOWDOWN";
    }

    setStage(nextStage);
    setBoard(nextBoard);
    setDeck(nextDeck);
    
    // Auto-complete All-In scenarios where no chips remain to act on
    const userNoRemaining = userStack === 0;
    const compNoRemaining = computerStack === 0;

    if ((userNoRemaining || compNoRemaining) && nextStage !== "SHOWDOWN") {
      // No actor has chips remaining to bet; deal board out instantly to showdown
      addTableLog("Players committed all-in. Dealing board out straight to showdown...", "system");
      let showdownBoard = [...nextBoard];
      let showdownDeck = [...nextDeck];
      while (showdownBoard.length < 5) {
        showdownBoard.push(showdownDeck[0]);
        showdownDeck = showdownDeck.slice(1);
      }
      setBoard(showdownBoard);
      setDeck(showdownDeck);
      setStage("SHOWDOWN");
      setTimeout(() => {
        handleShowdownEvaluation(showdownBoard);
      }, 1200);
      return;
    }

    if (nextStage === "SHOWDOWN") {
      handleShowdownEvaluation(nextBoard);
      return;
    }

    // First actor postflop: in Heads-up, Big Blind (non-dealer) has priority acts first postflop!
    // So if User is dealer (SB), Computer BB starts betting postflop.
    // If Computer is dealer (SB), User acts first.
    const postflopStarter = dealer === "User" ? "Computer" : "User";
    setTurn(postflopStarter);
    
    // Clear live GTO advices for new street
    setGtoAdvice(null);
  };

  // Standard Computer Turn strategy calculator (Heuristic bot based on strength)
  const executeComputerDecision = () => {
    setIsComputerThinking(true);
    
    // Evaluate standard computer hold
    const userBB = dealer === "Computer" ? 2 : 1; 
    const compBetDiff = userCurrentBet - computerCurrentBet;

    // Check preflop simple heuristic choices
    if (stage === "PREFLOP") {
      const c1 = computerHand[0];
      const c2 = computerHand[1];
      const compHighRank = Math.max(c1.value, c2.value);
      const isPocketPair = c1.value === c2.value;

      if (compBetDiff === 0) {
        // Option to check (Standard BB options on user flat call)
        addTableLog("Computer checks.", "action", "Computer");
        setHistoryTranscript((prev) => [...prev, "Computer checks."]);
        playCheckSound();
        setComputerActed(true);
        triggerNextBetTurn("Computer", "CHECK", 0);
      } else if (compBetDiff > 0) {
        // Responding to User raise or post- SB commitment
        const isSuited = c1.suit === c2.suit;
        const isConnector = Math.abs(c1.value - c2.value) === 1;
        const isBluffCandidate = (isSuited && isConnector) || (compHighRank >= 11 && compHighRank <= 13) || (c1.value === 14 || c2.value === 14);

        // Preflop 3-bet bluff adaptation
        let preflop3BetBluffChance = 0.15;
        if (computerAdaptationStyle === "BULLY") {
          preflop3BetBluffChance = 0.35; // Bully tries to 3-bet squeeze way more!
        } else if (computerAdaptationStyle === "VALUE_EXPLOITER") {
          preflop3BetBluffChance = 0.02; // Very rarely 3-bets bluffs
        }

        if (isPocketPair && compHighRank >= 11) {
          // Premium pocket pairs AA, KK, QQ, JJ (3bet raise)
          const raiseTotal = userCurrentBet * 3;
          executeComputerBettingMovement("RAISE", raiseTotal);
        } else if (isBluffCandidate && Math.random() < preflop3BetBluffChance && computerStack > userCurrentBet * 3) {
          // Adapted Preflop 3-bet bluff
          const bluffRaiseSize = Math.round(userCurrentBet * 3);
          addTableLog("Computer 3-bets as an aggressive speculative bluff!", "action", "Computer");
          executeComputerBettingMovement("RAISE", bluffRaiseSize);
        } else if (compHighRank >= 13 || isPocketPair) {
          // Moderate holdings: call raise
          executeComputerBettingMovement("CALL", userCurrentBet);
        } else if (compHighRank >= 10 && compBetDiff < 4) {
          // Weak raise: flat call
          executeComputerBettingMovement("CALL", userCurrentBet);
        } else {
          // High bet diff, weak hand -> Never fold, call to train
          executeComputerBettingMovement("CALL", userCurrentBet);
        }
      }
      setIsComputerThinking(false);
      return;
    }

    // Postflop computer heuristics logic based on best 5-card evaluation
    const compEval = evaluate7Cards(computerHand, board);
    const hasGreatHolding = compEval.rankType >= 3; // Three of a kind or better
    const hasPairHolding = compEval.rankType >= 1;  // One pair or two pair
    
    if (compBetDiff === 0) {
      // Checking spot
      const allPostCards = [...computerHand, ...board];
      const hasDraw = stage !== "RIVER" && hasPostflopDraws(allPostCards);

      // Heuristic probabilities based on adaptive playstyle
      let pureBluffChance = 0.15;
      let semiBluffChance = 0.35;
      let valueBetPairChance = 0.60;

      if (computerAdaptationStyle === "BULLY") {
        pureBluffChance = 0.35;       // Stabs air much more
        semiBluffChance = 0.65;       // Bets draws much more
        valueBetPairChance = 0.70;
      } else if (computerAdaptationStyle === "VALUE_EXPLOITER") {
        pureBluffChance = 0.0;        // Ceases pure bluffing calling stations
        semiBluffChance = 0.10;       // Reduces draws semi-bluffing, seeks free card
        valueBetPairChance = 0.90;    // Standard values are bet relentlessly
      }

      if (hasGreatHolding) {
        // Value bet 2/3 pot (or larger on calling stations!)
        const sizePct = computerAdaptationStyle === "VALUE_EXPLOITER" ? 0.85 : 0.65;
        const betAmt = Math.max(2, Math.round(potSize * sizePct));
        executeComputerBettingMovement("BET", betAmt);
      } else if (hasPairHolding && Math.random() < valueBetPairChance) {
        // Value bet with pair
        const sizePct = computerAdaptationStyle === "VALUE_EXPLOITER" ? 0.60 : 0.40;
        const betAmt = Math.max(2, Math.round(potSize * sizePct));
        executeComputerBettingMovement("BET", betAmt);
      } else if (hasDraw && Math.random() < semiBluffChance) {
        // Semi-bluff bet
        const betAmt = Math.max(2, Math.round(potSize * 0.5));
        addTableLog("Computer fires a semi-bluff bet on a drawing board texture!", "action", "Computer");
        executeComputerBettingMovement("BET", betAmt);
      } else if (!hasPairHolding && !hasGreatHolding && Math.random() < pureBluffChance) {
        // Pure bluff bet
        const betAmt = Math.max(2, Math.round(potSize * 0.4));
        addTableLog("Computer stabs at the pot with a delayed pure bluff!", "action", "Computer");
        executeComputerBettingMovement("BET", betAmt);
      } else {
        // Weak or check
        addTableLog("Computer checks.", "action", "Computer");
        setHistoryTranscript((prev) => [...prev, "Computer checks."]);
        playCheckSound();
        setComputerActed(true);
        triggerNextBetTurn("Computer", "CHECK", 0);
      }
    } else {
      // Confronted with an active user bet
      if (hasGreatHolding) {
        // Call or raise back
        const baseRaiseChance = computerAdaptationStyle === "VALUE_EXPLOITER" ? 0.75 : 0.50; // raise calling stations heavier
        if (Math.random() < baseRaiseChance && computerStack > compBetDiff * 2) {
          const sizePct = computerAdaptationStyle === "VALUE_EXPLOITER" ? 1.0 : 0.8;
          const reRaiseAmt = userCurrentBet + Math.max(4, Math.round(potSize * sizePct));
          executeComputerBettingMovement("RAISE", reRaiseAmt);
        } else {
          executeComputerBettingMovement("CALL", userCurrentBet);
        }
      } else if (hasPairHolding) {
        // HERO_CALLER NEVER folds a pair to a user bet or bluff line!
        const isHeroCaller = computerAdaptationStyle === "HERO_CALLER";
        if (!isHeroCaller && compBetDiff > computerStack * 0.65 && compEval.rankType === 1 && Math.random() > 0.5) {
          executeComputerBettingMovement("FOLD", 0);
        } else {
          if (isHeroCaller) {
            addTableLog("Computer operates under Hero Caller adaptation: calls down your bet with standard pairs!", "action", "Computer");
          }
          executeComputerBettingMovement("CALL", userCurrentBet);
        }
      } else {
        // No pair holding (Air). Check if they hold strong flush/straight draws
        const allPostCards = [...computerHand, ...board];
        const hasDraw = stage !== "RIVER" && hasPostflopDraws(allPostCards);
        
        if (hasDraw) {
          const rand = Math.random();
          let semiRaiseChance = 0.15;
          let defensiveCallLimit = 0.75; // percentage of pot limit for drawing call

          if (computerAdaptationStyle === "BULLY") {
            semiRaiseChance = 0.30;
            defensiveCallLimit = 0.90; // calls draws loose
          } else if (computerAdaptationStyle === "HERO_CALLER") {
            defensiveCallLimit = 0.85; // calls draws loose
          } else if (computerAdaptationStyle === "VALUE_EXPLOITER") {
            semiRaiseChance = 0.02; // rarely raises bluffs
            defensiveCallLimit = 0.55; // folds draws tighter against passive user
          }

          if (rand < semiRaiseChance && computerStack > compBetDiff * 2) {
            const reRaiseAmt = userCurrentBet + Math.max(6, Math.round(potSize * 0.85));
            addTableLog("Computer executes an aggressive postflop semi-bluff raise!", "action", "Computer");
            executeComputerBettingMovement("RAISE", reRaiseAmt);
          } else if (rand < 0.85 && compBetDiff <= potSize * defensiveCallLimit) {
            // Standard defensive call
            executeComputerBettingMovement("CALL", userCurrentBet);
          } else {
            // Fold weak draws against massive overbets
            executeComputerBettingMovement("FOLD", 0);
          }
        } else {
          // Absolute air: occasionally float-call small bets or raise-bluff to squeeze the bettor
          const rand = Math.random();
          let floatChance = 0.08;
          let raiseBluffChance = 0.12;

          if (computerAdaptationStyle === "BULLY") {
            floatChance = 0.18;
            raiseBluffChance = 0.25;
          } else if (computerAdaptationStyle === "HERO_CALLER") {
            floatChance = 0.16; // occasionally calls float (thinking you bluff)
            raiseBluffChance = 0.05;
          } else if (computerAdaptationStyle === "VALUE_EXPLOITER") {
            floatChance = 0.0;
            raiseBluffChance = 0.0;
          }

          if (compBetDiff <= potSize * 0.4 && rand < floatChance) {
            addTableLog("Computer floats your bet with low showdown value!", "action", "Computer");
            executeComputerBettingMovement("CALL", userCurrentBet);
          } else if (compBetDiff <= potSize * 0.6 && rand < raiseBluffChance && computerStack > compBetDiff * 2) {
            const reRaiseAmt = userCurrentBet + Math.max(6, Math.round(potSize * 0.75));
            addTableLog("Computer launches a shocking bluff-raise representing strong value!", "action", "Computer");
            executeComputerBettingMovement("RAISE", reRaiseAmt);
          } else {
            // Default fold
            executeComputerBettingMovement("FOLD", 0);
          }
        }
      }
    }
    setIsComputerThinking(false);
  };

  // Commits computer chip stack changes of action
  const executeComputerBettingMovement = (action: "FOLD" | "CALL" | "BET" | "RAISE", targetSize: number) => {
    if (action === "FOLD") {
      addTableLog("Computer folds. You win the hand!", "info", "Computer");
      setHistoryTranscript((prev) => [...prev, "Computer folds."]);
      
      // Award user the total pot accrued
      const winPot = potSize + userCurrentBet + computerCurrentBet;
      setUserStack((prev) => prev + winPot);
      setUserWinCount((prev) => prev + 1);
      
      setUserCurrentBet(0);
      setComputerCurrentBet(0);

      // Compute evaluated descriptions for our show screen on fold
      const userEvaluation = evaluate7Cards(userHand, board);
      const compEvaluation = evaluate7Cards(computerHand, board);
      setWinEvaluation({
        winner: "User",
        userHandName: userEvaluation.rankName,
        computerHandName: compEvaluation.rankName,
        explanation: "Computer folded postflop. You claim the pot!"
      });

      setStage("ENDED");
      setTurn(null);
      return;
    }

    if (action === "CALL") {
      const addedBet = userCurrentBet - computerCurrentBet;
      const actualCommited = Math.min(computerStack, addedBet);
      
      setComputerStack((prev) => prev - actualCommited);
      setComputerCurrentBet(userCurrentBet);
      setComputerActed(true);
      
      addTableLog(`Computer calls $${actualCommited}.`, "action", "Computer");
      setHistoryTranscript((prev) => [...prev, `Computer calls $${actualCommited}.`]);
      triggerNextBetTurn("Computer", "CALL", actualCommited);
      return;
    }

    if (action === "BET" || action === "RAISE") {
      // Ensure raise covers min raise threshold
      const costChange = targetSize - computerCurrentBet;
      const actualCommited = Math.min(computerStack, costChange);
      const newComputerBetCommitment = computerCurrentBet + actualCommited;

      setComputerStack((prev) => prev - actualCommited);
      setComputerCurrentBet(newComputerBetCommitment);
      setComputerActed(true);
      setUserActed(false); // forces user to act in response to raise/bet!

      addTableLog(`Computer ${action === "BET" ? "bets" : "raises to"} $${newComputerBetCommitment}.`, "action", "Computer");
      setHistoryTranscript((prev) => [...prev, `Computer ${action === "BET" ? "bets" : "raises to"} $${newComputerBetCommitment}.`]);
      playRaiseSound();
      triggerNextBetTurn("Computer", action, actualCommited);
    }
  };

  // Perform turn adjustments following any play actions
  const triggerNextBetTurn = (
    actor: "User" | "Computer",
    action: "CHECK" | "CALL" | "BET" | "RAISE",
    amount: number
  ) => {
    // Collect updated variables
    const updatedUserBet = actor === "User" ? (action === "RAISE" || action === "BET" ? amount + userCurrentBet : (action === "CALL" ? computerCurrentBet : userCurrentBet)) : userCurrentBet;
    const updatedComputerBet = actor === "Computer" ? (action === "RAISE" || action === "BET" ? amount + computerCurrentBet : (action === "CALL" ? userCurrentBet : computerCurrentBet)) : computerCurrentBet;

    // A street in poker closes only when both players have had a chance to act, and their committed bets are equal.
    const isStreetClosed = (userActed || actor === "User") && (computerActed || actor === "Computer") && (updatedUserBet === updatedComputerBet);

    if (isStreetClosed) {
      // Resolve betting round, sweep chips to main pot, proceed to next round
      const finalCommittedPot = stage === "PREFLOP"
        ? (updatedUserBet + updatedComputerBet)
        : (potSize + updatedUserBet + updatedComputerBet);
      
      setTimeout(() => {
        proceedToNextStreet(stage, board, deck, finalCommittedPot);
      }, 700);
    } else {
      // Toggle active turn
      setTurn(actor === "User" ? "Computer" : "User");
    }
  };


  // Supplement coach Comments during Decision Audit when flat-calling/checking is the highest strategy frequency, 
  // but betting/raising represents a strong secondary GTO line of 20% or greater.
  const getAugmentedCoachComments = (
    comments: string,
    breakdown: { fold: number; call: number; raise: number } | undefined,
    hand: Card[],
    b: Card[],
    stg: string,
    handEvalName: string
  ): string => {
    if (!breakdown) return comments;
    const fVal = breakdown.fold ?? 0;
    const cVal = breakdown.call ?? 0;
    const rVal = breakdown.raise ?? 0;

    const mainIsCallCheck = cVal > rVal && cVal > fVal;
    if (mainIsCallCheck && rVal >= 20) {
      const isPostflop = b.length >= 3;
      let augment = "";
      if (!isPostflop) {
        augment = " **Strategic Raise Option (>=20% GTO weight):** Preflop GTO models suggest raising with this holding to leverage position, build folds from speculative opponents, or thin the field early. If you prefer high-aggression lines, a raise is highly approved.";
      } else {
        const boardCards = b;
        const hasDraws = boardCards.some((c, i) => boardCards.some((c2, j) => i !== j && Math.abs(c.value - c2.value) <= 2)) ||
          ["H", "D", "C", "S"].some(suit => boardCards.filter(c => c.suit === suit).length >= 2);
        
        if (hasDraws) {
          augment = ` **Strategic Raise Option (>=20% GTO weight):** On this wet, draw-heavy board state, opting to raise with your ${handEvalName} holding represents a powerful line to deny equity realization, charge drawing ranges, and protect defensive showdown equity early.`;
        } else {
          augment = ` **Strategic Raise Option (>=20% GTO weight):** On this dry, uncoordinated board, mixing in a raise allows you to polarize your range effectively. Raising here target-values float attempts and lets you comfortably represent slow-played monster hands.`;
        }
      }

      if (!comments.toLowerCase().includes("strategic raise option") && !comments.toLowerCase().includes("strategic raise variation")) {
        return `${comments}\n\n${augment}`;
      }
    }
    return comments;
  };


  // USER ACTION HANDLERS
  const handleUserFold = () => {
    if (turn !== "User") return;

    const activeAdvice = gtoAdvice || getClientGTOAdvice(userHand, board, stage, computerCurrentBet, potSize);
    const foldEV = activeAdvice.evs.fold ?? 0.0;
    const callEV = activeAdvice.evs.call ?? 0.0;
    const raiseEV = activeAdvice.evs.raise ?? 0.0;
    const bestEV = Math.max(foldEV, callEV, raiseEV);
    const regret = Math.max(0, bestEV - foldEV);

    let bestAction: "Fold" | "Call/Check" | "Raise/Bet" = "Fold";
    if (bestEV === callEV) bestAction = "Call/Check";
    else if (bestEV === raiseEV) bestAction = "Raise/Bet";

    const rollChoice = getRngSelection(userRngRoll, activeAdvice.actionBreakdown);

    const userEval = evaluate7Cards(userHand, board);
    const handEvalName = userEval.rankName;

    const feedbackObj = {
      chosenAction: "Fold" as const,
      chosenActionLabel: "Fold",
      bestAction,
      bestActionLabel: bestAction === "Fold" ? "Fold" : (computerCurrentBet > userCurrentBet ? "Call" : "Check"),
      chosenEV: foldEV,
      bestEV,
      regret: parseFloat(regret.toFixed(2)),
      actionRegret: parseFloat(regret.toFixed(2)),
      actionBreakdown: activeAdvice.actionBreakdown,
      evs: activeAdvice.evs,
      rngRoll: userRngRoll,
      rngChoice: rollChoice,
      comments: getAugmentedCoachComments(activeAdvice.coachComments, activeAdvice.actionBreakdown, userHand, board, stage, handEvalName),
      onContinue: () => {
        setReviewFeedback(null);
        setCurrentHandRegretSum((prev) => prev + regret);
        setCurrentHandMovesCount((prev) => prev + 1);
        commitUserFold();
      }
    };
    recordStep1v1(feedbackObj);
    setReviewFeedback(feedbackObj);
  };

  // Helper to record user's actions for adaptation tracking
  const recordUserActionStats = (actionType: "FOLD" | "CHECK" | "CALL" | "RAISE") => {
    if (stage === "PREFLOP") {
      if (actionType === "CALL" || actionType === "RAISE") {
        setUserVpipCount((prev) => prev + 1);
      }
    } else {
      // Postflop action logs
      setUserPostflopPlays((prev) => prev + 1);
      if (actionType === "FOLD") {
        setUserPostflopFolds((prev) => prev + 1);
      } else if (actionType === "CHECK") {
        // Just record check if needed, doesn't increment call/fold/raise
      } else if (actionType === "CALL") {
        setUserPostflopCalls((prev) => prev + 1);
      } else if (actionType === "RAISE") {
        setUserPostflopRaises((prev) => prev + 1);
        // Deeply analyze if user holds air (bluffing)
        const userEval = evaluate7Cards(userHand, board);
        if (userEval.rankType < 1) {
          setUserPostflopBluffs((prev) => prev + 1);
        }
      }
    }
  };

  // Re-calculate computer reading of player playstyle and adapt countermeasures
  useEffect(() => {
    // Only analyze when user has made enough decisions across multiple plays
    if (handsPlayed <= 2 && userPostflopPlays < 3) {
      setComputerAdaptationStyle("STANDARD_GTO");
      return;
    }

    const vpipRate = (userVpipCount / handsPlayed) * 100;
    const postflopTotal = userPostflopRaises + userPostflopCalls + userPostflopFolds;
    const postflopRaiseRate = postflopTotal > 0 ? (userPostflopRaises / postflopTotal) * 100 : 0;
    const postflopCallRate = postflopTotal > 0 ? (userPostflopCalls / postflopTotal) * 100 : 0;
    const postflopFoldRate = postflopTotal > 0 ? (userPostflopFolds / postflopTotal) * 100 : 0;
    const bluffRateOfRaises = userPostflopRaises > 0 ? (userPostflopBluffs / userPostflopRaises) * 105 : 0; // standard bluff ratio calculation

    // Detect playstyle profile
    if (userPostflopBluffs >= 2 && bluffRateOfRaises > 35 && postflopRaiseRate > 35) {
      setComputerAdaptationStyle("HERO_CALLER"); // calls user's bluffs more!
    } else if (postflopCallRate > 50 && userPostflopRaises <= 1) {
      setComputerAdaptationStyle("VALUE_EXPLOITER"); // standard value betting, cease bluffs
    } else if (postflopFoldRate > 50 && vpipRate < 40) {
      setComputerAdaptationStyle("BULLY"); // bluffs and stabs more on folds
    } else {
      setComputerAdaptationStyle("STANDARD_GTO"); // default
    }
  }, [handsPlayed, userVpipCount, userPostflopPlays, userPostflopRaises, userPostflopBluffs, userPostflopCalls, userPostflopFolds]);

  // Push notifications/table logs when Computer adapts profile
  const prevStyleRef = useRef<string>("STANDARD_GTO");
  useEffect(() => {
    if (computerAdaptationStyle !== prevStyleRef.current) {
      const styleNames: Record<string, string> = {
        STANDARD_GTO: "Balanced GTO baseline",
        HERO_CALLER: "Exploitative Bluff-Catcher (Hero Caller)",
        VALUE_EXPLOITER: "Max Value Extractor (Value-Bet Exploiter)",
        BULLY: "Aggressive Table Bully (Pot Stealer)",
      };
      const styleDescs: Record<string, string> = {
        STANDARD_GTO: "Opponent plays standard un-exploitable strategy.",
        HERO_CALLER: "Opponent reads that you bluff too often and is widening their call-down ranges with pairs.",
        VALUE_EXPLOITER: "Opponent senses you are a calling station; they will stop bluffing and pump value-bets.",
        BULLY: "Opponent notes you are folding too much and will aggressively stab at the pot on checks/weak bets.",
      };

      addTableLog(`Notice: Computer Opponent adjusted profile to: ${styleNames[computerAdaptationStyle]}`, "system");
      addTableLog(`Read Explanation: ${styleDescs[computerAdaptationStyle]}`, "info");
      prevStyleRef.current = computerAdaptationStyle;
    }
  }, [computerAdaptationStyle]);

  const commitUserFold = () => {
    recordUserActionStats("FOLD");
    addTableLog("You fold.", "action", "User");
    setHistoryTranscript((prev) => [...prev, "User folds."]);
    
    // Award computer total pot
    const winPot = potSize + userCurrentBet + computerCurrentBet;
    setComputerStack((prev) => prev + winPot);
    setComputerWinCount((prev) => prev + 1);

    const userEvaluation = evaluate7Cards(userHand, board);
    const compEvaluation = evaluate7Cards(computerHand, board);
    setWinEvaluation({
      winner: "Computer",
      userHandName: userEvaluation.rankName,
      computerHandName: compEvaluation.rankName,
      explanation: "You folded. Computer claims the pot!"
    });

    setUserCurrentBet(0);
    setComputerCurrentBet(0);
    setStage("ENDED");
    setTurn(null);
    setGtoAdvice(null);
  };

  const handleUserCheck = () => {
    if (turn !== "User" || userCurrentBet !== computerCurrentBet) return;

    const activeAdvice = gtoAdvice || getClientGTOAdvice(userHand, board, stage, computerCurrentBet, potSize);
    const foldEV = activeAdvice.evs.fold;
    const callEV = activeAdvice.evs.call;
    const raiseEV = activeAdvice.evs.raise;
    const bestEV = Math.max(foldEV, callEV, raiseEV);
    const regret = Math.max(0, bestEV - callEV);

    let bestAction: "Fold" | "Call/Check" | "Raise/Bet" = "Fold";
    if (bestEV === callEV) bestAction = "Call/Check";
    else if (bestEV === raiseEV) bestAction = "Raise/Bet";

    const rollChoice = getRngSelection(userRngRoll, activeAdvice.actionBreakdown);

    const userEval = evaluate7Cards(userHand, board);
    const handEvalName = userEval.rankName;

    const feedbackObj = {
      chosenAction: "Call/Check" as const,
      chosenActionLabel: "Check",
      bestAction,
      bestActionLabel: bestAction === "Fold" ? "Fold" : "Check",
      chosenEV: callEV,
      bestEV,
      regret: parseFloat(regret.toFixed(2)),
      actionRegret: parseFloat(regret.toFixed(2)),
      actionBreakdown: activeAdvice.actionBreakdown,
      evs: activeAdvice.evs,
      rngRoll: userRngRoll,
      rngChoice: rollChoice,
      comments: getAugmentedCoachComments(activeAdvice.coachComments, activeAdvice.actionBreakdown, userHand, board, stage, handEvalName),
      onContinue: () => {
        setReviewFeedback(null);
        setCurrentHandRegretSum((prev) => prev + regret);
        setCurrentHandMovesCount((prev) => prev + 1);
        commitUserCheck();
      }
    };
    recordStep1v1(feedbackObj);
    setReviewFeedback(feedbackObj);
  };

  const commitUserCheck = () => {
    recordUserActionStats("CHECK");
    addTableLog("You check.", "action", "User");
    setHistoryTranscript((prev) => [...prev, "User checks."]);
    playCheckSound();
    setUserActed(true);
    triggerNextBetTurn("User", "CHECK", 0);
  };

  const handleUserCall = () => {
    if (turn !== "User") return;

    const activeAdvice = gtoAdvice || getClientGTOAdvice(userHand, board, stage, computerCurrentBet, potSize);
    const foldEV = activeAdvice.evs.fold;
    const callEV = activeAdvice.evs.call;
    const raiseEV = activeAdvice.evs.raise;
    const bestEV = Math.max(foldEV, callEV, raiseEV);
    const regret = Math.max(0, bestEV - callEV);

    let bestAction: "Fold" | "Call/Check" | "Raise/Bet" = "Fold";
    if (bestEV === callEV) bestAction = "Call/Check";
    else if (bestEV === raiseEV) bestAction = "Raise/Bet";

    const rollChoice = getRngSelection(userRngRoll, activeAdvice.actionBreakdown);

    const userEval = evaluate7Cards(userHand, board);
    const handEvalName = userEval.rankName;

    const feedbackObj = {
      chosenAction: "Call/Check" as const,
      chosenActionLabel: "Call",
      bestAction,
      bestActionLabel: bestAction === "Fold" ? "Fold" : "Call",
      chosenEV: callEV,
      bestEV,
      regret: parseFloat(regret.toFixed(2)),
      actionRegret: parseFloat(regret.toFixed(2)),
      actionBreakdown: activeAdvice.actionBreakdown,
      evs: activeAdvice.evs,
      rngRoll: userRngRoll,
      rngChoice: rollChoice,
      comments: getAugmentedCoachComments(activeAdvice.coachComments, activeAdvice.actionBreakdown, userHand, board, stage, handEvalName),
      onContinue: () => {
        setReviewFeedback(null);
        setCurrentHandRegretSum((prev) => prev + regret);
        setCurrentHandMovesCount((prev) => prev + 1);
        commitUserCall();
      }
    };
    recordStep1v1(feedbackObj);
    setReviewFeedback(feedbackObj);
  };

  const commitUserCall = () => {
    recordUserActionStats("CALL");
    const toCallVal = computerCurrentBet - userCurrentBet;
    const actualCommited = Math.min(userStack, toCallVal);

    setUserStack((prev) => prev - actualCommited);
    setUserCurrentBet(computerCurrentBet);
    setUserActed(true);

    addTableLog(`You call $${actualCommited}.`, "action", "User");
    setHistoryTranscript((prev) => [...prev, `You call $${actualCommited}.`]);
    triggerNextBetTurn("User", "CALL", actualCommited);
  };

  const getOptimalSizing = (recommendedAction: string, pot: number, oppBet: number, stage: HandStage): number => {
    // Check if recommendedAction has a number like "$15"
    const match = recommendedAction.match(/\$(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }

    if (stage === "PREFLOP") {
      if (oppBet > 0) {
        return Math.round(oppBet * 3);
      } else {
        return 6; // Standard BB preflop raise
      }
    } else {
      if (oppBet > 0) {
        return Math.round(oppBet * 3); // Standard 3-bet
      } else {
        return Math.max(2, Math.round(pot * 0.65)); // 65% pot
      }
    }
  };

  const computeSizingFeedback = (
    userSizing: number,
    recommendedAction: string,
    pot: number,
    oppBet: number,
    stage: HandStage,
    handEvalName: string,
    isActionOptimal: boolean,
    actionRegret: number
  ) => {
    const optimalSizing = getOptimalSizing(recommendedAction, pot, oppBet, stage);

    const difference = userSizing - optimalSizing;
    const percentDiff = optimalSizing > 0 ? (difference / optimalSizing) * 100 : 0;

    let status: "perfect" | "too_little" | "too_much" = "perfect";

    // Strict GTO Sizing tolerance:
    // If target is small (<= 10), we allow at most $1 variance (raising $4 when target is $2 is oversized by 100%!)
    const isAcceptableSmallPot = optimalSizing <= 10 ? Math.abs(difference) <= 1 : Math.abs(difference) <= 2;
    const isAcceptablePercentage = Math.abs(percentDiff) <= 15;

    if (isAcceptableSmallPot || isAcceptablePercentage) {
      status = "perfect";
    } else if (difference < 0) {
      status = "too_little";
    } else {
      status = "too_much";
    }

    let analysis = "";

    if (!isActionOptimal) {
      // The overall Raise/Bet action itself is suboptimal
      if (status === "perfect") {
        analysis = `Well-sized raise! Chosen line has an EV loss of ${actionRegret.toFixed(2)} bb compared to pure GTO, but applies perfect sizing pressure.`;
      } else if (status === "too_little") {
        analysis = `Suboptimal action and sizing too small! Opting to raise here is suboptimal (leaks ${actionRegret.toFixed(2)} bb). Furthermore, your size of $${userSizing} is smaller than standard raise guidelines ($${optimalSizing}). This makes the line doubly weak and vulnerable.`;
      } else {
        analysis = `Suboptimal action and sizing too large! Opting to raise here is suboptimal in GTO (leaks ${actionRegret.toFixed(2)} bb). Your size of $${userSizing} is oversized compared to standard $${optimalSizing}. Over-betting compounds your mistake and inflates a pot unnecessarily.`;
      }
    } else {
      // The Raise/Bet action is optimal, but sizing is graded
      if (status === "perfect") {
        analysis = `Perfect sizing! Your choice of $${userSizing} matches optimal GTO betting theory beautifully (target was ~$${optimalSizing}). This size perfectly balances charging drawing ranges while building a pot and retaining maximum call value.`;
      } else if (status === "too_little") {
        analysis = `Too little! Raising is correct, but you raised to $${userSizing} when GTO benchmarks recommend approximately $${optimalSizing} (undersized by ${Math.abs(Math.round(percentDiff))}%). Small sizing gives opponents profitable odds to call speculative draws, losing maximum value.`;
      } else {
        analysis = `Too much! Raising is correct, but you raised to $${userSizing} when GTO benchmarks recommend approximately $${optimalSizing} (oversized by ${Math.round(percentDiff)}%). This heavy sizing risks over-isolating yourself, causing the opponent to fold dominated hands and only call with premiums.`;
      }
    }

    return {
      userSizing,
      optimalSizing,
      status,
      analysis
    };
  };

  const handleUserRaiseSubmit = (raiseSize: number) => {
    if (turn !== "User") return;

    const activeAdvice = gtoAdvice || getClientGTOAdvice(userHand, board, stage, computerCurrentBet, potSize);
    const foldEV = activeAdvice.evs.fold;
    const callEV = activeAdvice.evs.call;
    const raiseEV = activeAdvice.evs.raise;
    const bestEV = Math.max(foldEV, callEV, raiseEV);
    const regret = Math.max(0, bestEV - raiseEV);

    let bestAction: "Fold" | "Call/Check" | "Raise/Bet" = "Fold";
    if (bestEV === callEV) bestAction = "Call/Check";
    else if (bestEV === raiseEV) bestAction = "Raise/Bet";

    const rollChoice = getRngSelection(userRngRoll, activeAdvice.actionBreakdown);

    const userEval = evaluate7Cards(userHand, board);
    const handEvalName = userEval.rankName;

    const isActionOptimal = regret === 0;

    const sizingFeedback = computeSizingFeedback(
      raiseSize,
      activeAdvice.recommendedAction,
      potSize,
      computerCurrentBet,
      stage,
      handEvalName,
      isActionOptimal,
      regret
    );

    // Calculate integrated total regret (action selection regret + sizing penalty if applicable)
    let totalRegret = regret;
    if (sizingFeedback.status !== "perfect") {
      const difference = Math.abs(raiseSize - sizingFeedback.optimalSizing);
      const percentDiff = sizingFeedback.optimalSizing > 0 ? (difference / sizingFeedback.optimalSizing) : 0;
      // Add sizing penalty to regret: minimum of 0.25 BB, scaling up with percentage difference
      const sizingPenalty = parseFloat(Math.min(1.5, 0.25 + percentDiff * 0.35).toFixed(2));
      totalRegret = parseFloat((regret + sizingPenalty).toFixed(2));
    } else if (regret > 0) {
      // Intentionally aggressive, perfectly sized raise receives a 75% regret discount to support practice
      totalRegret = parseFloat((regret * 0.25).toFixed(2));
    }

    const feedbackObj = {
      chosenAction: "Raise/Bet" as const,
      chosenActionLabel: `Raise to $${raiseSize}`,
      bestAction,
      bestActionLabel: bestAction === "Fold" ? "Fold" : bestAction === "Call/Check" ? (computerCurrentBet > userCurrentBet ? "Call" : "Check") : "Raise/Bet",
      chosenEV: raiseEV,
      bestEV,
      regret: totalRegret,
      actionRegret: parseFloat(regret.toFixed(2)),
      actionBreakdown: activeAdvice.actionBreakdown,
      evs: activeAdvice.evs,
      rngRoll: userRngRoll,
      rngChoice: rollChoice,
      comments: getAugmentedCoachComments(activeAdvice.coachComments, activeAdvice.actionBreakdown, userHand, board, stage, handEvalName),
      sizingFeedback,
      onContinue: () => {
        setReviewFeedback(null);
        setCurrentHandRegretSum((prev) => prev + totalRegret);
        setCurrentHandMovesCount((prev) => prev + 1);
        commitUserRaiseSubmit(raiseSize);
      }
    };
    recordStep1v1(feedbackObj);
    setReviewFeedback(feedbackObj);
  };

  const commitUserRaiseSubmit = (raiseSize: number) => {
    recordUserActionStats("RAISE");
    // Constraint raises
    const diff = raiseSize - userCurrentBet;
    const actualCommited = Math.min(userStack, diff);
    const finalUserBetCommitment = userCurrentBet + actualCommited;

    setUserStack((prev) => prev - actualCommited);
    setUserCurrentBet(finalUserBetCommitment);
    setUserActed(true);
    setComputerActed(false); // Forces computer to react to user raise

    const logTerm = userCurrentBet === 0 ? "bet" : "raise";
    addTableLog(`You ${logTerm === "bet" ? "bet" : "raise to"} $${finalUserBetCommitment}.`, "action", "User");
    setHistoryTranscript((prev) => [...prev, `User ${logTerm === "bet" ? "bets" : "raises to"} $${finalUserBetCommitment}.`]);
    playRaiseSound();

    setBetChangeSlider(Math.min(userStack, finalUserBetCommitment + 4)); // increment slider suggestion
    triggerNextBetTurn("User", "RAISE", actualCommited);
  };

  const renderRoleBadge = (role: "BTN" | "SB" | "BB" | "UTG" | "HJ" | string | undefined) => {
    if (!role) return null;
    if (role === "BTN" || role === "D") {
      return (
        <div className="flex items-center gap-1 select-none shrink-0" title="Dealer Button / BTN">
          <span 
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-amber-400 text-slate-950 border-2 border-white font-black flex items-center justify-center text-xs sm:text-sm shadow-[0_0_12px_rgba(245,158,11,0.9)] animate-pulse" 
            style={{ textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
          >
            D
          </span>
          <span className="text-[9px] sm:text-[10px] font-sans font-black tracking-wider text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/35 uppercase font-mono shadow-[0_0_5px_rgba(245,158,11,0.2)]">
            DEALER
          </span>
        </div>
      );
    }
    if (role === "SB") {
      return (
        <div className="flex items-center gap-1 select-none shrink-0" title="Small Blind / SB">
          <span 
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-rose-600 text-white border-2 border-white font-black flex items-center justify-center text-[9px] sm:text-[10px] shadow-[0_0_12px_rgba(225,29,72,0.9)] animate-pulse"
          >
            SB
          </span>
          <span className="text-[9px] sm:text-[10px] font-sans font-black tracking-wider text-rose-300 bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/35 uppercase font-mono shadow-[0_0_5px_rgba(225,29,72,0.2)]">
            S.BLIND
          </span>
        </div>
      );
    }
    if (role === "BB") {
      return (
        <div className="flex items-center gap-1 select-none shrink-0" title="Big Blind / BB">
          <span 
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-600 text-white border-2 border-white font-black flex items-center justify-center text-[9px] sm:text-[10px] shadow-[0_0_12px_rgba(5,150,105,0.9)] animate-pulse"
          >
            BB
          </span>
          <span className="text-[9px] sm:text-[10px] font-sans font-black tracking-wider text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/35 uppercase font-mono shadow-[0_0_5px_rgba(5,150,105,0.2)]">
            B.BLIND
          </span>
        </div>
      );
    }
    return (
      <span className="text-[9px] sm:text-[10px] bg-slate-850 border border-indigo-500/35 text-indigo-300 px-2 py-0.5 rounded font-mono font-black uppercase shrink-0 shadow-[0_0_6px_rgba(99,102,241,0.25)]">
        {role}
      </span>
    );
  };

  const getCardHtmlDisplay = (card: Card) => {
    return getCardDisplay(card);
  };

  return (
    <div 
      className="flex flex-col bg-slate-50 font-sans text-slate-900 overflow-hidden transition-all duration-300 origin-top-left" 
      id="gto-trainer-root"
      style={{
        zoom: zoomFactor,
        height: `${100 / zoomFactor}vh`,
        width: `${100 / zoomFactor}vw`,
        maxHeight: `${100 / zoomFactor}vh`,
        maxWidth: `${100 / zoomFactor}vw`
      }}
    >
      
      {/* 1. Sleek Header Banner Bar */}
      <nav className="h-12 sm:h-14 px-4 sm:px-6 shrink-0 flex items-center justify-between bg-white border-b border-slate-200 shadow-xs z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-base sm:text-xl shadow-md relative">
            🎰
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-800 leading-tight">GTO Poker Coach</h1>
            <p className="text-[9px] sm:text-[10px] text-slate-500 font-medium leading-none">
              {gameMode === "5player" ? "5-Player Full Simulation" : "Heads-up Texas Hold'em (100BB Training Sandbox)"}
            </p>
          </div>
        </div>

        {/* Dynamic Mode Selector Toggle */}
        <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-250/60 select-none items-center" id="model-training-mode-toggle">
          <button
            id="gto-mode-1v1"
            onClick={() => handleGameModeChange("1v1")}
            className={`px-2.5 py-1 text-[9px] sm:text-[10.5px] font-black rounded-lg transition-all cursor-pointer ${
              gameMode === "1v1"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-205/50"
                : "text-slate-500 hover:text-slate-850"
            }`}
          >
            Heads-Up (1v1)
          </button>
          <button
            id="gto-mode-5player"
            onClick={() => handleGameModeChange("5player")}
            className={`px-2.5 py-1 text-[9px] sm:text-[10.5px] font-black rounded-lg transition-all cursor-pointer ${
              gameMode === "5player"
                ? "bg-white text-indigo-700 shadow-xs border border-slate-205/50"
                : "text-slate-500 hover:text-slate-850"
            }`}
          >
            5-Player Sim
          </button>
        </div>

        {/* Dynamic Screen Scaling controller */}
        <div className="hidden lg:flex bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-250/60 select-none items-center gap-1" id="zoom-control-bar">
          <span className="text-[8px] uppercase tracking-wider text-slate-400 font-extrabold px-1">Screen Scale</span>
          {(["auto", "100", "110", "120", "130"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setZoomMode(mode)}
              className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black rounded-md transition-all cursor-pointer ${
                zoomMode === mode
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-205/50"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title={mode === "auto" ? `Auto Detect (current: ${Math.round(zoomFactor * 100)}%)` : `Scale to ${mode}%`}
            >
              {mode === "auto" ? `Auto (${Math.round(zoomFactor * 100)}%)` : `${mode}%`}
            </button>
          ))}
        </div>

        {/* Global Stats tracker */}
        <div className="flex items-center gap-3 text-xs font-semibold select-none">
          <button
            onClick={() => setShowHowToPlay(!showHowToPlay)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="How to use GTO HUD instructions"
          >
            <HelpIcon size={18} />
          </button>
        </div>
      </nav>

      {/* Main Workspace Frame */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* SIDEBAR PRESET LOGS: Physical Action log of Poker hand */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col justify-between overflow-hidden shrink-0 hidden lg:flex">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50 shrink-0 flex justify-between items-center">
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              <History size={12} className="text-indigo-500" />
              Interactive Table Logs
            </label>
            <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">
              REAL-TIME
            </span>
          </div>

          {/* Action Log entries */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[11px] leading-relaxed">
            {(gameMode === "5player" ? logs5 : logs).map((log) => {
              const itemStyleMap = {
                "system": "bg-slate-100 text-slate-700 border-l-2 border-slate-400 p-2 rounded-r-md",
                "info": "text-slate-500 py-0.5",
                "action": "bg-indigo-50/50 text-indigo-950 border-l-2 border-indigo-400 p-2 rounded-r-md font-semibold",
                "coach-positive": "bg-emerald-50 text-emerald-800 border-l-2 border-emerald-400 p-2 rounded-r-md",
                "coach-warning": "bg-rose-50 text-rose-800 border-l-2 border-rose-400 p-2 rounded-r-md"
              };
              
              return (
                <div key={log.id} className={`${itemStyleMap[log.type]} block`}>
                  <div className="flex justify-between text-[9px] text-slate-400 mb-0.5 select-none font-sans font-medium">
                    <span>{log.player || "SYSTEM"}</span>
                    <span>{log.timestamp}</span>
                  </div>
                  <p>{log.text}</p>
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>

          {/* Table guide sidebar footer */}
          <div className="p-4 border-t border-slate-150 bg-slate-50 space-y-2 shrink-0">
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
              <Info size={12} className="text-indigo-500 shrink-0" />
              <span>Small Blind: $1 | Big Blind: $2</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleTopUp}
                className="flex-1 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 text-slate-600 text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                title="Reset stack variables to $100 depth"
              >
                <RotateCcw size={11} />
                <span>Top up $100 Stacks</span>
              </button>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: Real-Time virtual poker felt table */}
        <main className="flex-1 p-3 md:p-4 bg-slate-100 overflow-y-auto md:overflow-hidden select-none flex flex-col min-h-0 h-full">
          <div className="w-full flex-1 flex flex-col md:grid md:grid-cols-12 gap-3 sm:gap-4 min-h-0 md:overflow-hidden">
            
            {/* LEFT CONTAINER: Virtual Felt Board */}
            <div className="md:col-span-7 w-full flex flex-col md:h-full min-h-[480px] md:min-h-0 gap-3 justify-between">
              
              {/* Card: Gorgeous Casino Felt Canvas (Theme Styled) */}
              <div 
                className="flex-1 bg-slate-950 border border-slate-950 rounded-2xl shadow-xl overflow-hidden flex flex-col justify-between p-3 sm:p-4 relative min-h-[460px] md:min-h-0"
                style={{ backgroundImage: `url(${pokerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
              >
            
            {/* Dark overlay for maximum readability of players, text, and chips */}
            <div className="absolute inset-0 bg-slate-550/20 backdrop-brightness-75 pointer-events-none z-0"></div>

            {gameMode === "5player" ? (
              <div className="relative w-full h-full flex flex-col justify-between p-2 min-h-0 z-10" id="felt-5player-board">
                {/* Upper Row: BetaBot & GammaBot */}
                <div className="flex justify-between items-start w-full px-2 mt-4">
                  {/* Seat 2 (BetaBot) */}
                  <div className="relative">
                    <div className={`p-2 rounded-xl border bg-slate-950/90 shadow-lg flex flex-col items-center min-w-[80px] sm:min-w-[102px] transition-all duration-300 ${
                      players5[2]?.folded ? "opacity-35 border-slate-800" :
                      activePosition5 === 2 ? "border-amber-400 ring-4 ring-amber-400/25 scale-102" : "border-slate-800"
                    }`}>
                      {/* Card Back preview if active */}
                      {!players5[2]?.folded && stage5 !== "ENDED" && stage5 !== "SHOWDOWN" && (
                        <div className="absolute -top-3.5 flex gap-0.5">
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                        </div>
                      )}
                      {/* Showdown actual cards */}
                      {(stage5 === "SHOWDOWN" || stage5 === "ENDED") && !players5[2]?.folded && (
                        <div className="absolute -top-3.5 flex gap-0.5 select-none animate-scale-up">
                          {players5[2]?.hand.map((c, i) => (
                            <div key={i} className="w-5.5 h-7.5 bg-white text-slate-950 rounded flex items-center justify-center font-black text-[9px] border border-slate-300 shadow">
                              <span className={c.suit === 'H' || c.suit === 'D' ? 'text-rose-500' : 'text-slate-950'}>
                                {c.rank}{c.suit === "H" ? "♥" : c.suit === "D" ? "♦" : c.suit === "C" ? "♣" : "♠"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col items-center gap-1 mt-2.5 w-full">
                        <span className="text-[10px] sm:text-xs font-extrabold text-slate-100 flex items-center gap-0.5">
                          <span>🤖</span> BetaBot
                        </span>
                        <div className="h-6 flex items-center justify-center">
                          {renderRoleBadge(players5[2]?.role)}
                        </div>
                      </div>
                      <div className="text-[9.5px] sm:text-xs font-mono text-amber-400 font-extrabold mt-0.5">${players5[2]?.stack}</div>
                      
                      {players5[2]?.lastAction && (
                        <div className="mt-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[8px] text-slate-300">
                          {players5[2]?.lastAction}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seat 3 (GammaBot) */}
                  <div className="relative">
                    <div className={`p-2 rounded-xl border bg-slate-950/90 shadow-lg flex flex-col items-center min-w-[80px] sm:min-w-[102px] transition-all duration-300 ${
                      players5[3]?.folded ? "opacity-35 border-slate-800" :
                      activePosition5 === 3 ? "border-amber-400 ring-4 ring-amber-400/25 scale-102" : "border-slate-800"
                    }`}>
                      {!players5[3]?.folded && stage5 !== "ENDED" && stage5 !== "SHOWDOWN" && (
                        <div className="absolute -top-3.5 flex gap-0.5">
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                        </div>
                      )}
                      {(stage5 === "SHOWDOWN" || stage5 === "ENDED") && !players5[3]?.folded && (
                        <div className="absolute -top-3.5 flex gap-0.5 select-none animate-scale-up">
                          {players5[3]?.hand.map((c, i) => (
                            <div key={i} className="w-5.5 h-7.5 bg-white text-slate-950 rounded flex items-center justify-center font-black text-[9px] border border-slate-300 shadow">
                              <span className={c.suit === 'H' || c.suit === 'D' ? 'text-rose-500' : 'text-slate-950'}>
                                {c.rank}{c.suit === "H" ? "♥" : c.suit === "D" ? "♦" : c.suit === "C" ? "♣" : "♠"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col items-center gap-1 mt-2.5 w-full">
                        <span className="text-[10px] sm:text-xs font-extrabold text-slate-100 flex items-center gap-0.5">
                          <span>🤖</span> GammaBot
                        </span>
                        <div className="h-6 flex items-center justify-center">
                          {renderRoleBadge(players5[3]?.role)}
                        </div>
                      </div>
                      <div className="text-[9.5px] sm:text-xs font-mono text-amber-400 font-extrabold mt-0.5">${players5[3]?.stack}</div>
                      
                      {players5[3]?.lastAction && (
                        <div className="mt-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[8px] text-slate-300">
                          {players5[3]?.lastAction}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle Row: AlphaBot, Center Hub, DeltaBot */}
                <div className="flex justify-between items-center w-full px-1 my-3">
                  {/* Seat 1 (AlphaBot) */}
                  <div className="relative">
                    <div className={`p-2 rounded-xl border bg-slate-950/90 shadow-lg flex flex-col items-center min-w-[80px] sm:min-w-[102px] transition-all duration-300 ${
                      players5[1]?.folded ? "opacity-35 border-slate-800" :
                      activePosition5 === 1 ? "border-amber-400 ring-4 ring-amber-400/25 scale-102" : "border-slate-800"
                    }`}>
                      {!players5[1]?.folded && stage5 !== "ENDED" && stage5 !== "SHOWDOWN" && (
                        <div className="absolute -top-3.5 flex gap-0.5">
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                        </div>
                      )}
                      {(stage5 === "SHOWDOWN" || stage5 === "ENDED") && !players5[1]?.folded && (
                        <div className="absolute -top-3.5 flex gap-0.5 select-none animate-scale-up">
                          {players5[1]?.hand.map((c, i) => (
                            <div key={i} className="w-5.5 h-7.5 bg-white text-slate-950 rounded flex items-center justify-center font-black text-[9px] border border-slate-300 shadow">
                              <span className={c.suit === 'H' || c.suit === 'D' ? 'text-rose-500' : 'text-slate-950'}>
                                {c.rank}{c.suit === "H" ? "♥" : c.suit === "D" ? "♦" : c.suit === "C" ? "♣" : "♠"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col items-center gap-1 mt-2.5 w-full">
                        <span className="text-[10px] sm:text-xs font-extrabold text-slate-100 flex items-center gap-0.5">
                          <span>🤖</span> AlphaBot
                        </span>
                        <div className="h-6 flex items-center justify-center">
                          {renderRoleBadge(players5[1]?.role)}
                        </div>
                      </div>
                      <div className="text-[9.5px] sm:text-xs font-mono text-amber-400 font-extrabold mt-0.5">${players5[1]?.stack}</div>
                      
                      {players5[1]?.lastAction && (
                        <div className="mt-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[8px] text-slate-300">
                          {players5[1]?.lastAction}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Center Hub: Pot, Dealer Button and Board Community Cards */}
                  <div className="flex flex-col items-center justify-center flex-1 max-w-[210px] sm:max-w-[250px] mx-1">
                    {/* Pot frame */}
                    <div className="bg-slate-950/90 border border-slate-850 px-2.5 py-1 sm:py-1.5 rounded-xl shadow-lg text-center flex flex-col items-center w-full">
                      <span className="text-[8px] text-slate-500 font-extrabold tracking-widest leading-none">TOTAL POT</span>
                      <div className="flex items-center gap-1 mt-0.5 font-mono">
                        <div className="w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[8px] text-slate-950 font-black">$</div>
                        <strong className="text-xs sm:text-sm text-amber-400 font-black">${potSize5 + players5.reduce((sum, p) => sum + p.currentBet, 0)}</strong>
                      </div>
                      <div className="text-[7.5px] text-slate-400 mt-0.5">
                        Button: <strong className="text-indigo-400 font-mono uppercase">{players5[dealerIndex5]?.name}</strong>
                      </div>
                    </div>

                    {/* Street banner perfectly in the center */}
                    <div className="my-1 text-[8.5px] font-mono font-black tracking-widest uppercase bg-indigo-950/80 border border-indigo-800/85 text-indigo-400 px-3 py-0.5 rounded-full select-none shadow">
                      STREET: {stage5}
                    </div>

                    {/* Board Cards */}
                    <div className="flex gap-1 justify-center items-center min-h-[50px] sm:min-h-[64px] bg-slate-950/40 p-1.5 rounded-lg border border-slate-850/40 mt-1.5 w-full">
                      {board5.length > 0 ? (
                        board5.map((c, idx) => (
                          <div key={idx} className="w-8 h-11 sm:w-10 sm:h-14 bg-white text-slate-950 rounded flex flex-col justify-between p-1 shadow-lg border border-slate-300 shrink-0 select-none animate-fade-in font-bold">
                            <div className="text-[8px] sm:text-[10px] text-left leading-none font-bold">{c.rank}</div>
                            <div className={`text-xs sm:text-base text-center leading-none font-bold ${c.suit === 'H' || c.suit === 'D' ? 'text-rose-500' : 'text-slate-950'}`}>
                              {c.suit === "H" ? "♥" : c.suit === "D" ? "♦" : c.suit === "C" ? "♣" : "♠"}
                            </div>
                            <div className="text-[8px] sm:text-[10px] text-right leading-none font-bold">{c.rank}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[8px] text-slate-500 font-mono tracking-wider font-bold">BOARD COMM</div>
                      )}
                      {board5.length > 0 && board5.length < 5 && (
                        Array.from({ length: 5 - board5.length }).map((_, i) => (
                          <div key={i} className="w-8 h-11 sm:w-10 sm:h-14 border border-dashed border-slate-700 bg-slate-950/60 rounded flex items-center justify-center text-[7px] text-slate-650 font-mono font-bold shrink-0">
                            +
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Seat 4 (DeltaBot) */}
                  <div className="relative">
                    <div className={`p-2 rounded-xl border bg-slate-950/90 shadow-lg flex flex-col items-center min-w-[80px] sm:min-w-[102px] transition-all duration-300 ${
                      players5[4]?.folded ? "opacity-35 border-slate-800" :
                      activePosition5 === 4 ? "border-amber-400 ring-4 ring-amber-400/25 scale-102" : "border-slate-800"
                    }`}>
                      {!players5[4]?.folded && stage5 !== "ENDED" && stage5 !== "SHOWDOWN" && (
                        <div className="absolute -top-3.5 flex gap-0.5">
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                          <div className="w-5.5 h-7.5 bg-indigo-950 border border-indigo-400 rounded flex items-center justify-center text-indigo-400 text-[10px] shadow font-bold">♠</div>
                        </div>
                      )}
                      {(stage5 === "SHOWDOWN" || stage5 === "ENDED") && !players5[4]?.folded && (
                        <div className="absolute -top-3.5 flex gap-0.5 select-none animate-scale-up">
                          {players5[4]?.hand.map((c, i) => (
                            <div key={i} className="w-5.5 h-7.5 bg-white text-slate-950 rounded flex items-center justify-center font-black text-[9px] border border-slate-300 shadow">
                              <span className={c.suit === 'H' || c.suit === 'D' ? 'text-rose-500' : 'text-slate-950'}>
                                {c.rank}{c.suit === "H" ? "♥" : c.suit === "D" ? "♦" : c.suit === "C" ? "♣" : "♠"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col items-center gap-1 mt-2.5 w-full">
                        <span className="text-[10px] sm:text-xs font-extrabold text-slate-100 flex items-center gap-0.5">
                          <span>🤖</span> DeltaBot
                        </span>
                        <div className="h-6 flex items-center justify-center">
                          {renderRoleBadge(players5[4]?.role)}
                        </div>
                      </div>
                      <div className="text-[9.5px] sm:text-xs font-mono text-amber-400 font-extrabold mt-0.5">${players5[4]?.stack}</div>
                      
                      {players5[4]?.lastAction && (
                        <div className="mt-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[8px] text-slate-300">
                          {players5[4]?.lastAction}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: User Seating felt */}
                <div className="flex justify-center items-end w-full px-2 mb-2">
                  <div className="relative">
                    <div className={`p-2 rounded-xl border bg-slate-950/95 shadow-2xl flex items-center gap-4 min-w-[200px] sm:min-w-[240px] transition-all duration-300 ${
                      players5[0]?.folded ? "opacity-50 border-slate-800" :
                      activePosition5 === 0 ? "border-indigo-400 ring-4 ring-indigo-400/35 scale-102" : "border-slate-800"
                    }`}>
                      {activePosition5 === 0 && (
                        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white font-mono text-[7px] font-extrabold px-1.5 py-0.5 rounded shadow-md uppercase tracking-wider animate-pulse">
                          Your Turn
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-indigo-405 flex items-center justify-center shrink-0">
                          🎯
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10.5px] font-black text-indigo-100">You (Hero)</span>
                            {renderRoleBadge(players5[0]?.role)}
                          </div>
                          <div className="text-[10px] font-mono text-amber-400 font-extrabold">Stack: ${players5[0]?.stack}</div>
                        </div>
                      </div>

                      {/* User cards */}
                      <div className="flex gap-1 ml-auto">
                        {players5[0]?.hand.map((c, i) => (
                          <div key={i} className="w-9 h-13 sm:w-10 sm:h-14 bg-white text-slate-950 rounded flex flex-col justify-between p-1 shadow-lg border border-slate-300 font-bold select-none hover:-translate-y-1 transition-transform">
                            <div className="text-[8px] sm:text-[10px] text-left leading-none font-bold">{c.rank}</div>
                            <div className={`text-xs sm:text-base text-center leading-none font-bold ${c.suit === 'H' || c.suit === 'D' ? 'text-rose-500' : 'text-slate-950'}`}>
                              {c.suit === "H" ? "♥" : c.suit === "D" ? "♦" : c.suit === "C" ? "♣" : "♠"}
                            </div>
                            <div className="text-[8px] sm:text-[10px] text-right leading-none font-bold">{c.rank}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* UP: Opponent Hub (Computer) */}
                <div className="flex justify-between items-center z-10">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center relative transition-all ${
                      turn === "Computer" 
                        ? "border-amber-400 shadow-md ring-4 ring-amber-400/20 bg-slate-800" 
                        : "border-slate-700 bg-slate-800"
                    }`}>
                      <span className="text-xs sm:text-base">🤖</span>
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-indigo-600 rounded-full border border-slate-900 flex items-center justify-center text-[7px] sm:text-[8px] text-zinc-100 font-bold font-mono">
                        C
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] sm:text-xs font-black text-slate-100">GTO Computer Opponent</span>
                        {renderRoleBadge(dealer === "Computer" ? "BTN" : "BB")}
                        {dealer === "Computer" && renderRoleBadge("SB")}
                        {turn === "Computer" && (
                          <span className="text-[8px] bg-amber-500/25 text-amber-300 font-mono tracking-wide px-1.5 py-0.5 rounded animate-pulse font-bold">
                            ACTING
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[9.5px] sm:text-xs text-slate-400 font-mono">
                        <Coins size={10} className="text-amber-500" />
                        <span>Stack: <strong className="text-amber-400">${computerStack}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Opponent's Cards: Hidden until Showdown */}
                  <div className="flex gap-1.5 sm:gap-2">
                    {computerHand.length > 0 ? (
                      computerHand.map((card, idx) => {
                        const isRevealed = stage === "SHOWDOWN" || stage === "ENDED";
                        return (
                          <div
                            key={`comp-hole-${idx}`}
                            className={`w-12 h-18 sm:w-14 sm:h-20 lg:w-16 lg:h-24 rounded-lg flex flex-col justify-between p-1.5 sm:p-2 shadow-lg select-none transition-all duration-300 transform font-bold font-sans ${
                              isRevealed
                                ? "bg-white text-slate-900 border border-white translate-y-0 shadow-lg"
                                : "bg-indigo-950 border-2 border-indigo-400 flex items-center justify-center text-indigo-400/80 skew-y-1 scale-95 shadow-inner"
                            }`}
                          >
                            {isRevealed ? (
                              <>
                                <div className="text-[11px] sm:text-xs lg:text-sm text-left leading-none font-bold">{card.rank}</div>
                                <div className={`text-lg sm:text-xl lg:text-2xl text-center leading-none font-sans ${card.suit === "H" || card.suit === "D" ? "text-rose-500" : "text-slate-900"}`}>
                                  {card.suit === "H" ? "♥" : card.suit === "D" ? "♦" : card.suit === "C" ? "♣" : "♠"}
                                </div>
                                <div className="text-[11px] sm:text-xs lg:text-sm text-right leading-none font-bold">{card.rank}</div>
                              </>
                            ) : (
                              <div className="text-base sm:text-lg font-serif">♠</div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-slate-500 text-[10px] sm:text-xs italic">Dealt cards will show...</div>
                    )}
                  </div>
                </div>

                {/* MIDDLE: Board Community cards & Pot sizes */}
                <div className="flex flex-col items-center justify-center my-1.5 sm:my-3 space-y-1.5 sm:space-y-2.5 z-10">
                  
                  {/* Central Pot Display chips */}
                  <div className="flex flex-col items-center bg-slate-950/90 backdrop-blur-md px-3 py-1 sm:py-1.5 sm:px-5 rounded-lg sm:rounded-xl border border-slate-800 shadow-xl w-44 sm:w-48 text-center">
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest leading-none">TOTAL POT SIZE</span>
                    
                    <div className="flex items-center gap-1 mt-0.5 mb-0.5">
                      <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 bg-amber-500 rounded-full flex items-center justify-center text-[8px] sm:text-[9px] text-slate-950 font-black shadow-inner">
                        $
                      </div>
                      <strong className="text-lg sm:text-xl text-amber-400 font-mono tracking-tight leading-none">${potSize + userCurrentBet + computerCurrentBet}</strong>
                    </div>

                    {/* VISUAL 3D CHIP STACKING */}
                    <div className="w-full border-t border-b border-slate-850/65 py-0.5 sm:py-1 my-0.5 flex items-center justify-center overflow-visible">
                      <PokerChipsVisual amount={potSize + userCurrentBet + computerCurrentBet} />
                    </div>

                    {/* Dealer position label indicator */}
                    <div className="text-[8px] sm:text-[9px] text-slate-400 font-medium font-mono tracking-tight mt-0.5">
                      Button is on: <span className="text-indigo-400 uppercase font-black">{dealer}</span>
                    </div>
                  </div>

                  {/* Street banner perfectly in the center */}
                  <div className="my-1 text-[8.5px] sm:text-[10px] font-mono font-black tracking-widest uppercase bg-indigo-950/80 border border-indigo-800/85 text-indigo-400 px-3 py-0.5 rounded-full select-none shadow">
                    STREET: {stage}
                  </div>

                  {/* Board community card slots (Flop, Turn, River) */}
                  <div className="flex gap-1.5 sm:gap-2 justify-center items-center min-h-[64px] sm:min-h-[82px] bg-slate-950/20 px-2 sm:px-3 py-1 border border-slate-800/20 rounded-xl">
                    {board.length > 0 ? (
                      board.map((card, idx) => (
                        <div
                          key={`board-${idx}`}
                          className="w-12 h-18 sm:w-14 sm:h-20 lg:w-16 lg:h-24 bg-white text-slate-950 rounded-lg flex flex-col justify-between p-1.5 sm:p-2 shadow-2xl border border-white font-bold animate-fade-in animate-scale-up shrink-0"
                        >
                          <div className="text-[11px] sm:text-xs lg:text-sm text-left leading-none font-bold">{card.rank}</div>
                          <div className={`text-lg sm:text-xl lg:text-2xl text-center leading-none ${card.suit === "H" || card.suit === "D" ? "text-rose-500" : "text-slate-950"}`}>
                            {card.suit === "H" ? "♥" : card.suit === "D" ? "♦" : card.suit === "C" ? "♣" : "♠"}
                          </div>
                          <div className="text-[11px] sm:text-xs lg:text-sm text-right leading-none font-bold">{card.rank}</div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500 py-2 sm:py-4 max-w-xs sm:max-w-sm text-center px-2">
                        <div className="text-sm sm:text-2xl tracking-widest text-slate-700 font-mono font-bold">BOARD COMM</div>
                        <p className="text-[8px] sm:text-[10px] mt-0.5 font-mono uppercase text-slate-400 tracking-wider">
                          {stage === "PREFLOP" ? "Preflop active betting round" : "Felt community space"}
                        </p>
                      </div>
                    )}
                    
                    {/* Empty slots placeholders showing card targets */}
                    {board.length < 5 && board.length > 0 && (
                      Array.from({ length: 5 - board.length }).map((_, i) => (
                        <div
                          key={`placeholder-${i}`}
                          className="w-12 h-18 sm:w-14 sm:h-20 lg:w-16 lg:h-24 border border-dashed border-slate-700 bg-slate-950/40 rounded-lg flex items-center justify-center text-[7px] sm:text-[9px] text-slate-600 font-mono font-bold shrink-0"
                        >
                          {board.length + i === 3 ? "TURN" : board.length + i === 4 ? "RIVER" : "BOARD"}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* DOWN: Player Hub (User) */}
                <div className="flex justify-between items-center z-10 border-t border-slate-850/60 pt-1.5 sm:pt-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center relative transition-all ${
                      turn === "User" 
                        ? "border-indigo-400 shadow-md ring-4 ring-indigo-400/20 bg-slate-800" 
                        : "border-slate-700 bg-slate-800"
                    }`}>
                      <span className="text-xs sm:text-base">🎯</span>
                      <div className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-indigo-600 rounded-full border border-slate-900 flex items-center justify-center text-[7px] sm:text-[8px] text-zinc-100 font-bold font-mono">
                        You
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10.5px] sm:text-xs font-black text-indigo-100">Your pocket cards</span>
                        {renderRoleBadge(dealer === "User" ? "BTN" : "BB")}
                        {dealer === "User" && renderRoleBadge("SB")}
                        {turn === "User" && (
                          <span className="text-[8px] bg-indigo-500/25 text-indigo-305 font-mono tracking-wide px-1.5 py-0.5 rounded animate-pulse font-bold">
                            YOUR TURN
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[9.5px] sm:text-xs text-slate-400 font-mono">
                        <Coins size={10} className="text-amber-500" />
                        <span>Stack: <strong className="text-amber-400">${userStack}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Player's Hole Cards */}
                  <div className="flex gap-1.5 sm:gap-2">
                    {userHand.length > 0 ? (
                      userHand.map((card, idx) => (
                        <div
                          key={`user-hole-${idx}`}
                          className="w-12 h-18 sm:w-14 sm:h-20 lg:w-16 lg:h-24 bg-white text-slate-950 rounded-lg flex flex-col justify-between p-1.5 sm:p-2 shadow-2xl border border-white font-bold hover:-translate-y-2 transition-transform duration-200 cursor-pointer"
                        >
                          <div className="text-[11px] sm:text-xs lg:text-sm text-left leading-none font-bold">{card.rank}</div>
                          <div className={`text-lg sm:text-xl lg:text-2xl text-center leading-none ${card.suit === "H" || card.suit === "D" ? "text-rose-500" : "text-slate-950"}`}>
                            {card.suit === "H" ? "♥" : card.suit === "D" ? "♦" : card.suit === "C" ? "♣" : "♠"}
                          </div>
                          <div className="text-[11px] sm:text-xs lg:text-sm text-right leading-none font-bold">{card.rank}</div>
                        </div>
                      ) )
                    ) : (
                      <div className="text-slate-450 text-xs italic font-medium">Dealt hand will display...</div>
                    )}
                  </div>
                </div>
              </>
            )}
            </div>

            {/* Interactive Animated Flying Chips Layer */}
            <AnimatePresence>
              {flyingChips.map((chip) => {
                const isUser = chip.from === "User";
                return (
                  <motion.div
                    key={chip.id}
                    initial={{
                      opacity: 0.1,
                      scale: 0.6,
                      x: 0,
                      y: isUser ? 180 : -180,
                      left: "50%",
                      top: "50%",
                      marginLeft: "-16px",
                      marginTop: "-16px",
                    }}
                    animate={{
                      opacity: [1, 1, 0],
                      scale: [0.9, 1.15, 0.9],
                      x: (Math.random() - 0.5) * 80,
                      y: (Math.random() - 0.5) * 40,
                    }}
                    transition={{
                      duration: 0.8,
                      ease: "easeOut",
                    }}
                    onAnimationComplete={() => {
                      setFlyingChips((prev) => prev.filter((c) => c.id !== chip.id));
                    }}
                    className="absolute pointer-events-none z-50 animate-fade-in"
                  >
                    <PokerChipSingle
                      color={chip.value >= 100 ? 'black' : chip.value >= 25 ? 'green' : chip.value >= 5 ? 'red' : 'blue'}
                      value={chip.value}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

        {/* RIGHT CONTAINER: Controls & Auditing */}
        <div className="md:col-span-5 flex flex-col gap-4 pr-1 px-1 min-h-0 md:h-full md:overflow-y-auto pb-4">
          {gameMode === "5player" ? (
            stage5 === "ENDED" || stage5 === "SHOWDOWN" ? (
              <div className="space-y-4 animate-scale-up shrink-0">
                <div className="bg-slate-900 border border-slate-950 rounded-3xl p-6 shadow-2xl space-y-4 text-center text-white shrink-0">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-center gap-2">
                      <Crown size={18} className="text-amber-400 font-extrabold" />
                      <h3 className="font-bold text-sm tracking-tight text-white uppercase sm:text-base">
                        Hand Finished
                      </h3>
                    </div>
                    <p className="text-xs text-slate-350 font-medium font-sans">
                      Check the Live Dealer Log to see the winners and hands shown.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      startNewHand5();
                    }}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1 cursor-pointer active:scale-98 text-slate-950"
                  >
                    <span>Deal Next Hand</span>
                    <Play size={12} className="fill-slate-950" />
                  </button>
                </div>

                {/* 5-PLAYER HAND REVIEW LOGIC */}
                {isFetchingHandReview5 ? (
                  <div className="p-8 bg-slate-900/55 border border-slate-950 rounded-3xl text-center space-y-3 animate-pulse text-white shrink-0">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-indigo-500 animate-spin mx-auto" />
                    <p className="font-mono text-[10px] text-slate-400 uppercase tracking-widest font-extrabold pb-1">Analyzing multi-way battle with AI Coach...</p>
                  </div>
                ) : handReview5 ? (() => {
                  const finalScore = calculateFinalReviewScore5();
                  let badgeColor = "bg-rose-500/15 text-rose-300 border-rose-500/25";
                  let badgeLabel = "Weak Accuracy";
                  if (finalScore >= 90) {
                    badgeColor = "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
                    badgeLabel = "GTO Champion";
                  } else if (finalScore >= 70) {
                    badgeColor = "bg-amber-500/10 text-amber-300 border-amber-500/25";
                    badgeLabel = "Good Tactical Line";
                  }

                  return (
                    <div className="bg-slate-900 rounded-3xl p-6 border border-slate-950 shadow-2xl space-y-5 text-white animate-scale-up shrink-0">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                        <div className="space-y-1 mr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-200 tracking-tight uppercase">Hand Performance Review</span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                              {badgeLabel}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-normal">Calculated GTO Accuracy based on Big Blind regret metrics accumulated over 5-player active rounds.</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Final GTO Score:</div>
                            <div className="text-[10px] font-mono text-slate-300 font-bold">Regrets: {currentHandRegretSum5.toFixed(2)} bb</div>
                          </div>
                          <div className="flex items-center justify-center w-14 h-14 bg-indigo-500/15 border border-indigo-500/30 rounded-2xl text-center">
                            <span className="text-xl font-black text-indigo-400 font-mono tracking-tighter">{finalScore}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Recap */}
                        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-md space-y-1.5 flex flex-col">
                          <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                            📊 Recap
                          </h4>
                          <div className="text-xs text-slate-800 leading-relaxed font-sans prose-sm animate-fade-in">
                            <MarkdownRenderer content={handReview5.summaryAnalysis} />
                          </div>
                        </div>

                        {/* Good Play */}
                        <div className="p-4 bg-white rounded-2xl border border-emerald-250 shadow-md space-y-1.5 flex flex-col">
                          <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                            🟢 Good Play
                          </h4>
                          <div className="text-xs text-slate-800 leading-relaxed font-sans prose-sm animate-fade-in">
                            <MarkdownRenderer content={handReview5.goodPlay} />
                          </div>
                        </div>

                        {/* Bad Play */}
                        <div className="p-4 bg-white rounded-2xl border border-rose-250 shadow-md space-y-1.5 flex flex-col">
                          <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                            🔴 Bad Play
                          </h4>
                          <div className="text-xs text-slate-800 leading-relaxed font-sans prose-sm animate-fade-in">
                            <MarkdownRenderer content={handReview5.badPlay} />
                          </div>
                        </div>

                        {/* GTO Takeaway */}
                        <div className="p-4 bg-white rounded-2xl border border-indigo-250 shadow-md space-y-1.5 flex flex-col">
                          <h4 className="text-[10px] font-black text-indigo-650 uppercase tracking-widest flex items-center gap-1.5">
                            💡 GTO Takeaway
                          </h4>
                          <div className="text-xs text-slate-850 leading-relaxed font-sans prose-sm italic font-medium animate-fade-in">
                            <MarkdownRenderer content={handReview5.gtoMainTakeaway} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : null}
              </div>
            ) : reviewFeedback5 ? (
              <div className="bg-slate-900 border border-slate-950 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-scale-up shrink-0 select-none text-white transition-all">
                {(() => {
                  const chosenActionKey = reviewFeedback5.chosenAction === "Fold" ? "fold" : reviewFeedback5.chosenAction === "Call/Check" ? "call" : "raise";
                  const chosenFreq = reviewFeedback5.actionBreakdown[chosenActionKey] || 0;
                  
                  let optionalityStatus: "mandatory" | "optional" | "prohibited" = "optional";
                  let actionBadgeLabel = "OPTIONAL ACTION";
                  let badgeStyles = "bg-sky-500/10 text-sky-400 border-sky-500/25";
                  
                  if (chosenFreq >= 90) {
                    optionalityStatus = "mandatory";
                    actionBadgeLabel = "MANDATORY ACTION";
                    badgeStyles = "bg-indigo-500/15 text-indigo-305 border-indigo-500/30";
                  } else if (chosenFreq > 5) {
                    optionalityStatus = "optional";
                    actionBadgeLabel = "OPTIONAL (MIXED STRATEGY)";
                    badgeStyles = "bg-amber-500/10 text-amber-305 border-amber-500/25";
                  } else {
                    optionalityStatus = "prohibited";
                    actionBadgeLabel = "PROHIBITED STRATEGY ERROR";
                    badgeStyles = "bg-rose-500/15 text-rose-450 border-rose-500/30 animate-pulse";
                  }

                  const actionRegret = reviewFeedback5.actionRegret !== undefined ? reviewFeedback5.actionRegret : reviewFeedback5.regret;
                  const isActionOptimal = actionRegret === 0;
                  const hasSizingFeedback = !!reviewFeedback5.sizingFeedback;
                  const sizingStatus = reviewFeedback5.sizingFeedback?.status || "perfect";

                  let correctnessLabel = "Optimal GTO Play";
                  let correctnessStyles = "text-emerald-400";
                  let correctnessBgBorder = "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
                  let correctnessIcon = "★";
                  let correctnessDesc = "";

                  if (isActionOptimal) {
                    if (hasSizingFeedback && sizingStatus !== "perfect") {
                      correctnessIcon = "⚠️";
                      correctnessBgBorder = "bg-amber-500/15 text-amber-300 border-amber-500/20";
                      if (sizingStatus === "too_much") {
                        correctnessLabel = "Excessive Sizing Error";
                        correctnessStyles = "text-amber-400 font-bold";
                        correctnessDesc = `Bet selected correctly, but your size ($${reviewFeedback5.sizingFeedback?.userSizing}) is too large. GTO targets ~$${reviewFeedback5.sizingFeedback?.optimalSizing}.`;
                      } else {
                        correctnessLabel = "Undersized Sizing Error";
                        correctnessStyles = "text-amber-400 font-bold";
                        correctnessDesc = `Bet selected correctly, but your size ($${reviewFeedback5.sizingFeedback?.userSizing}) is too small. GTO targets ~$${reviewFeedback5.sizingFeedback?.optimalSizing}.`;
                      }
                    } else {
                      correctnessIcon = "★";
                      correctnessBgBorder = "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
                      correctnessLabel = "Optimal GTO Play";
                      correctnessStyles = "text-emerald-400";
                      correctnessDesc = `Excellent decision! Selection is theoretically secure and optimal.`;
                    }
                  } else {
                    const isIntentionalAggressive = 
                      reviewFeedback5.chosenAction === "Raise/Bet" && 
                      sizingStatus === "perfect";

                    if (isIntentionalAggressive) {
                      correctnessIcon = "⚡";
                      correctnessBgBorder = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                      correctnessLabel = "Well-Sized Aggression";
                      correctnessStyles = "text-amber-400 font-extrabold";
                      correctnessDesc = `Well-sized raise! Chosen line has an EV loss of ${reviewFeedback5.actionRegret.toFixed(2)} bb compared to pure GTO check/call, but applies perfect sizing pressure.`;
                    } else {
                      const regretVal = reviewFeedback5.regret;
                      if (regretVal < 1.0) {
                        correctnessIcon = "⚠️";
                        correctnessBgBorder = "bg-amber-500/15 text-amber-300 border-amber-500/20";
                        correctnessLabel = "Inaccurate Line";
                        correctnessStyles = "text-amber-300";
                      } else {
                        correctnessIcon = "🚨";
                        correctnessBgBorder = "bg-rose-500/15 text-rose-450 border-rose-500/20";
                        correctnessLabel = "Blunder Play";
                        correctnessStyles = "text-rose-400";
                      }

                      correctnessDesc = `Sub-optimal decision chosen (leaks ${regretVal.toFixed(2)} bb in theoretical expectation).`;
                      if (hasSizingFeedback) {
                        correctnessDesc += ` Sizing ($${reviewFeedback5.sizingFeedback?.userSizing}) deviates from recommended ~$${reviewFeedback5.sizingFeedback?.optimalSizing}.`;
                      }
                    }
                  }

                  return (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3.5 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🎯</span>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">GTO Solver-Hand Decision Audit</h3>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Left Column: Metrics Visualization block */}
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${badgeStyles}`}>
                              {actionBadgeLabel}
                            </span>
                            {reviewFeedback5.sizingFeedback && (
                              <span className="text-[9px] font-mono font-bold bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                                Sizing: ${reviewFeedback5.sizingFeedback.userSizing} / Target: ${reviewFeedback5.sizingFeedback.optimalSizing} ({reviewFeedback5.sizingFeedback.status === "perfect" ? "Perfect" : reviewFeedback5.sizingFeedback.status === "too_little" ? "Too Small" : "Too Large"})
                              </span>
                            )}
                          </div>

                          <div className={`p-4 rounded-2xl border ${correctnessBgBorder} transition-all`}>
                            <div className="flex items-start gap-2.5">
                              <span className="text-lg leading-none shrink-0 mt-0.5">{correctnessIcon}</span>
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-450 block uppercase font-mono tracking-wider font-extrabold leading-none">Your Action Result</span>
                                <h4 className={`text-sm tracking-tight ${correctnessStyles}`}>{correctnessLabel}</h4>
                                <p className="text-[10px] text-slate-300 font-sans leading-normal mt-1 leading-relaxed animate-fade-in">
                                  {correctnessDesc}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2.5 bg-slate-950/40 p-4 rounded-2xl border border-slate-850">
                            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-extrabold">All GTO Strategy Options</span>
                            
                            {(() => {
                              const actionsList = [
                                {
                                  key: "fold",
                                  name: "Fold",
                                  label: "Fold",
                                  freq: reviewFeedback5.actionBreakdown.fold,
                                  ev: reviewFeedback5.evs.fold,
                                  bgClass: "bg-slate-450",
                                },
                                {
                                  key: "call",
                                  name: "Call/Check",
                                  label: reviewFeedback5.bestActionLabel === "Check" ? "Check" : "Call",
                                  freq: reviewFeedback5.actionBreakdown.call,
                                  ev: reviewFeedback5.evs.call,
                                  bgClass: "bg-blue-500",
                                },
                                {
                                  key: "raise",
                                  name: "Raise/Bet",
                                  label: "Raise/Bet",
                                  freq: reviewFeedback5.actionBreakdown.raise,
                                  ev: reviewFeedback5.evs.raise,
                                  bgClass: "bg-emerald-500",
                                }
                              ];

                              return actionsList.map((act) => {
                                const isChosen = act.name === reviewFeedback5.chosenAction;
                                const isBest = act.name === reviewFeedback5.bestAction;
                                return (
                                  <div key={act.key} className={`p-2 rounded-lg border ${isChosen ? 'bg-slate-900 border-indigo-500/30' : 'bg-slate-900/40 border-slate-900/60'} flex flex-col gap-1 transition-all`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`w-2 h-2 rounded-full ${act.bgClass} shrink-0`}></span>
                                        <span className="font-bold text-[11px] text-white truncate">{act.label}</span>
                                        
                                        {isChosen && (
                                          <span className="px-1 py-0.2 rounded text-[7px] font-black uppercase bg-indigo-505/20 text-indigo-305 border border-indigo-505/20 shrink-0">
                                            You
                                          </span>
                                        )}
                                        {isBest && (
                                          <span className="px-1 py-0.2 rounded text-[7px] font-black uppercase bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 shrink-0">
                                            Best
                                          </span>
                                        )}
                                      </div>
                                      
                                      <div className="flex items-center gap-3 font-mono">
                                        <div className="text-right">
                                          <span className="text-[7px] text-slate-400 block uppercase font-extrabold leading-none mb-1">GTO Freq</span>
                                          <span className="text-white text-xs sm:text-[13px] font-black tracking-tight">{act.freq}%</span>
                                        </div>
                                        <div className="text-right min-w-[45px]">
                                          <span className="text-[7px] text-slate-400 block uppercase font-extrabold leading-none mb-1">EV/bb</span>
                                          <span className={`text-xs sm:text-[13px] font-black tracking-tight ${act.ev >= 0 ? 'text-emerald-400' : 'text-slate-350'}`}>
                                            {act.ev >= 0 ? `+${act.ev.toFixed(2)}` : act.ev.toFixed(2)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <div className="w-full bg-slate-950/50 h-1 rounded-full overflow-hidden">
                                      <div className={`h-full ${act.bgClass}`} style={{ width: `${act.freq}%` }}></div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                        {/* Right Column: Coach Strategic Comments & Button */}
                        <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-850 flex flex-col justify-between">
                          <div>
                            <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider block">Consultation Feedback</span>
                            <p className="text-[10px] md:text-xs text-slate-300 italic mt-2 leading-relaxed font-sans select-text hover:text-white">
                              "{reviewFeedback5.comments}"
                            </p>
                          </div>

                          <div className="mt-3 space-y-2">
                            <button
                              onClick={reviewFeedback5.onContinue}
                              className="w-full py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-950/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:translate-x-0.5 active:scale-98 text-white"
                            >
                              <span>Apply Action & Continue Play</span>
                              <ArrowRight size={12} />
                            </button>

                            <button
                              onClick={() => setReviewFeedback5(null)}
                              className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-755 text-slate-350 border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 text-slate-200"
                            >
                              <RotateCcw size={12} />
                              <span>Undo Move & Decide Again</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : activePosition5 === 0 ? (
              <div className="bg-slate-900 border border-slate-950 rounded-3xl p-5 shadow-2xl flex flex-col justify-between select-none text-white transition-all min-h-[480px] md:min-h-[500px] lg:min-h-[530px] shrink-0">
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Interactive GTO Betting</h4>
                    </div>
                    <span className="text-[8px] bg-indigo-650/30 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                      Hero Active
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-850 text-center">
                    <div>
                      <span className="block text-[7.5px] text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">To Call</span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        ${(currentBetToCall5 - (players5[0]?.currentBet || 0)) > 0 ? (currentBetToCall5 - (players5[0]?.currentBet || 0)) : 0}
                      </span>
                    </div>
                    <div className="border-l border-r border-slate-850">
                      <span className="block text-[7.5px] text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">Pot Size</span>
                      <span className="text-xs font-mono font-bold text-slate-200">${potSize5 + players5.reduce((sum, p) => sum + p.currentBet, 0)}</span>
                    </div>
                    <div>
                      <span className="block text-[7.5px] text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">Your Bet</span>
                      <span className="text-xs font-mono font-bold text-indigo-400">${players5[0]?.currentBet || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 my-4 flex-1 flex flex-col justify-center">
                  {/* Row 1: Actions, Calls, Multipliers */}
                  <div className="space-y-1.5 animate-fade-in">
                    <span className="text-[8px] uppercase font-mono font-extrabold text-indigo-400 tracking-wider">Primary Line:</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        onClick={() => submitUserAction5("FOLD")}
                        className="px-3 py-1.5 rounded-lg font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                      >
                        Fold
                      </button>

                      {/* Call match condition */}
                      {(currentBetToCall5 - (players5[0]?.currentBet || 0)) > 0 ? (
                        <button
                          onClick={() => submitUserAction5("CALL")}
                          className="px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-750 text-white shadow-md shadow-indigo-950/40 transition-colors cursor-pointer"
                        >
                          Call ${currentBetToCall5 - (players5[0]?.currentBet || 0)}
                        </button>
                      ) : (
                        <button
                          onClick={() => submitUserAction5("CHECK")}
                          className="px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-750 text-white shadow-md shadow-indigo-950/40 transition-colors cursor-pointer"
                        >
                          Check
                        </button>
                      )}

                      <div className="h-4 w-px bg-slate-800 mx-1"></div>

                      {[
                        { l: "Min x2", v: Math.max(currentBetToCall5 * 2, currentBetToCall5 + 2, 4) },
                        { l: "3x Bet", v: Math.max(currentBetToCall5 * 3, currentBetToCall5 + 2, 6) }
                      ].map((raisePreset) => {
                        const actualVal = Math.min(
                          (players5[0]?.stack || 0) + (players5[0]?.currentBet || 0),
                          Math.max(currentBetToCall5 + 2, Math.round(raisePreset.v))
                        );
                        if (actualVal <= currentBetToCall5) return null;
                        return (
                          <button
                            key={raisePreset.l}
                            onClick={() => {
                              submitUserAction5("RAISE", actualVal);
                            }}
                            className="px-2 py-1 rounded-lg font-extrabold text-[9px] sm:text-[10px] text-indigo-400 bg-indigo-950/50 border border-indigo-900/40 hover:bg-indigo-900/60 uppercase transition-all cursor-pointer"
                            title={`Raise directly to $${actualVal}`}
                          >
                            {raisePreset.l} (${actualVal})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 2: Fractional Pots (1/4, 1/2, 3/4) */}
                  <div className="space-y-1.5 animate-fade-in">
                    <span className="text-[8px] uppercase font-mono font-extrabold text-slate-400 tracking-wider">Pot Fractions:</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      {(() => {
                        const activePotAmount = potSize5 + players5.reduce((sum, p) => sum + p.currentBet, 0);
                        return [
                          { l: "1/4 Pot", v: Math.round(activePotAmount * 0.25) },
                          { l: "1/2 Pot", v: Math.round(activePotAmount * 0.50) },
                          { l: "3/4 Pot", v: Math.round(activePotAmount * 0.75) }
                        ].map((raisePreset) => {
                          const actualVal = Math.min(
                            (players5[0]?.stack || 0) + (players5[0]?.currentBet || 0),
                            Math.max(currentBetToCall5 + 2, Math.round(raisePreset.v))
                          );
                          const isUnusable = actualVal <= currentBetToCall5;
                          return (
                            <button
                              key={raisePreset.l}
                              disabled={isUnusable}
                              onClick={() => {
                                submitUserAction5("RAISE", actualVal);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[9px] sm:text-[10px] uppercase transition-all cursor-pointer ${
                                isUnusable
                                  ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed opacity-40"
                                  : "text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 hover:bg-emerald-900"
                              }`}
                              title={`Raise directly to $${actualVal}`}
                            >
                              {raisePreset.l} (${actualVal})
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Row 3: Pot & Max bets */}
                  <div className="space-y-1.5 animate-fade-in">
                    <span className="text-[8px] uppercase font-mono font-extrabold text-slate-400 tracking-wider">Pot &amp; Max size:</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      {[
                        { l: "Pot size", v: Math.round(potSize5 + players5.reduce((sum, p) => sum + p.currentBet, 0)) },
                        { l: "All in", v: (players5[0]?.stack || 0) + (players5[0]?.currentBet || 0) }
                      ].map((raisePreset) => {
                        const actualVal = Math.min(
                          (players5[0]?.stack || 0) + (players5[0]?.currentBet || 0),
                          Math.max(currentBetToCall5 + 2, Math.round(raisePreset.v))
                        );
                        const isAllIn = raisePreset.l === "All in";
                        const isUnusable = !isAllIn && actualVal <= currentBetToCall5;
                        return (
                          <button
                            key={raisePreset.l}
                            disabled={isUnusable}
                            onClick={() => {
                              submitUserAction5("RAISE", actualVal);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[9px] sm:text-[10px] uppercase transition-all cursor-pointer ${
                              isUnusable
                                ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed opacity-40"
                                : isAllIn
                                  ? "text-rose-400 bg-rose-950/50 border border-rose-900/50 hover:bg-rose-900"
                                  : "text-amber-400 bg-amber-950/50 border border-amber-900/50 hover:bg-amber-900"
                            }`}
                            title={`Raise directly to $${actualVal}`}
                          >
                            {raisePreset.l} (${actualVal})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Range slider custom raises */}
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="flex justify-between items-center text-[9px] sm:text-[10px] text-slate-400 uppercase font-extrabold tracking-wider leading-none">
                    <span>Raise Slider:</span>
                    <strong className="text-indigo-400 font-mono text-sm">${betChangeSlider}</strong>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="range"
                      min={Math.max(currentBetToCall5 + 2, 4)}
                      max={(players5[0]?.stack || 0) + (players5[0]?.currentBet || 0)}
                      step={1}
                      value={Math.max(Math.max(currentBetToCall5 + 2, 4), Math.min(betChangeSlider, (players5[0]?.stack || 0) + (players5[0]?.currentBet || 0)))}
                      onChange={(e) => setBetChangeSlider(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-950 rounded appearance-none cursor-pointer accent-indigo-505"
                    />
                    <button
                      onClick={() => {
                        const actVal = Math.max(
                          Math.max(currentBetToCall5 + 2, 4),
                          Math.min(betChangeSlider, (players5[0]?.stack || 0) + (players5[0]?.currentBet || 0))
                        );
                        submitUserAction5("RAISE", actVal);
                      }}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg cursor-pointer shrink-0 transition-colors"
                    >
                      Set Bet
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-950 rounded-3xl p-5 shadow-2xl flex flex-col justify-center items-center text-center py-10 space-y-4 animate-pulse select-none text-white transition-all min-h-[480px] md:min-h-[500px] lg:min-h-[530px] shrink-0">
                <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-indigo-505 animate-spin" />
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-extrabold">SOLVER ACTIVE SIMULATION</span>
                  <p className="text-xs text-slate-300 font-bold font-sans">
                    Waiting for <strong className="text-amber-400">{players5[activePosition5]?.name}</strong> to act...poker calculations in progress.
                  </p>
                </div>
              </div>
            )
          ) : (
            <>
              {/* Interactive User Controls Panel OR GTO Review Audit Panel */}
              {stage !== "SHOWDOWN" && stage !== "ENDED" && (
            reviewFeedback ? (
              <div className="bg-slate-900 border border-slate-950 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-scale-up shrink-0 select-none text-white transition-all">
                {(() => {
                  const chosenActionKey = reviewFeedback.chosenAction === "Fold" ? "fold" : reviewFeedback.chosenAction === "Call/Check" ? "call" : "raise";
                  const chosenFreq = reviewFeedback.actionBreakdown[chosenActionKey] || 0;
                  
                  let optionalityStatus: "mandatory" | "optional" | "prohibited" = "optional";
                  let actionBadgeLabel = "OPTIONAL ACTION";
                  let badgeStyles = "bg-sky-500/10 text-sky-400 border-sky-500/25";
                  
                  if (chosenFreq >= 90) {
                    optionalityStatus = "mandatory";
                    actionBadgeLabel = "MANDATORY ACTION";
                    badgeStyles = "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
                  } else if (chosenFreq > 5) {
                    optionalityStatus = "optional";
                    actionBadgeLabel = "OPTIONAL (MIXED STRATEGY)";
                    badgeStyles = "bg-amber-500/10 text-amber-300 border-amber-500/25";
                  } else {
                    optionalityStatus = "prohibited";
                    actionBadgeLabel = "PROHIBITED STRATEGY ERROR";
                    badgeStyles = "bg-rose-500/15 text-rose-450 border-rose-500/30 animate-pulse";
                  }

                  const actionRegret = reviewFeedback.actionRegret !== undefined ? reviewFeedback.actionRegret : reviewFeedback.regret;
                  const isActionOptimal = actionRegret === 0;
                  const hasSizingFeedback = !!reviewFeedback.sizingFeedback;
                  const sizingStatus = reviewFeedback.sizingFeedback?.status || "perfect";

                  let correctnessLabel = "Optimal GTO Play";
                  let correctnessStyles = "text-emerald-400";
                  let correctnessBgBorder = "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
                  let correctnessIcon = "★";
                  let correctnessDesc = "";

                  if (isActionOptimal) {
                    if (hasSizingFeedback && sizingStatus !== "perfect") {
                      correctnessIcon = "⚠️";
                      correctnessBgBorder = "bg-amber-500/15 text-amber-300 border-amber-500/20";
                      if (sizingStatus === "too_much") {
                        correctnessLabel = "Excessive Sizing Error";
                        correctnessStyles = "text-amber-400 font-bold";
                        correctnessDesc = `Bet selected correctly, but your size ($${reviewFeedback.sizingFeedback?.userSizing}) is too large. GTO targets ~$${reviewFeedback.sizingFeedback?.optimalSizing}.`;
                      } else {
                        correctnessLabel = "Undersized Sizing Error";
                        correctnessStyles = "text-amber-400 font-bold";
                        correctnessDesc = `Bet selected correctly, but your size ($${reviewFeedback.sizingFeedback?.userSizing}) is too small. GTO targets ~$${reviewFeedback.sizingFeedback?.optimalSizing}.`;
                      }
                    } else {
                      correctnessIcon = "★";
                      correctnessBgBorder = "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
                      correctnessLabel = "Optimal GTO Play";
                      correctnessStyles = "text-emerald-400";
                      correctnessDesc = `Excellent decision! Selection is theoretically secure and optimal.`;
                    }
                  } else {
                    const isIntentionalAggressive = 
                      reviewFeedback.chosenAction === "Raise/Bet" && 
                      sizingStatus === "perfect";

                    if (isIntentionalAggressive) {
                      correctnessIcon = "⚡";
                      correctnessBgBorder = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                      correctnessLabel = "Well-Sized Aggression";
                      correctnessStyles = "text-amber-400 font-extrabold";
                      correctnessDesc = `Well-sized raise! Chosen line has an EV loss of ${reviewFeedback.actionRegret.toFixed(2)} bb compared to pure GTO check/call, but applies perfect sizing pressure.`;
                    } else {
                      const regretVal = reviewFeedback.regret;
                      if (regretVal < 1.0) {
                        correctnessIcon = "⚠️";
                        correctnessBgBorder = "bg-amber-500/15 text-amber-300 border-amber-500/20";
                        correctnessLabel = "Inaccurate Line";
                        correctnessStyles = "text-amber-300";
                      } else {
                        correctnessIcon = "🚨";
                        correctnessBgBorder = "bg-rose-500/15 text-rose-455 border-rose-500/20";
                        correctnessLabel = "Blunder Play";
                        correctnessStyles = "text-rose-400";
                      }

                      correctnessDesc = `Sub-optimal decision chosen (leaks ${regretVal.toFixed(2)} bb in theoretical expectation).`;
                      if (hasSizingFeedback) {
                        correctnessDesc += ` Sizing ($${reviewFeedback.sizingFeedback?.userSizing}) deviates from recommended ~$${reviewFeedback.sizingFeedback?.optimalSizing}.`;
                      }
                    }
                  }

                  let optionalityDesc = "";
                  if (optionalityStatus === "mandatory") {
                    optionalityDesc = `Pure Strategy (${chosenFreq}%). Alternative decisions are incorrect GTO-wise.`;
                  } else if (optionalityStatus === "optional") {
                    optionalityDesc = `Mixed GTO action (${chosenFreq}%). Alternative options also hold positive EV.`;
                  } else {
                    optionalityDesc = `Mistake. Solver frequency is ${chosenFreq}%, meaning it's flat-out prohibited GTO.`;
                  }

                  return (
                    <>
                      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-3.5 gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🎯</span>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">GTO Solver-Hand Decision Audit</h3>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[9px]">
                          <span className={`px-2.5 py-1 rounded-full border font-extrabold uppercase tracking-widest shadow-sm ${badgeStyles}`}>
                            {actionBadgeLabel}
                          </span>
                        </div>
                      </div>

                      {/* Visual GTO Action Correctness & Optionality Status Banner */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-850/80">
                        {/* Left Block: Optimality Rating */}
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg text-sm font-black border ${correctnessBgBorder}`}>
                            {correctnessIcon}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">GTO Correctness:</span>
                              <span className={`text-[10px] font-black uppercase font-mono ${correctnessStyles}`}>
                                {correctnessLabel}
                              </span>
                              {reviewFeedback.sizingFeedback && (
                                <span className="text-[9px] font-mono font-bold bg-slate-900 border border-slate-800/80 px-2 py-0.5 rounded text-slate-350">
                                  Sizing: ${reviewFeedback.sizingFeedback.userSizing} / Target: ${reviewFeedback.sizingFeedback.optimalSizing} ({reviewFeedback.sizingFeedback.status === "perfect" ? "Perfect" : reviewFeedback.sizingFeedback.status === "too_little" ? "Too Small" : "Too Large"})
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-300 mt-1">
                              {correctnessDesc}
                            </p>
                          </div>
                        </div>

                        {/* Right Block: Optionality Rating */}
                        <div className="flex items-start gap-3 border-t sm:border-t-0 sm:border-l border-slate-850 pt-3 sm:pt-0 sm:pl-4">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg text-sm font-black border ${
                            optionalityStatus === "mandatory" 
                              ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/20" 
                              : optionalityStatus === "optional" 
                                ? "bg-amber-500/15 text-amber-350 border-amber-500/20" 
                                : "bg-rose-500/15 text-rose-400 border-rose-500/20"
                          }`}>
                            {optionalityStatus === "mandatory" ? "🔒" : optionalityStatus === "optional" ? "🔄" : "🚫"}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Choice Type:</span>
                              <span className={`text-[10px] font-black uppercase font-mono ${
                                optionalityStatus === "mandatory" 
                                  ? "text-indigo-400" 
                                  : optionalityStatus === "optional" 
                                    ? "text-amber-300" 
                                    : "text-rose-400"
                              }`}>
                                {optionalityStatus === "mandatory" ? "Pure (Mandatory)" : optionalityStatus === "optional" ? "Mixed (Optional)" : "Prohibited"}
                              </span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-300 mt-0.5">
                              {optionalityDesc}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                <div className="flex flex-col gap-4">
                  {/* Left Column: Merged GTO Solver Frequencies & Profitability Matrix */}
                  <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-850 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">GTO Solver Frequencies</span>
                        {/* Compact overall colored distribution bar */}
                        <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden flex border border-slate-950 shrink-0">
                          {reviewFeedback.actionBreakdown.fold > 0 && (
                            <div className="h-full bg-rose-500" style={{ width: `${reviewFeedback.actionBreakdown.fold}%` }} />
                          )}
                          {reviewFeedback.actionBreakdown.call > 0 && (
                            <div className="h-full bg-indigo-500" style={{ width: `${reviewFeedback.actionBreakdown.call}%` }} />
                          )}
                          {reviewFeedback.actionBreakdown.raise > 0 && (
                            <div className="h-full bg-emerald-500" style={{ width: `${reviewFeedback.actionBreakdown.raise}%` }} />
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 mt-2">
                        {(() => {
                          const actionsList = [
                            {
                              key: "fold",
                              name: "Fold",
                              label: "Fold",
                              freq: reviewFeedback.actionBreakdown.fold,
                              ev: reviewFeedback.evs.fold,
                              bgClass: "bg-rose-500",
                            },
                            {
                              key: "call",
                              name: "Call/Check",
                              label: computerCurrentBet > userCurrentBet ? "Call" : "Check",
                              freq: reviewFeedback.actionBreakdown.call,
                              ev: reviewFeedback.evs.call,
                              bgClass: "bg-indigo-500",
                            },
                            {
                              key: "raise",
                              name: "Raise/Bet",
                              label: computerCurrentBet > userCurrentBet ? "Raise" : "Bet",
                              freq: reviewFeedback.actionBreakdown.raise,
                              ev: reviewFeedback.evs.raise,
                              bgClass: "bg-emerald-500",
                            }
                          ];

                          return actionsList.map((act) => {
                            const isChosen = act.name === reviewFeedback.chosenAction;
                            const isBest = act.name === reviewFeedback.bestAction;
                            return (
                              <div key={act.key} className={`p-2 rounded-lg border ${isChosen ? 'bg-slate-900 border-indigo-500/30' : 'bg-slate-900/40 border-slate-900/60'} flex flex-col gap-1 transition-all`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`w-2 h-2 rounded-full ${act.bgClass} shrink-0`}></span>
                                    <span className="font-bold text-[11px] text-white truncate">{act.label}</span>
                                    
                                    {isChosen && (
                                      <span className="px-1 py-0.2 rounded text-[7px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 shrink-0">
                                        You
                                      </span>
                                    )}
                                    {isBest && (
                                      <span className="px-1 py-0.2 rounded text-[7px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                        Best
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-3 font-mono">
                                    <div className="text-right">
                                      <span className="text-[7px] text-slate-400 block uppercase font-extrabold leading-none mb-1">GTO Freq</span>
                                      <span className="text-white text-xs sm:text-[13px] font-black tracking-tight">{act.freq}%</span>
                                    </div>
                                    <div className="text-right min-w-[45px]">
                                      <span className="text-[7px] text-slate-400 block uppercase font-extrabold leading-none mb-1">EV/bb</span>
                                      <span className={`text-xs sm:text-[13px] font-black tracking-tight ${act.ev >= 0 ? 'text-emerald-400' : 'text-slate-350'}`}>
                                        {act.ev >= 0 ? `+${act.ev.toFixed(2)}` : act.ev.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Action visual bar */}
                                <div className="w-full bg-slate-950/50 h-1 rounded-full overflow-hidden">
                                  <div className={`h-full ${act.bgClass}`} style={{ width: `${act.freq}%` }}></div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Bottom row: Regret statistics and RNG rollout */}
                    <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] border-t border-slate-900/60 font-mono">
                      <div className={`p-1.5 rounded-lg border flex flex-col justify-center text-center ${
                        reviewFeedback.regret === 0 
                          ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" 
                          : "bg-rose-500/5 border-rose-500/10 text-rose-350"
                      }`}>
                        <span className="text-[7px] uppercase font-bold text-slate-500 block">Regret EV Loss</span>
                        <strong className="text-[11px] font-bold mt-0.5">
                          {reviewFeedback.regret === 0 ? "0.00 bb" : `-${reviewFeedback.regret.toFixed(2)} bb`}
                        </strong>
                      </div>

                      <div className="p-1.5 bg-slate-900 border border-slate-850 rounded-lg flex flex-col justify-center text-center">
                        <span className="text-[7px] uppercase text-slate-500 font-bold block">Solver RNG Seed</span>
                        <strong className="text-[11px] font-bold text-amber-400 mt-0.5">
                          Roll: {reviewFeedback.rngRoll}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Coach Strategic Comments & Button */}
                  <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-850 flex flex-col justify-between">
                    <div>
                      <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider block">Consultation Feedback</span>
                      <p className="text-[10px] md:text-xs text-slate-300 italic mt-2 leading-relaxed font-sans select-text">
                        "{reviewFeedback.comments}"
                      </p>
                    </div>

                    <div className="mt-3 space-y-2">
                      <button
                        onClick={reviewFeedback.onContinue}
                        className="w-full py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-950/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:translate-x-0.5 active:scale-98"
                      >
                        <span>Apply Action & Continue Play</span>
                        <ArrowRight size={12} />
                      </button>

                      <button
                        onClick={() => setReviewFeedback(null)}
                        className="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-750 text-slate-350 border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 text-slate-200"
                      >
                        <RotateCcw size={12} />
                        <span>Undo Move & Decide Again</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-950 rounded-3xl p-5 shadow-2xl flex flex-col justify-between select-none text-white transition-all min-h-[480px] md:min-h-[500px] lg:min-h-[530px] shrink-0">
                <div className="space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${turn === "User" ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"}`}></span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Interactive GTO Betting</h4>
                    </div>
                    <span className="text-[8px] bg-indigo-600/30 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                      {turn === "User" ? "Hero active" : "Opponent Turn"}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/40 p-2 rounded-xl border border-slate-850 text-center">
                    <div>
                      <span className="block text-[7.5px] text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">To Call</span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {computerCurrentBet > userCurrentBet ? `$${computerCurrentBet - userCurrentBet}` : "$0"}
                      </span>
                    </div>
                    <div className="border-l border-r border-slate-850">
                      <span className="block text-[7.5px] text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">Pot Size</span>
                      <span className="text-xs font-mono font-bold text-slate-200">${potSize + userCurrentBet + computerCurrentBet}</span>
                    </div>
                    <div>
                      <span className="block text-[7.5px] text-slate-500 font-extrabold uppercase tracking-widest mb-0.5">Your Bet</span>
                      <span className="text-xs font-mono font-bold text-indigo-400">${userCurrentBet}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 my-4 flex-1 flex flex-col justify-center">
                  {/* Row 1: Actions, Calls, Multipliers */}
                  <div className="space-y-1.5 animate-fade-in">
                    <span className="text-[8px] uppercase font-mono font-extrabold text-indigo-400 tracking-wider">Primary Line:</span>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        disabled={turn !== "User"}
                        onClick={handleUserFold}
                        className="px-3 py-1.5 rounded-lg font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        Fold
                      </button>

                      {/* Call match condition */}
                      {computerCurrentBet > userCurrentBet ? (
                        <button
                          disabled={turn !== "User"}
                          onClick={handleUserCall}
                          className="px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-750 text-white shadow-md shadow-indigo-950/40 transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          Call ${computerCurrentBet - userCurrentBet}
                        </button>
                      ) : (
                        <button
                          disabled={turn !== "User" || userCurrentBet !== computerCurrentBet}
                          onClick={handleUserCheck}
                          className="px-3 py-1.5 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-750 text-white shadow-md shadow-indigo-950/40 transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          Check
                        </button>
                      )}

                      {turn === "User" && (
                        <>
                          <div className="h-4 w-px bg-slate-800 mx-1"></div>

                          {[
                            { l: "Min x2", v: Math.max(computerCurrentBet * 2, 4) },
                            { l: "3x Bet", v: Math.max(computerCurrentBet * 3, 6) }
                          ].map((raisePreset) => {
                            const amt = Math.min(
                              userStack + userCurrentBet,
                              Math.max(computerCurrentBet + 2, Math.round(raisePreset.v))
                            );
                            if (amt <= computerCurrentBet) return null;
                            return (
                              <button
                                key={raisePreset.l}
                                onClick={() => {
                                  handleUserRaiseSubmit(amt);
                                }}
                                className="px-2 py-1.5 rounded-lg font-extrabold text-[9px] sm:text-[10px] text-indigo-400 bg-indigo-950/50 border border-indigo-900/40 hover:bg-indigo-900/60 uppercase transition-all cursor-pointer"
                                title={`Raise directly to $${amt}`}
                              >
                                {raisePreset.l} (${amt})
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Fractional Pots (1/4, 1/2, 3/4) */}
                  {turn === "User" && (
                    <div className="space-y-1.5 animate-fade-in">
                      <span className="text-[8px] uppercase font-mono font-extrabold text-slate-400 tracking-wider">Pot Fractions:</span>
                      <div className="flex flex-wrap gap-2 items-center">
                        {(() => {
                          const activePotAmount = potSize + userCurrentBet + computerCurrentBet;
                          return [
                            { l: "1/4 Pot", v: Math.round(activePotAmount * 0.25) },
                            { l: "1/2 Pot", v: Math.round(activePotAmount * 0.50) },
                            { l: "3/4 Pot", v: Math.round(activePotAmount * 0.75) }
                          ].map((raisePreset) => {
                            const amt = Math.min(
                              userStack + userCurrentBet,
                              Math.max(computerCurrentBet + 2, Math.round(raisePreset.v))
                            );
                            const isUnusable = amt <= computerCurrentBet;
                            return (
                              <button
                                key={raisePreset.l}
                                disabled={isUnusable}
                                onClick={() => {
                                  handleUserRaiseSubmit(amt);
                                }}
                                className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[9px] sm:text-[10px] uppercase transition-all cursor-pointer ${
                                  isUnusable
                                    ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed opacity-40"
                                    : "text-emerald-400 bg-emerald-950/50 border border-emerald-900/50 hover:bg-emerald-900"
                                }`}
                                title={`Raise directly to $${amt}`}
                              >
                                {raisePreset.l} (${amt})
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Row 3: Pot & Max bets */}
                  {turn === "User" && (
                    <div className="space-y-1.5 animate-fade-in">
                      <span className="text-[8px] uppercase font-mono font-extrabold text-slate-400 tracking-wider">Pot &amp; Max size:</span>
                      <div className="flex flex-wrap gap-2 items-center">
                        {[
                          { l: "Pot size", v: Math.round(potSize + userCurrentBet + computerCurrentBet) },
                          { l: "All in", v: userStack + userCurrentBet }
                        ].map((raisePreset) => {
                          const amt = Math.min(
                            userStack + userCurrentBet,
                            Math.max(computerCurrentBet + 2, Math.round(raisePreset.v))
                          );
                          const isAllIn = raisePreset.l === "All in";
                          const isUnusable = !isAllIn && amt <= computerCurrentBet;
                          return (
                            <button
                              key={raisePreset.l}
                              disabled={isUnusable}
                              onClick={() => {
                                handleUserRaiseSubmit(amt);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg font-extrabold text-[9px] sm:text-[10px] uppercase transition-all cursor-pointer ${
                                isUnusable
                                  ? "bg-slate-950/40 text-slate-600 border border-slate-900 cursor-not-allowed opacity-40"
                                  : isAllIn
                                    ? "text-rose-400 bg-rose-950/50 border border-rose-900/50 hover:bg-rose-900"
                                    : "text-amber-400 bg-amber-950/50 border border-amber-900/50 hover:bg-amber-900"
                              }`}
                              title={`Raise directly to $${amt}`}
                            >
                              {raisePreset.l} (${amt})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Range slider custom raises */}
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="flex justify-between items-center text-[9px] sm:text-[10px] text-slate-400 uppercase font-extrabold tracking-wider leading-none">
                    <span>Raise Slider:</span>
                    <strong className="text-indigo-400 font-mono text-sm">${betChangeSlider}</strong>
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="range"
                      disabled={turn !== "User"}
                      min={Math.max(computerCurrentBet + 2, 4)}
                      max={userStack + userCurrentBet}
                      step={1}
                      value={betChangeSlider}
                      onChange={(e) => setBetChangeSlider(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-950 rounded appearance-none cursor-pointer accent-indigo-505 disabled:opacity-50"
                    />
                    <button
                      disabled={turn !== "User"}
                      onClick={() => handleUserRaiseSubmit(betChangeSlider)}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-lg cursor-pointer shrink-0 transition-colors disabled:opacity-40"
                    >
                      Set Bet
                    </button>
                  </div>
                </div>
              </div>
            )
          )}

          {/* Showdown outcomes box */}
          {stage === "ENDED" && (
            <div className="space-y-4 animate-scale-up shrink-0">
              <div className="bg-indigo-950 text-indigo-100 rounded-3xl p-6 border border-indigo-850 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="space-y-1.5 max-w-lg">
                  <div className="flex items-center gap-2">
                    <Crown size={18} className="text-amber-400" />
                    <h3 className="font-bold text-sm tracking-tight text-white uppercase sm:text-base">
                      {winEvaluation?.winner === "User" && "You won the hand!"}
                      {winEvaluation?.winner === "Computer" && "Computer wins the hand."}
                      {winEvaluation?.winner === "Split" && "Split pot!"}
                    </h3>
                  </div>
                  <p className="text-xs text-indigo-200 font-medium italic">
                    Result: {winEvaluation?.explanation}
                  </p>
                  <div className="text-[10px] font-mono text-indigo-300 flex items-center gap-1.5 pt-1">
                    <span>Your hand: <strong>{winEvaluation?.userHandName}</strong></span>
                    <span>•</span>
                    <span>Computer's hand: <strong>{winEvaluation?.computerHandName}</strong></span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setHandsPlayed((prev) => prev + 1);
                    resetGameHand();
                  }}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-950/20 flex items-center gap-1 cursor-pointer"
                >
                  <span>Deal Next Hand</span>
                  <Play size={12} className="fill-slate-950" />
                </button>
              </div>

              {/* HAND REVIEW LOGIC */}
              {isFetchingHandReview ? (
                <div className="p-8 bg-slate-50 rounded-3xl border border-slate-150 text-center space-y-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin mx-auto" />
                  <p className="font-mono text-[10px] text-slate-400 uppercase tracking-widest font-extrabold pb-1">Analyzing complete street action with AI Coach...</p>
                </div>
              ) : handReview ? (() => {
                const finalScore = calculateFinalReviewScore();
                let badgeColor = "bg-rose-100 text-rose-700 border-rose-200";
                let badgeLabel = "Weak Accuracy";
                if (finalScore >= 90) {
                  badgeColor = "bg-emerald-100 text-emerald-700 border-emerald-200";
                  badgeLabel = "GTO Champion";
                } else if (finalScore >= 70) {
                  badgeColor = "bg-amber-100 text-amber-700 border-amber-200";
                  badgeLabel = "Good Tactical Line";
                }

                return (
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                      <div className="space-y-1 mr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-slate-800 tracking-tight uppercase">Hand Performance Review</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeColor}`}>
                            {badgeLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal">Calculated GTO Accuracy based on Big Blind regret metrics accumulated over all action rounds.</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Final GTO Score:</div>
                          <div className="text-[10px] font-mono text-slate-500 font-bold">Regrets: {currentHandRegretSum.toFixed(2)} bb</div>
                        </div>
                        <div className="flex items-center justify-center w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl text-center">
                          <span className="text-xl font-black text-indigo-600 font-mono tracking-tighter">{finalScore}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Recap */}
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-md space-y-1.5 flex flex-col">
                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                          📊 Recap
                        </h4>
                        <div className="text-xs text-slate-800 leading-normal prose-sm">
                          <MarkdownRenderer content={handReview.summaryAnalysis} />
                        </div>
                      </div>

                      {/* Good Play */}
                      <div className="p-4 bg-white rounded-2xl border border-emerald-250 shadow-md space-y-1.5 flex flex-col">
                        <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                          🟢 Good Play
                        </h4>
                        <div className="text-xs text-slate-800 leading-normal prose-sm">
                          <MarkdownRenderer content={handReview.goodPlay} />
                        </div>
                      </div>

                      {/* Bad Play */}
                      <div className="p-4 bg-white rounded-2xl border border-rose-250 shadow-md space-y-1.5 flex flex-col">
                        <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1.5">
                          🔴 Bad Play
                        </h4>
                        <div className="text-xs text-slate-800 leading-normal prose-sm">
                          <MarkdownRenderer content={handReview.badPlay} />
                        </div>
                      </div>

                      {/* GTO Takeaway */}
                      <div className="p-4 bg-white rounded-2xl border border-indigo-250 shadow-md space-y-1.5 flex flex-col">
                        <h4 className="text-[10px] font-black text-indigo-650 uppercase tracking-widest flex items-center gap-1.5">
                          💡 GTO Takeaway
                        </h4>
                        <div className="text-xs text-slate-850 leading-normal prose-sm italic font-medium">
                          <MarkdownRenderer content={handReview.gtoMainTakeaway} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : null}
            </div>
          )}
            </>
          )}

          {/* Persistent Opponent Read & Adaptations Panel */}
          {gameMode !== "5player" && (
          <div className="bg-slate-900 border border-slate-950 rounded-2xl p-4 shadow-xl text-white flex flex-col gap-3 shrink-0 select-none">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">👁️‍G</span>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-300">Opponent Intelligence Hub</h3>
              </div>
              <span className="text-[8px] font-mono px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-bold tracking-wider animate-pulse">
                DYNAMIC PROFILE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Player Reading info */}
              <div className="bg-slate-950/75 p-2.5 rounded-xl border border-slate-850 flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Your Game Style:</span>
                  <strong className={`text-[11px] mt-1 block tracking-tight ${
                    computerAdaptationStyle === "HERO_CALLER" 
                      ? "text-rose-450 font-black" 
                      : computerAdaptationStyle === "VALUE_EXPLOITER" 
                        ? "text-indigo-400 font-bold" 
                        : computerAdaptationStyle === "BULLY" 
                          ? "text-amber-400 font-bold" 
                          : "text-emerald-400 font-bold"
                  }`}>
                    {computerAdaptationStyle === "HERO_CALLER" && "🔥 Bluff-Heavy Maniac"}
                    {computerAdaptationStyle === "VALUE_EXPLOITER" && "💧 Passive Calling Station"}
                    {computerAdaptationStyle === "BULLY" && "🍂 Tight Fold-Happy"}
                    {computerAdaptationStyle === "STANDARD_GTO" && "⚖️ Balanced (GTO)"}
                  </strong>
                </div>
                <p className="text-[9.5px] text-slate-400 mt-1 leading-normal font-sans">
                  {computerAdaptationStyle === "HERO_CALLER" && "You raise and bet speculative air hands heavily postflop."}
                  {computerAdaptationStyle === "VALUE_EXPLOITER" && "You call and check postflop lines frequently without raises."}
                  {computerAdaptationStyle === "BULLY" && "You are folding a high ratio of blinds/turns under bets."}
                  {computerAdaptationStyle === "STANDARD_GTO" && "You maintain standard balanced ranges across multiple streets."}
                </p>
              </div>

              {/* Dynamic Adaptation details */}
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-850 flex flex-col justify-between">
                <div>
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Bot Response State:</span>
                  <strong className="text-[11px] text-indigo-300 mt-1 block font-mono">
                    {computerAdaptationStyle === "HERO_CALLER" && "🛡️ HERO-CALL DOWN"}
                    {computerAdaptationStyle === "VALUE_EXPLOITER" && "💰 MAX-VALUE PUMP"}
                    {computerAdaptationStyle === "BULLY" && "⚔️ AGGRESSIVE STEAL"}
                    {computerAdaptationStyle === "STANDARD_GTO" && "🤖 BASELINE GTO"}
                  </strong>
                </div>
                <p className="text-[9.5px] text-slate-400 mt-1 leading-normal font-sans">
                  {computerAdaptationStyle === "HERO_CALLER" && "Closing folding frequencies; calls you down with matching single pair."}
                  {computerAdaptationStyle === "VALUE_EXPLOITER" && "Halts bluffs; elevates value-bet size and probability on passive checks."}
                  {computerAdaptationStyle === "BULLY" && "Fires multi-street bluffs and steps up preflop response rates on folds."}
                  {computerAdaptationStyle === "STANDARD_GTO" && "Standard heuristic calculations and GTO randomized bluff options."}
                </p>
              </div>
            </div>

            {/* Player stats indicators */}
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-850 flex items-center justify-between gap-4 text-center font-mono text-[9px]">
              <div className="flex-1">
                <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider leading-none">VPIP Rate</span>
                <strong className="text-slate-200 text-xs mt-1 block">
                  {handsPlayed > 1 ? Math.round((userVpipCount / handsPlayed) * 100) : 0}%
                </strong>
              </div>
              <div className="w-px h-6 bg-slate-800"></div>
              <div className="flex-1">
                <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider leading-none">Post Agg %</span>
                <strong className="text-slate-200 text-xs mt-1 block">
                  {(() => {
                    const postActions = userPostflopRaises + userPostflopCalls + userPostflopFolds;
                    return postActions > 0 ? Math.round((userPostflopRaises / postActions) * 100) : 0;
                  })()}%
                </strong>
              </div>
              <div className="w-px h-6 bg-slate-800"></div>
              <div className="flex-1">
                <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider leading-none">Bluffs Held</span>
                <strong className="text-slate-200 text-xs mt-1 block">
                  {userPostflopBluffs} <span className="text-[8px] text-slate-500">({userPostflopRaises > 0 ? Math.round((userPostflopBluffs / userPostflopRaises) * 100) : 0}%)</span>
                </strong>
              </div>
            </div>
          </div>
          )}

          {/* ⏪ ADVANCED HAND STEP-BY-STEP AUDIT REPLAYER & PRACTICE ENGINE */}
          {((lastHandSteps && lastHandSteps.length > 0) || (currentHandSteps && currentHandSteps.length > 0)) && (
            <div className="bg-slate-900 border border-slate-950 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 text-white hover:border-slate-800 transition-all shrink-0 select-none mt-2">
              
              {/* Header block */}
              <div className="flex flex-col gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History size={16} className="text-amber-400 font-extrabold" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-200 animate-pulse">
                      Practice & Audit Replayer
                    </h3>
                  </div>
                  
                  {reviewStepIndex >= 0 && (
                    <button
                      onClick={() => setReviewStepIndex(-1)}
                      className="text-[10px] bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-extrabold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      Exit Review
                    </button>
                  )}
                </div>

                {/* Hand Selector Category Pills */}
                {reviewStepIndex === -1 && (
                  <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl gap-1 border border-slate-850 mt-1">
                    <button
                      disabled={currentHandSteps.length === 0}
                      onClick={() => {
                        setReviewingCurrentHand(true);
                        setReviewStepIndex(-1);
                      }}
                      className={`py-1.5 px-2 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                        currentHandSteps.length === 0
                          ? 'opacity-40 cursor-not-allowed text-slate-600'
                          : reviewingCurrentHand
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                      }`}
                    >
                      Ongoing Hand ({currentHandSteps.length} moves)
                    </button>
                    <button
                      disabled={lastHandSteps.length === 0}
                      onClick={() => {
                        setReviewingCurrentHand(false);
                        setReviewStepIndex(-1);
                      }}
                      className={`py-1.5 px-2 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                        lastHandSteps.length === 0
                          ? 'opacity-40 cursor-not-allowed text-slate-600'
                          : !reviewingCurrentHand
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                      }`}
                    >
                      Last Finished Hand ({lastHandSteps.length} moves)
                    </button>
                  </div>
                )}
              </div>

              {/* Main Content */}
              {(() => {
                const targetSteps = reviewingCurrentHand ? currentHandSteps : lastHandSteps;
                const stepsToUse = targetSteps.length > 0 ? targetSteps : (currentHandSteps.length > 0 ? currentHandSteps : lastHandSteps);

                if (reviewStepIndex === -1) {
                  return (
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-850 space-y-1">
                        <span className="text-[10px] font-black text-amber-400 block uppercase tracking-wider">
                          {stepsToUse === currentHandSteps ? "Ongoing Hand Live Analysis" : "Last Hand Archive"}
                        </span>
                        <p className="text-[11px] text-slate-400 leading-normal font-sans">
                          {stepsToUse === currentHandSteps 
                            ? `Analyze and practice every decision you have made in the current hand (Hand #${stepsToUse[0]?.handNumber ?? 1}). You can review GTO EV outputs for each step, rewind the action to that exact point, and replay or redo the entire game from there!`
                            : `Every GTO decision, advice, and commentary from last hand (Hand #${stepsToUse[0]?.handNumber ?? 1}) is stored. Double click cards or use controls below to inspect and redo that hand.`
                          }
                        </p>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => setReviewStepIndex(0)}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 border border-indigo-500 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-98"
                        >
                          <span>Inspect Every Step ({stepsToUse.length})</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>

                      {/* Interactive Step Timeline list */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-extrabold pb-0.5 border-b border-slate-800">Step Timeline (Click to Redo)</span>
                        {stepsToUse.map((stp, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setReviewStepIndex(idx);
                            }}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 hover:bg-slate-950 border border-slate-850/60 hover:border-indigo-500/50 transition-all cursor-pointer font-sans"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-705 flex items-center justify-center text-[10px] font-black text-slate-305 font-mono">
                                {idx + 1}
                              </span>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-slate-200">
                                  {stp.stage}
                                </span>
                                <span className="text-[9px] text-indigo-300 font-mono">
                                  Choice: {stp.reviewFeedback?.chosenActionLabel ?? "Unknown"}
                                </span>
                              </div>
                            </div>

                            {redoConfirmIdx?.index === idx && redoConfirmIdx?.isCurrent === (stepsToUse === currentHandSteps) ? (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRedoFromStep(stp, idx, stepsToUse === currentHandSteps);
                                  }}
                                  className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white font-black text-[9px] uppercase rounded-lg transition-all shadow"
                                >
                                  Confirm Redo?
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRedoConfirmIdx(null);
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold text-[9px] uppercase rounded-lg transition-all"
                                >
                                  X
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRedoConfirmIdx({ index: idx, isCurrent: stepsToUse === currentHandSteps });
                                }}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-[9px] uppercase rounded-lg transition-all"
                              >
                                Redo
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                    </div>
                  );
                } else {
                  const step = stepsToUse[reviewStepIndex];
                  if (!step) return null;
                  const feedback = step.reviewFeedback;
                  const bestActionLabel = feedback.bestActionLabel || "Unknown";

                  return (
                    <div className="space-y-4 animate-fade-in">
                      {/* Top controls stepper */}
                      <div className="flex items-center justify-between bg-slate-950/40 p-2 rounded-xl border border-slate-855">
                        <button
                          disabled={reviewStepIndex === 0}
                          onClick={() => setReviewStepIndex(reviewStepIndex - 1)}
                          className="px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-200 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded-lg disabled:opacity-30 cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <ChevronLeft size={10} />
                          <span>Back</span>
                        </button>
                        <span className="text-[11px] font-mono text-slate-300 font-extrabold select-none">
                          Step {reviewStepIndex + 1} / {stepsToUse.length} ({step.stage})
                        </span>
                        <button
                          disabled={reviewStepIndex === stepsToUse.length - 1}
                          onClick={() => setReviewStepIndex(reviewStepIndex + 1)}
                          className="px-2.5 py-1.5 text-[10px] font-black uppercase text-slate-200 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded-lg disabled:opacity-30 cursor-pointer flex items-center gap-1 transition-colors"
                        >
                          <span>Next</span>
                          <ChevronRight size={10} />
                        </button>
                      </div>

                      {/* Redo Action Button */}
                      {redoConfirmIdx?.index === reviewStepIndex && redoConfirmIdx?.isCurrent === (stepsToUse === currentHandSteps) ? (
                        <div className="flex gap-2 w-full animate-fade-in">
                          <button
                            onClick={() => handleRedoFromStep(step, reviewStepIndex, stepsToUse === currentHandSteps)}
                            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 border border-rose-500 text-white font-black text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                          >
                            <span>⚠️ Confirm Rewind & Play From Here?</span>
                          </button>
                          <button
                            onClick={() => setRedoConfirmIdx(null)}
                            className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-350 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRedoConfirmIdx({ index: reviewStepIndex, isCurrent: stepsToUse === currentHandSteps })}
                          className="w-full py-2.5 bg-amber-500 hover:bg-amber-650 border border-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 animate-pulse"
                        >
                          <span>⏪ Play / Redo Game from This Step</span>
                        </button>
                      )}

                      {/* Mini Game State Info Cards */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-950/30 p-3 rounded-2xl border border-slate-850 text-xs text-white">
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-extrabold leading-none mb-1 text-slate-400 animate-pulse">Your Hand</span>
                          <div className="flex gap-1.5 mt-0.5">
                            {step.userCards?.map((c: any, ci: number) => {
                              const isRed = c.suit === "H" || c.suit === "D";
                              return (
                                <div key={ci} className="w-8 h-11 bg-white rounded border border-slate-300 flex flex-col justify-between items-center text-slate-950 font-black p-0.5 relative select-none">
                                  <span className={`text-[10px] leading-none ${isRed ? "text-red-650" : "text-slate-950"}`}>{c.rank}</span>
                                  <span className={`text-sm leading-none ${isRed ? "text-red-500" : "text-slate-700"}`}>
                                    {c.suit === "S" && "♠"}
                                    {c.suit === "H" && "♥"}
                                    {c.suit === "D" && "♦"}
                                    {c.suit === "C" && "♣"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-extrabold leading-none mb-1 text-slate-400">Board CARDS</span>
                          <div className="flex gap-1.5 mt-0.5">
                            {!step.board || step.board.length === 0 ? (
                              <span className="text-[9px] text-slate-500 font-mono italic">No board cards</span>
                            ) : (
                              step.board.map((c: any, ci: number) => {
                                const isRed = c.suit === "H" || c.suit === "D";
                                return (
                                  <div key={ci} className="w-8 h-11 bg-white rounded border border-slate-300 flex flex-col justify-between items-center text-slate-950 font-black p-0.5 relative select-none">
                                    <span className={`text-[10px] leading-none ${isRed ? "text-red-650" : "text-slate-950"}`}>{c.rank}</span>
                                    <span className={`text-sm leading-none ${isRed ? "text-red-500" : "text-slate-700"}`}>
                                      {c.suit === "S" && "♠"}
                                      {c.suit === "H" && "♥"}
                                      {c.suit === "D" && "♦"}
                                      {c.suit === "C" && "♣"}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Decision Stats */}
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between items-center bg-slate-950/20 p-2 rounded-lg text-slate-300">
                          <span className="text-slate-400 text-[10px] font-bold uppercase">Pot Size / Bet to Call</span>
                          <span className="font-mono font-bold">${step.potSize} / ${step.currentBetToCall}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-950/20 p-2 rounded-lg text-slate-350">
                          <span className="text-slate-400 text-[10px] font-bold uppercase">Your Choice</span>
                          <span className="font-mono font-black text-amber-400">{feedback.chosenActionLabel}</span>
                        </div>
                      </div>

                      {/* Verdict Indicator */}
                      <div className="space-y-3">
                        <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block font-extrabold text-slate-300">Action Frequencies & EV</span>
                        
                        <div className="space-y-2 bg-slate-950/40 p-3 rounded-2xl border border-slate-850">
                          {(() => {
                            const actionsList = [
                              {
                                name: "Fold",
                                label: bestActionLabel === "Fold" ? "Fold (Best)" : "Fold",
                                freq: feedback.actionBreakdown?.fold ?? 0,
                                ev: feedback.evs?.fold ?? 0,
                                bgClass: "bg-slate-450",
                              },
                              {
                                name: "Call/Check",
                                label: bestActionLabel === "Check" || bestActionLabel === "Call" || bestActionLabel === "Call/Check" ? `${bestActionLabel} (Best)` : "Call/Check",
                                freq: feedback.actionBreakdown?.call ?? 0,
                                ev: feedback.evs?.call ?? 0,
                                bgClass: "bg-indigo-505",
                              },
                              {
                                name: "Raise/Bet",
                                label: bestActionLabel === "Raise/Bet" || bestActionLabel === "Raise" || bestActionLabel?.startWith?.("Raise") ? `${bestActionLabel} (Best)` : "Raise/Bet",
                                freq: feedback.actionBreakdown?.raise ?? 0,
                                ev: feedback.evs?.raise ?? 0,
                                bgClass: "bg-amber-500",
                              },
                            ];

                            return actionsList.map((act) => {
                              const isSelected = feedback.chosenAction === act.name;
                              return (
                                <div key={act.name} className={`flex flex-col gap-1 p-2 rounded-xl transition-all ${
                                  isSelected ? "bg-slate-900 border border-slate-750 shadow-inner" : "border border-transparent"
                                }`}>
                                  <div className="flex justify-between items-center text-[10.5px]">
                                    <div className="flex items-center gap-1.5">
                                      {isSelected && <span className="text-amber-400 text-[8px]">●</span>}
                                      <span className={`font-extrabold ${isSelected ? "text-amber-400 font-black" : "text-slate-300"}`}>
                                        {act.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 font-mono">
                                      <div className="text-right">
                                        <span className="text-[7px] text-slate-500 block uppercase font-extrabold leading-none mb-1">GTO Freq</span>
                                        <span className="text-white text-xs font-black tracking-tight">{act.freq}%</span>
                                      </div>
                                      <div className="text-right min-w-[45px]">
                                        <span className="text-[7px] text-slate-500 block uppercase font-extrabold leading-none mb-1">EV/bb</span>
                                        <span className={`text-xs font-black tracking-tight ${act.ev >= 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                          {act.ev >= 0 ? `+${act.ev.toFixed(2)}` : act.ev.toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="w-full bg-slate-950 h-1 rounded overflow-hidden mt-1 select-none">
                                    <div className={`h-full ${act.bgClass} rounded-r transition-all`} style={{ width: `${act.freq}%` }} />
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Coach Comments */}
                      <div className="p-3.5 bg-slate-950 border border-slate-850 rounded-2xl space-y-1.5">
                        <span className="text-[9px] font-mono font-extrabold text-indigo-400 block uppercase tracking-widest">AI Coach GTO Commentary</span>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{feedback.comments}</p>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>
          )}
        </div>
      </div>
    </main>
      </div>

      {/* Absolute floating modal: user instructions overlay */}
      {showHowToPlay && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-6 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg p-6 w-full border border-slate-200 hover:shadow-2xl transition-shadow shadow-xl space-y-4 animate-scale-up">
            <div className="flex justify-between items-start border-b border-slate-150 pb-3">
              <h3 className="text-sm md:text-base font-extrabold text-slate-800 flex items-center gap-1.5">
                <HelpCircle size={18} className="text-indigo-600" />
                Heads-up GTO Training Guide
              </h3>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-lg"
              >
                &times;
              </button>
            </div>
            
            <div className="space-y-2.5 text-xs md:text-sm text-slate-600 leading-relaxed font-sans">
              <p>
                Welcome to the **Premium Heads-Up No-Limit Texas Hold'em GTO Trainer**! This simulator runs real standard HUD cash game rules with starting stakes set at $100 depth ($1/$2 blinds).
              </p>
              
              <h4 className="font-bold text-slate-800 uppercase text-[10px] md:text-xs pt-2">BETTING SEQUENCE LAWS</h4>
              <ul className="list-disc pl-4 space-y-1 text-xs text-slate-500">
                <li>
                  Dealer Button toggles every hand. In HeadsUp, the Dealer acts as the **Small Blind ($1)** and acts **first pre-flop** but **last on all post-flop streets** (Flop, Turn, River). This acts as optimal standard GTO play.
                </li>
                <li>
                  To respond to bets, select quick action hotkeys or slider limits to bet or call.
                </li>
                <li>
                  The computer operates a robust math heuristic optimizer that reacts dynamically to stack values and board compositions.
                </li>
              </ul>

              <h4 className="font-bold text-slate-800 uppercase text-[10px] md:text-xs pt-2">REAL-TIME GTO COACH UTILITIES</h4>
              <p className="text-xs text-slate-500">
                Seek real-time strategic advice at any active fold/bet choice. The Gemini strategy reviewer compiles table cards, actions, and stack commitments to output customized range advice, theory percentages, and tactical blunders warnings.
              </p>
            </div>

            <button
              onClick={() => setShowHowToPlay(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all"
            >
              Continue training
            </button>
          </div>
        </div>
      )}

      {/* 4. Bottom Terminal status footer */}
      <footer className="h-10 bg-slate-950 flex items-center px-6 md:px-8 justify-between text-[10px] text-slate-500 font-mono tracking-tight shrink-0">
        <div className="flex gap-4 md:gap-6 items-center">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Poker Simulator: Active</span>
          </span>
          <span className="hidden sm:inline">Deck: Standard 52 card deal</span>
          <span className="hidden md:inline">Evaluator: 7-Card Best Complex Combination</span>
        </div>
        <div>
          <span>EP GTO Platform • v2.6.2</span>
        </div>
      </footer>
    </div>
  );
}
