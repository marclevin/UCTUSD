"""
Onboard a custodial customer onto UCTUSD (XRPL testnet).

This is the pattern a custodial service uses: for each new customer you
create an XRPL account you control the keys for, activate it with XRP, and
open a trust line so it can hold your token.

    pip install -r requirements.txt
    python onboard_customer.py                  # new customer account
    python onboard_customer.py --seed sEd...    # trust-line an existing one

Testnet only. In real custody the customer's seed goes to an HSM/KMS, never
to stdout and never to a plain file like this script prints it.
"""

import argparse
import json
import os
from pathlib import Path

from xrpl.clients import JsonRpcClient
from xrpl.models.amounts import IssuedCurrencyAmount
from xrpl.models.requests import AccountLines
from xrpl.models.transactions import TrustSet
from xrpl.transaction import submit_and_wait
from xrpl.wallet import Wallet, generate_faucet_wallet

TESTNET_URL = "https://s.altnet.rippletest.net:51234"
EXPLORER = "https://testnet.xrpl.org"

# "UCTUSD" is 6 characters, so — like RLUSD — it must be given as the
# 40-character hex currency code rather than a 3-character ISO-style code.
CURRENCY_HEX = "5543545553440000000000000000000000000000"
DEFAULT_ISSUER = "rELez4x4Zqv3KYqboYVfrYPF8521Ycbxa5"

# The most a customer account is allowed to hold. A trust line is a cap, not
# a balance: setting it does not give the customer any tokens.
TRUST_LIMIT = "1000000"


def resolve_issuer() -> str:
    """Issuer address from env, else the repo's accounts.json, else the default."""
    if env := os.environ.get("UCTUSD_ISSUER"):
        return env
    accounts = Path(__file__).resolve().parent.parent / "accounts.json"
    if accounts.exists():
        return json.loads(accounts.read_text())["issuer"]["address"]
    return DEFAULT_ISSUER


def open_trust_line(client: JsonRpcClient, wallet: Wallet, issuer: str, limit: str):
    """Authorise `wallet` to hold up to `limit` UCTUSD issued by `issuer`."""
    trust_set = TrustSet(
        account=wallet.address,
        limit_amount=IssuedCurrencyAmount(
            currency=CURRENCY_HEX,
            issuer=issuer,
            value=limit,
        ),
    )
    # submit_and_wait autofills fee/sequence, signs, submits, and blocks until
    # the transaction is in a validated ledger.
    response = submit_and_wait(trust_set, client, wallet)
    result = response.result["meta"]["TransactionResult"]
    if result != "tesSUCCESS":
        raise RuntimeError(f"TrustSet failed: {result}")
    return response.result["hash"]


def uctusd_balance(client: JsonRpcClient, address: str, issuer: str) -> str:
    """Current UCTUSD balance, or '0' if the trust line holds nothing."""
    lines = client.request(
        AccountLines(account=address, peer=issuer, ledger_index="validated")
    ).result["lines"]
    for line in lines:
        if line["currency"] == CURRENCY_HEX:
            return line["balance"]
    return "0"


def main() -> None:
    parser = argparse.ArgumentParser(description="Onboard a UCTUSD custodial customer.")
    parser.add_argument("--seed", help="use an existing wallet instead of creating one")
    parser.add_argument("--limit", default=TRUST_LIMIT, help=f"trust limit (default {TRUST_LIMIT})")
    args = parser.parse_args()

    issuer = resolve_issuer()
    client = JsonRpcClient(TESTNET_URL)

    # 1. The customer's account. An XRPL account does not exist until it is
    #    funded, so a new one has to be activated before it can transact.
    if args.seed:
        wallet = Wallet.from_seed(args.seed)
        print(f"Using existing account {wallet.address}")
    else:
        print("Creating and funding a customer account...")
        wallet = generate_faucet_wallet(client)
        print(f"  address {wallet.address}")

    # 2. The trust line. Without it the customer cannot receive UCTUSD at all;
    #    payments to them fail with tecPATH_DRY.
    print(f"\nOpening UCTUSD trust line (limit {args.limit})...")
    tx_hash = open_trust_line(client, wallet, issuer, args.limit)
    print(f"  ok  {tx_hash}")

    balance = uctusd_balance(client, wallet.address, issuer)

    # What a custodial service would store against the customer record.
    print("\n" + "=" * 62)
    print("  Customer account ready")
    print("=" * 62)
    print(f"  Address  : {wallet.address}")
    print(f"  Seed     : {wallet.seed}   <- testnet only; use an HSM for real")
    print(f"  Issuer   : {issuer}")
    print(f"  Currency : {CURRENCY_HEX}")
    print(f"  Balance  : {balance} UCTUSD")
    print(f"  Explorer : {EXPLORER}/accounts/{wallet.address}")
    print("=" * 62)
    print("\nThe account can now hold UCTUSD. Ask a TA to fund it, or send from")
    print("the distributor:  npm run distribute -- " + wallet.address)


if __name__ == "__main__":
    main()
