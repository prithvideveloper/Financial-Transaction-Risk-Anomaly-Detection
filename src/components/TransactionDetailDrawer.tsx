import React from "react";
import { X, ShieldAlert, CreditCard, User, AlertTriangle, ArrowRight, ShieldCheck, MapPin } from "lucide-react";
import { type TransactionRecord, getRecommendedAction } from "../lib/riskEngine";

interface Props {
  transaction: TransactionRecord;
  onClose: () => void;
  onEscalate?: (tx: TransactionRecord) => void;
  onBlockCard?: (tx: TransactionRecord) => void;
  onResolve?: (tx: TransactionRecord) => void;
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function TransactionDetailDrawer({ transaction: tx, onClose, onEscalate, onBlockCard, onResolve }: Props) {
  const rec = getRecommendedAction(tx.level);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <aside className="drawer" style={{ width: "min(560px, 94vw)" }} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className={`risk-badge risk-${tx.level.toLowerCase()}`}>
                <span className="risk-dot" />
                {tx.level} Risk
              </span>
              {tx.isFraud && (
                <span className="risk-badge risk-critical" style={{ fontSize: "9px" }}>
                  <ShieldAlert size={11} /> Ground Truth Fraud
                </span>
              )}
            </div>
            <h2 style={{ marginTop: "4px" }}>Transaction {tx.id}</h2>
            <p>Dataset Ref ID: #{tx.datasetId} · {tx.date}</p>
          </div>
          <button className="button button-ghost icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {/* Risk Hero Banner */}
          <div className="risk-hero" style={{ background: "var(--card)", padding: "16px", borderRadius: "var(--radius)", marginBottom: "16px" }}>
            <div className={`score-ring score-${tx.level.toLowerCase()}`}>
              <strong>{tx.score}</strong>
              <span>/ 100</span>
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: "0 0 4px" }}>{tx.level} Risk Assessment</h3>
              <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--muted-foreground)" }}>
                {tx.isFraud
                  ? "Flagged by ground-truth fraud label from dataset."
                  : "Assessed using real-time credit card risk intelligence rules."}
              </p>
              <div className={`rec-box ${rec.badgeClass}`} style={{ padding: "8px 12px" }}>
                <span className="rec-title" style={{ fontSize: "10px" }}>{rec.action}</span>
                <p className="rec-desc" style={{ fontSize: "10px" }}>{rec.description}</p>
              </div>
            </div>
          </div>

          {/* Transaction Core */}
          <section className="drawer-section">
            <h4><CreditCard size={12} style={{ display: "inline", marginRight: "4px" }} /> Transaction Specifics</h4>
            <div className="detail-row"><span>Amount</span><strong className="amount-cell" style={{ fontSize: "15px" }}>{moneyFormatter.format(tx.amount)}</strong></div>
            <div className="detail-row"><span>Processing Channel</span><span className="type-pill">{tx.channel}</span></div>
            <div className="detail-row"><span>Merchant Category (MCC)</span><span>{tx.mcc} — {tx.mccDesc}</span></div>
            <div className="detail-row"><span>Terminal Location</span><span style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={11} /> {tx.merchantCity || "ONLINE"}{tx.merchantState ? `, ${tx.merchantState}` : ""} {tx.zip ? `(${tx.zip})` : ""}</span></div>
            <div className="detail-row"><span>Security Error / Glitch</span><strong style={{ color: tx.error ? "var(--critical)" : "var(--low)" }}>{tx.error || "None (Clean Transmission)"}</strong></div>
            <div className="detail-row"><span>Authorized Timestamp</span><span className="mono">{tx.date}</span></div>
          </section>

          {/* Card Profile */}
          <section className="drawer-section">
            <h4>Cardholder & Instrument Profile</h4>
            <div className="detail-row"><span>Card Brand & Type</span><strong>{tx.card.brand} {tx.card.type}</strong></div>
            <div className="detail-row"><span>Masked Card Number</span><strong className="mono">{tx.card.maskedNumber}</strong></div>
            <div className="detail-row"><span>Credit Limit</span><strong>{moneyFormatter.format(tx.card.creditLimit)}</strong></div>
            <div className="detail-row"><span>EMV Chip Hardware</span><span>{tx.card.hasChip ? "Yes (Chip Present)" : "No (Stripe Only)"}</span></div>
            <div className="detail-row"><span>Dark Web Breach Status</span><strong style={{ color: tx.card.darkWeb ? "var(--critical)" : "var(--low)" }}>{tx.card.darkWeb ? "⚠️ Compromised in Breach Dump" : "✓ No Known Leak"}</strong></div>
          </section>

          {/* User Financial standing */}
          <section className="drawer-section">
            <h4><User size={12} style={{ display: "inline", marginRight: "4px" }} /> Client Profile (Dataset Client #{tx.user.id})</h4>
            <div className="detail-row"><span>Cardholder Age & Gender</span><span>{tx.user.age} yrs · {tx.user.gender}</span></div>
            <div className="detail-row"><span>Registered Billing Address</span><span>{tx.user.address}</span></div>
            <div className="detail-row"><span>Credit Score</span><strong style={{ color: tx.user.creditScore >= 720 ? "var(--low)" : tx.user.creditScore < 600 ? "var(--critical)" : "var(--medium)" }}>{tx.user.creditScore} / 850</strong></div>
            <div className="detail-row"><span>Annual Income</span><span>{moneyFormatter.format(tx.user.income)}</span></div>
            <div className="detail-row"><span>Outstanding Debt</span><span>{moneyFormatter.format(tx.user.debt)}</span></div>
          </section>

          {/* Risk Factors / Explainability */}
          <section className="drawer-section">
            <h4>Explainable Risk Factor Breakdown ({tx.reasons.length})</h4>
            {tx.reasons.map((r, i) => (
              <div className="reason" key={i}>
                <div className="reason-points" style={{ background: r.points < 0 ? "color-mix(in oklch, var(--low) 15%, transparent)" : undefined, color: r.points < 0 ? "var(--low)" : undefined }}>
                  {r.points > 0 ? `+${r.points}` : r.points}
                </div>
                <div style={{ flex: 1 }}>
                  <strong>{r.label}</strong>
                  <p>{r.detail}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Status and Analyst Notes */}
          {tx.alertStatus && (
            <section className="drawer-section">
              <h4>Case Status & Notes</h4>
              <div className="detail-row"><span>Current Status</span><span className={`status-badge status-${tx.alertStatus.toLowerCase().replace(/\s+/g, "")}`}>{tx.alertStatus}</span></div>
              {tx.analystNotes && tx.analystNotes.length > 0 && (
                <div className="notes-container">
                  {tx.analystNotes.map((note, idx) => (
                    <div className="note-item" key={idx}>
                      <span>Analyst Note #{idx + 1}</span>
                      {note}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="drawer-actions">
          <button className="button button-outline" onClick={onClose}>Close</button>
          {onBlockCard && (
            <button className="button" style={{ background: "var(--destructive)", color: "#fff" }} onClick={() => onBlockCard(tx)}>
              Block Card
            </button>
          )}
          {onEscalate && (
            <button className="button button-primary" onClick={() => onEscalate(tx)}>
              Escalate to SAR
            </button>
          )}
          {onResolve && tx.alertStatus !== "Resolved" && (
            <button className="button button-outline" onClick={() => onResolve(tx)}>
              Mark Resolved
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
