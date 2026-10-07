import React, { useState, useMemo } from "react";
import {
  SlidersHorizontal,
  RotateCcw,
  BookmarkPlus,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Zap,
  CheckCircle2,
  Lock,
  ChevronDown,
  MapPin,
  CreditCard,
  Brain
} from "lucide-react";
import { calculateTransactionRisk, getRecommendedAction, type RiskLevel, type TransactionRecord } from "../lib/riskEngine";
import { MCC_OPTIONS } from "../lib/mccList";
import { predictRisk } from "../lib/mlInference";

interface Props {
  realTransactions: TransactionRecord[];
  onOpenDetail?: (tx: TransactionRecord) => void;
  mlReady?: boolean;
}

interface SavedScenario {
  id: string;
  timestamp: string;
  title: string;
  amount: number;
  channel: string;
  mccDesc: string;
  score: number;
  level: RiskLevel;
  action: string;
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function RiskSimulatorView({ realTransactions, mlReady = false }: Props) {
  // Simulator input state
  const [amount, setAmount] = useState<number>(1450);
  const [channel, setChannel] = useState<string>("Swipe Transaction");
  const [mcc, setMcc] = useState<string>("4829");
  const [error, setError] = useState<string>("Bad CVV");
  const [isCrossState, setIsCrossState] = useState<boolean>(true);

  // Card attributes
  const [cardBrand, setCardBrand] = useState<string>("Visa");
  const [cardType, setCardType] = useState<string>("Credit");
  const [creditLimit, setCreditLimit] = useState<number>(5000);
  const [hasChip, setHasChip] = useState<boolean>(true);
  const [darkWeb, setDarkWeb] = useState<boolean>(false);

  // Cardholder profile
  const [creditScore, setCreditScore] = useState<number>(640);
  const [userIncome, setUserIncome] = useState<number>(54000);
  const [userDebt, setUserDebt] = useState<number>(24000);

  // Comparison baseline (initial state score)
  const [baselineScore, setBaselineScore] = useState<number>(35);

  // Saved scenarios
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([
    {
      id: "SCEN-01",
      timestamp: "10:14 AM",
      title: "P2P Money Transfer Spike",
      amount: 4500,
      channel: "Online Transaction",
      mccDesc: "Money Transfer",
      score: 84,
      level: "Critical",
      action: "HARD DECLINE & BLOCK CARD"
    },
    {
      id: "SCEN-02",
      timestamp: "10:22 AM",
      title: "Grocery EMV Prime Cardholder",
      amount: 85,
      channel: "Chip Transaction",
      mccDesc: "Grocery Stores",
      score: 14,
      level: "Low",
      action: "AUTO-APPROVE TRANSACTION"
    }
  ]);

  const defaultMcc = { code: "5411", name: "Grocery Stores", riskTier: "normal" as const };
  const selectedMccOption = MCC_OPTIONS.find((m) => m.code === mcc) ?? defaultMcc;

  // Calculate live risk with the engine
  const calculation = calculateTransactionRisk({
    amount,
    channel,
    mcc,
    mccDesc: selectedMccOption.name,
    error: error === "None" ? null : error,
    isCrossState,
    card: {
      brand: cardBrand,
      type: cardType,
      creditLimit,
      hasChip,
      darkWeb
    },
    user: {
      creditScore,
      income: userIncome,
      debt: userDebt
    }
  });

  const recommendation = getRecommendedAction(calculation.level);
  const delta = calculation.score - baselineScore;

  // ML prediction for the current simulator state
  const mlPrediction = useMemo(() => {
    if (!mlReady) return null;
    return predictRisk({
      amount,
      channel,
      mcc,
      error: error === "None" ? null : error,
      card: { creditLimit, hasChip, darkWeb },
      user: { creditScore, income: userIncome, debt: userDebt },
    });
  }, [mlReady, amount, channel, mcc, error, creditLimit, hasChip, darkWeb, creditScore, userIncome, userDebt]);

  // Blended final score (60% ML + 40% rule-based)
  const displayScore = mlPrediction
    ? Math.round(0.60 * mlPrediction.riskScore + 0.40 * calculation.score)
    : calculation.score;

  // Preset Handlers
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case "darkweb":
        setAmount(3850);
        setChannel("Online Transaction");
        setMcc("5944"); // Jewelry
        setError("Bad CVV");
        setDarkWeb(true);
        setHasChip(true);
        setIsCrossState(true);
        setCreditLimit(5000);
        setCreditScore(610);
        break;
      case "wire":
        setAmount(14200);
        setChannel("Online Transaction");
        setMcc("4829"); // Money transfer
        setError("None");
        setDarkWeb(false);
        setCreditLimit(10000);
        setCreditScore(680);
        setIsCrossState(false);
        break;
      case "skimming":
        setAmount(600);
        setChannel("Swipe Transaction");
        setMcc("5311"); // Department stores
        setError("Bad PIN");
        setHasChip(true);
        setDarkWeb(false);
        setIsCrossState(true);
        setCreditScore(700);
        break;
      case "microcharge":
        setAmount(0.49);
        setChannel("Online Transaction");
        setMcc("4722"); // Travel
        setError("None");
        setDarkWeb(false);
        setHasChip(true);
        setIsCrossState(false);
        break;
      case "legit":
        setAmount(74.5);
        setChannel("Chip Transaction");
        setMcc("5411"); // Grocery
        setError("None");
        setDarkWeb(false);
        setHasChip(true);
        setIsCrossState(false);
        setCreditLimit(15000);
        setCreditScore(785);
        setUserDebt(4000);
        break;
    }
  };

  const loadFromRealTransaction = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const txId = e.target.value;
    if (!txId) return;
    const tx = realTransactions.find((t) => t.id === txId);
    if (!tx) return;

    setAmount(tx.amount);
    setChannel(tx.channel);
    setMcc(tx.mcc || "5411");
    setError(tx.error || "None");
    setCardBrand(tx.card.brand);
    setCardType(tx.card.type);
    setCreditLimit(tx.card.creditLimit);
    setHasChip(tx.card.hasChip);
    setDarkWeb(tx.card.darkWeb);
    setCreditScore(tx.user.creditScore);
    setUserIncome(tx.user.income);
    setUserDebt(tx.user.debt);
    setIsCrossState(false);
    setBaselineScore(tx.score);
  };

  const handleSaveScenario = () => {
    const newScenario: SavedScenario = {
      id: `SCEN-0${savedScenarios.length + 1}`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      title: `${channel.replace(" Transaction", "")} at ${selectedMccOption.name.slice(0, 20)}`,
      amount,
      channel,
      mccDesc: selectedMccOption.name,
      score: calculation.score,
      level: calculation.level,
      action: recommendation.action
    };
    setSavedScenarios([newScenario, ...savedScenarios]);
  };

  const handleReset = () => {
    setAmount(100);
    setChannel("Chip Transaction");
    setMcc("5411");
    setError("None");
    setDarkWeb(false);
    setHasChip(true);
    setCreditLimit(5000);
    setCreditScore(720);
    setIsCrossState(false);
    setBaselineScore(calculation.score);
  };

  // Color according to score
  const scoreColor =
    calculation.score >= 80
      ? "var(--critical)"
      : calculation.score >= 60
      ? "var(--high)"
      : calculation.score >= 35
      ? "var(--medium)"
      : "var(--low)";

  // SVG Gauge calculations
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (calculation.score / 100) * circumference;

  return (
    <div className="view-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Top action and preset banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px" }}>
            Risk Simulation Studio
          </h2>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted-foreground)" }}>
            Full-screen what-if scenario testing & counterfactual risk evaluation against live ground-truth heuristics.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <select
            className="select-wrap"
            style={{ width: "220px", height: "34px", background: "var(--card)", cursor: "pointer" }}
            onChange={loadFromRealTransaction}
            defaultValue=""
          >
            <option value="" disabled>
              Load from Real Dataset...
            </option>
            {realTransactions.slice(0, 30).map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} — {t.card.brand} ({moneyFormatter.format(t.amount)})
              </option>
            ))}
          </select>
          <button className="button button-outline" onClick={handleReset}>
            <RotateCcw size={14} /> Reset
          </button>
          <button className="button button-primary" onClick={handleSaveScenario}>
            <BookmarkPlus size={14} /> Save Scenario
          </button>
        </div>
      </div>

      {/* Quick Scenario Preset Chips */}
      <div className="preset-bar">
        <span style={{ fontSize: "11px", color: "var(--muted-foreground)", marginRight: "4px" }}>
          <Sparkles size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "3px" }} /> Test Presets:
        </span>
        <button className="preset-btn" onClick={() => applyPreset("darkweb")}>
          ⚠️ Credential Dump / Dark Web
        </button>
        <button className="preset-btn" onClick={() => applyPreset("wire")}>
          💸 High-Value Wire Breach
        </button>
        <button className="preset-btn" onClick={() => applyPreset("skimming")}>
          🏧 Skimming Magnetic Fallback
        </button>
        <button className="preset-btn" onClick={() => applyPreset("microcharge")}>
          🤖 Bot Micro-Charge Testing
        </button>
        <button className="preset-btn" onClick={() => applyPreset("legit")}>
          ✓ Low-Risk EMV Chip Purchase
        </button>
      </div>

      {/* 3-Column Full-Screen Grid Layout */}
      <div className="sim-fullscreen-grid">
        {/* Column 1: Transaction & Channel Parameters */}
        <div className="sim-column">
          <div className="sim-card">
            <div className="sim-card-header">
              <h3><Zap size={14} color="var(--primary)" /> Transaction Parameters</h3>
              <span>Core Transaction</span>
            </div>

            {/* Amount with quick chips */}
            <div className="field">
              <span>Transaction Amount (USD)</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="0"
                step="10"
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                {[25, 250, 1500, 5000, 15000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="preset-btn"
                    style={{ padding: "2px 7px", fontSize: "10px" }}
                    onClick={() => setAmount(v)}
                  >
                    ${v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel */}
            <div className="field">
              <span>Payment Channel / Presentation</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="Swipe Transaction">Swipe Transaction (Magnetic Stripe)</option>
                <option value="Online Transaction">Online Transaction (Card-Not-Present CNP)</option>
                <option value="Chip Transaction">Chip Transaction (EMV Contactless/Insert)</option>
              </select>
            </div>

            {/* Merchant Category (MCC) */}
            <div className="field">
              <span>Merchant Category Code (MCC)</span>
              <select value={mcc} onChange={(e) => setMcc(e.target.value)}>
                {MCC_OPTIONS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name} {m.riskTier === "high" ? "⚡ (High Risk)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Injected Error */}
            <div className="field">
              <span>Injected Security Error / Fault</span>
              <select value={error} onChange={(e) => setError(e.target.value)}>
                <option value="None">None (Clean Authorization)</option>
                <option value="Bad CVV">Bad CVV (Card Security Code Mismatch)</option>
                <option value="Bad PIN">Bad PIN (Terminal PIN Failure)</option>
                <option value="Bad Expiration">Bad Expiration (Expired or Mismatched Date)</option>
                <option value="Bad Card Number">Bad Card Number (Checksum Failure)</option>
                <option value="Insufficient Balance">Insufficient Balance (Declined)</option>
                <option value="Technical Glitch">Technical Glitch (Hardware Interruption)</option>
              </select>
            </div>

            {/* Cross State Toggle */}
            <label className="toggle-label" style={{ margin: "6px 0", padding: "8px 0" }}>
              <input
                type="checkbox"
                checked={isCrossState}
                onChange={(e) => setIsCrossState(e.target.checked)}
              />
              <span className="toggle" />
              <span>Cross-State Geographic Anomaly</span>
            </label>
          </div>
        </div>

        {/* Column 2: Card & Cardholder Profile */}
        <div className="sim-column">
          <div className="sim-card">
            <div className="sim-card-header">
              <h3><CreditCard size={14} color="var(--primary)" /> Card Instrument & Account</h3>
              <span>Issuer Profile</span>
            </div>

            <div className="field-group">
              <div className="field">
                <span>Card Brand</span>
                <select value={cardBrand} onChange={(e) => setCardBrand(e.target.value)}>
                  <option value="Visa">Visa</option>
                  <option value="Mastercard">Mastercard</option>
                  <option value="Amex">American Express</option>
                  <option value="Discover">Discover</option>
                </select>
              </div>

              <div className="field">
                <span>Card Type</span>
                <select value={cardType} onChange={(e) => setCardType(e.target.value)}>
                  <option value="Credit">Credit</option>
                  <option value="Debit">Debit</option>
                  <option value="Debit (Prepaid)">Prepaid Debit</option>
                </select>
              </div>
            </div>

            <div className="field">
              <span>Card Credit Limit</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(Number(e.target.value))}
                  style={{ width: "100px" }}
                />
                <input
                  type="range"
                  min="500"
                  max="35000"
                  step="500"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(Number(e.target.value))}
                  className="sim-slider"
                />
              </div>
            </div>

            {/* Dark Web Breach Toggle */}
            <div
              style={{
                background: darkWeb ? "color-mix(in oklch, var(--critical) 12%, transparent)" : "var(--background)",
                border: `1px solid ${darkWeb ? "var(--critical)" : "var(--border)"}`,
                padding: "12px",
                borderRadius: "var(--radius)",
                transition: "all 0.2s"
              }}
            >
              <label className="toggle-label" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={darkWeb}
                  onChange={(e) => setDarkWeb(e.target.checked)}
                />
                <span className="toggle" />
                <div style={{ marginLeft: "8px" }}>
                  <strong style={{ color: darkWeb ? "var(--critical)" : "var(--foreground)", fontSize: "11px" }}>
                    Card Compromised on Dark Web
                  </strong>
                  <p style={{ margin: "2px 0 0", fontSize: "10px", color: "var(--muted-foreground)" }}>
                    Simulate cardholder credentials found in threat intel breach database.
                  </p>
                </div>
              </label>
            </div>

            <label className="toggle-label" style={{ margin: "2px 0" }}>
              <input
                type="checkbox"
                checked={hasChip}
                onChange={(e) => setHasChip(e.target.checked)}
              />
              <span className="toggle" />
              <span>Card Has EMV Chip Enabled</span>
            </label>
          </div>

          {/* Cardholder Credit Profile */}
          <div className="sim-card">
            <div className="sim-card-header">
              <h3><Layers size={14} color="var(--primary)" /> Cardholder Profile</h3>
              <span>Financial Baseline</span>
            </div>

            <div className="slider-container">
              <div className="slider-header">
                <span>Credit Score: <strong>{creditScore} / 850</strong></span>
                <span style={{ fontSize: "10px", color: creditScore >= 740 ? "var(--low)" : creditScore < 600 ? "var(--critical)" : "var(--medium)" }}>
                  {creditScore >= 740 ? "Prime / Excellent" : creditScore >= 670 ? "Good" : creditScore >= 580 ? "Fair" : "Subprime"}
                </span>
              </div>
              <input
                type="range"
                min="350"
                max="850"
                value={creditScore}
                onChange={(e) => setCreditScore(Number(e.target.value))}
                className="sim-slider"
              />
            </div>

            <div className="field-group">
              <div className="field">
                <span>Annual Income ($)</span>
                <input
                  type="number"
                  value={userIncome}
                  onChange={(e) => setUserIncome(Number(e.target.value))}
                  step="1000"
                />
              </div>
              <div className="field">
                <span>Total Debt ($)</span>
                <input
                  type="number"
                  value={userDebt}
                  onChange={(e) => setUserDebt(Number(e.target.value))}
                  step="1000"
                />
              </div>
            </div>
            <div style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
              Debt-to-Income Ratio: <strong>{userIncome > 0 ? ((userDebt / userIncome) * 100).toFixed(0) : 0}%</strong>
            </div>
          </div>
        </div>

        {/* Column 3: Live Output, Gauge, Recommendation & Explainability */}
        <div className="sim-column">
          {/* Animated Gauge Card */}
          <div className="gauge-card">
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {mlPrediction ? "Hybrid ML + Rule Engine" : "Active Rule Engine Evaluation"}
            </span>

            {/* Circular Gauge */}
            <div className="gauge-wrapper">
              <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  stroke="var(--secondary)"
                  strokeWidth="10"
                  fill="transparent"
                />
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  stroke={scoreColor}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
                />
              </svg>
              <div className="gauge-score-display">
                <span className="gauge-score-num" style={{ color: scoreColor }}>
                  {calculation.score}
                </span>
                <span className="gauge-score-sub">{calculation.level} Risk</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
              <span className={`risk-badge risk-${calculation.level.toLowerCase()}`}>
                <span className="risk-dot" /> {calculation.level} Tier
              </span>
              <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                Fraud Probability: <strong>{calculation.fraudProbability}%</strong>
              </span>
            </div>

            {/* ML Score breakdown */}
            {mlPrediction ? (
              <div className="sim-ml-scores">
                <div className="sim-ml-row">
                  <span className="sim-ml-label"><Brain size={11} /> XGBoost</span>
                  <div className="sim-ml-bar-wrap">
                    <div className="sim-ml-bar sim-ml-bar-xgb" style={{ width: `${mlPrediction.xgbScore * 100}%` }} />
                  </div>
                  <span className="sim-ml-val">{(mlPrediction.xgbScore * 100).toFixed(0)}%</span>
                </div>
                <div className="sim-ml-row">
                  <span className="sim-ml-label">Isolation Forest</span>
                  <div className="sim-ml-bar-wrap">
                    <div className="sim-ml-bar sim-ml-bar-if" style={{ width: `${mlPrediction.ifScore * 100}%` }} />
                  </div>
                  <span className="sim-ml-val">{(mlPrediction.ifScore * 100).toFixed(0)}%</span>
                </div>
                <div className="sim-ml-row">
                  <span className="sim-ml-label">Hybrid Score</span>
                  <div className="sim-ml-bar-wrap">
                    <div className="sim-ml-bar sim-ml-bar-hybrid" style={{ width: `${mlPrediction.hybridScore * 100}%` }} />
                  </div>
                  <span className="sim-ml-val">{mlPrediction.riskScore}/100</span>
                </div>
                <div className="sim-ml-confidence">
                  Confidence: <strong>{mlPrediction.confidence}</strong>
                  {mlPrediction.isFraudPredicted ? " · 🚨 Fraud Predicted" : " · ✅ Legitimate Predicted"}
                </div>
              </div>
            ) : (
              <div className="sim-ml-loading">
                <Brain size={12} /> ML Engine loading… scores will appear shortly
              </div>
            )}
          </div>

          {/* Action Recommendation */}
          <div className={`rec-box ${recommendation.badgeClass}`}>
            <div className="rec-header">
              <span className="rec-title">{recommendation.action}</span>
              {calculation.level === "Critical" ? (
                <ShieldAlert size={16} />
              ) : calculation.level === "High" ? (
                <AlertTriangle size={16} />
              ) : calculation.level === "Medium" ? (
                <Lock size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
            </div>
            <p className="rec-desc">{recommendation.description}</p>
          </div>

          {/* Delta Comparison Box */}
          <div className="comparison-box">
            <div>
              <span style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>Compared to Baseline</span>
              <div style={{ fontWeight: "600", fontSize: "12px", marginTop: "2px" }}>
                Baseline: {baselineScore} pts → Current: {calculation.score} pts
              </div>
            </div>
            <span className={`delta-tag ${delta > 0 ? "up" : delta < 0 ? "down" : "same"}`}>
              {delta > 0 ? (
                <>
                  <TrendingUp size={12} /> +{delta} pts
                </>
              ) : delta < 0 ? (
                <>
                  <TrendingDown size={12} /> {delta} pts
                </>
              ) : (
                "0 pts (No Change)"
              )}
            </span>
          </div>

          {/* Score Contributors Explainability */}
          <div className="sim-card">
            <div className="sim-card-header">
              <h3><Layers size={14} color="var(--primary)" /> Risk Factors Triggered ({calculation.reasons.length})</h3>
              <span>Weight Breakdown</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
              {calculation.reasons.map((r, i) => (
                <div className="reason" key={i} style={{ margin: "4px 0" }}>
                  <div
                    className="reason-points"
                    style={{
                      background: r.points < 0 ? "color-mix(in oklch, var(--low) 15%, transparent)" : undefined,
                      color: r.points < 0 ? "var(--low)" : undefined
                    }}
                  >
                    {r.points > 0 ? `+${r.points}` : r.points}
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: "11px" }}>{r.label}</strong>
                    <p style={{ fontSize: "10px" }}>{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Simulations Session Log */}
      {savedScenarios.length > 0 && (
        <div className="panel" style={{ marginTop: "12px" }}>
          <div className="panel-heading">
            <div>
              <h2>Saved What-If Scenarios (Session History)</h2>
              <p>Compare recorded test outcomes side-by-side</p>
            </div>
            <button onClick={() => setSavedScenarios([])}>Clear All</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Time</th>
                  <th>Scenario Description</th>
                  <th>Amount</th>
                  <th>Channel</th>
                  <th>Risk Score</th>
                  <th>Status Tier</th>
                  <th>Recommended Policy Action</th>
                </tr>
              </thead>
              <tbody>
                {savedScenarios.map((s) => (
                  <tr key={s.id}>
                    <td className="id-cell">{s.id}</td>
                    <td className="mono">{s.timestamp}</td>
                    <td><strong>{s.title}</strong></td>
                    <td className="amount-cell">{moneyFormatter.format(s.amount)}</td>
                    <td><span className="type-pill">{s.channel}</span></td>
                    <td>
                      <div className="score-cell">
                        <strong>{s.score}</strong>
                        <span><i style={{ width: `${s.score}%` }} /></span>
                      </div>
                    </td>
                    <td><span className={`risk-badge risk-${s.level.toLowerCase()}`}><span className="risk-dot" />{s.level}</span></td>
                    <td><span style={{ fontSize: "11px", fontWeight: "600" }}>{s.action}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
