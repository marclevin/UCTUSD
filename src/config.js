// UCTUSD — a testnet stablecoin that mimics RLUSD, for UCT student projects.
// Everything here is XRPL TESTNET only. These tokens have no value.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = join(__dirname, '..');
export const ACCOUNTS_FILE = join(PROJECT_ROOT, 'accounts.json');

// --- Network -----------------------------------------------------------
export const NETWORK = 'wss://s.altnet.rippletest.net:51233';
export const EXPLORER = 'https://testnet.xrpl.org';

// --- Token identity ----------------------------------------------------
// "UCTUSD" is 6 characters, so — exactly like RLUSD — it cannot use the
// 3-character ISO-style code and must be expressed as 40 hex characters.
export const CURRENCY_NAME = 'UCTUSD';
export const CURRENCY_HEX = '5543545553440000000000000000000000000000';

// --- Issuance parameters ----------------------------------------------
export const TOTAL_SUPPLY = '100000000';        // 100,000,000 UCTUSD
export const DISTRIBUTOR_TRUST_LIMIT = '1000000000000';
export const STUDENT_TRUST_LIMIT = '1000000';   // default limit for student wallets
export const STUDENT_GRANT = '10000';           // default UCTUSD handed to a new student

// --- Issuer settings (classroom-friendly RLUSD profile) ----------------
// Matches RLUSD's mainnet issuer on: DefaultRipple, open trust lines,
// clawback enabled, freeze retained, zero transfer fee.
// Deliberately omits RLUSD's DepositAuth / RequireDestinationTag /
// DisallowIncomingXRP so students can pay the issuer back (burn/redeem).
export const ISSUER_DOMAIN = 'uct.ac.za';
export const ISSUER_TICK_SIZE = 5;

// The course owner's existing Xaman testnet wallet — becomes a holder.
export const OWNER_WALLET = 'r3eT2SdWPqfipdXg8zzyikt2iVNPNfYykP';

// --- Helpers -----------------------------------------------------------

/** Build an XRPL IssuedCurrencyAmount for UCTUSD. */
export function uctusd(value, issuerAddress) {
  return { currency: CURRENCY_HEX, issuer: issuerAddress, value: String(value) };
}

/** Read accounts.json, produced by `npm run setup`. */
export function loadAccounts() {
  if (!existsSync(ACCOUNTS_FILE)) {
    throw new Error(
      `accounts.json not found at ${ACCOUNTS_FILE}\n` +
      `Run "npm run setup" first to create and configure the UCTUSD accounts.`
    );
  }
  return JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));
}

/** Submit a transaction and throw with a useful message unless it succeeds. */
export async function submit(client, wallet, tx, label) {
  const res = await client.submitAndWait(tx, { autofill: true, wallet });
  const code = res.result.meta.TransactionResult;
  if (code !== 'tesSUCCESS') {
    throw new Error(`${label} failed: ${code}`);
  }
  console.log(`   ok  ${label}  (${res.result.hash})`);
  return res;
}

/** Look up a UCTUSD trust line on an account, if it has one. */
export async function findTrustLine(client, address, issuerAddress) {
  const { result } = await client.request({
    command: 'account_lines', account: address, peer: issuerAddress, ledger_index: 'validated',
  });
  return result.lines.find((l) => l.currency === CURRENCY_HEX) ?? null;
}
