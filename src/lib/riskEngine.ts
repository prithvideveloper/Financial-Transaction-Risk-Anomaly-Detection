export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface TransactionCard {
  id: string;
  brand: string;
  type: string;
  maskedNumber: string;
  expires: string;
  hasChip: boolean;
  creditLimit: number;
  darkWeb: boolean;
}

export interface TransactionUser {
  id: string;
  age: number;
  gender: string;
  address: string;
  income: number;
  debt: number;
  creditScore: number;
}

export interface RiskReason {
  label: string;
  points: number;
  detail: string;
}

export interface TransactionRecord {
  id: string;
  datasetId: string;
  date: string;
  amount: number;
  channel: string;
  merchantId: string;
  merchantCity: string;
  merchantState: string;
  zip: string;
  mcc: string;
  mccDesc: string;
  error: string | null;
  isFraud: boolean;
  card: TransactionCard;
  user: TransactionUser;
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
  alertStatus?: "Pending Review" | "Investigating" | "Escalated" | "Resolved" | "False Positive" | undefined;
  analystNotes?: string[] | undefined;
  resolvedAt?: string | undefined;
  actionTaken?: string | undefined;
}

export const HIGH_RISK_MCCS: Record<string, string> = {
  "4829": "Money Transfer",
  "7801": "Internet Gambling",
  "7995": "Betting & Casino Gaming",
  "6051": "Quasi Cash / Crypto / Foreign Currency",
  "5944": "Jewelry Stores",
  "5094": "Precious Stones and Metals",
  "4722": "Travel Agencies & Tour Operators",
  "7996": "Amusement Parks & Carnivals",
  "5813": "Drinking Places (Nightclubs & Bars)",
  "3780": "Computer Network Services"
};

export function calculateTransactionRisk(input: {
  amount: number;
  channel: string;
  mcc?: string;
  mccDesc?: string;
  error?: string | null;
  isFraud?: boolean;
  card?: Partial<TransactionCard>;
  user?: Partial<TransactionUser>;
  isCrossState?: boolean;
}): { score: number; level: RiskLevel; reasons: RiskReason[]; fraudProbability: number } {
  const reasons: RiskReason[] = [];
  let score = 12; // Base baseline

  // 1. Confirmed Fraud Training Label
  if (input.isFraud) {
    score += 42;
    reasons.push({
      label: "Supervised Anomaly Signature",
      points: 42,
      detail: "Matches confirmed fraudulent attack patterns in ground-truth dataset."
    });
  }

  // 2. Dark Web Breach
  if (input.card?.darkWeb) {
    score += 35;
    reasons.push({
      label: "Dark Web Compromise",
      points: 35,
      detail: "Card number identified in credential breach intelligence dumps."
    });
  }

  // 3. Error / Terminal Security Failures
  const err = (input.error || "").toLowerCase();
  if (err.includes("cvv")) {
    score += 28;
    reasons.push({
      label: "CVV Authentication Failure",
      points: 28,
      detail: "Card verification value mismatch during authorization."
    });
  }
  if (err.includes("pin")) {
    score += 26;
    reasons.push({
      label: "Invalid PIN Attempt",
      points: 26,
      detail: "Incorrect cardholder PIN entered at terminal."
    });
  }
  if (err.includes("expiration")) {
    score += 22;
    reasons.push({
      label: "Expired / Bad Expiration",
      points: 22,
      detail: "Presented card expiration does not match issuer records."
    });
  }
  if (err.includes("bad card number")) {
    score += 32;
    reasons.push({
      label: "Card Number Checksum Error",
      points: 32,
      detail: "Luhn checksum or bank identification number invalid."
    });
  }
  if (err.includes("insufficient")) {
    score += 16;
    reasons.push({
      label: "Insufficient Funds / Credit",
      points: 16,
      detail: "Transaction exceeded currently available balance or credit line."
    });
  }
  if (err.includes("glitch")) {
    score += 8;
    reasons.push({
      label: "POS Technical Glitch",
      points: 8,
      detail: "Terminal connection interrupted during cryptogram verification."
    });
  }

  // 4. Amount & Limit Utilization
  const amt = Math.abs(input.amount || 0);
  const limit = input.card?.creditLimit || 5000;
  if (limit > 0 && amt > limit) {
    score += 30;
    reasons.push({
      label: "Credit Limit Exceeded",
      points: 30,
      detail: `Charge amount ($${amt.toLocaleString()}) exceeds the card credit limit ($${limit.toLocaleString()}).`
    });
  } else if (limit > 0 && amt > limit * 0.8) {
    score += 18;
    reasons.push({
      label: "High Credit Utilization (>80%)",
      points: 18,
      detail: `Charge represents over 80% of card limit ($${limit.toLocaleString()}).`
    });
  }

  if (amt >= 5000) {
    score += 22;
    reasons.push({
      label: "High Value Threshold",
      points: 22,
      detail: "Transaction exceeds the $5,000 corporate review threshold."
    });
  } else if (amt >= 1000) {
    score += 12;
    reasons.push({
      label: "Elevated Value",
      points: 12,
      detail: "Transaction is in the upper quartile of typical consumer amounts."
    });
  } else if (amt > 0 && amt < 1.0 && (input.channel.toLowerCase().includes("online") || input.channel.toLowerCase().includes("web"))) {
    score += 20;
    reasons.push({
      label: "Micro-Charge Probing Pattern",
      points: 20,
      detail: `Nominal micro-charge ($${amt.toFixed(2)}) typical of automated card-testing bots.`
    });
  }

  // 5. Channel Security
  const channelLower = (input.channel || "").toLowerCase();
  if (input.card?.hasChip && channelLower.includes("swipe")) {
    score += 16;
    reasons.push({
      label: "Magnetic Fallback on Chip Card",
      points: 16,
      detail: "Magnetic stripe swipe used on a chip-enabled card (skimming vulnerability)."
    });
  } else if (channelLower.includes("online")) {
    score += 10;
    reasons.push({
      label: "Card-Not-Present (CNP)",
      points: 10,
      detail: "Online transaction conducted without physical terminal presence."
    });
  } else if (input.card?.hasChip && channelLower.includes("chip") && !err) {
    score -= 10;
    reasons.push({
      label: "EMV Cryptographic Validation",
      points: -10,
      detail: "Hardware chip encrypted dynamic cryptogram successfully authenticated."
    });
  }

  // 6. Merchant Category (MCC)
  const mccCode = input.mcc || "";
  if (HIGH_RISK_MCCS[mccCode]) {
    score += 20;
    reasons.push({
      label: `High-Risk MCC: ${HIGH_RISK_MCCS[mccCode]}`,
      points: 20,
      detail: `Merchant category (${mccCode}) exhibits elevated dispute and fraud loss metrics.`
    });
  }

  // 7. Cardholder Financial Profile
  const scoreUser = input.user?.creditScore;
  if (scoreUser && scoreUser < 580) {
    score += 15;
    reasons.push({
      label: "Subprime Credit Standing",
      points: 15,
      detail: `Cardholder credit score (${scoreUser}) indicates elevated default risk.`
    });
  } else if (scoreUser && scoreUser >= 760 && !input.isFraud && !err) {
    score -= 8;
    reasons.push({
      label: "Prime Cardholder Standing",
      points: -8,
      detail: `Cardholder has an established prime credit history (${scoreUser}).`
    });
  }

  const income = input.user?.income || 0;
  const debt = input.user?.debt || 0;
  if (income > 0 && debt > income * 2.2) {
    score += 12;
    reasons.push({
      label: "Excessive Debt-to-Income",
      points: 12,
      detail: `Cardholder total debt ($${debt.toLocaleString()}) exceeds 220% of annual income.`
    });
  }

  // 8. Cross-State Anomaly
  if (input.isCrossState) {
    score += 14;
    reasons.push({
      label: "Geographic Velocity Anomaly",
      points: 14,
      detail: "Merchant terminal location deviates from cardholder registered billing state."
    });
  }

  // Bound score
  score = Math.max(5, Math.min(100, Math.round(score)));

  const level: RiskLevel =
    score >= 80 ? "Critical" : score >= 60 ? "High" : score >= 35 ? "Medium" : "Low";

  if (reasons.length === 0) {
    reasons.push({
      label: "Standard Verification Baseline",
      points: 12,
      detail: "Transaction passed standard rules with no suspicious signals."
    });
  }

  const fraudProbability = Math.round(Math.min(99, Math.max(1, score * 0.94)));

  return { score, level, reasons, fraudProbability };
}

export function getRecommendedAction(level: RiskLevel): {
  action: string;
  type: "decline" | "review" | "stepup" | "approve";
  badgeClass: string;
  description: string;
} {
  switch (level) {
    case "Critical":
      return {
        action: "HARD DECLINE & BLOCK CARD",
        type: "decline",
        badgeClass: "action-critical",
        description: "Immediate transaction decline, account suspension, and automated SMS cardholder alert."
      };
    case "High":
      return {
        action: "HOLD FOR FRAUD ANALYST REVIEW",
        type: "review",
        badgeClass: "action-high",
        description: "Place authorization on a 15-minute verification hold for manual analyst clearance."
      };
    case "Medium":
      return {
        action: "STEP-UP 2FA AUTHENTICATION",
        type: "stepup",
        badgeClass: "action-medium",
        description: "Prompt user for biometric authorization or one-time SMS verification code."
      };
    case "Low":
    default:
      return {
        action: "AUTO-APPROVE TRANSACTION",
        type: "approve",
        badgeClass: "action-low",
        description: "Transaction cleared for instant settlement without user friction."
      };
  }
}
