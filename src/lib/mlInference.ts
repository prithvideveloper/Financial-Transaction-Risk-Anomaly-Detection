/**
 * Sentinel ML Inference Engine
 * Client-side XGBoost + Isolation Forest inference using pre-trained model weights
 * All computation runs in the browser — zero data transmitted externally
 */

export interface HybridPrediction {
  xgbScore: number;          // XGBoost fraud probability [0-1]
  ifScore: number;           // Isolation Forest anomaly score [0-1]
  hybridScore: number;       // Weighted ensemble score [0-1]
  riskScore: number;         // Final risk score [0-100]
  isFraudPredicted: boolean; // Threshold-based binary prediction
  confidence: "High" | "Medium" | "Low";
  featureValues: number[];   // Extracted feature vector
  topDrivers: { feature: string; value: number; importance: number }[];
}

export interface MLModelStatus {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  metadata?: {
    xgbAuc: number;
    hybridF1: number;
    hybridAuc: number;
    numTrees: number;
    trainedAt: string;
    featureImportance: { name: string; importance: number }[];
  };
}

// ─── Feature extraction (must match training script exactly) ─────────────────
const HIGH_RISK_MCC = new Set([
  "4829","7801","7995","6051","5944","5094","4722","7996","5813","3780","4814","7802"
]);

const ERROR_SEVERITY_MAP: Record<string, number> = {
  "bad card number": 4,
  "bad cvv": 3,
  "bad pin": 3,
  "bad expiration": 2,
  "insufficient balance": 2,
  "technical glitch": 1,
};

export const FEATURE_NAMES = [
  "log_amount",
  "amount_limit_ratio",
  "is_online",
  "is_swipe",
  "chip_swipe_anomaly",
  "has_error",
  "error_severity",
  "high_risk_mcc",
  "inv_credit_score",
  "debt_income_ratio",
  "dark_web_compromise",
  "micro_charge_probe",
  "amount_log_sq",
  "limit_log",
  "error_online_interact",
];

export function extractMLFeatures(input: {
  amount: number;
  channel: string;
  mcc?: string;
  error?: string | null;
  card?: { creditLimit?: number; hasChip?: boolean; darkWeb?: boolean };
  user?: { creditScore?: number; income?: number; debt?: number };
}): number[] {
  const amt = Math.abs(input.amount || 0);
  const limit = Math.max(input.card?.creditLimit || 5000, 1);
  const income = Math.max(input.user?.income || 50000, 1);
  const debt = Math.max(input.user?.debt || 0, 0);
  const creditScore = input.user?.creditScore || 700;
  const err = (input.error || "").toLowerCase();
  const channel = (input.channel || "").toLowerCase();
  const mcc = String(input.mcc || "");
  const hasChip = input.card?.hasChip || false;
  const isOnline = channel.includes("online") ? 1 : 0;
  const isSwipe = channel.includes("swipe") ? 1 : 0;

  let errSev = 0;
  for (const [pattern, sev] of Object.entries(ERROR_SEVERITY_MAP)) {
    if (err.includes(pattern)) errSev = Math.max(errSev, sev);
  }

  const logAmt = Math.log1p(amt);
  const hasError = err.length > 0 ? 1 : 0;

  return [
    logAmt,                                                    // 0
    Math.min(amt / limit, 10.0),                               // 1
    isOnline,                                                  // 2
    isSwipe,                                                   // 3
    hasChip && isSwipe ? 1 : 0,                                // 4
    hasError,                                                  // 5
    errSev / 4.0,                                              // 6
    HIGH_RISK_MCC.has(mcc) ? 1 : 0,                           // 7
    Math.min(Math.max((760 - creditScore) / 450, 0), 1),       // 8
    Math.min(debt / income, 8.0),                              // 9
    input.card?.darkWeb ? 1 : 0,                               // 10
    amt < 1.0 && isOnline ? 1 : 0,                             // 11
    (logAmt * logAmt) / 100.0,                                 // 12
    Math.log1p(limit) / 10.0,                                  // 13
    hasError * isOnline,                                        // 14
  ];
}

// ─── Tree traversal functions ─────────────────────────────────────────────────

type XGBNode =
  | { isLeaf: true; weight: number }
  | { isLeaf: false; feature: number; threshold: number; left: XGBNode; right: XGBNode };

type IFNode =
  | { isLeaf: true; size: number }
  | { isLeaf: false; feature: number; threshold: number; left: IFNode; right: IFNode };

function sigmoid(x: number): number {
  if (x > 30) return 1 - 1e-9;
  if (x < -30) return 1e-9;
  return 1 / (1 + Math.exp(-x));
}

function traverseXGB(node: XGBNode, features: number[]): number {
  if (node.isLeaf) return node.weight;
  const feat = (node as { isLeaf: false; feature: number; threshold: number; left: XGBNode; right: XGBNode });
  return (features[feat.feature] ?? 0) <= feat.threshold
    ? traverseXGB(feat.left, features)
    : traverseXGB(feat.right, features);
}

function expectedPathLength(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const EULER_MASCHERONI = 0.5772156649;
  return 2 * (Math.log(n - 1) + EULER_MASCHERONI) - 2 * (n - 1) / n;
}

function traverseIF(node: IFNode, features: number[], depth: number): number {
  if (node.isLeaf) return depth + expectedPathLength(node.size);
  const n = (node as { isLeaf: false; feature: number; threshold: number; left: IFNode; right: IFNode });
  return (features[n.feature] ?? 0) <= n.threshold
    ? traverseIF(n.left, features, depth + 1)
    : traverseIF(n.right, features, depth + 1);
}

// ─── Model state ─────────────────────────────────────────────────────────────

interface XGBModel {
  trees: XGBNode[];
  eta: number;
  baseScore: number;
  featureNames: string[];
  metadata: {
    aucRoc: number;
    f1: number;
    optimalThreshold: number;
    featureImportance: { name: string; importance: number }[];
  };
}

interface IFModel {
  trees: IFNode[];
  subsampleSize: number;
  metadata: { aucRoc: number; optimalThreshold: number };
}

interface HybridMeta {
  weights: { xgboost: number; isolationForest: number };
  hybridThreshold: number;
  scoreNormalization: { riskBands: { low: number; medium: number; high: number; critical: number } };
  metrics: { aucRoc: number; f1: number; precision: number; recall: number; accuracy: number };
}

let xgbModel: XGBModel | null = null;
let ifModel: IFModel | null = null;
let hybridMeta: HybridMeta | null = null;
let modelStatus: MLModelStatus = { loaded: false, loading: false, error: null };

export function getModelStatus(): MLModelStatus {
  return { ...modelStatus };
}

// ─── Load models from public/models/ ─────────────────────────────────────────

export async function loadMLModels(): Promise<void> {
  if (modelStatus.loaded || modelStatus.loading) return;
  modelStatus = { loaded: false, loading: true, error: null };

  try {
    const [xgbRes, ifRes, metaRes] = await Promise.all([
      fetch("/models/xgboost_model.json"),
      fetch("/models/isolation_forest.json"),
      fetch("/models/hybrid_meta.json"),
    ]);

    if (!xgbRes.ok) throw new Error(`XGBoost model load failed: ${xgbRes.status}`);
    if (!ifRes.ok)  throw new Error(`Isolation Forest load failed: ${ifRes.status}`);
    if (!metaRes.ok) throw new Error(`Hybrid meta load failed: ${metaRes.status}`);

    [xgbModel, ifModel, hybridMeta] = await Promise.all([
      xgbRes.json(),
      ifRes.json(),
      metaRes.json(),
    ]);

    modelStatus = {
      loaded: true,
      loading: false,
      error: null,
      metadata: {
        xgbAuc: xgbModel!.metadata.aucRoc,
        hybridF1: hybridMeta!.metrics.f1,
        hybridAuc: hybridMeta!.metrics.aucRoc,
        numTrees: xgbModel!.trees.length + ifModel!.trees.length,
        trainedAt: xgbModel!.metadata.featureImportance ? new Date().toISOString() : new Date().toISOString(),
        featureImportance: xgbModel!.metadata.featureImportance,
      },
    };

    console.log(`[ML] Models loaded — XGB AUC: ${xgbModel!.metadata.aucRoc}, Hybrid F1: ${hybridMeta!.metrics.f1}`);
  } catch (err: any) {
    modelStatus = { loaded: false, loading: false, error: String(err?.message || err) };
    console.error("[ML] Model load failed:", err);
  }
}

// ─── Inference ────────────────────────────────────────────────────────────────

export function predictRisk(input: {
  amount: number;
  channel: string;
  mcc?: string;
  error?: string | null;
  card?: { creditLimit?: number; hasChip?: boolean; darkWeb?: boolean };
  user?: { creditScore?: number; income?: number; debt?: number };
}): HybridPrediction | null {
  if (!xgbModel || !ifModel || !hybridMeta) return null;

  const features = extractMLFeatures(input);

  // ── XGBoost inference: sum of boosted tree outputs + sigmoid
  let rawScore = xgbModel.baseScore;
  for (const tree of xgbModel.trees) {
    rawScore += xgbModel.eta * traverseXGB(tree, features);
  }
  const xgbScore = sigmoid(rawScore);

  // ── Isolation Forest anomaly score
  const avgPathLen =
    ifModel.trees.reduce((sum, tree) => sum + traverseIF(tree, features, 0), 0) /
    ifModel.trees.length;
  const c = expectedPathLength(ifModel.subsampleSize);
  const ifScore = Math.pow(2, -avgPathLen / c);

  // ── Weighted hybrid ensemble
  const { xgboost: wXgb, isolationForest: wIF } = hybridMeta.weights;
  const hybridScore = wXgb * xgbScore + wIF * ifScore;

  // ── Convert to 0–100 risk scale
  const riskScore = Math.min(100, Math.round(hybridScore * 100));

  // ── Threshold-based binary prediction (optimized on training data)
  const isFraudPredicted = hybridScore >= hybridMeta.hybridThreshold;

  // ── Confidence from both model agreement
  const agreement = Math.abs(xgbScore - ifScore);
  const confidence: "High" | "Medium" | "Low" =
    agreement < 0.15 ? "High" : agreement < 0.30 ? "Medium" : "Low";

  // ── Top risk drivers from feature importance × feature activation
  const fi = xgbModel.metadata.featureImportance;
  const topDrivers: { feature: string; value: number; importance: number }[] = fi
    .map((f) => {
      const idx = FEATURE_NAMES.indexOf(f.name);
      return {
        feature: f.name,
        value: idx >= 0 ? (features[idx] ?? 0) : 0,
        importance: f.importance,
      };
    })
    .filter((d) => d.value > 0)
    .sort((a, b) => b.importance * b.value - a.importance * a.value)
    .slice(0, 5);

  return {
    xgbScore,
    ifScore,
    hybridScore,
    riskScore,
    isFraudPredicted,
    confidence,
    featureValues: features,
    topDrivers,
  };
}

// ─── Batch scoring utility ────────────────────────────────────────────────────

export function batchPredict(records: Array<{
  amount: number;
  channel: string;
  mcc?: string;
  error?: string | null;
  card?: { creditLimit?: number; hasChip?: boolean; darkWeb?: boolean };
  user?: { creditScore?: number; income?: number; debt?: number };
}>): (HybridPrediction | null)[] {
  return records.map((r) => predictRisk(r));
}

// ─── Risk band from ML score ──────────────────────────────────────────────────

export function mlScoreToRiskLevel(riskScore: number): "Critical" | "High" | "Medium" | "Low" {
  if (!hybridMeta) {
    return riskScore >= 80 ? "Critical" : riskScore >= 60 ? "High" : riskScore >= 35 ? "Medium" : "Low";
  }
  const { low, medium, high, critical } = hybridMeta.scoreNormalization.riskBands;
  const s = riskScore / 100;
  if (s >= critical) return "Critical";
  if (s >= high)     return "High";
  if (s >= medium)   return "Medium";
  return "Low";
}
