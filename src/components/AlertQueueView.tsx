import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  ArrowUpRight,
  User,
  CreditCard,
  MessageSquare,
  FileCheck,
  Lock,
  ChevronRight,
  Eye,
  Plus
} from "lucide-react";
import { type TransactionRecord } from "../lib/riskEngine";

interface Props {
  transactions: TransactionRecord[];
  onUpdateTransaction: (updated: TransactionRecord) => void;
  onOpenDetail: (tx: TransactionRecord) => void;
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function AlertQueueView({ transactions, onUpdateTransaction, onOpenDetail }: Props) {
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [search, setSearch] = useState<string>("");
  const [fraudOnly, setFraudOnly] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Deep-dive investigation modal state
  const [investigatingTx, setInvestigatingTx] = useState<TransactionRecord | null>(null);
  const [noteInput, setNoteInput] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filter only transactions with an alert status or score >= 60 (High/Critical)
  const alertList = useMemo(() => {
    return transactions.filter((t) => {
      // Must be at least Medium risk or have explicit alert status
      if (t.score < 50 && !t.alertStatus) return false;

      const currentStatus = t.alertStatus || "Pending Review";

      // Filters
      if (severityFilter !== "All" && t.level !== severityFilter) return false;
      if (statusFilter !== "All" && currentStatus !== statusFilter) return false;
      if (fraudOnly && !t.isFraud) return false;

      if (search.trim()) {
        const query = search.toLowerCase();
        const str = `${t.id} ${t.datasetId} ${t.card.maskedNumber} ${t.card.brand} ${t.merchantCity} ${t.mccDesc} ${t.error || ""}`.toLowerCase();
        if (!str.includes(query)) return false;
      }

      return true;
    });
  }, [transactions, severityFilter, statusFilter, fraudOnly, search]);

  // Aggregate KPI metrics
  const kpis = useMemo(() => {
    const allAlerts = transactions.filter((t) => t.score >= 50 || t.alertStatus);
    const critical = allAlerts.filter((t) => t.level === "Critical").length;
    const pending = allAlerts.filter((t) => (t.alertStatus || "Pending Review") === "Pending Review").length;
    const investigating = allAlerts.filter((t) => t.alertStatus === "Investigating").length;
    const escalated = allAlerts.filter((t) => t.alertStatus === "Escalated").length;
    const resolved = allAlerts.filter((t) => t.alertStatus === "Resolved" || t.alertStatus === "False Positive").length;
    const totalVolumeAtRisk = allAlerts.reduce((sum, t) => sum + (t.score >= 60 ? t.amount : 0), 0);

    return { total: allAlerts.length, critical, pending, investigating, escalated, resolved, totalVolumeAtRisk };
  }, [transactions]);

  // Individual Actions
  const handleSetStatus = (
    tx: TransactionRecord,
    newStatus: "Pending Review" | "Investigating" | "Escalated" | "Resolved" | "False Positive",
    actionNote?: string
  ) => {
    const updatedNotes = [...(tx.analystNotes || [])];
    if (actionNote) {
      updatedNotes.push(`[${new Date().toLocaleTimeString()}] ${actionNote}`);
    }

    const updated: TransactionRecord = {
      ...tx,
      alertStatus: newStatus,
      analystNotes: updatedNotes,
      resolvedAt: newStatus === "Resolved" || newStatus === "False Positive" ? new Date().toISOString() : tx.resolvedAt
    };

    onUpdateTransaction(updated);
    if (investigatingTx?.id === tx.id) {
      setInvestigatingTx(updated);
    }
    showToast(`Case ${tx.id} marked as "${newStatus}"`);
  };

  const handleBlockCard = (tx: TransactionRecord) => {
    handleSetStatus(tx, "Escalated", `Card ${tx.card.maskedNumber} permanently BLOCKED at issuer level. Alert sent to customer.`);
    showToast(`⛔ Card ${tx.card.maskedNumber} blocked and account frozen.`);
  };

  // Batch Actions
  const toggleSelectAll = () => {
    if (selectedIds.size === alertList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alertList.map((t) => t.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchResolve = () => {
    selectedIds.forEach((id) => {
      const tx = transactions.find((t) => t.id === id);
      if (tx) handleSetStatus(tx, "Resolved", "Batch marked resolved by analyst.");
    });
    setSelectedIds(new Set());
    showToast(`Resolved ${selectedIds.size} selected alerts.`);
  };

  const handleBatchEscalate = () => {
    selectedIds.forEach((id) => {
      const tx = transactions.find((t) => t.id === id);
      if (tx) handleSetStatus(tx, "Escalated", "Batch escalated to SAR compliance queue.");
    });
    setSelectedIds(new Set());
    showToast(`Escalated ${selectedIds.size} alerts to SAR queue.`);
  };

  const handleAddNote = () => {
    if (!investigatingTx || !noteInput.trim()) return;
    const updatedNotes = [...(investigatingTx.analystNotes || []), `[${new Date().toLocaleTimeString()}] ${noteInput.trim()}`];
    const updated: TransactionRecord = { ...investigatingTx, analystNotes: updatedNotes };
    onUpdateTransaction(updated);
    setInvestigatingTx(updated);
    setNoteInput("");
    showToast("Investigation note saved.");
  };

  return (
    <div className="view-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "var(--card)",
            border: "1px solid var(--primary)",
            padding: "12px 20px",
            borderRadius: "var(--radius)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "12px",
            fontWeight: "600",
            animation: "popIn 0.2s ease"
          }}
        >
          <CheckCircle size={16} color="var(--primary)" />
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div>
        <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px" }}>
          Fraud & Anomaly Alert Queue
        </h2>
        <p style={{ margin: 0, fontSize: "11px", color: "var(--muted-foreground)" }}>
          Full-screen incident triage workspace. Investigate flagged suspicious transactions, execute enforcement actions, and log regulatory SAR cases.
        </p>
      </div>

      {/* Top 5 KPI Strip */}
      <div className="alerts-kpi-grid">
        <div className="alert-kpi-card" style={{ borderLeft: "3px solid var(--critical)" }}>
          <span className="alert-kpi-title"><ShieldAlert size={13} color="var(--critical)" /> Critical Alerts</span>
          <span className="alert-kpi-value" style={{ color: "var(--critical)" }}>{kpis.critical}</span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Urgent · Auto-action required</span>
        </div>
        <div className="alert-kpi-card" style={{ borderLeft: "3px solid var(--high)" }}>
          <span className="alert-kpi-title"><AlertTriangle size={13} color="var(--high)" /> Pending Review</span>
          <span className="alert-kpi-value">{kpis.pending}</span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Awaiting analyst review</span>
        </div>
        <div className="alert-kpi-card" style={{ borderLeft: "3px solid var(--medium)" }}>
          <span className="alert-kpi-title"><Clock size={13} color="var(--medium)" /> In Investigation</span>
          <span className="alert-kpi-value">{kpis.investigating}</span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Active analyst case files</span>
        </div>
        <div className="alert-kpi-card" style={{ borderLeft: "3px solid var(--primary)" }}>
          <span className="alert-kpi-title"><FileCheck size={13} color="var(--primary)" /> Escalated to SAR</span>
          <span className="alert-kpi-value">{kpis.escalated}</span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Filed for regulatory review</span>
        </div>
        <div className="alert-kpi-card" style={{ borderLeft: "3px solid var(--low)" }}>
          <span className="alert-kpi-title"><CheckCircle size={13} color="var(--low)" /> Resolved / Cleared</span>
          <span className="alert-kpi-value">{kpis.resolved}</span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Completed cases</span>
        </div>
      </div>

      {/* Filters and Batch Actions Toolbar */}
      <div className="alerts-filter-bar">
        {/* Search */}
        <label className="search-field" style={{ width: "260px" }}>
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Alert ID, card last 4, error..."
          />
        </label>

        {/* Severity */}
        <label className="select-wrap">
          <Filter size={13} />
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            <option value="All">All Severities</option>
            <option value="Critical">Critical Only</option>
            <option value="High">High Only</option>
            <option value="Medium">Medium Only</option>
          </select>
        </label>

        {/* Status */}
        <label className="select-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Investigating">Investigating</option>
            <option value="Escalated">Escalated</option>
            <option value="Resolved">Resolved</option>
            <option value="False Positive">False Positive</option>
          </select>
        </label>

        {/* Fraud toggle */}
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={fraudOnly}
            onChange={(e) => setFraudOnly(e.target.checked)}
          />
          <span className="toggle" />
          <span>Ground Truth Fraud</span>
        </label>

        {/* Batch actions if items selected */}
        {selectedIds.size > 0 && (
          <div className="batch-actions-bar">
            <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--primary)" }}>
              {selectedIds.size} selected
            </span>
            <button className="button button-outline" style={{ height: "30px", fontSize: "11px" }} onClick={handleBatchResolve}>
              <CheckCircle size={12} /> Mark Resolved
            </button>
            <button className="button button-primary" style={{ height: "30px", fontSize: "11px" }} onClick={handleBatchEscalate}>
              <FileCheck size={12} /> Escalate SAR
            </button>
          </div>
        )}
      </div>

      {/* Main Alert Queue Table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: "36px" }}>
                  <input
                    type="checkbox"
                    checked={alertList.length > 0 && selectedIds.size === alertList.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Alert / Severity</th>
                <th>Transaction & Timestamp</th>
                <th>Card & Account</th>
                <th>Merchant & Category</th>
                <th>Amount</th>
                <th>Primary Risk Triggers</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alertList.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground)" }}>
                    No alerts matching current filters.
                  </td>
                </tr>
              ) : (
                alertList.slice(0, 100).map((tx) => {
                  const status = tx.alertStatus || "Pending Review";
                  const isSelected = selectedIds.has(tx.id);

                  return (
                    <tr
                      key={tx.id}
                      style={{
                        background: isSelected ? "color-mix(in oklch, var(--primary) 6%, transparent)" : undefined
                      }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(tx.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>

                      {/* Severity & Score */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span className={`risk-badge risk-${tx.level.toLowerCase()}`}>
                            <span className="risk-dot" /> {tx.level}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: "700" }}>
                            Score: {tx.score}
                          </span>
                        </div>
                      </td>

                      {/* Transaction & Date */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong className="id-cell">{tx.id}</strong>
                          <span className="mono" style={{ fontSize: "9px" }}>{tx.date}</span>
                          <span className="type-pill" style={{ width: "fit-content", marginTop: "2px" }}>
                            {tx.channel}
                          </span>
                        </div>
                      </td>

                      {/* Card Profile */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontWeight: "600" }}>{tx.card.brand} {tx.card.type}</span>
                          <span className="mono">{tx.card.maskedNumber}</span>
                          {tx.card.darkWeb && (
                            <span style={{ color: "var(--critical)", fontSize: "9px", fontWeight: "700" }}>
                              ⚠️ Leaked on Dark Web
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Merchant */}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "600" }}>{tx.mccDesc}</span>
                          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                            {tx.merchantCity || "ONLINE"} {tx.merchantState ? `, ${tx.merchantState}` : ""}
                          </span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td>
                        <strong className="amount-cell">{moneyFormatter.format(tx.amount)}</strong>
                      </td>

                      {/* Triggers */}
                      <td style={{ maxWidth: "260px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          {tx.isFraud && (
                            <span style={{ color: "var(--critical)", fontSize: "10px", fontWeight: "700" }}>
                              • Ground Truth Fraud Verified
                            </span>
                          )}
                          {tx.reasons.slice(0, 2).map((r, i) => (
                            <span key={i} style={{ fontSize: "10px", color: "var(--secondary-foreground)" }}>
                              • {r.label}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`status-badge status-${status.toLowerCase().replace(/\s+/g, "")}`}>
                          {status}
                        </span>
                      </td>

                      {/* Quick Actions */}
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: "5px" }}>
                          <button
                            className="button button-outline"
                            style={{ height: "28px", padding: "0 8px", fontSize: "10px" }}
                            title="Open Investigation Workspace"
                            onClick={() => setInvestigatingTx(tx)}
                          >
                            <Eye size={12} /> Investigate
                          </button>
                          <button
                            className="button"
                            style={{ height: "28px", padding: "0 8px", fontSize: "10px", background: "var(--destructive)", color: "#fff" }}
                            title="Block Card at Issuer"
                            onClick={() => handleBlockCard(tx)}
                          >
                            Block
                          </button>
                          {status !== "Escalated" && (
                            <button
                              className="button button-primary"
                              style={{ height: "28px", padding: "0 8px", fontSize: "10px" }}
                              title="Escalate to SAR"
                              onClick={() => handleSetStatus(tx, "Escalated", "Escalated to SAR filing queue by analyst.")}
                            >
                              SAR
                            </button>
                          )}
                          {status !== "Resolved" && (
                            <button
                              className="button button-ghost"
                              style={{ height: "28px", padding: "0 6px" }}
                              title="Mark Resolved"
                              onClick={() => handleSetStatus(tx, "Resolved", "Marked resolved by analyst.")}
                            >
                              <CheckCircle size={14} color="var(--low)" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>Showing {Math.min(alertList.length, 100)} of {alertList.length} alert records</span>
          <span style={{ fontSize: "10px" }}>Real-time event stream active</span>
        </div>
      </div>

      {/* Deep-Dive Investigation Modal */}
      {investigatingTx && (
        <div className="overlay modal-overlay" onMouseDown={() => setInvestigatingTx(null)}>
          <div
            className="modal"
            style={{ width: "min(680px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className={`risk-badge risk-${investigatingTx.level.toLowerCase()}`}>
                  {investigatingTx.level} Risk
                </span>
                <h2 style={{ margin: "4px 0 0" }}>Investigation File: {investigatingTx.id}</h2>
              </div>
              <button className="button button-ghost icon-button" onClick={() => setInvestigatingTx(null)}>
                ✕
              </button>
            </header>

            <div style={{ overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Status Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--card)",
                  padding: "12px 16px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)"
                }}
              >
                <div>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>Current Workflow Status</span>
                  <div style={{ marginTop: "2px" }}>
                    <span className={`status-badge status-${(investigatingTx.alertStatus || "Pending Review").toLowerCase().replace(/\s+/g, "")}`}>
                      {investigatingTx.alertStatus || "Pending Review"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className="button button-outline"
                    style={{ height: "30px", fontSize: "11px" }}
                    onClick={() => handleSetStatus(investigatingTx, "Investigating", "Analyst opened active investigation.")}
                  >
                    Set Investigating
                  </button>
                  <button
                    className="button button-primary"
                    style={{ height: "30px", fontSize: "11px" }}
                    onClick={() => handleSetStatus(investigatingTx, "Escalated", "Escalated to Compliance SAR.")}
                  >
                    Escalate SAR
                  </button>
                  <button
                    className="button button-outline"
                    style={{ height: "30px", fontSize: "11px" }}
                    onClick={() => handleSetStatus(investigatingTx, "Resolved", "Cleared and resolved.")}
                  >
                    Resolve Case
                  </button>
                </div>
              </div>

              {/* Transaction Specs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ background: "var(--card)", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase" }}>Transaction Summary</span>
                  <div className="detail-row"><span>Amount</span><strong>{moneyFormatter.format(investigatingTx.amount)}</strong></div>
                  <div className="detail-row"><span>Channel</span><span>{investigatingTx.channel}</span></div>
                  <div className="detail-row"><span>Merchant</span><span>{investigatingTx.mccDesc}</span></div>
                  <div className="detail-row"><span>Terminal Location</span><span>{investigatingTx.merchantCity}, {investigatingTx.merchantState}</span></div>
                  <div className="detail-row"><span>Security Error</span><strong style={{ color: investigatingTx.error ? "var(--critical)" : "var(--low)" }}>{investigatingTx.error || "None"}</strong></div>
                </div>

                <div style={{ background: "var(--card)", padding: "12px", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase" }}>Card & Cardholder</span>
                  <div className="detail-row"><span>Card</span><strong>{investigatingTx.card.brand} ({investigatingTx.card.maskedNumber})</strong></div>
                  <div className="detail-row"><span>Credit Limit</span><span>{moneyFormatter.format(investigatingTx.card.creditLimit)}</span></div>
                  <div className="detail-row"><span>Cardholder Credit Score</span><strong>{investigatingTx.user.creditScore} / 850</strong></div>
                  <div className="detail-row"><span>Cardholder Income</span><span>{moneyFormatter.format(investigatingTx.user.income)}</span></div>
                  <div className="detail-row"><span>Dark Web Intel</span><strong style={{ color: investigatingTx.card.darkWeb ? "var(--critical)" : "var(--low)" }}>{investigatingTx.card.darkWeb ? "⚠️ Found in Breach" : "Clean"}</strong></div>
                </div>
              </div>

              {/* Triggered Rules */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: "650" }}>Triggered Risk Policies</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {investigatingTx.reasons.map((r, i) => (
                    <div className="reason" key={i} style={{ margin: 0, padding: "8px 12px", background: "var(--card)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                      <div className="reason-points">{r.points > 0 ? `+${r.points}` : r.points}</div>
                      <div>
                        <strong>{r.label}</strong>
                        <p>{r.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analyst Case Notes Log */}
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: "650" }}>Analyst Investigation Log</h4>
                <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <input
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Enter observation, customer contact notes, or SAR justification..."
                    style={{ flex: 1, height: "36px", padding: "0 10px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--foreground)", fontSize: "11px" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNote();
                    }}
                  />
                  <button className="button button-primary" onClick={handleAddNote} style={{ height: "36px" }}>
                    <Plus size={14} /> Add Note
                  </button>
                </div>

                <div className="notes-container">
                  {(investigatingTx.analystNotes || []).length === 0 ? (
                    <div style={{ padding: "12px", fontSize: "11px", color: "var(--muted-foreground)", background: "var(--card)", borderRadius: "var(--radius)", textAlign: "center" }}>
                      No analyst notes logged for this incident yet.
                    </div>
                  ) : (
                    investigatingTx.analystNotes!.map((note, idx) => (
                      <div className="note-item" key={idx}>
                        {note}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button className="button button-outline" onClick={() => setInvestigatingTx(null)}>
                Close
              </button>
              <button
                className="button"
                style={{ background: "var(--destructive)", color: "#fff" }}
                onClick={() => {
                  handleBlockCard(investigatingTx);
                  setInvestigatingTx(null);
                }}
              >
                <Lock size={13} /> Block Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
