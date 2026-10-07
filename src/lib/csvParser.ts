import { calculateTransactionRisk, type TransactionRecord } from "./riskEngine";

export function parseTransactionCsv(text: string): TransactionRecord[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const firstLine = lines[0];
  if (!firstLine) return [];
  const rawHeaders = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    headerMap[h] = i;
  });

  const getCol = (row: string[], name: string, fallbackIndex = -1): string => {
    if (headerMap[name] !== undefined) return row[headerMap[name]]?.replace(/^"|"$/g, "").trim() ?? "";
    if (fallbackIndex >= 0 && fallbackIndex < row.length) return row[fallbackIndex]?.replace(/^"|"$/g, "").trim() ?? "";
    return "";
  };

  const parsed: TransactionRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const line = rawLine.trim();
    if (!line) continue;

    // Handle CSV splitting respecting commas inside quotes if any
    const cols: string[] = [];
    let inQuotes = false;
    let curr = "";
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(curr.trim());
        curr = "";
      } else {
        curr += char;
      }
    }
    cols.push(curr.trim());

    if (cols.length < 3) continue;

    const id = getCol(cols, "id", 0) || `TXN-${String(i + 8000000)}`;
    const date = getCol(cols, "date", 1) || new Date().toISOString();
    const clientId = getCol(cols, "client_id", 2) || String(1000 + (i % 500));
    const cardId = getCol(cols, "card_id", 3) || String(2000 + (i % 1000));
    const rawAmt = getCol(cols, "amount", 4) || "$0";
    const amount = Math.abs(parseFloat(rawAmt.replace(/[$,]/g, "")) || 0);
    const channel = getCol(cols, "use_chip", 5) || getCol(cols, "channel") || getCol(cols, "type") || "Swipe Transaction";
    const merchantId = getCol(cols, "merchant_id", 6) || String(50000 + (i % 200));
    const merchantCity = getCol(cols, "merchant_city", 7) || "ONLINE";
    const merchantState = getCol(cols, "merchant_state", 8) || "";
    const zip = getCol(cols, "zip", 9) || "";
    const mcc = getCol(cols, "mcc", 10) || "5411";
    const rawErr = getCol(cols, "errors", 11) || getCol(cols, "error") || "";
    const isFraudRaw = getCol(cols, "isfraud") || getCol(cols, "fraud");
    const isFraud = isFraudRaw === "1" || isFraudRaw.toLowerCase() === "true" || isFraudRaw.toLowerCase() === "yes";

    const card = {
      id: cardId,
      brand: "Visa",
      type: "Credit",
      maskedNumber: `•••• ${cardId.padStart(4, "0").slice(-4)}`,
      expires: "12/2026",
      hasChip: !channel.toLowerCase().includes("swipe"),
      creditLimit: 5000,
      darkWeb: false
    };

    const user = {
      id: clientId,
      age: 38,
      gender: "Unknown",
      address: `${merchantCity || "Metro Area"}, ${merchantState || "US"}`,
      income: 52000,
      debt: 12000,
      creditScore: 710
    };

    const risk = calculateTransactionRisk({
      amount,
      channel,
      mcc,
      mccDesc: "General Merchant",
      error: rawErr || null,
      isFraud,
      card,
      user
    });

    parsed.push({
      id: id.startsWith("TXN-") ? id : `TXN-${id}`,
      datasetId: id,
      date,
      amount,
      channel,
      merchantId,
      merchantCity,
      merchantState,
      zip,
      mcc,
      mccDesc: "Merchant Category",
      error: rawErr || null,
      isFraud,
      card,
      user,
      score: risk.score,
      level: risk.level,
      reasons: risk.reasons,
      alertStatus: (risk.level === "Critical" || risk.level === "High" ? "Pending Review" : undefined) as TransactionRecord["alertStatus"]
    });

    // Cap at 5,000 rows for smooth client-side performance
    if (parsed.length >= 5000) break;
  }

  return parsed;
}
