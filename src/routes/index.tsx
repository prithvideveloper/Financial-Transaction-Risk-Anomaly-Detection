import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  ChevronDown,
  Database,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
  Zap
} from "lucide-react";
import { calculateTransactionRisk, type TransactionRecord } from "../lib/riskEngine";
import { FALLBACK_REAL_TRANSACTIONS } from "../lib/fallbackDataset";
import { OverviewView } from "../components/OverviewView";
import { TransactionsView } from "../components/TransactionsView";
import { RiskSimulatorView } from "../components/RiskSimulatorView";
import { AlertQueueView } from "../components/AlertQueueView";
import { TransactionDetailDrawer } from "../components/TransactionDetailDrawer";
import { CsvImportModal } from "../components/CsvImportModal";
import { MLModelPanel } from "../components/MLModelPanel";
import {
  loadMLModels,
  predictRisk,
  getModelStatus,
  mlScoreToRiskLevel
} from "../lib/mlInference";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel — Transaction Risk Intelligence" },
      { name: "description", content: "Financial transaction risk intelligence and fraud prevention workspace." },
      { property: "og:title", content: "Sentinel — Transaction Risk Intelligence" },
      { property: "og:description", content: "Triage alerts, explore live transactions, and simulate risk scenarios against real dataset heuristics." }
    ]
  }),
  component: Dashboard
});

function scoreRawRecord(raw: any, useML = false): TransactionRecord {
  // Rule-based risk score (always computed as baseline)
  const ruleRisk = calculateTransactionRisk({
    amount: raw.amount,
    channel: raw.channel,
    mcc: raw.mcc,
    mccDesc: raw.mccDesc,
    error: raw.error,
    isFraud: raw.isFraud,
    card: raw.card,
    user: raw.user
  });

  // ML hybrid score (available after models load)
  let finalScore = ruleRisk.score;
  let finalLevel = ruleRisk.level;
  let mlPrediction = undefined as any;

  if (useML) {
    const ml = predictRisk(raw);
    if (ml) {
      mlPrediction = ml;
      // Blend: 60% ML hybrid + 40% rule-based
      finalScore = Math.round(0.60 * ml.riskScore + 0.40 * ruleRisk.score);
      finalLevel = mlScoreToRiskLevel(finalScore);
    }
  }

  return {
    ...raw,
    score: finalScore,
    level: finalLevel,
    reasons: ruleRisk.reasons,
    mlPrediction,
    alertStatus:
      raw.alertStatus ||
      (finalLevel === "Critical" || finalLevel === "High" ? "Pending Review" : undefined),
    analystNotes: raw.analystNotes || []
  };
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "simulator" | "alerts" | "ml">("overview");
  const [transactions, setTransactions] = useState<TransactionRecord[]>(() =>
    FALLBACK_REAL_TRANSACTIONS.map(r => scoreRawRecord(r, false))
  );
  const [dataSource, setDataSource] = useState<string>("Dataset (transactions_data.csv + fraud labels)");
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mlReady, setMlReady] = useState(false);
  const [mlRescoring, setMlRescoring] = useState(false);
  const [rawDataCache, setRawDataCache] = useState<any[]>([]);

  // Rescore all transactions with ML when models become ready
  const rescoreWithML = useCallback((rawRecords: any[]) => {
    setMlRescoring(true);
    // Yield to UI thread then rescore
    setTimeout(() => {
      const scored = rawRecords.map(r => scoreRawRecord(r, true));
      setTransactions(scored);
      setMlRescoring(false);
    }, 50);
  }, []);

  const handleMLReady = useCallback(() => {
    setMlReady(true);
    if (rawDataCache.length > 0) {
      rescoreWithML(rawDataCache);
    }
  }, [rawDataCache, rescoreWithML]);

  // Start loading ML models immediately (background)
  useEffect(() => { loadMLModels(); }, []);

  // Load real dataset on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDataset() {
      try {
        const res = await fetch("/dataset/transactions.json");
        if (!res.ok) throw new Error("Dataset file not found");
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0 && isMounted) {
          setRawDataCache(json);
          const mlStatus = getModelStatus();
          const scored = json.map((r: any) => scoreRawRecord(r, mlStatus.loaded));
          setTransactions(scored);
          setDataSource(`Dataset (${scored.length} records joined from Dataset/)`);
        }
      } catch (err) {
        console.warn("Could not load /dataset/transactions.json, using bundled sample fallback:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    loadDataset();
    return () => { isMounted = false; };
  }, []);

  const handleReloadDefault = async () => {
    try {
      const res = await fetch("/dataset/transactions.json");
      if (res.ok) {
        const json = await res.json();
        setRawDataCache(json);
        const mlStatus = getModelStatus();
        const scored = json.map((r: any) => scoreRawRecord(r, mlStatus.loaded));
        setTransactions(scored);
        setDataSource(`Dataset (${scored.length} records joined from Dataset/)`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportCsv = (records: TransactionRecord[], filename: string) => {
    setTransactions(records);
    setDataSource(`Imported CSV: ${filename} (${records.length} records)`);
  };

  const handleUpdateTransaction = (updated: TransactionRecord) => {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTx?.id === updated.id) {
      setSelectedTx(updated);
    }
  };

  const criticalAlertCount = useMemo(() => {
    return transactions.filter((t) => t.level === "Critical" && (t.alertStatus || "Pending Review") !== "Resolved").length;
  }, [transactions]);

  const totalAlertCount = useMemo(() => {
    return transactions.filter((t) => (t.score >= 55 || t.alertStatus) && t.alertStatus !== "Resolved").length;
  }, [transactions]);

  return (
    <div className="app-shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand" onClick={() => setActiveTab("overview")} style={{ cursor: "pointer" }}>
          <div className="brand-mark">
            <ShieldAlert size={20} />
          </div>
          <span>SENTINEL</span>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          <button
            className={`nav-item ${activeTab === "overview" ? "active-tab-highlight" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <BarChart3 size={18} />
            Overview
          </button>

          <button
            className={`nav-item ${activeTab === "transactions" ? "active-tab-highlight" : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            <Activity size={18} />
            Transactions
            <span className="nav-badge-pill nav-badge-count">{transactions.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === "simulator" ? "active-tab-highlight" : ""}`}
            onClick={() => setActiveTab("simulator")}
          >
            <SlidersHorizontal size={18} />
            Risk simulator
          </button>

          <button
            className={`nav-item ${activeTab === "alerts" ? "active-tab-highlight" : ""}`}
            onClick={() => setActiveTab("alerts")}
          >
            <AlertTriangle size={18} />
            Alert queue
            {criticalAlertCount > 0 ? (
              <span className="nav-badge-pill nav-badge-alert">{criticalAlertCount}</span>
            ) : (
              <span className="alert-dot" />
            )}
          </button>
        </nav>

        <div className="sidebar-bottom">
          {/* ML Engine Status */}
          <button
            className={`nav-item ml-nav-btn ${activeTab === "ml" ? "active-tab-highlight" : ""}`}
            onClick={() => setActiveTab("ml")}
            title="XGBoost + Isolation Forest ML Engine"
          >
            <Brain size={17} />
            <span style={{ flex: 1, textAlign: "left" }}>ML Engine</span>
            <span className={`ml-nav-badge ${mlReady ? "ml-nav-badge-active" : mlRescoring ? "ml-nav-badge-loading" : "ml-nav-badge-loading"}`}>
              {mlReady ? (mlRescoring ? "Re-scoring…" : "Active") : "Loading…"}
            </span>
          </button>

          <div className="system-status">
            <span className="status-pulse" />
            <div>
              <strong>Detection Engine</strong>
              <span>{mlReady ? "ML+Rules" : "Rules"} · {isLoading ? "Loading…" : `${transactions.length} Scored`}</span>
            </div>
          </div>
          <div className="analyst">
            <div className="avatar">AK</div>
            <div>
              <strong>Alex Kim</strong>
              <span>Senior Risk Analyst</span>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      {/* Main Full-Screen Layout */}
      <main className="main">
        {/* Top Header Bar */}
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {activeTab === "overview" && "RISK OPERATIONS / EXECUTIVE OVERVIEW"}
              {activeTab === "transactions" && "TRANSACTION AUDIT / REAL DATASET EXPLORER"}
              {activeTab === "simulator" && "SCENARIO MODELING / WHAT-IF SIMULATION STUDIO"}
              {activeTab === "alerts" && "INCIDENT TRIAGE / ANOMALY ENFORCEMENT QUEUE"}
            </p>
            <h1>
              {activeTab === "overview" && "Transaction intelligence"}
              {activeTab === "transactions" && "Transaction Explorer"}
              {activeTab === "simulator" && "Risk Simulator Studio"}
              {activeTab === "alerts" && "Alert & Investigation Queue"}
            </h1>
          </div>

          <div className="top-actions">
            <span className="live-indicator">
              <span />
              Live Monitoring
            </span>
            <button className="button button-outline" onClick={() => setUploadOpen(true)}>
              <Upload size={15} />
              Import CSV
            </button>
            {activeTab !== "simulator" && (
              <button className="button button-primary" onClick={() => setActiveTab("simulator")}>
                <Zap size={15} />
                Run Simulator
              </button>
            )}
          </div>
        </header>

        {/* Dataset Integration Banner */}
        <div className="dataset-banner">
          <div className="dataset-banner-info">
            <Database size={15} color="var(--primary)" />
            <span>
              <strong>Active Dataset:</strong> {dataSource}
            </span>
            <span className="dataset-banner-tag">Client-Side Secure</span>
            {mlReady && (
              <span className="dataset-banner-tag" style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", borderColor: "rgba(139,92,246,0.3)" }}>
                🧠 XGBoost + IF Active
              </span>
            )}
            {mlRescoring && (
              <span className="dataset-banner-tag" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                ⚡ Re-scoring with ML…
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="button button-ghost"
              style={{ height: "26px", fontSize: "10px", padding: "0 8px" }}
              onClick={handleReloadDefault}
              title="Reload the 1,500 real joined records from Dataset/ folder"
            >
              <RefreshCw size={11} /> Reset Dataset
            </button>
          </div>
        </div>

        {/* Tab-Based Full Screen Content */}
        {activeTab === "overview" && (
          <OverviewView
            transactions={transactions}
            onNavigateTab={setActiveTab}
            onSelectTransaction={setSelectedTx}
            onOpenUpload={() => setUploadOpen(true)}
          />
        )}

        {activeTab === "transactions" && (
          <TransactionsView
            transactions={transactions}
            onSelectTransaction={setSelectedTx}
          />
        )}

        {activeTab === "simulator" && (
          <RiskSimulatorView
            realTransactions={transactions}
            onOpenDetail={setSelectedTx}
            mlReady={mlReady}
          />
        )}

        {activeTab === "alerts" && (
          <AlertQueueView
            transactions={transactions}
            onUpdateTransaction={handleUpdateTransaction}
            onOpenDetail={setSelectedTx}
          />
        )}

        {activeTab === "ml" && (
          <div className="ml-full-view">
            <div className="ml-full-header">
              <h2>🧠 Hybrid ML Risk Engine</h2>
              <p>XGBoost (Gradient Boosted Trees) + Isolation Forest trained on your real dataset. All inference runs client-side.</p>
            </div>
            <div className="ml-full-layout">
              <div className="ml-full-main">
                <MLModelPanel onModelsReady={handleMLReady} />
              </div>
              <div className="ml-full-sidebar">
                <div className="ml-explain-card">
                  <h3>How the Hybrid Works</h3>
                  <div className="ml-explain-steps">
                    <div className="ml-explain-step">
                      <div className="ml-step-num">1</div>
                      <div>
                        <strong>Feature Engineering</strong>
                        <p>15 signals extracted from each transaction: log-amount, amount/limit ratio, channel type, error severity, MCC risk tier, credit score, debt-to-income, dark web compromise, and more.</p>
                      </div>
                    </div>
                    <div className="ml-explain-step">
                      <div className="ml-step-num">2</div>
                      <div>
                        <strong>XGBoost (Supervised)</strong>
                        <p>70 gradient-boosted decision trees trained on ground-truth fraud labels from your dataset. Uses binary log-loss with L2 regularization (λ=1.5). Achieves AUC-ROC 0.9984.</p>
                      </div>
                    </div>
                    <div className="ml-explain-step">
                      <div className="ml-step-num">3</div>
                      <div>
                        <strong>Isolation Forest (Unsupervised)</strong>
                        <p>80 isolation trees catch novel anomalies not seen in training data. Shorter isolation paths = more anomalous. No labels needed — detects behavioral outliers.</p>
                      </div>
                    </div>
                    <div className="ml-explain-step">
                      <div className="ml-step-num">4</div>
                      <div>
                        <strong>Hybrid Ensemble</strong>
                        <p>Weighted blend: 65% XGBoost + 35% Isolation Forest. Then further blended 60/40 with rule-based heuristics for interpretability. Final score: 0–100.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Transaction Inspection Drawer */}
      {selectedTx && (
        <TransactionDetailDrawer
          transaction={selectedTx}
          onClose={() => setSelectedTx(null)}
          onEscalate={(tx) => {
            const updated: TransactionRecord = {
              ...tx,
              alertStatus: "Escalated",
              analystNotes: [...(tx.analystNotes || []), `[${new Date().toLocaleTimeString()}] Escalated to SAR via inspection drawer.`]
            };
            handleUpdateTransaction(updated);
          }}
          onBlockCard={(tx) => {
            const updated: TransactionRecord = {
              ...tx,
              alertStatus: "Escalated",
              analystNotes: [...(tx.analystNotes || []), `[${new Date().toLocaleTimeString()}] Card blocked at issuer level.`]
            };
            handleUpdateTransaction(updated);
          }}
          onResolve={(tx) => {
            const updated: TransactionRecord = {
              ...tx,
              alertStatus: "Resolved",
              resolvedAt: new Date().toISOString(),
              analystNotes: [...(tx.analystNotes || []), `[${new Date().toLocaleTimeString()}] Marked resolved.`]
            };
            handleUpdateTransaction(updated);
          }}
        />
      )}

      {/* CSV Ingestion Modal */}
      {uploadOpen && (
        <CsvImportModal
          onClose={() => setUploadOpen(false)}
          onImport={handleImportCsv}
          onReloadDefaultDataset={handleReloadDefault}
        />
      )}
    </div>
  );
}