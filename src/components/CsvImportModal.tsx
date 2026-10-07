import React, { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileSpreadsheet, Upload, X, CheckCircle2, Download, AlertCircle, RefreshCw } from "lucide-react";
import { parseTransactionCsv } from "../lib/csvParser";
import { type TransactionRecord } from "../lib/riskEngine";

interface Props {
  onClose: () => void;
  onImport: (records: TransactionRecord[], filename: string) => void;
  onReloadDefaultDataset: () => void;
}

export function CsvImportModal({ onClose, onImport, onReloadDefaultDataset }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const processFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && !file.type.includes("csv")) {
      setErrorMsg("Please select a valid CSV file (.csv format).");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseTransactionCsv(text);
        if (parsed.length === 0) {
          setErrorMsg("Could not parse transactions from this CSV. Check column headers (e.g. amount, channel/use_chip).");
          setLoading(false);
          return;
        }

        onImport(parsed, file.name);
        onClose();
      } catch (err: any) {
        setErrorMsg("Failed to parse file: " + (err?.message || "Unknown error"));
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setErrorMsg("Error reading file.");
      setLoading(false);
    };

    reader.readAsText(file);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="overlay modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width: "min(560px, 94vw)" }} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Client-Side Transaction Data Ingestion</h2>
            <p style={{ margin: 0, fontSize: "10px", color: "var(--muted-foreground)" }}>
              Data evaluated in-memory inside browser. Zero remote network transmission.
            </p>
          </div>
          <button className="button button-ghost icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: "20px" }}>
          {errorMsg && (
            <div
              style={{
                background: "color-mix(in oklch, var(--critical) 12%, transparent)",
                border: "1px solid var(--critical)",
                padding: "10px 14px",
                borderRadius: "var(--radius)",
                marginBottom: "14px",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--critical)"
              }}
            >
              <AlertCircle size={15} />
              {errorMsg}
            </div>
          )}

          {/* Drag & Drop Zone */}
          <div
            className="dropzone"
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{ margin: 0, minHeight: "180px", cursor: "pointer" }}
          >
            <div className="upload-icon">
              <FileSpreadsheet size={24} />
            </div>
            <strong>{loading ? "Processing CSV in browser..." : "Drop your transaction CSV here"}</strong>
            <p>or click to browse your files · Supports cards, transactions & synthetic datasets</p>
            <button className="button button-outline" type="button" disabled={loading}>
              <Upload size={14} /> Choose CSV File
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFileChange} hidden />
          </div>

          {/* Alternative Quick Action */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "16px",
              padding: "12px",
              background: "var(--card)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              fontSize: "11px"
            }}
          >
            <div>
              <strong>Reset to Real Project Dataset</strong>
              <p style={{ margin: "2px 0 0", color: "var(--muted-foreground)", fontSize: "10px" }}>
                1,500 real joined records from Dataset/ folder
              </p>
            </div>
            <button
              className="button button-outline"
              style={{ height: "30px", fontSize: "11px" }}
              onClick={() => {
                onReloadDefaultDataset();
                onClose();
              }}
            >
              <RefreshCw size={12} /> Reload Dataset
            </button>
          </div>

          {/* Supported Format Note */}
          <div className="schema-note" style={{ margin: "14px 0 0" }}>
            <strong>Supported CSV Columns</strong>
            <p>
              id, date, client_id, card_id, amount, use_chip (channel), merchant_id, merchant_city, merchant_state, zip, mcc, errors, isFraud
            </p>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button className="button button-outline" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
