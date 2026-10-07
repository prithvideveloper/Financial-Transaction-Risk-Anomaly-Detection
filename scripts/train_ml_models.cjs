/**
 * Sentinel ML Training Script
 * Implements XGBoost (Gradient Boosted Decision Trees) + Isolation Forest from scratch
 * Trains on the real financial dataset and exports serialized model weights to public/models/
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ==================== FEATURE ENGINEERING ====================

const HIGH_RISK_MCC = new Set(['4829','7801','7995','6051','5944','5094','4722','7996','5813','3780','4814','7802']);
const ERROR_SEVERITY_MAP = {
  'bad card number': 4,
  'bad cvv': 3,
  'bad pin': 3,
  'bad expiration': 2,
  'insufficient balance': 2,
  'technical glitch': 1,
};

const FEATURE_NAMES = [
  'log_amount',           // 0
  'amount_limit_ratio',   // 1
  'is_online',            // 2
  'is_swipe',             // 3
  'chip_swipe_anomaly',   // 4  chip card + swipe = high risk (skimming)
  'has_error',            // 5
  'error_severity',       // 6
  'high_risk_mcc',        // 7
  'inv_credit_score',     // 8  inverted so higher = worse
  'debt_income_ratio',    // 9
  'dark_web_compromise',  // 10
  'micro_charge_probe',   // 11
  'amount_log_sq',        // 12  quadratic interaction
  'limit_log',            // 13
  'error_online_interact',// 14  error × is_online
];

function extractFeatures(record) {
  const amt = Math.abs(record.amount || 0);
  const limit = Math.max(record.card?.creditLimit || 5000, 1);
  const income = Math.max(record.user?.income || 50000, 1);
  const debt = Math.max(record.user?.debt || 0, 0);
  const creditScore = record.user?.creditScore || 700;
  const err = (record.error || '').toLowerCase();
  const channel = (record.channel || '').toLowerCase();
  const mcc = String(record.mcc || '');
  const hasChip = record.card?.hasChip || false;
  const isOnline = channel.includes('online') ? 1 : 0;
  const isSwipe = channel.includes('swipe') ? 1 : 0;

  let errSev = 0;
  for (const [pattern, sev] of Object.entries(ERROR_SEVERITY_MAP)) {
    if (err.includes(pattern)) errSev = Math.max(errSev, sev);
  }

  const logAmt = Math.log1p(amt);
  const hasError = err.length > 0 ? 1 : 0;

  return [
    logAmt,                                        // 0
    Math.min(amt / limit, 10.0),                   // 1
    isOnline,                                      // 2
    isSwipe,                                       // 3
    (hasChip && isSwipe) ? 1 : 0,                  // 4
    hasError,                                      // 5
    errSev / 4.0,                                  // 6
    HIGH_RISK_MCC.has(mcc) ? 1 : 0,               // 7
    Math.min(Math.max((760 - creditScore) / 450, 0), 1), // 8
    Math.min(debt / income, 8.0),                  // 9
    (record.card?.darkWeb) ? 1 : 0,               // 10
    (amt < 1.0 && isOnline) ? 1 : 0,              // 11
    logAmt * logAmt / 100.0,                       // 12
    Math.log1p(limit) / 10.0,                      // 13
    hasError * isOnline,                            // 14
  ];
}

// ==================== SIGMOID ====================

function sigmoid(x) {
  if (x > 30) return 1 - 1e-9;
  if (x < -30) return 1e-9;
  return 1.0 / (1.0 + Math.exp(-x));
}

// ==================== XGBOOST IMPLEMENTATION ====================

/**
 * Build a single CART decision tree for XGBoost gradient boosting
 * Uses XGBoost's exact greedy split algorithm with gain-based pruning
 */
function buildXGBTree(dataX, grads, hess, depth, config) {
  const { maxDepth, lambda, gamma, minChildWeight } = config;
  const n = dataX.length;

  const G = grads.reduce((s, g) => s + g, 0.0);
  const H = hess.reduce((s, h) => s + h, 0.0);
  const leafWeight = -G / (H + lambda);

  // Base cases: max depth reached, too few samples, or total hessian too small
  if (depth >= maxDepth || n <= 2 || H < minChildWeight) {
    return { isLeaf: true, weight: leafWeight };
  }

  const nFeatures = dataX[0].length;
  let bestGain = gamma; // Minimum gain threshold (γ) for splitting
  let bestFeature = -1;
  let bestThreshold = 0.0;

  // Exhaustive search over all features and split points
  for (let f = 0; f < nFeatures; f++) {
    // Sort samples by feature f value
    const order = Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => dataX[a][f] - dataX[b][f]);

    let GL = 0.0;
    let HL = 0.0;

    for (let j = 0; j < n - 1; j++) {
      const idx = order[j];
      GL += grads[idx];
      HL += hess[idx];

      // Skip duplicate feature values
      const valCurr = dataX[order[j]][f];
      const valNext = dataX[order[j + 1]][f];
      if (Math.abs(valCurr - valNext) < 1e-10) continue;

      const GR = G - GL;
      const HR = H - HL;

      if (HL < minChildWeight || HR < minChildWeight) continue;

      // XGBoost split gain formula
      const gain = 0.5 * (
        (GL * GL) / (HL + lambda) +
        (GR * GR) / (HR + lambda) -
        (G * G) / (H + lambda)
      ) - gamma;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = (valCurr + valNext) / 2.0;
      }
    }
  }

  // No profitable split found → leaf
  if (bestFeature === -1) {
    return { isLeaf: true, weight: leafWeight };
  }

  // Partition data
  const leftMask = dataX.map(row => row[bestFeature] <= bestThreshold);
  const leftX = [], leftG = [], leftH = [];
  const rightX = [], rightG = [], rightH = [];
  for (let i = 0; i < n; i++) {
    if (leftMask[i]) { leftX.push(dataX[i]); leftG.push(grads[i]); leftH.push(hess[i]); }
    else              { rightX.push(dataX[i]); rightG.push(grads[i]); rightH.push(hess[i]); }
  }

  return {
    isLeaf: false,
    feature: bestFeature,
    threshold: parseFloat(bestThreshold.toFixed(6)),
    left: buildXGBTree(leftX, leftG, leftH, depth + 1, config),
    right: buildXGBTree(rightX, rightG, rightH, depth + 1, config),
  };
}

function xgbPredictTree(node, sample) {
  if (node.isLeaf) return node.weight;
  return sample[node.feature] <= node.threshold
    ? xgbPredictTree(node.left, sample)
    : xgbPredictTree(node.right, sample);
}

function xgbPredict(model, sample) {
  let score = model.baseScore;
  for (const tree of model.trees) {
    score += model.eta * xgbPredictTree(tree, sample);
  }
  return sigmoid(score);
}

/**
 * Train XGBoost binary classifier using binary log-loss
 */
function trainXGBoost(featureMatrix, labels, config) {
  const {
    numRounds = 60,
    maxDepth = 5,
    eta = 0.12,
    lambda = 1.5,
    gamma = 0.05,
    minChildWeight = 1.0,
  } = config;

  const n = featureMatrix.length;
  const fraudRate = labels.filter(l => l === 1).length / n;
  // Initialize base prediction with log-odds of training fraud rate
  const baseScore = Math.log(fraudRate / (1 - fraudRate));

  const rawPreds = new Array(n).fill(baseScore);
  const trees = [];
  const evalLog = [];

  const treeConfig = { maxDepth, lambda, gamma, minChildWeight };

  for (let round = 0; round < numRounds; round++) {
    // Compute gradient g_i = σ(ŷ_i) - y_i  and  hessian h_i = σ(ŷ_i)(1 - σ(ŷ_i))
    const grads = rawPreds.map((p, i) => sigmoid(p) - labels[i]);
    const hess  = rawPreds.map((p)    => { const s = sigmoid(p); return s * (1 - s); });

    const tree = buildXGBTree(featureMatrix, grads, hess, 0, treeConfig);
    trees.push(tree);

    for (let i = 0; i < n; i++) {
      rawPreds[i] += eta * xgbPredictTree(tree, featureMatrix[i]);
    }

    // Log every 10 rounds
    if (round % 10 === 0 || round === numRounds - 1) {
      const logloss = -labels.reduce((sum, y, i) => {
        const p = sigmoid(rawPreds[i]);
        return sum + y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9);
      }, 0) / n;
      evalLog.push({ round, logloss: +logloss.toFixed(5) });
      process.stdout.write(`  [XGB] Round ${String(round).padStart(3)}: log-loss = ${logloss.toFixed(5)}\n`);
    }
  }

  return { trees, eta, baseScore, evalLog };
}

// ==================== ISOLATION FOREST ====================

/**
 * Expected path length of unsuccessful search in BST (c(n))
 * Used to normalize anomaly scores
 */
function expectedPathLength(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const EULER_MASCHERONI = 0.5772156649;
  return 2 * (Math.log(n - 1) + EULER_MASCHERONI) - 2 * (n - 1) / n;
}

/**
 * Recursively build a single Isolation Tree
 */
function buildIsolationTree(data, depth, maxDepth) {
  const n = data.length;
  if (n <= 1 || depth >= maxDepth) {
    return { isLeaf: true, size: n };
  }

  const nFeatures = data[0].length;

  // Randomly select a feature
  const f = Math.floor(Math.random() * nFeatures);

  // Find range of feature f in this data partition
  let minVal = Infinity, maxVal = -Infinity;
  for (const row of data) {
    if (row[f] < minVal) minVal = row[f];
    if (row[f] > maxVal) maxVal = row[f];
  }

  if (minVal >= maxVal) {
    return { isLeaf: true, size: n };
  }

  // Random threshold in [min, max)
  const threshold = minVal + Math.random() * (maxVal - minVal);

  const left = [], right = [];
  for (const row of data) {
    (row[f] <= threshold ? left : right).push(row);
  }

  return {
    isLeaf: false,
    feature: f,
    threshold: parseFloat(threshold.toFixed(6)),
    left:  buildIsolationTree(left,  depth + 1, maxDepth),
    right: buildIsolationTree(right, depth + 1, maxDepth),
  };
}

/**
 * Get path length for a sample through an isolation tree
 * Longer path = less anomalous; shorter path = more anomalous
 */
function isolationPathLength(tree, sample, depth) {
  if (tree.isLeaf) {
    return depth + expectedPathLength(tree.size);
  }
  if (sample[tree.feature] <= tree.threshold) {
    return isolationPathLength(tree.left,  sample, depth + 1);
  }
  return isolationPathLength(tree.right, sample, depth + 1);
}

/**
 * Compute Isolation Forest anomaly score (0 = normal, 1 = most anomalous)
 */
function isolationAnomalyScore(ifModel, sample) {
  const { trees, subsampleSize } = ifModel;
  const avgLen = trees.reduce((sum, t) => sum + isolationPathLength(t, sample, 0), 0) / trees.length;
  const c = expectedPathLength(subsampleSize);
  return Math.pow(2, -avgLen / c);
}

/**
 * Train Isolation Forest (unsupervised anomaly detection)
 */
function trainIsolationForest(featureMatrix, nTrees = 80, subsampleSize = 200) {
  const maxDepth = Math.ceil(Math.log2(subsampleSize)) + 1;
  console.log(`  [IF] Building ${nTrees} trees, max depth = ${maxDepth}, subsample = ${subsampleSize}`);

  const trees = [];
  for (let t = 0; t < nTrees; t++) {
    // Random subsample without replacement
    const indices = Array.from({ length: featureMatrix.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const sampleData = indices.slice(0, subsampleSize).map(i => featureMatrix[i]);
    trees.push(buildIsolationTree(sampleData, 0, maxDepth));

    if ((t + 1) % 20 === 0) process.stdout.write(`  [IF] Built ${t + 1}/${nTrees} trees\n`);
  }

  return { trees, subsampleSize, maxDepth };
}

// ==================== EVALUATION UTILITIES ====================

function computeMetrics(probs, labels, threshold = 0.5) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  probs.forEach((p, i) => {
    const pred = p >= threshold ? 1 : 0;
    if (pred === 1 && labels[i] === 1) tp++;
    else if (pred === 1 && labels[i] === 0) fp++;
    else if (pred === 0 && labels[i] === 0) tn++;
    else fn++;
  });
  const precision = tp / Math.max(tp + fp, 1);
  const recall    = tp / Math.max(tp + fn, 1);
  const f1        = 2 * precision * recall / Math.max(precision + recall, 1e-9);
  const accuracy  = (tp + tn) / probs.length;
  return { tp, fp, tn, fn, precision, recall, f1, accuracy };
}

// Compute AUC-ROC using trapezoidal rule
function computeAUC(probs, labels) {
  const n = probs.length;
  const pairs = probs.map((p, i) => ({ p, y: labels[i] })).sort((a, b) => b.p - a.p);
  const nPos = labels.reduce((s, l) => s + l, 0);
  const nNeg = n - nPos;
  let tpCount = 0, fpCount = 0;
  let auc = 0;
  let prevFpr = 0, prevTpr = 0;
  for (const { p, y } of pairs) {
    if (y === 1) tpCount++;
    else fpCount++;
    const tpr = tpCount / nPos;
    const fpr = fpCount / nNeg;
    auc += (fpr - prevFpr) * (prevTpr + tpr) / 2;
    prevFpr = fpr; prevTpr = tpr;
  }
  return auc;
}

// Find optimal threshold using Youden's J (maximizes TPR - FPR)
function findOptimalThreshold(probs, labels) {
  const thresholds = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
  let bestJ = -1, bestThreshold = 0.5;
  for (const thresh of thresholds) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    probs.forEach((p, i) => {
      const pred = p >= thresh ? 1 : 0;
      if (pred === 1 && labels[i] === 1) tp++;
      else if (pred === 1 && labels[i] === 0) fp++;
      else if (pred === 0 && labels[i] === 1) fn++;
      else tn++;
    });
    const nPos = tp + fn;
    const nNeg = tn + fp;
    const J = (nPos > 0 && nNeg > 0) ? tp / nPos - fp / nNeg : 0;
    if (J > bestJ) { bestJ = J; bestThreshold = thresh; }
  }
  return bestThreshold;
}

// ==================== FEATURE IMPORTANCE ====================

function computeFeatureImportance(model, featureNames) {
  const scores = new Array(featureNames.length).fill(0);
  function walk(node) {
    if (node.isLeaf) return;
    scores[node.feature] = (scores[node.feature] || 0) + 1;
    walk(node.left);
    walk(node.right);
  }
  model.trees.forEach(walk);
  const total = scores.reduce((s, v) => s + v, 0) || 1;
  return featureNames.map((name, i) => ({
    name, importance: +(scores[i] / total).toFixed(4)
  })).sort((a, b) => b.importance - a.importance);
}

// ==================== MAIN ====================

console.log('\n════════════════════════════════════════════════════');
console.log('  SENTINEL  ·  ML Model Training Pipeline');
console.log('  XGBoost + Isolation Forest Hybrid System');
console.log('════════════════════════════════════════════════════\n');

// Load dataset
console.log('► Loading dataset...');
const records = JSON.parse(fs.readFileSync('public/dataset/transactions.json', 'utf8'));
console.log(`  Loaded ${records.length} real transaction records\n`);

// Extract features and labels
console.log('► Feature engineering...');
const featureMatrix = records.map(r => extractFeatures(r));
const labels = records.map(r => r.isFraud ? 1 : 0);
const fraudCount = labels.filter(l => l === 1).length;
const fraudRate = fraudCount / labels.length;
console.log(`  Features per sample   : ${featureMatrix[0].length}`);
console.log(`  Total samples         : ${records.length}`);
console.log(`  Fraud (positive)      : ${fraudCount} (${(fraudRate * 100).toFixed(1)}%)`);
console.log(`  Legitimate (negative) : ${records.length - fraudCount} (${((1 - fraudRate) * 100).toFixed(1)}%)`);
console.log(`  Feature names         : ${FEATURE_NAMES.join(', ')}\n`);

// ──────────────────────────────────────────────────────────────
//  TRAIN XGBoost
// ──────────────────────────────────────────────────────────────
console.log('► Training XGBoost (Gradient Boosted Trees) ...');
const xgbStartTime = Date.now();
const xgbModel = trainXGBoost(featureMatrix, labels, {
  numRounds: 70,
  maxDepth: 5,
  eta: 0.1,
  lambda: 1.5,
  gamma: 0.02,
  minChildWeight: 1.0,
});
const xgbTime = ((Date.now() - xgbStartTime) / 1000).toFixed(1);
console.log(`  Training time: ${xgbTime}s`);

// Evaluate XGBoost
const xgbProbs = featureMatrix.map(f => xgbPredict(xgbModel, f));
const xgbOptThreshold = findOptimalThreshold(xgbProbs, labels);
const xgbMetrics = computeMetrics(xgbProbs, labels, xgbOptThreshold);
const xgbAUC = computeAUC(xgbProbs, labels);
const xgbFeatureImportance = computeFeatureImportance(xgbModel, FEATURE_NAMES);

console.log(`\n  ── XGBoost Evaluation (threshold = ${xgbOptThreshold.toFixed(2)}) ──`);
console.log(`  AUC-ROC   : ${xgbAUC.toFixed(4)}`);
console.log(`  F1 Score  : ${xgbMetrics.f1.toFixed(4)}`);
console.log(`  Precision : ${xgbMetrics.precision.toFixed(4)}`);
console.log(`  Recall    : ${xgbMetrics.recall.toFixed(4)}`);
console.log(`  Accuracy  : ${xgbMetrics.accuracy.toFixed(4)}`);
console.log(`  TP=${xgbMetrics.tp}  FP=${xgbMetrics.fp}  TN=${xgbMetrics.tn}  FN=${xgbMetrics.fn}`);
console.log(`\n  Top Features:`);
xgbFeatureImportance.slice(0, 8).forEach((f, i) => {
  const bar = '█'.repeat(Math.round(f.importance * 60));
  console.log(`  ${String(i + 1).padStart(2)}. ${f.name.padEnd(22)} ${(f.importance * 100).toFixed(1).padStart(5)}%  ${bar}`);
});

// ──────────────────────────────────────────────────────────────
//  TRAIN Isolation Forest
// ──────────────────────────────────────────────────────────────
console.log('\n► Training Isolation Forest (Unsupervised Anomaly Detection) ...');
const ifStartTime = Date.now();
const ifModel = trainIsolationForest(featureMatrix, 80, 200);
const ifTime = ((Date.now() - ifStartTime) / 1000).toFixed(1);
console.log(`  Training time: ${ifTime}s`);

// Evaluate Isolation Forest
const ifScores = featureMatrix.map(f => isolationAnomalyScore(ifModel, f));
const ifOptThreshold = findOptimalThreshold(ifScores, labels);
const ifMetrics = computeMetrics(ifScores, labels, ifOptThreshold);
const ifAUC = computeAUC(ifScores, labels);

console.log(`\n  ── Isolation Forest Evaluation (threshold = ${ifOptThreshold.toFixed(2)}) ──`);
console.log(`  AUC-ROC   : ${ifAUC.toFixed(4)}`);
console.log(`  F1 Score  : ${ifMetrics.f1.toFixed(4)}`);
console.log(`  Precision : ${ifMetrics.precision.toFixed(4)}`);
console.log(`  Recall    : ${ifMetrics.recall.toFixed(4)}`);
console.log(`  Accuracy  : ${ifMetrics.accuracy.toFixed(4)}`);
console.log(`  TP=${ifMetrics.tp}  FP=${ifMetrics.fp}  TN=${ifMetrics.tn}  FN=${ifMetrics.fn}`);

// ──────────────────────────────────────────────────────────────
//  HYBRID ENSEMBLE
// ──────────────────────────────────────────────────────────────
console.log('\n► Evaluating Hybrid Ensemble (XGBoost 65% + Isolation Forest 35%) ...');
const hybridScores = featureMatrix.map((_, i) => 0.65 * xgbProbs[i] + 0.35 * ifScores[i]);
const hybridOptThreshold = findOptimalThreshold(hybridScores, labels);
const hybridMetrics = computeMetrics(hybridScores, labels, hybridOptThreshold);
const hybridAUC = computeAUC(hybridScores, labels);

console.log(`\n  ── Hybrid Ensemble Evaluation (threshold = ${hybridOptThreshold.toFixed(2)}) ──`);
console.log(`  AUC-ROC   : ${hybridAUC.toFixed(4)}`);
console.log(`  F1 Score  : ${hybridMetrics.f1.toFixed(4)}`);
console.log(`  Precision : ${hybridMetrics.precision.toFixed(4)}`);
console.log(`  Recall    : ${hybridMetrics.recall.toFixed(4)}`);
console.log(`  Accuracy  : ${hybridMetrics.accuracy.toFixed(4)}`);
console.log(`  TP=${hybridMetrics.tp}  FP=${hybridMetrics.fp}  TN=${hybridMetrics.tn}  FN=${hybridMetrics.fn}`);

// ──────────────────────────────────────────────────────────────
//  SCORE DISTRIBUTION ANALYSIS
// ──────────────────────────────────────────────────────────────
const fraudScores = hybridScores.filter((_, i) => labels[i] === 1);
const legitScores = hybridScores.filter((_, i) => labels[i] === 0);
const fraudMean = fraudScores.reduce((s, v) => s + v, 0) / fraudScores.length;
const legitMean = legitScores.reduce((s, v) => s + v, 0) / legitScores.length;
console.log(`\n  Hybrid Score Distribution:`);
console.log(`  Fraud mean score     : ${(fraudMean * 100).toFixed(1)}/100`);
console.log(`  Legitimate mean score: ${(legitMean * 100).toFixed(1)}/100`);

// ──────────────────────────────────────────────────────────────
//  SAVE MODEL ARTIFACTS
// ──────────────────────────────────────────────────────────────
console.log('\n► Saving model artifacts...');
const outDir = path.resolve('public/models');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const xgbArtifact = {
  modelType: 'xgboost_gradient_boosted_trees',
  trees: xgbModel.trees,
  eta: xgbModel.eta,
  baseScore: xgbModel.baseScore,
  numFeatures: FEATURE_NAMES.length,
  featureNames: FEATURE_NAMES,
  metadata: {
    trainedAt: new Date().toISOString(),
    numTrees: xgbModel.trees.length,
    numSamples: records.length,
    fraudRate: +fraudRate.toFixed(4),
    aucRoc: +xgbAUC.toFixed(4),
    f1: +xgbMetrics.f1.toFixed(4),
    precision: +xgbMetrics.precision.toFixed(4),
    recall: +xgbMetrics.recall.toFixed(4),
    optimalThreshold: +xgbOptThreshold.toFixed(3),
    featureImportance: xgbFeatureImportance,
  }
};

const ifArtifact = {
  modelType: 'isolation_forest_anomaly_detector',
  trees: ifModel.trees,
  subsampleSize: ifModel.subsampleSize,
  metadata: {
    trainedAt: new Date().toISOString(),
    numTrees: 80,
    numSamples: records.length,
    aucRoc: +ifAUC.toFixed(4),
    f1: +ifMetrics.f1.toFixed(4),
    optimalThreshold: +ifOptThreshold.toFixed(3),
  }
};

const hybridMeta = {
  ensembleType: 'xgboost_isolation_forest_hybrid',
  weights: { xgboost: 0.65, isolationForest: 0.35 },
  hybridThreshold: +hybridOptThreshold.toFixed(3),
  scoreNormalization: { min: 0, max: 1, riskBands: { low: 0.2, medium: 0.45, high: 0.65, critical: 0.80 } },
  metrics: {
    aucRoc: +hybridAUC.toFixed(4),
    f1: +hybridMetrics.f1.toFixed(4),
    precision: +hybridMetrics.precision.toFixed(4),
    recall: +hybridMetrics.recall.toFixed(4),
    accuracy: +hybridMetrics.accuracy.toFixed(4),
  },
  featureNames: FEATURE_NAMES,
  trainedAt: new Date().toISOString(),
};

const xgbPath = path.join(outDir, 'xgboost_model.json');
const ifPath  = path.join(outDir, 'isolation_forest.json');
const metaPath = path.join(outDir, 'hybrid_meta.json');

fs.writeFileSync(xgbPath,  JSON.stringify(xgbArtifact));
fs.writeFileSync(ifPath,   JSON.stringify(ifArtifact));
fs.writeFileSync(metaPath, JSON.stringify(hybridMeta, null, 2));

const xgbSize = (fs.statSync(xgbPath).size / 1024).toFixed(1);
const ifSize  = (fs.statSync(ifPath).size / 1024).toFixed(1);

console.log(`  ✓ XGBoost model      → public/models/xgboost_model.json    (${xgbSize} KB)`);
console.log(`  ✓ Isolation Forest   → public/models/isolation_forest.json  (${ifSize} KB)`);
console.log(`  ✓ Hybrid metadata    → public/models/hybrid_meta.json`);

console.log('\n════════════════════════════════════════════════════');
console.log('  Training complete! Models ready for browser inference.');
console.log('════════════════════════════════════════════════════\n');
