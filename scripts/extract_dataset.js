const fs = require('fs');
const path = require('path');
const readline = require('readline');

console.log('1. Loading cards_data.csv...');
const cardLines = fs.readFileSync('Dataset/cards_data.csv', 'utf8').split(/\r?\n/);
const cardMap = new Map();
for (let i = 1; i < cardLines.length; i++) {
  const line = cardLines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  const num = cols[4] || '';
  const last4 = num.slice(-4);
  cardMap.set(cols[0], {
    id: cols[0],
    clientId: cols[1],
    brand: cols[2] || 'Visa',
    type: cols[3] || 'Credit',
    maskedNumber: '•••• ' + (last4 || '0000'),
    expires: cols[5] || '',
    cvv: cols[6] || '',
    hasChip: (cols[7] || '').toUpperCase() === 'YES',
    creditLimit: parseFloat((cols[9] || '$0').replace(/[$,]/g, '')) || 5000,
    darkWeb: (cols[12] || '').toLowerCase() === 'yes'
  });
}
console.log('Cards loaded:', cardMap.size);

console.log('2. Loading users_data.csv...');
const userLines = fs.readFileSync('Dataset/users_data.csv', 'utf8').split(/\r?\n/);
const userMap = new Map();
for (let i = 1; i < userLines.length; i++) {
  const line = userLines[i].trim();
  if (!line) continue;
  const cols = line.split(',');
  userMap.set(cols[0], {
    id: cols[0],
    age: parseInt(cols[1], 10) || 40,
    gender: cols[5] || 'Unknown',
    address: cols[6] || '',
    income: parseFloat((cols[10] || '$0').replace(/[$,]/g, '')) || 50000,
    debt: parseFloat((cols[11] || '$0').replace(/[$,]/g, '')) || 0,
    creditScore: parseInt(cols[12], 10) || 700
  });
}
console.log('Users loaded:', userMap.size);

console.log('3. Loading mcc_codes.json...');
const mccMap = JSON.parse(fs.readFileSync('Dataset/mcc_codes.json', 'utf8'));

console.log('4. Loading fraud IDs from train_fraud_labels.json...');
const fraudData = JSON.parse(fs.readFileSync('Dataset/train_fraud_labels.json', 'utf8'));
const fraudIds = new Set();
for (const [tid, val] of Object.entries(fraudData.target || {})) {
  if (val === 'Yes') fraudIds.add(tid);
}
console.log('Loaded fraud IDs count:', fraudIds.size);

console.log('5. Reading transactions_data.csv...');
const fileStream = fs.createReadStream('Dataset/transactions_data.csv');
const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

let lineCount = 0;
let fraudCount = 0;
let legitCount = 0;
const selected = [];

rl.on('line', (line) => {
  lineCount++;
  if (lineCount === 1) return;

  const parts = line.split(',');
  const tid = parts[0];
  const isFraud = fraudIds.has(tid);

  if (isFraud && fraudCount < 300) {
    selected.push({ raw: line, isFraud: true });
    fraudCount++;
  } else if (!isFraud && legitCount < 1200 && (lineCount % 12 === 0 || parts[11])) {
    selected.push({ raw: line, isFraud: false });
    legitCount++;
  }

  if (fraudCount >= 300 && legitCount >= 1200) {
    rl.close();
    fileStream.destroy();
  }

  if (lineCount % 200000 === 0) {
    console.log(`Scanned ${lineCount} lines (Frauds: ${fraudCount}, Legit: ${legitCount})`);
  }
});

rl.on('close', () => {
  console.log(`Extraction complete! Total: ${selected.length} (Fraud: ${fraudCount}, Legit: ${legitCount})`);

  const parsedRecords = selected.map((item) => {
    const parts = item.raw.split(',');
    const id = parts[0];
    const date = parts[1];
    const clientId = parts[2];
    const cardId = parts[3];
    const rawAmt = parts[4] || '$0';
    const amount = Math.abs(parseFloat(rawAmt.replace(/[$,]/g, '')) || 0);
    const channel = parts[5] || 'Swipe Transaction';
    const merchantId = parts[6];
    const merchantCity = parts[7] || 'ONLINE';
    const merchantState = parts[8] || '';
    const zip = parts[9] || '';
    const mcc = parts[10] || '5411';
    const mccDesc = mccMap[mcc] || 'General Retail & Services';
    const rawErr = (parts.slice(11).join(',') || '').replace(/["\r\n]/g, '').trim();

    const card = cardMap.get(cardId) || {
      id: cardId,
      clientId,
      brand: 'Visa',
      type: 'Credit',
      maskedNumber: '•••• 1000',
      expires: '12/2025',
      hasChip: true,
      creditLimit: 5000,
      darkWeb: false
    };

    const user = userMap.get(clientId) || {
      id: clientId,
      age: 40,
      gender: 'Unknown',
      address: 'Address on file',
      income: 55000,
      debt: 15000,
      creditScore: 710
    };

    return {
      id: 'TXN-' + id,
      datasetId: id,
      date,
      amount,
      channel,
      merchantId,
      merchantCity,
      merchantState,
      zip,
      mcc,
      mccDesc,
      error: rawErr || null,
      isFraud: item.isFraud,
      card: {
        id: card.id,
        brand: card.brand,
        type: card.type,
        maskedNumber: card.maskedNumber,
        expires: card.expires,
        hasChip: card.hasChip,
        creditLimit: card.creditLimit,
        darkWeb: card.darkWeb
      },
      user: {
        id: user.id,
        age: user.age,
        gender: user.gender,
        address: user.address,
        income: user.income,
        debt: user.debt,
        creditScore: user.creditScore
      }
    };
  });

  const outDir = path.resolve('public/dataset');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'transactions.json');
  fs.writeFileSync(outPath, JSON.stringify(parsedRecords, null, 2));
  console.log(`Saved ${parsedRecords.length} real records to ${outPath}! File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  // Also create a sample CSV file for users to test uploading directly
  const csvHeaders = ['id', 'date', 'client_id', 'card_id', 'amount', 'use_chip', 'merchant_id', 'merchant_city', 'merchant_state', 'zip', 'mcc', 'errors'];
  const sampleCsvLines = [csvHeaders.join(',')];
  for (const item of selected.slice(0, 500)) {
    sampleCsvLines.push(item.raw.trim());
  }
  const sampleCsvPath = path.join(outDir, 'sample_transactions.csv');
  fs.writeFileSync(sampleCsvPath, sampleCsvLines.join('\n'));
  console.log(`Saved sample CSV to ${sampleCsvPath}!`);
});
