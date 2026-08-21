// Student onboarding: get a testnet wallet that is ready to use UCTUSD.
//
//   node src/onboard-student.js                 # brand-new funded wallet
//   node src/onboard-student.js --seed sEd...   # use a wallet you already have
//   node src/onboard-student.js --limit 50000   # custom trust limit
//
// Creates (or reuses) a wallet, funds it from the XRP testnet faucet, and
// sets the UCTUSD trust line.
//
// It then tries to top the wallet up with UCTUSD, using distributor
// credentials from accounts.json or from the UCTUSD_DISTRIBUTOR_SEED
// environment variable. Students who have neither still get a fully
// trust-lined wallet — they just need a TA to send them tokens.

import { Client, Wallet, TrustSetFlags } from 'xrpl';
import { existsSync } from 'node:fs';
import {
  NETWORK, EXPLORER, CURRENCY_NAME, CURRENCY_HEX, ACCOUNTS_FILE,
  STUDENT_TRUST_LIMIT, STUDENT_GRANT, loadAccounts, uctusd, submit,
} from './config.js';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

// The issuer address is public information, so it can be supplied by env var
// for students working from a copy of this script without accounts.json.
let issuerAddress = process.env.UCTUSD_ISSUER || null;
let distributorSeed = process.env.UCTUSD_DISTRIBUTOR_SEED || null;
if (existsSync(ACCOUNTS_FILE)) {
  const accounts = loadAccounts();
  issuerAddress ||= accounts.issuer.address;
  distributorSeed ||= accounts.distributor.seed;
}
if (!issuerAddress) {
  console.error(`No issuer address. Set UCTUSD_ISSUER=r... or run this next to accounts.json.`);
  process.exit(1);
}

const client = new Client(NETWORK);
await client.connect();

// 1. Wallet --------------------------------------------------------------
const existingSeed = arg('--seed');
let wallet;
if (existingSeed) {
  wallet = Wallet.fromSeed(existingSeed);
  console.log(`1/3  Using existing wallet ${wallet.address}`);
  // An unfunded account cannot submit transactions; top it up if needed.
  try {
    await client.request({ command: 'account_info', account: wallet.address, ledger_index: 'validated' });
  } catch {
    console.log(`     not activated yet — requesting XRP from the faucet...`);
    ({ wallet } = await client.fundWallet(wallet));
  }
} else {
  console.log('1/3  Creating and funding a new testnet wallet...');
  ({ wallet } = await client.fundWallet());
  console.log(`     address ${wallet.address}`);
}

// 2. Trust line ----------------------------------------------------------
const limit = arg('--limit') || STUDENT_TRUST_LIMIT;
console.log(`\n2/3  Setting the ${CURRENCY_NAME} trust line (limit ${limit})...`);
await submit(client, wallet, {
  TransactionType: 'TrustSet',
  Account: wallet.address,
  LimitAmount: uctusd(limit, issuerAddress),
}, `TrustSet ${CURRENCY_NAME}`);

// 3. Optional top-up -----------------------------------------------------
console.log(`\n3/3  Requesting ${CURRENCY_NAME}...`);
if (distributorSeed) {
  const distributor = Wallet.fromSeed(distributorSeed);
  await submit(client, distributor, {
    TransactionType: 'Payment',
    Account: distributor.address,
    Destination: wallet.address,
    Amount: uctusd(STUDENT_GRANT, issuerAddress),
  }, `${STUDENT_GRANT} ${CURRENCY_NAME} -> ${wallet.address}`);
} else {
  console.log(`     no distributor credentials available — skipping.`);
  console.log(`     Send this address to your TA to be funded: ${wallet.address}`);
}

console.log('\n' + '='.repeat(66));
console.log(`  Wallet ready`);
console.log('='.repeat(66));
console.log(`  Address       : ${wallet.address}`);
console.log(`  Seed          : ${wallet.seed}   <- testnet only, keep it handy`);
console.log(`  Token         : ${CURRENCY_NAME}`);
console.log(`  Currency code : ${CURRENCY_HEX}`);
console.log(`  Issuer        : ${issuerAddress}`);
console.log(`  Explorer      : ${EXPLORER}/accounts/${wallet.address}`);
console.log('='.repeat(66));

await client.disconnect();
