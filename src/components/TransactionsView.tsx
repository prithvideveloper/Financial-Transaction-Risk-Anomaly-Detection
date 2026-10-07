import React, { useState, useMemo } from "react";
import {
  Search,
  Filter,
  Download,
  ArrowUpDown,
  ChevronRight,
  ShieldAlert,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  MapPin,
  AlertTriangle
} from "lucide-react";
import { type TransactionRecord } from "../lib/riskEngine";

interface Props {
  transactions: TransactionRecord[];
  onSelectTransaction: (tx: TransactionRecord) => void;
}

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function TransactionsView({ transactions, onSelectTransaction }: Props) {
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState("All risks");
  const [channelFilter, setChannelFilter] = useState("All channels");
  const [errorOnly, setErrorOnly] = useState(false);
  const [fraudOnly, setFraudOnly] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState<"date" | "amount" | "score">("score");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (riskFilter !== "All risks" && tx.level !== riskFilter) return false;
      if (channelFilter !== "All channels" && tx.channel !== channelFilter) return false;
      if (errorOnly && !tx.error) return false;
      if (fraudOnly && !tx.isFraud) return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const searchable = `${tx.id} ${tx.datasetId} ${tx.card.brand} ${tx.card.maskedNumber} ${tx.merchantCity} ${tx.merchantState} ${tx.mccDesc} ${tx.error || ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, query, riskFilter, channelFilter, errorOnly, fraudOnly]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let diff = 0;
      if (sortBy === "score") diff = a.score - b.score;
      else if (sortBy === "amount") diff = a.amount - b.amount;
      else if (sortBy === "date") diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [filtered, sortBy, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const toggleSort = (col: "date" | "amount" | "score") => {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "Transaction ID",
      "Dataset ID",
      "Date",
      "Amount",
      "Channel",
      "Merchant City",
      "Merchant State",
      "MCC",
      "MCC Description",
      "Card Brand",
      "Card Number",
      "Credit Limit",
      "Dark Web",
      "Security Error",
      "Ground Truth Fraud",
      "Risk Score",
      "Risk Tier"
    ];

    const rows = sorted.map((t) => [
      t.id,
      t.datasetId,
      t.date,
      t.amount,
      `"${t.channel}"`,
      `"${t.merchantCity}"`,
      t.merchantState,
      t.mcc,
      `"${t.mccDesc}"`,
      t.card.brand,
      t.card.maskedNumber,
      t.card.creditLimit,
      t.card.darkWeb ? "Yes" : "No",
      `"${t.error || ""}"`,
      t.isFraud ? "Yes" : "No",
      t.score,
      t.level
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinel_transactions_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* View Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", margin: "0 0 4px" }}>
            Transaction Explorer & Audit Workspace
          </h2>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--muted-foreground)" }}>
            Inspect real card-holder transactions joined from dataset files. Search, filter, and audit individual security traces.
          </p>
        </div>

        <button className="button button-outline" onClick={handleExportCsv}>
          <Download size={14} /> Export CSV ({sorted.length})
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="filterbar" style={{ background: "var(--card)", borderRadius: "var(--radius)", flexWrap: "wrap" }}>
        <label className="search-field" style={{ minWidth: "260px" }}>
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search TXN ID, card number, city, error..."
          />
        </label>

        <label className="select-wrap">
          <Filter size={13} />
          <select
            value={riskFilter}
            onChange={(e) => {
              setRiskFilter(e.target.value);
              setPage(1);
            }}
          >
            <option>All risks</option>
            <option>Critical</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </label>

        <label className="select-wrap">
          <select
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value);
              setPage(1);
            }}
          >
            <option>All channels</option>
            <option value="Swipe Transaction">Swipe Transaction</option>
            <option value="Online Transaction">Online Transaction</option>
            <option value="Chip Transaction">Chip Transaction</option>
          </select>
        </label>

        <label className="toggle-label">
          <input
            type="checkbox"
            checked={errorOnly}
            onChange={(e) => {
              setErrorOnly(e.target.checked);
              setPage(1);
            }}
          />
          <span className="toggle" />
          <span>With Errors Only</span>
        </label>

        <label className="toggle-label">
          <input
            type="checkbox"
            checked={fraudOnly}
            onChange={(e) => {
              setFraudOnly(e.target.checked);
              setPage(1);
            }}
          />
          <span className="toggle" />
          <span>Ground Truth Fraud Only</span>
        </label>

        <span className="record-count" style={{ marginLeft: "auto" }}>
          {sorted.length} of {transactions.length} records
        </span>
      </div>

      {/* Table Section */}
      <div className="table-section" style={{ margin: 0 }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("date")}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Date & Time <ArrowUpDown size={11} />
                  </div>
                </th>
                <th>Channel</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("amount")}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Amount <ArrowUpDown size={11} />
                  </div>
                </th>
                <th>Card Instrument</th>
                <th>Merchant Location & Category</th>
                <th>Error Flag</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("score")}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    Risk Score <ArrowUpDown size={11} />
                  </div>
                </th>
                <th>Risk Tier</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground)" }}>
                    No transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                pagedRecords.map((tx) => (
                  <tr key={tx.id} onClick={() => onSelectTransaction(tx)}>
                    <td className="id-cell">
                      <strong>{tx.id}</strong>
                    </td>
                    <td className="mono" style={{ fontSize: "10px" }}>
                      {tx.date}
                    </td>
                    <td>
                      <span className="type-pill">{tx.channel.replace(" Transaction", "")}</span>
                    </td>
                    <td className="amount-cell">{moneyFormatter.format(tx.amount)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: "600" }}>{tx.card.brand}</span>
                        <span className="mono">{tx.card.maskedNumber}</span>
                        {tx.card.darkWeb && (
                          <span style={{ color: "var(--critical)", fontSize: "9px" }}>⚠️ Leaked</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "11px", fontWeight: "600" }}>{tx.mccDesc}</span>
                        <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                          {tx.merchantCity || "ONLINE"}{tx.merchantState ? `, ${tx.merchantState}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      {tx.error ? (
                        <span style={{ color: "var(--critical)", fontWeight: "600", fontSize: "10px" }}>
                          {tx.error}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)", fontSize: "10px" }}>Clean</span>
                      )}
                    </td>
                    <td>
                      <div className="score-cell">
                        <strong>{tx.score}</strong>
                        <span>
                          <i
                            style={{
                              width: `${tx.score}%`,
                              background:
                                tx.score >= 80
                                  ? "var(--critical)"
                                  : tx.score >= 60
                                  ? "var(--high)"
                                  : tx.score >= 35
                                  ? "var(--medium)"
                                  : "var(--low)"
                            }}
                          />
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className={`risk-badge risk-${tx.level.toLowerCase()}`}>
                          <span className="risk-dot" />
                          {tx.level}
                        </span>
                        {tx.isFraud && (
                          <span style={{ color: "var(--critical)" }} title="Ground truth fraud">
                            <ShieldAlert size={13} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <ChevronRight size={14} color="var(--muted-foreground)" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="table-pagination">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length} transactions
          </div>

          <div className="pagination-controls">
            <button
              className="page-btn"
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              className="page-btn"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>

            <span style={{ margin: "0 6px", fontSize: "11px", fontWeight: "600" }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              className="page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>
            <button
              className="page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </button>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                marginLeft: "8px",
                height: "28px",
                padding: "0 6px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--foreground)",
                fontSize: "11px"
              }}
            >
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
