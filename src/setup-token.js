// One-time creation of the UCTUSD token on the XRPL testnet.
//
//   node src/setup-token.js
//
// Creates a cold ISSUER and a hot DISTRIBUTOR, configures the issuer with an
// RLUSD-style profile, then mints the full supply into the distributor.
// Writes credentials to accounts.json. Refuses to run twice.

import { Client, AccountSetAsfFlags, TrustSetFlags, convertStringToHex } from 'xrpl';
import { writeFileSync, existsSync } from 'node:fs';
import {
  NETWORK, EXPLORER, ACCOUNTS_FILE, CURRENCY_NAME, CURRENCY_HEX,
  TOTAL_SUPPLY, DISTRIBUTOR_TRUST_LIMIT, ISSUER_DOMAIN, ISSUER_TICK_SIZE,
  OWNER_WALLET, uctusd, submit,
} from './config.js';

if (existsSync(ACCOUNTS_FILE)) {
  console.error(`accounts.json already exists — UCTUSD looks set up already.`);
  console.error(`Delete or rename it if you really want to mint a brand-new token.`);
  process.exit(1);
}

const client = new Client(NETWORK);
await client.connect();
console.log(`Connected to XRPL testnet (${NETWORK})\n`);

// 1. Fund the two accounts from the testnet faucet ----------------------
console.log('1/6  Funding accounts from the testnet faucet...');
const { wallet: issuer } = await client.fundWallet();
console.log(`   issuer       ${issuer.address}`);
const { wallet: distributor } = await client.fundWallet();
console.log(`   distributor  ${distributor.address}\n`);

// 2. Clawback — MUST be set before the issuer has any trust lines -------
console.log('2/6  Enabling clawback on the issuer (must precede any trust line)...');
await submit(client, issuer, {
  TransactionType: 'AccountSet',
  Account: issuer.address,
  SetFlag: AccountSetAsfFlags.asfAllowTrustLineClawback,
}, 'AccountSet asfAllowTrustLineClawback');

// 3. DefaultRipple — without this the token cannot move between holders -
console.log('\n3/6  Enabling DefaultRipple on the issuer...');
await submit(client, issuer, {
  TransactionType: 'AccountSet',
  Account: issuer.address,
  SetFlag: AccountSetAsfFlags.asfDefaultRipple,
}, 'AccountSet asfDefaultRipple');

// 4. Cosmetic / market settings. TransferRate is left unset = 0% fee,
//    matching RLUSD. NoFreeze is deliberately NOT set, so the issuer keeps
//    the ability to freeze individual trust lines.
console.log('\n4/6  Setting issuer Domain and TickSize...');
await submit(client, issuer, {
  TransactionType: 'AccountSet',
  Account: issuer.address,
  Domain: convertStringToHex(ISSUER_DOMAIN),
  TickSize: ISSUER_TICK_SIZE,
}, `AccountSet Domain=${ISSUER_DOMAIN} TickSize=${ISSUER_TICK_SIZE}`);

// 5. Distributor trusts the issuer. NoRipple on the hot wallet's side is
//    standard practice: it stops third parties rippling through the
//    distributor, without affecting its own payments.
console.log('\n5/6  Creating the distributor trust line...');
await submit(client, distributor, {
  TransactionType: 'TrustSet',
  Account: distributor.address,
  LimitAmount: uctusd(DISTRIBUTOR_TRUST_LIMIT, issuer.address),
  Flags: TrustSetFlags.tfSetNoRipple,
}, `TrustSet ${CURRENCY_NAME} limit ${DISTRIBUTOR_TRUST_LIMIT}`);

// 6. Mint the supply -----------------------------------------------------
console.log(`\n6/6  Minting ${Number(TOTAL_SUPPLY).toLocaleString('en-US')} ${CURRENCY_NAME}...`);
await submit(client, issuer, {
  TransactionType: 'Payment',
  Account: issuer.address,
  Destination: distributor.address,
  Amount: uctusd(TOTAL_SUPPLY, issuer.address),
}, `Payment ${TOTAL_SUPPLY} ${CURRENCY_NAME} -> distributor`);

// --- Persist credentials -----------------------------------------------
const accounts = {
  network: NETWORK,
  currency: { name: CURRENCY_NAME, hex: CURRENCY_HEX },
  issuer: { address: issuer.address, seed: issuer.seed, role: 'cold / issuing account' },
  distributor: { address: distributor.address, seed: distributor.seed, role: 'hot / operational account' },
  owner: { address: OWNER_WALLET, role: 'Xaman holder (no seed held here)' },
  totalSupply: TOTAL_SUPPLY,
};
writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

// --- Verify from the ledger --------------------------------------------
const { result: bal } = await client.request({
  command: 'gateway_balances', account: issuer.address, ledger_index: 'validated',
});
const { result: info } = await client.request({
  command: 'account_info', account: issuer.address, ledger_index: 'validated',
});

console.log('\n' + '='.repeat(66));
console.log(`  ${CURRENCY_NAME} is live on the XRPL testnet`);
console.log('='.repeat(66));
console.log(`  Currency code (hex) : ${CURRENCY_HEX}`);
console.log(`  Issuer              : ${issuer.address}`);
console.log(`  Distributor         : ${distributor.address}`);
console.log(`  Obligations         :`, bal.obligations);
console.log(`  Issuer flags        :`, Object.entries(info.account_flags)
  .filter(([, v]) => v).map(([k]) => k).join(', '));
console.log(`  Explorer            : ${EXPLORER}/accounts/${issuer.address}`);
console.log('='.repeat(66));
console.log(`\nCredentials written to accounts.json (testnet seeds — do not reuse on mainnet).`);

await client.disconnect();
