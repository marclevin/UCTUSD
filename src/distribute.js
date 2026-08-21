// Hand out UCTUSD from the distributor account.
//
//   node src/distribute.js <address> [amount]
//   node src/distribute.js --batch <file> [amount]
//   node src/distribute.js --balances
//
// The batch file is one recipient per line; blank lines and lines starting
// with # are ignored. A line may be "rAddress" or "rAddress,amount" to give
// that recipient a different amount.

import { Client, Wallet } from 'xrpl';
import { readFileSync } from 'node:fs';
import {
  NETWORK, EXPLORER, CURRENCY_NAME, CURRENCY_HEX, STUDENT_GRANT,
  loadAccounts, uctusd, submit, findTrustLine,
} from './config.js';

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error(`usage: node src/distribute.js <address> [amount]
       node src/distribute.js --batch <file> [amount]
       node src/distribute.js --balances`);
  process.exit(1);
}

const accounts = loadAccounts();
const issuerAddress = accounts.issuer.address;
const distributor = Wallet.fromSeed(accounts.distributor.seed);

const client = new Client(NETWORK);
await client.connect();

/** Parse "rAddress" / "rAddress,amount" lines into recipient records. */
function parseBatch(path, fallbackAmount) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [address, amount] = line.split(',').map((s) => s.trim());
      return { address, amount: amount || fallbackAmount };
    });
}

if (argv[0] === '--balances') {
  const { result } = await client.request({
    command: 'gateway_balances', account: issuerAddress, ledger_index: 'validated', hotwallet: [distributor.address],
  });
  const { result: lines } = await client.request({
    command: 'account_lines', account: issuerAddress, ledger_index: 'validated',
  });
  // With `hotwallet` set, `obligations` counts only tokens held outside our
  // own hot wallet — i.e. what students actually hold.
  const circulating = Number(result.obligations?.[CURRENCY_HEX] ?? 0);
  const treasury = Number(result.balances?.[distributor.address]?.[0]?.value ?? 0);
  const n = (v) => v.toLocaleString('en-US');
  console.log(`Held by students (circulating): ${n(circulating)} ${CURRENCY_NAME}`);
  console.log(`Held by distributor (treasury): ${n(treasury)} ${CURRENCY_NAME}`);
  console.log(`Total issued                  : ${n(circulating + treasury)} ${CURRENCY_NAME}`);
  console.log(`\nHolders (${lines.lines.length}):`);
  for (const l of lines.lines) {
    // From the issuer's perspective a holder's balance is stored negated.
    console.log(`  ${l.account}  ${(-Number(l.balance)).toLocaleString('en-US')} ${CURRENCY_NAME}` +
      (l.freeze ? '  [FROZEN]' : ''));
  }
  await client.disconnect();
  process.exit(0);
}

const recipients = argv[0] === '--batch'
  ? parseBatch(argv[1], argv[2] || STUDENT_GRANT)
  : [{ address: argv[0], amount: argv[1] || STUDENT_GRANT }];

console.log(`Sending ${CURRENCY_NAME} from distributor ${distributor.address}\n`);

let sent = 0, skipped = 0;
for (const { address, amount } of recipients) {
  // A payment to an account with no trust line fails with tecPATH_DRY, which
  // is a confusing error to hand a student — check first and say why.
  const line = await findTrustLine(client, address, issuerAddress);
  if (!line) {
    console.log(`   --  ${address}  skipped: no ${CURRENCY_NAME} trust line yet`);
    skipped++;
    continue;
  }
  const headroom = Number(line.limit) - Number(line.balance);
  if (headroom < Number(amount)) {
    console.log(`   --  ${address}  skipped: trust limit too low (headroom ${headroom})`);
    skipped++;
    continue;
  }
  try {
    await submit(client, distributor, {
      TransactionType: 'Payment',
      Account: distributor.address,
      Destination: address,
      Amount: uctusd(amount, issuerAddress),
    }, `${amount} ${CURRENCY_NAME} -> ${address}`);
    sent++;
  } catch (err) {
    console.log(`   !!  ${address}  ${err.message}`);
    skipped++;
  }
}

console.log(`\nDone. ${sent} sent, ${skipped} skipped.`);
if (recipients.length === 1 && sent === 1) {
  console.log(`${EXPLORER}/accounts/${recipients[0].address}`);
}
await client.disconnect();
