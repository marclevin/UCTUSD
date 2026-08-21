# UCTUSD — an RLUSD-alike stablecoin on the XRPL testnet

Teaching token for UCT student projects. **Testnet only. These tokens have no value.**

## Token details

| | |
|---|---|
| Network | XRPL Testnet (`wss://s.altnet.rippletest.net:51233`) |
| Symbol | `UCTUSD` |
| Currency code | `5543545553440000000000000000000000000000` |
| Issuer | `rELez4x4Zqv3KYqboYVfrYPF8521Ycbxa5` |
| Distributor | `rsWPX7FKwnfk6enosumAzEuTs5Y12Steq4` |
| Supply | 100,000,000 |
| Transfer fee | 0% |

`UCTUSD` is 6 characters, so — exactly like RLUSD — it cannot use the 3-character
ISO-style code and must be given as the 40-character hex code above.

## Issuer configuration

Modelled on RLUSD's mainnet issuer (`rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`):

| Setting | UCTUSD | RLUSD | |
|---|---|---|---|
| `DefaultRipple` | on | on | required for holder-to-holder transfers |
| `RequireAuth` | off | off | anyone may open a trust line |
| `AllowTrustLineClawback` | on | on | issuer can claw tokens back |
| `NoFreeze` | not set | not set | issuer retains freeze powers |
| `TransferRate` | 0% | 0% | |
| `DepositAuth` | **off** | on | *differs* — lets students pay the issuer |
| `RequireDestTag` | **off** | on | *differs* |
| `DisallowIncomingXRP` | **off** | on | *differs* |

The three differences are deliberate: RLUSD's settings block payments *to* the
issuer, which would break burn/redeem exercises.

## Node scripts (xrpl.js)

```bash
npm install

npm run setup                                  # one-time; already done
npm run distribute -- <address> [amount]       # send UCTUSD to one address
npm run distribute -- --batch students.txt     # send to a list of addresses
npm run distribute -- --balances               # supply and holders
npm run onboard                                # new funded + trust-lined wallet
npm run onboard -- --seed sEd...               # trust-line an existing wallet
```

`students.txt` is one address per line; `#` comments and blank lines are ignored.
A line may be `rAddress,amount` to override the default grant.

Recipients need a UCTUSD trust line before they can be paid — `distribute` checks
this and skips with a clear message rather than failing on `tecPATH_DRY`.

For self-serve onboarding without handing out `accounts.json`, students can run
`onboard` with environment variables instead:

```bash
UCTUSD_ISSUER=rELez4x4Zqv3KYqboYVfrYPF8521Ycbxa5 \
UCTUSD_DISTRIBUTOR_SEED=<distributor seed> npm run onboard
```

Omit `UCTUSD_DISTRIBUTOR_SEED` and they still get a trust-lined wallet; they just
need a TA to fund it.

## Python (xrpl-py)

`python/onboard_customer.py` is the same onboarding flow in Python, written the
way a **custodial service** would do it: create an account you hold the keys for
on the customer's behalf, activate it with XRP, open the UCTUSD trust line.

```bash
cd python
pip install -r requirements.txt

python onboard_customer.py                  # new customer account
python onboard_customer.py --seed sEd...    # trust-line an existing account
python onboard_customer.py --limit 50000    # custom trust limit
```

It reads the issuer from `UCTUSD_ISSUER`, else `../accounts.json`, else a built-in
default — so it still works if you hand students only this one file.

A trust line is a **cap, not a balance**: opening one lets the account hold UCTUSD
but does not give it any. Fund it with `npm run distribute -- <address>`.

## Adding UCTUSD to Xaman

1. Xaman → Settings → Advanced → **Node**: switch to a Testnet node.
2. Go to the account, tap **Add asset** → **Add custom asset** (or "manually").
3. Issuer: `rELez4x4Zqv3KYqboYVfrYPF8521Ycbxa5`
   Currency: `5543545553440000000000000000000000000000`
4. Approve the TrustSet, then run
   `npm run distribute -- <your address> 50000`.

## Files

- `src/config.js` — token constants and shared helpers
- `src/setup-token.js` — one-time issuance (refuses to run twice)
- `src/distribute.js` — hand out tokens / inspect supply
- `src/onboard-student.js` — student wallet + trust line + grant
- `python/onboard_customer.py` — custodial-customer onboarding in xrpl-py
- `accounts.json` — **contains testnet seeds**; gitignored
