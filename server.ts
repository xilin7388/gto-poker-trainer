import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

const apiKey = process.env.GEMINI_API_KEY;

// Lazy initialization / client creator for Google Gen AI
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!aiClient && apiKey) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err) {
      console.warn("Notice: Gemini Client initialization deferred:", err);
    }
  }
  return aiClient;
}

// Helper to perform calls to the Gemini API with automatic retries + exponential backoff and jitter on transient errors (like 503, 429)
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 500): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      // Match the standard error structure of ApiError or error message substrings
      const errStr = err ? JSON.stringify(err) : "";
      const errMsg = err?.message || "";
      const isTransient = 
        err.status === 503 || err.status === 429 || 
        err.code === 503 || err.code === 429 ||
        errStr.includes("503") || errStr.includes("429") || 
        errStr.includes("UNAVAILABLE") || errStr.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("503") || errMsg.includes("429") || 
        errMsg.includes("UNAVAILABLE") || errMsg.includes("RESOURCE_EXHAUSTED");

      if (attempt >= maxRetries || !isTransient) {
        throw err;
      }
      
      const delay = initialDelay * Math.pow(2, attempt) * (0.85 + Math.random() * 0.3); // exponential backoff with jitter
      console.warn(`[Gemini API] Request returned transient error. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms. Error detail: ${errMsg || errStr}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

app.use(express.json());

// Main poker analysis endpoint
app.post("/api/poker-gto", async (req, res) => {
  try {
    const {
      userHand = [],
      opponentHand = [],
      userHandEvalName = "Not evaluated",
      opponentHandEvalName = "Not evaluated",
      userHandRankType = 0,
      opponentHandRankType = 0,
      board = [],
      actions = [],
      potSize = 0,
      userStack = 100,
      computerStack = 100,
      currentBet = 0,
      stage = "PREFLOP",
      actionSpot = "COACH_ADVICE", // or "HAND_REVIEW"
    } = req.body;

    // Helper: Turn card arrays into strings with poker suit emojis
    const suitEmojis: Record<string, string> = {
      S: "♠️",
      H: "♥️",
      D: "♦️",
      C: "♣️"
    };

    const cardStr = (cards: any[]) =>
      cards.map((c) => `${c.rank}${suitEmojis[c.suit] || c.suit}`).join(", ") || "None";

    const boardCardsStr = cardStr(board);
    const userCardsStr = cardStr(userHand);
    const opponentCardsStr = cardStr(opponentHand);
    const actionsTranscript = actions.join("\n") || "No actions yet";

    // 1. Check if Gemini key exists
    const client = getAiClient();
    if (!client) {
      if (actionSpot === "HAND_REVIEW") {
        const calculatedScore = req.body.score ?? 100;
        let summaryAnalysis = `Hand resolved at stage ${stage}. Final pot reached $${potSize}.`;
        let goodPlay = "Matched standard GTO lines where checking and folding kept variance low.";
        let badPlay = "Few minor inaccuracies on betting sizes, but no extreme EV blunders identified.";
        let gtoMainTakeaway = "Configure GEMINI_API_KEY in the Secrets panel to unlock live street-by-street AI coaching feedback.";

        if (calculatedScore < 70) {
          goodPlay = "Selected passive check lines on select streets to limit potential losses.";
          badPlay = "Several high-regret decisions spotted. Aggressive bets with nothing or folding powerful made hands leaks chips.";
          gtoMainTakeaway = "Configure GEMINI_API_KEY in the Secrets panel to unlock live street-by-street AI coaching feedback.";
        }

        return res.json({
          summaryAnalysis,
          goodPlay,
          badPlay,
          gtoMainTakeaway,
          isFallback: true
        });
      }
      
      // Return solid fallback heuristics for GTO advice so app remains 100% playable offline
      const localEvaluation = getLocalHeuristics(userHand, board, stage, currentBet, potSize, userHandRankType, userHandEvalName);
      return res.json({
        ...localEvaluation,
        isFallback: true,
        message: "Offline Math Engine. Add GEMINI_API_KEY in Secrets for live GTO Coach advice."
      });
    }

    // 2. Dedicated Hand Review Generator
    if (actionSpot === "HAND_REVIEW") {
      const systemInstruction = `You are an elite, world-class Heads-Up poker coach and GTO (Game Theory Optimal) theoretician.
Your task is to analyze the complete transcript of a newly played poker hand and provide a comprehensive hand review.
CRITICAL FORMATTING RULES:
1. You MUST always use card suit emojis (♥️, ♦️, ♣️, ♠️) instead of letters (h, d, c, s or H, D, C, S) or words (hearts, diamonds, clubs, spades) when describing specific cards, hands, or suits. For example, represent the Ace of spades as A♠️, King of hearts as K♥️, or pocket 10s with hearts as 10♥️.
2. Structure your review critique strictly into distinct, brief, bulleted "goodPlay" (what went well) and "badPlay" (what went poorly/inaccuracies) fields in the JSON response. Do not use generic text paragraphs.
3. Trim all sentences to make everything extremely brief, concise, and highly readable. Minimize word counts and fluff.
4. CRITICAL: If the player's accumulated GTO EV loss regret is 0 (or less than 0.5) OR the player has a high performance score (e.g., 90% or higher), you MUST set "badPlay" strictly to: "- None: No significant GTO deviations found." Do NOT hallucinate any errors (such as criticizing folding weak starting hands like 5-2 off, which is actually a perfect GTO fold). Only categorize a play as a "bad play" if the user actually committed an incorrect action with non-zero regret in the action transcript.`;

      const userPrompt = `Review the completed poker hand:
- Hand Stage Reached: ${stage}
- Board Cards: ${boardCardsStr}
- Player's Hand Cards: ${userCardsStr} (Parsed hand combination: ${userHandEvalName})
- Computer (Opponent's) Hand Cards: ${opponentCardsStr} (Parsed hand combination: ${opponentHandEvalName})
- Climax Main Pot Size: $${potSize}
- Hero's ending stack: $${userStack}
- Villain's ending stack: $${computerStack}
- Interactive Action Transcript of play:
${actionsTranscript}
- Hero's accumulated regret (GTO EV loss) this hand: ${req.body.regret ?? 0} BB
- Hero's calculated performance score (0-100 scale, where 100 is flawless play): ${req.body.score ?? 100}

Provide exactly:
1. "summaryAnalysis" as a maximum 2-sentence objective recap using card suit emojis. Let it be extremely trimmed and direct.
2. "goodPlay" as a highly consolidated markdown list of bullet points detailing Hero's good plays or GTO balanced decisions. Max 2 concise bullets.
3. "badPlay" as a highly consolidated markdown list of bullet points. If Hero has very low/0 regret or a high score (score >= 90), you MUST output exactly: "- None: No significant GTO deviations found." Do NOT invent or hallucinate mistakes where none exist. If Hero correctly folded a weak starting hand (like 5-2 off), that is a perfect fold, NOT a bad play or preflop loose play.
4. "gtoMainTakeaway" as a single, super brief educational bullet.`;

      const response = await callWithRetry(() => client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryAnalysis: { type: Type.STRING },
              goodPlay: { type: Type.STRING },
              badPlay: { type: Type.STRING },
              gtoMainTakeaway: { type: Type.STRING }
            },
            required: ["summaryAnalysis", "goodPlay", "badPlay", "gtoMainTakeaway"]
          }
        }
      }));

      if (response.text) {
        const reviewData = JSON.parse(response.text.trim());
        return res.json({
          ...reviewData,
          isFallback: false
        });
      } else {
        throw new Error("Empty review from AI engine");
      }
    }

    // Determine target prompt based on context
    const isPostflop = board.length >= 3;
    const systemInstruction = `You are a world-class No-Limit Texas Hold'em poker strategy consultant and GTO (Game Theory Optimal) coach. 
Your objective is to evaluate Heads-Up action spots ($1/$2 Blinds, $100 effective stacks) and provide high-fidelity strategic analysis.
CRITICAL FORMATTING & CONTENT RULES:
1. You MUST always use card suit emojis (♥️, ♦️, ♣️, ♠️) instead of letters (h, d, c, s or H, D, C, S) or words (hearts, diamonds, clubs, spades) when describing specific cards, hands, or suits in "coachComments" or "handStrengthEvaluation". For example, represent the Ace of spades as A♠️, King of hearts as K♥️, or pocket 10s with hearts as 10♥️.
2. Trim all "coachComments" to be extremely brief, concise, and highly readable (max 2 sentences). Avoid verbose paragraphs.
3. The strategy percentages in "actionBreakdown" (fold, call, raise) MUST sum to exactly 100%.
4. If the most recommended or highest percentage option in "actionBreakdown" is Call/Check but "raise" is 20% or greater, you MUST explicitly include a brief mention and theory breakdown of the Raise option in "coachComments". Explain when, why, and given what specific holdings or board texture we might favor a raise (e.g. wet textured boards or fold equity lever).
5. CRITICAL STRATEGIC FOCUS: In "handStrengthEvaluation" and "coachComments", do NOT simply use generic terms like "holding a pair" or "you have one pair". Instead, you MUST analyze and describe:
- The exact relative strength category of the hand relative to the active board (e.g., is it Top Pair Top Kicker, Mid-Pair with Ace-Kicker, Bottom Pair, Overpair, Underpair, or board-paired High Card).
- The kicker card itself (e.g., "A♥️ kicker", "weak 4♠️ kicker") and why that kicker is critical or marginal for bluff-catching or thin-value betting in this range situation.
- The precise suit relationships and details (e.g., active flush draws you hold, backdoor flush potential, holding blockers of the board's dominant suits, or defending against a wet/suited board runout) and how those specific suits impact your GTO equity realization.
Be highly analytical, talk about range topology (polarized vs merged), blocker and unblocker effects, stack-to-pot ratio (SPR), and MDF (Minimum Defense Frequency) when postflop, or preflop opening frequencies.`;

    const userPrompt = `Analyze the following poker situation:
- Game Type: heads-up No-Limit Texas Hold'em ($1/$2 blinds)
- Current Hand Stage: ${stage}
- Board Cards: ${boardCardsStr}
- Player's Hand: ${userCardsStr} (Evaluated Hand Strength: ${userHandEvalName})
- Computer (Opponent's) Hand: ${opponentCardsStr} (Evaluated Hand Strength: ${opponentHandEvalName})
- Current Pot: $${potSize}
- Committed Bet this Round: $${currentBet}
- Player's Stack Remaining: $${userStack}
- Computer's Stack Remaining: $${computerStack}
- Actions Taken So Far:\n${actionsTranscript}

Provide a deep strategic review. What is the GTO action?
For "recommendedAction" use simple terms (e.g. "Check", "Call $X", "Raise/Bet to $X", "Fold").
For "actionBreakdown" provide reasonable percentages (e.g., Fold: 10, Call: 55, Raise: 35).
For "evs" calculate realistic expected profit of each action in big blinds (e.g. fold: 0.0, call: 1.5, raise: -0.5).
For "coachComments", provide 2-3 sentences of deep GTO theory rationale for this action.
For "handStrengthEvaluation", summarize what we have (e.g., Pocket Kings, Nut Flush Draw, Top Pair Top Kicker).
For "rangeConcept", name the strategic theory context (e.g., "Range Advantage Value Bet", "Merged Bluff Catcher", "Polarized Check-Raise").

Also fill out:
- "rangeOverallStrategy" with overall Check-Fold, Check-Call, and Bet-Raise percentages for our entire strategy range.
- "rangeRawEquity" as the average range-versus-range equity of Hero (out of 100).
- "rangeEQR" as the equity realization percentage of Hero's range (typically 80 to 120, where >100 is IP position/strength).
- "rangeHandCategories" as the hand-strength category split representing Hero's entire starting/range topology.
- "macroStats" with current Pot, SPR, ranges equity advantage analysis.`;

    // Fetch response with Gemini 3.5-flash
    const response = await callWithRetry(() => client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedAction: { type: Type.STRING },
            actionBreakdown: {
              type: Type.OBJECT,
              properties: {
                fold: { type: Type.NUMBER, description: "Fold percentage (0..100)" },
                call: { type: Type.NUMBER, description: "Call percentage (0..100)" },
                raise: { type: Type.NUMBER, description: "Raise/Bet percentage (0..100)" },
              },
              required: ["fold", "call", "raise"],
            },
            evs: {
              type: Type.OBJECT,
              properties: {
                fold: { type: Type.NUMBER, description: "Expected Value of Fold in Big Blinds (0.0)" },
                call: { type: Type.NUMBER, description: "Expected Value of Call/Check in Big Blinds" },
                raise: { type: Type.NUMBER, description: "Expected Value of Raise/Bet in Big Blinds" },
              },
              required: ["fold", "call", "raise"],
            },
            coachComments: { type: Type.STRING, description: "Deep strategic evaluation and explanation" },
            handStrengthEvaluation: { type: Type.STRING, description: "Actual card strength explanation" },
            rangeConcept: { type: Type.STRING, description: "Poker core strategy terminology" },
            rangeOverallStrategy: {
              type: Type.OBJECT,
              properties: {
                checkFold: { type: Type.NUMBER, description: "Check-Fold percentage for the entire range (0..100)" },
                checkCall: { type: Type.NUMBER, description: "Check-Call percentage for the entire range (0..100)" },
                betRaise: { type: Type.NUMBER, description: "Bet-Raise percentage for the entire range (0..100)" },
              },
              required: ["checkFold", "checkCall", "betRaise"],
            },
            rangeRawEquity: { type: Type.NUMBER, description: "The raw equity percentage for user entire range (0..100)" },
            rangeEQR: { type: Type.NUMBER, description: "The Equity Realization EQR percentage (typically 70..130)" },
            rangeHandCategories: {
              type: Type.OBJECT,
              properties: {
                overpairs: { type: Type.NUMBER, description: "Percentage of overpairs in range (0..100)" },
                topPairs: { type: Type.NUMBER, description: "Percentage of top pairs in range (0..100)" },
                midPairs: { type: Type.NUMBER, description: "Percentage of mid pairs in range (0..100)" },
                draws: { type: Type.NUMBER, description: "Percentage of draws in range (0..100)" },
                air: { type: Type.NUMBER, description: "Percentage of air/nothing in range (0..100)" },
              },
              required: ["overpairs", "topPairs", "midPairs", "draws", "air"],
            },
            macroStats: {
              type: Type.OBJECT,
              properties: {
                spr: { type: Type.NUMBER, description: "Stack-to-Pot Ratio based on current pot size and user stack" },
                equityAdvantage: { type: Type.STRING, description: "Who has equity advantage: 'Hero', 'Villain' or 'Equal'" },
                nutAdvantage: { type: Type.STRING, description: "Who has nut advantage: 'Hero', 'Villain' or 'Equal'" },
                heroRangeEquity: { type: Type.NUMBER, description: "Hero overall hand range equity percentage (0..100)" },
                villainRangeEquity: { type: Type.NUMBER, description: "Villain overall hand range equity percentage (0..100)" },
              },
              required: ["spr", "equityAdvantage", "nutAdvantage", "heroRangeEquity", "villainRangeEquity"],
            },
          },
          required: [
            "recommendedAction",
            "actionBreakdown",
            "evs",
            "coachComments",
            "handStrengthEvaluation",
            "rangeConcept",
            "rangeOverallStrategy",
            "rangeRawEquity",
            "rangeEQR",
            "rangeHandCategories",
            "macroStats",
          ],
        },
      },
    }));

    if (response.text) {
      const gtoData = JSON.parse(response.text.trim());
      return res.json({
        ...gtoData,
        isFallback: false
      });
    } else {
      throw new Error("Empty response from AI engine");
    }
  } catch (err: any) {
    console.warn("Notice: GTO Advice/Review generation using mathematical fallback model... Details:", err?.message || err);
    // Return high quality fallback
    const { userHand = [], board = [], stage = "PREFLOP", currentBet = 0, potSize = 0, actionSpot = "COACH_ADVICE", score = 100, userHandRankType = 0, userHandEvalName = "High Card" } = req.body;
    
    if (actionSpot === "HAND_REVIEW") {
      const calculatedScore = score ?? 100;
      let summaryAnalysis = `Hand resolved at stage ${stage}. Final pot reached $${potSize}.`;
      let goodPlay = "Matched standard GTO lines where checking and folding kept variance low.";
      let badPlay = "Few minor inaccuracies on betting sizes, but no extreme EV blunders identified.";
      let gtoMainTakeaway = "Configure GEMINI_API_KEY in the Secrets panel to unlock live street-by-street AI coaching feedback.";

      if (calculatedScore < 70) {
        goodPlay = "Selected passive check lines on select streets to limit potential losses.";
        badPlay = "Several high-regret decisions spotted. Aggressive bets with nothing or folding powerful made hands leaks chips.";
        gtoMainTakeaway = "Configure GEMINI_API_KEY in the Secrets panel to unlock live street-by-street AI coaching feedback.";
      }

      return res.json({
        summaryAnalysis,
        goodPlay,
        badPlay,
        gtoMainTakeaway,
        isFallback: true
      });
    }

    const localEvaluation = getLocalHeuristics(userHand, board, stage, currentBet, potSize, userHandRankType, userHandEvalName);
    return res.json({
      ...localEvaluation,
      isFallback: true,
      error: err.message || "An issue occurred, used local simulation."
    });
  }
});

// Helper to analyze user's pair/combos relative to board, kicker strength and suit/draw effects
function describeHandRelation(
  hand: any[], 
  board: any[], 
  stage: string, 
  evalName: string, 
  rankType: number
): { description: string; assessment: string } {
  if (hand.length < 2) {
    return { description: evalName, assessment: "Waiting for cards to deal." };
  }

  const suitsDisplay: Record<string, string> = { H: "♥️", D: "♦️", C: "♣️", S: "♠️" };
  const getCardStr = (c: any) => `${c.rank}${suitsDisplay[c.suit] || c.suit}`;

  const c1 = hand[0];
  const c2 = hand[1];

  if (board.length === 0) {
    if (c1.value === c2.value) {
      const pocketStr = `${c1.rank}${suitsDisplay[c1.suit]}${c2.rank}${suitsDisplay[c2.suit]}`;
      return {
        description: `Pocket Pair of ${c1.rank}s (${pocketStr})`,
        assessment: `An extremely strong pre-deal pocket pair. Preflop GTO models heavily favor raising to isolate opponents and extract pure range equity.`
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
}

// A local poker analyzer to make sure we always have working GTO values when offline or missing keys
function getLocalHeuristics(
  userHand: any[], 
  board: any[], 
  stage: string, 
  currentBet: number, 
  potSize: number, 
  userHandRankType: number = 0, 
  userHandEvalName: string = "High Card"
) {
  const sprValue = potSize > 0 ? parseFloat((100 / potSize).toFixed(1)) : 50.0;

  // Preflop heuristics
  if (stage === "PREFLOP") {
    if (userHand.length < 2) {
      return {
        recommendedAction: "Check",
        actionBreakdown: { fold: 10, call: 90, raise: 0 },
        evs: { fold: 0.0, call: 0.1, raise: 0.0 },
        coachComments: "Waiting for cards to deal. Check or wait.",
        handStrengthEvaluation: "No cards dealt",
        rangeConcept: "Idle pre-deal check",
        rangeOverallStrategy: { checkFold: 20, checkCall: 60, betRaise: 20 },
        rangeRawEquity: 50.0,
        rangeEQR: 100,
        rangeHandCategories: { overpairs: 2, topPairs: 10, midPairs: 15, draws: 15, air: 58 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 50.0, villainRangeEquity: 50.0 }
      };
    }

    const c1 = userHand[0];
    const c2 = userHand[1];
    const highVal = Math.max(c1.value, c2.value);
    const lowVal = Math.min(c1.value, c2.value);
    const isPair = c1.value === c2.value;
    const isSuited = c1.suit === c2.suit;

    if (isPair) {
      if (highVal >= 10) {
        // AA, KK, QQ, JJ, TT
        return {
          recommendedAction: `Raise to $6`,
          actionBreakdown: { fold: 0, call: 15, raise: 85 },
          evs: { fold: 0.0, call: 4.8, raise: 7.2 },
          coachComments: "Premium pocket pairs represent our highest value preflop opening values. We should raise to build a pot immediately and leverage equity primacy.",
          handStrengthEvaluation: `Premium Pocket Pair of ${c1.rank}s`,
          rangeConcept: "Linear Value Opening Advantage",
          rangeOverallStrategy: { checkFold: 10, checkCall: 45, betRaise: 45 },
          rangeRawEquity: 58.7,
          rangeEQR: 112,
          rangeHandCategories: { overpairs: 15, topPairs: 10, midPairs: 10, draws: 10, air: 55 },
          macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Hero", heroRangeEquity: 58.7, villainRangeEquity: 41.3 }
        };
      } else {
        // Medium/Low pair
        return {
          recommendedAction: "Call $2",
          actionBreakdown: { fold: 5, call: 70, raise: 25 },
          evs: { fold: 0.0, call: 2.1, raise: 1.8 },
          coachComments: "Medium Pocket pairs have high set-mining potential. We want to play these to see flops cheap or raise occasionally as a tactical mixture.",
          handStrengthEvaluation: `Mid Pocket Pair of ${c1.rank}s`,
          rangeConcept: "Set Mining Speculative Range",
          rangeOverallStrategy: { checkFold: 15, checkCall: 55, betRaise: 30 },
          rangeRawEquity: 52.4,
          rangeEQR: 102,
          rangeHandCategories: { overpairs: 5, topPairs: 12, midPairs: 18, draws: 10, air: 55 },
          macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Equal", heroRangeEquity: 52.4, villainRangeEquity: 47.6 }
        };
      }
    }

    if (highVal === 14 || (highVal >= 12 && lowVal >= 10)) {
      // Strong high cards Ace, Broadways K/Q/J
      return {
        recommendedAction: "Raise to $5",
        actionBreakdown: { fold: 5, call: 35, raise: 60 },
        evs: { fold: 0.0, call: 1.8, raise: 3.4 },
        coachComments: "Strong broadways represent excellent high-card advantage pre-flop. We raise to clean out weaker ranges and capture preflop momentum.",
        handStrengthEvaluation: `Strong Broadway ${c1.rank}${c2.rank}`,
        rangeConcept: "Broadway Dominance Strategy",
        rangeOverallStrategy: { checkFold: 12, checkCall: 48, betRaise: 40 },
        rangeRawEquity: 55.2,
        rangeEQR: 106,
        rangeHandCategories: { overpairs: 3, topPairs: 20, midPairs: 15, draws: 12, air: 50 },
        macroStats: { spr: sprValue, equityAdvantage: "Hero", nutAdvantage: "Equal", heroRangeEquity: 55.2, villainRangeEquity: 44.8 }
      };
    }

    if (isSuited && highVal - lowVal <= 4) {
      // Suited connectors e.g. 89s, TJs
      return {
        recommendedAction: "Call $2",
        actionBreakdown: { fold: 10, call: 70, raise: 20 },
        evs: { fold: 0.0, call: 1.5, raise: 1.1 },
        coachComments: "Suited connectors work incredibly well in heads-up play due to postflop flexibility. Standard flat call or light 3-bet spot to balance bluff ratios.",
        handStrengthEvaluation: `Suited Connected ${c1.rank}${c2.rank}s`,
        rangeConcept: "Implied Odds Speculative Range",
        rangeOverallStrategy: { checkFold: 18, checkCall: 52, betRaise: 30 },
        rangeRawEquity: 51.1,
        rangeEQR: 108,
        rangeHandCategories: { overpairs: 1, topPairs: 8, midPairs: 12, draws: 25, air: 54 },
        macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 51.1, villainRangeEquity: 48.9 }
      };
    }

    // Weak cards
    if (highVal <= 8) {
      return {
        recommendedAction: "Fold",
        actionBreakdown: { fold: 85, call: 10, raise: 5 },
        evs: { fold: 0.0, call: -1.2, raise: -2.0 },
        coachComments: "Low unsuited trash represents negative equity in Heads-Up play. GTO folds these values OOP to minimize defensive leakage.",
        handStrengthEvaluation: `Trashy Offsuit ${c1.rank}${c2.rank}o`,
        rangeConcept: "Range Restructuring Folds",
        rangeOverallStrategy: { checkFold: 45, checkCall: 40, betRaise: 15 },
        rangeRawEquity: 38.5,
        rangeEQR: 82,
        rangeHandCategories: { overpairs: 0, topPairs: 4, midPairs: 10, draws: 8, air: 78 },
        macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 38.5, villainRangeEquity: 61.5 }
      };
    }

    // Default preflop
    return {
      recommendedAction: "Call $2",
      actionBreakdown: { fold: 20, call: 60, raise: 20 },
      evs: { fold: 0.0, call: 0.8, raise: 0.5 },
      coachComments: "This hand falls in the moderate class. Calling or flatting are highly standard balanced options to keep our defense wide.",
      handStrengthEvaluation: `Offsuit high card ${c1.rank}${c2.rank}o`,
      rangeConcept: "Default Marginal Defense",
      rangeOverallStrategy: { checkFold: 20, checkCall: 55, betRaise: 25 },
      rangeRawEquity: 48.2,
      rangeEQR: 95,
      rangeHandCategories: { overpairs: 1, topPairs: 12, midPairs: 14, draws: 10, air: 63 },
      macroStats: { spr: sprValue, equityAdvantage: "Equal", nutAdvantage: "Equal", heroRangeEquity: 48.2, villainRangeEquity: 51.8 }
    };
  }

  // Postflop simple heuristics using mathematically calculated hand ranks passed from client
  const hasOpponentBet = currentBet > 0;
  
  const isVeryStrong = userHandRankType >= 4; // Straight, Flush, Full House, Quads, Straight Flush
  const isModerate = userHandRankType >= 1 && userHandRankType <= 3; // One Pair, Two Pair, Three of a Kind

  const handAnalysis = describeHandRelation(userHand, board, stage, userHandEvalName, userHandRankType);

  if (isVeryStrong) {
    return {
      recommendedAction: hasOpponentBet ? `Raise/Bet to $${Math.round(potSize * 0.75 + currentBet)}` : "Bet/Raise",
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

  return {
    recommendedAction: hasOpponentBet ? "Fold" : "Check",
    actionBreakdown: hasOpponentBet ? { fold: 70, call: 20, raise: 10 } : { fold: 0, call: 80, raise: 20 },
    evs: hasOpponentBet ? { fold: 0.0, call: -0.5, raise: -1.0 } : { fold: 0.0, call: 0.4, raise: 0.2 },
    coachComments: `In ${stage}, we do not connect with the board. Folding to bets prevents unprofitable leaks while checking down lets us realize equity for free.`,
    handStrengthEvaluation: "Low Card Air/Nothing",
    rangeConcept: "Polarized Range Folding Node",
    rangeOverallStrategy: { checkFold: 40, checkCall: 40, betRaise: 20 },
    rangeRawEquity: 44.5,
    rangeEQR: 90,
    rangeHandCategories: { overpairs: 2, topPairs: 10, midPairs: 12, draws: 16, air: 60 },
    macroStats: { spr: sprValue, equityAdvantage: "Villain", nutAdvantage: "Villain", heroRangeEquity: 44.5, villainRangeEquity: 55.5 }
  };
}

// Setup Vite and static assets compilation
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
