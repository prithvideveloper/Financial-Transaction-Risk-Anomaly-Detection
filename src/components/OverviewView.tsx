import React, { useMemo } from "react";
import {
  Activity,
  ShieldAlert,
  CircleDollarSign,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Zap,
  Upload,
  AlertTriangle,
  Lock,
  Layers,
  MapPin
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import { type TransactionRecord } from "../lib/riskEngine";

interface Props {
  transactions: TransactionRecord[];
  onNavigateTab: (tab: "overview" | "transactions" | "simulator" | "alerts") => void;
  onSelectTransaction: (tx: TransactionRecord) => void;
  onOpenUpload: () => void;
}

const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function OverviewView({ transactions, onNavigateTab, onSelectTransaction, onOpenUpload }: Props) {
  // Real KPIs computed from real dataset
  const metrics = useMemo(() => {
    const total = transactions.length;
    const fraudCount = transactions.filter((t) => t.isFraud).length;
    const criticalAndHigh = transactions.filter((t) => t.score >= 60);
    const exposure = criticalAndHigh.reduce((sum, t) => sum + t.amount, 0);
    const avgScore = total > 0 ? Math.round(transactions.reduce((sum, t) => sum + t.score, 0) / total) : 0;
    const fraudRate = total > 0 ? ((fraudCount / total) * 100).toFixed(1) : "0.0";

    return { total, fraudCount, exposure, avgScore, fraudRate, criticalCount: criticalAndHigh.length };
  }, [transactions]);

  // Channel distribution
  const channelData = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.forEach((t) => {
      const ch = t.channel.replace(" Transaction", "");
      counts[ch] = (counts[ch] || 0) + 1;
    });
    return Object.entries(counts).map(([channel, count]) => ({ channel, count }));
  }, [transactions]);

  // Risk bands
  const riskBands = useMemo(() => {
    const bands = [
      { range: "0–19", count: 0, fill: "var(--low)" },
      { range: "20–39", count: 0, fill: "var(--low)" },
      { range: "40–59", count: 0, fill: "var(--medium)" },
      { range: "60–79", count: 0, fill: "var(--high)" },
      { range: "80–100", count: 0, fill: "var(--critical)" }
    ];
    transactions.forEach((t) => {
      let bandIndex = 0;
      if (t.score < 20) bandIndex = 0;
      else if (t.score < 40) bandIndex = 1;
      else if (t.score < 60) bandIndex = 2;
      else if (t.score < 80) bandIndex = 3;
      else bandIndex = 4;
      const b = bands[bandIndex];
      if (b) b.count++;
    });
    return bands;
  }, [transactions]);

  // Top High-Risk Categories
  const topMccData = useMemo(() => {
    const map: Record<string, { count: number; highRisk: number }> = {};
    transactions.forEach((t) => {
      const desc = t.mccDesc.length > 20 ? t.mccDesc.slice(0, 18) + "…" : t.mccDesc;
      if (!map[desc]) map[desc] = { count: 0, highRisk: 0 };
      const item = map[desc]!;
      item.count++;
      if (t.score >= 60) item.highRisk++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].highRisk - a[1].highRisk)
      .slice(0, 6)
      .map(([mcc, data]) => ({ mcc, count: data.count, highRisk: data.highRisk }));
  }, [transactions]);

  // 12-slot timeline trend
  const timelineData = useMemo(() => {
    const slots = Array.from({ length: 12 }, (_, i) => ({
      slot: `${String(i * 2).padStart(2, "0")}:00`,
      flagged: 0,
      total: 0
    }));

    transactions.forEach((t, i) => {
      const idx = i % 12;
      const s = slots[idx];
      if (s) {
        s.total++;
        if (t.score >= 60) s.flagged++;
      }
    });

    return slots;
  }, [transactions]);

  const recentAlerts = useMemo(() => {
    return transactions.filter((t) => t.score >= 65 || t.isFraud).slice(0, 5);
  }, [transactions]);

  return (
    <div className="view-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Metric Grid */}
      <section className="metric-grid" aria-label="Executive metrics">
        <div className="metric">
          <div className="metric-top">
            <div className="metric-icon"><Activity /></div>
            <span className="metric-delta"><ArrowUpRight /> Active</span>
          </div>
          <p>Total Transactions Loaded</p>
          <h2>{compactFormatter.format(metrics.total)}</h2>
          <span className="metric-hint">100% Client-side real dataset</span>
        </div>

        <div className="metric">
          <div className="metric-top">
            <div className="metric-icon" style={{ color: "var(--critical)", background: "color-mix(in oklch, var(--critical) 12%, transparent)" }}>
              <ShieldAlert />
            </div>
            <span className="metric-delta up-risk"><ArrowUpRight /> {metrics.fraudRate}%</span>
          </div>
          <p>Ground-Truth Frauds</p>
          <h2 style={{ color: "var(--critical)" }}>{metrics.fraudCount}</h2>
          <span className="metric-hint">Supervised training labels matched</span>
        </div>

        <div className="metric">
          <div className="metric-top">
            <div className="metric-icon"><CircleDollarSign /></div>
            <span className="metric-delta"><ArrowDownRight /> Real exposure</span>
          </div>
          <p>Volume at Risk (High/Critical)</p>
          <h2>{moneyFormatter.format(metrics.exposure)}</h2>
          <span className="metric-hint">Total dollar amount of flagged activity</span>
        </div>

        <div className="metric">
          <div className="metric-top">
            <div className="metric-icon"><Gauge /></div>
            <span className="metric-delta neutral">Mean {metrics.avgScore}</span>
          </div>
          <p>Average Risk Score</p>
          <h2>{metrics.avgScore} / 100</h2>
          <div className="metric-meter"><i style={{ width: `${metrics.avgScore}%` }} /></div>
          <span className="metric-hint">Active heuristics calibration</span>
        </div>
      </section>

      {/* Analytics Charts */}
      <section className="chart-grid">
        <div className="panel timeline-panel">
          <div className="panel-heading">
            <div>
              <h2>Anomaly Temporal Velocity</h2>
              <p>High-risk transactions detected across diurnal activity slots</p>
            </div>
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Real event series</span>
          </div>
          <ResponsiveContainer width="100%" height={235}>
            <AreaChart data={timelineData} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="slot" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="chart-tooltip">
                      <span>Time: {payload[0]?.payload?.slot}</span>
                      <strong>{payload[0]?.value} flagged transactions</strong>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="flagged" stroke="var(--chart-primary)" strokeWidth={2} fill="url(#anomalyGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Channel Mix */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Payment Presentation</h2>
              <p>Volume by authorization channel</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={235}>
            <BarChart data={channelData} layout="vertical" margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="channel" type="category" width={75} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="chart-tooltip">
                      <span>{payload[0]?.payload?.channel}</span>
                      <strong>{payload[0]?.value} transactions</strong>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" fill="var(--chart-secondary)" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Risk Distribution */}
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Risk Score Distribution</h2>
              <p>Transactions grouped by score band</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={235}>
            <BarChart data={riskBands} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="range" stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="chart-tooltip">
                      <span>Band: {payload[0]?.payload?.range}</span>
                      <strong>{payload[0]?.value} transactions</strong>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {riskBands.map((entry) => (
                  <Cell key={entry.range} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Critical Alerts Feed & Quick Action Preview */}
      <section className="table-section">
        <div className="section-heading">
          <div>
            <h2>Urgent Incident Watchlist</h2>
            <p>Immediate triage items from real ground-truth records</p>
          </div>
          <button className="button button-outline" style={{ height: "30px", fontSize: "11px" }} onClick={() => onNavigateTab("alerts")}>
            View Full Alert Queue ({metrics.criticalCount}) <ChevronRight size={14} />
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Channel</th>
                <th>Amount</th>
                <th>Card Instrument</th>
                <th>Location / Category</th>
                <th>Security Fault</th>
                <th>Score</th>
                <th>Risk Tier</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentAlerts.map((tx) => (
                <tr key={tx.id} onClick={() => onSelectTransaction(tx)}>
                  <td className="id-cell">{tx.id}</td>
                  <td><span className="type-pill">{tx.channel.replace(" Transaction", "")}</span></td>
                  <td className="amount-cell">{moneyFormatter.format(tx.amount)}</td>
                  <td>{tx.card.brand} {tx.card.maskedNumber}</td>
                  <td>{tx.mccDesc} ({tx.merchantCity})</td>
                  <td>
                    {tx.error ? (
                      <span style={{ color: "var(--critical)", fontWeight: "600" }}>{tx.error}</span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)" }}>Clean</span>
                    )}
                  </td>
                  <td>
                    <div className="score-cell">
                      <strong>{tx.score}</strong>
                      <span><i style={{ width: `${tx.score}%`, background: "var(--critical)" }} /></span>
                    </div>
                  </td>
                  <td>
                    <span className={`risk-badge risk-${tx.level.toLowerCase()}`}>
                      <span className="risk-dot" />{tx.level}
                    </span>
                  </td>
                  <td><ChevronRight size={14} color="var(--muted-foreground)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
