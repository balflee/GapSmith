"""
GapSmith x402 agent demo — self-contained reference implementation.

Demonstrates an autonomous AI agent paying GapSmith via the x402 protocol on
Solana to fetch market intelligence, then triggering an async Forge ideation
job and polling for the result.

  Usage:
    pip install solders solana spl-token requests base58
    python agent_demo.py [--mainnet] [--secret-key BASE58_KEY]

  By default runs on devnet. Pass --mainnet to use real USDC.
  If --secret-key is omitted, generates an ephemeral wallet (devnet only —
  on mainnet you must supply your own funded wallet).

Author: GapSmith / Colosseum Frontier Hackathon 2026
License: MIT
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from typing import Any

import base58
import requests
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction
from solders.message import Message
from solders.instruction import Instruction, AccountMeta
from solders.system_program import TransferParams, transfer
from solders.hash import Hash
from solana.rpc.api import Client
from spl.token.instructions import (
    get_associated_token_address,
    create_associated_token_account,
    transfer_checked,
    TransferCheckedParams,
)


# ────────────────────────────────────────────────────────────────────
# Constants
# ────────────────────────────────────────────────────────────────────

GAPSMITH_BASE = "https://gapsmith.draftlabs.org"
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
MEMO_PROGRAM_ID = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

# USDC mints
USDC_MAINNET = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
USDC_DEVNET = Pubkey.from_string("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")

RPC_MAINNET = "https://api.mainnet-beta.solana.com"
RPC_DEVNET = "https://api.devnet.solana.com"


# ────────────────────────────────────────────────────────────────────
# Wallet helpers
# ────────────────────────────────────────────────────────────────────

def load_keypair(secret_key_b58: str | None) -> Keypair:
    if secret_key_b58:
        return Keypair.from_bytes(base58.b58decode(secret_key_b58))
    return Keypair()


def usdc_mint_for(network: str) -> Pubkey:
    return USDC_MAINNET if network == "mainnet" else USDC_DEVNET


def rpc_for(network: str) -> str:
    return RPC_MAINNET if network == "mainnet" else RPC_DEVNET


# ────────────────────────────────────────────────────────────────────
# x402 helpers — the core protocol implementation
# ────────────────────────────────────────────────────────────────────

def parse_402(resp: requests.Response) -> dict:
    """Extract the first acceptable payment requirement from a 402 response."""
    body = resp.json()
    accepts = body.get("accepts") or []
    if not accepts:
        raise RuntimeError(f"402 had no payment options: {body}")
    return accepts[0]


def build_x402_header(tx_signature: str, network: str) -> str:
    """Encode the X-PAYMENT header per x402 spec (base64 of JSON)."""
    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": "solana" if network == "mainnet" else "solana-devnet",
        "payload": {"txSignature": tx_signature},
    }
    return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def settle_payment(
    requirements: dict,
    keypair: Keypair,
    network: str,
) -> str:
    """Build + sign + submit an SPL USDC transferChecked tx with memo."""
    rpc = Client(rpc_for(network), commitment="confirmed")
    mint = Pubkey.from_string(requirements["asset"])
    recipient_ata = Pubkey.from_string(requirements["payTo"])
    amount_atomic = int(requirements["maxAmountRequired"])
    sender_ata = get_associated_token_address(keypair.pubkey(), mint)

    instructions: list[Instruction] = []

    # Idempotently create merchant ATA if missing (first buyer pays ~0.002 SOL rent).
    # Solana RFC: create_associated_token_account is itself idempotent in newer SPL versions;
    # we wrap in a try/except so we don't bail on already-existing account.
    info = rpc.get_account_info(recipient_ata).value
    if info is None:
        instructions.append(
            create_associated_token_account(
                payer=keypair.pubkey(),
                owner=Pubkey.from_string(requirements.get("extra", {}).get("assetOwner", "")) if requirements.get("extra") else recipient_ata,
                mint=mint,
            )
        )

    # SPL transferChecked: sender_ata -> recipient_ata
    instructions.append(
        transfer_checked(
            TransferCheckedParams(
                program_id=TOKEN_PROGRAM_ID,
                source=sender_ata,
                mint=mint,
                dest=recipient_ata,
                owner=keypair.pubkey(),
                amount=amount_atomic,
                decimals=6,  # USDC
            )
        )
    )

    # Memo binds the tx to this resource (server logs it for analytics)
    memo_text = f"x402:{requirements['resource']}"
    instructions.append(
        Instruction(
            program_id=MEMO_PROGRAM_ID,
            accounts=[],
            data=memo_text.encode("utf-8"),
        )
    )

    blockhash_resp = rpc.get_latest_blockhash()
    blockhash: Hash = blockhash_resp.value.blockhash
    msg = Message.new_with_blockhash(instructions, keypair.pubkey(), blockhash)
    tx = Transaction([keypair], msg, blockhash)
    sig_resp = rpc.send_transaction(tx)
    tx_signature = str(sig_resp.value)

    # Wait for confirmation
    rpc.confirm_transaction(sig_resp.value, commitment="confirmed")
    return tx_signature


def x402_request(
    method: str,
    url: str,
    *,
    keypair: Keypair,
    network: str = "mainnet",
    json_body: dict | None = None,
    timeout: int = 30,
) -> requests.Response:
    """Make an x402-paid request: probe -> 402 -> pay -> retry with proof."""

    # Probe
    probe = requests.request(method, url, json=json_body, timeout=timeout)
    if probe.status_code != 402:
        return probe  # Already non-402 (cached, or different error)

    requirements = parse_402(probe)
    print(f"  -> {probe.status_code} {requirements['description']}")
    print(f"  -> cost: {int(requirements['maxAmountRequired']) / 1_000_000:.4f} USDC")

    # Settle on-chain
    print("  -> signing + sending Solana tx...")
    tx_sig = settle_payment(requirements, keypair, network)
    print(f"  -> tx: {tx_sig}")

    # Redeem
    headers = {"X-PAYMENT": build_x402_header(tx_sig, network)}
    final = requests.request(method, url, json=json_body, headers=headers, timeout=timeout)
    return final


# ────────────────────────────────────────────────────────────────────
# Demo flow
# ────────────────────────────────────────────────────────────────────

def _add_network_param(path: str, network: str) -> str:
    """Append ?network=devnet to URLs when running on devnet so the server
    builds a devnet 402 response. Mainnet is the server default; no param needed."""
    if network != "devnet":
        return path
    sep = "&" if "?" in path else "?"
    return f"{path}{sep}network=devnet"


def demo_data_api(keypair: Keypair, network: str) -> None:
    """Hit each Data API endpoint, paying $0.10 per call."""
    print("\n=== Data API demo ===")
    paths = [
        "/api/v1/scout/gaps?sector=ai-ml&limit=5",          # synthesized opportunities
        "/api/v1/scout/brief",                               # daily executive brief (richest)
        "/api/v1/scout/pain-clusters?sector=ai-ml&limit=5",
        "/api/v1/scout/trends?days=7&limit=5",
        "/api/v1/scout/keywords?limit=10",
    ]
    for path in paths:
        url = GAPSMITH_BASE + _add_network_param(path, network)
        print(f"\nGET {path}")
        resp = x402_request("GET", url, keypair=keypair, network=network)
        if resp.ok:
            data = resp.json()
            keys = list(data.keys())
            count = data.get("count", "?")
            print(f"  [OK] 200 — keys={keys}, count={count}")
            # Show a tiny preview
            for k in keys:
                v = data[k]
                if isinstance(v, list) and v:
                    print(f"  preview {k}[0]: {json.dumps(v[0])[:120]}")
                    break
        else:
            print(f"  ✗ {resp.status_code} — {resp.text[:200]}")


def demo_compute_api(keypair: Keypair, network: str) -> None:
    """Trigger an async Forge brainstorm + poll until done."""
    print("\n=== Compute API demo ===")
    url = GAPSMITH_BASE + _add_network_param("/api/v1/forge/ideate", network)
    print(f"\nPOST {url}")
    body = {
        "sectors": ["ai-ml"],
        "context": "Find a SaaS gap in agent observability — what frustrates devs running multi-agent pipelines in production?",
        "product_modes": ["saas"],
    }
    resp = x402_request("POST", url, keypair=keypair, network=network, json_body=body, timeout=60)
    if resp.status_code != 202:
        print(f"  ✗ unexpected status {resp.status_code} — {resp.text[:300]}")
        return
    job = resp.json()
    print(f"  [OK] 202 jobId={job['jobId']} eta={job['etaMinutes']} min")
    print(f"  -> polling {job['statusUrl']} every 60s...")

    deadline = time.time() + 60 * (job["etaMinutes"] + 15)
    while time.time() < deadline:
        time.sleep(60)
        s = requests.get(GAPSMITH_BASE + job["statusUrl"]).json()
        print(f"  status={s['status']}  progress={s.get('progressPct', 0)}%")
        if s["status"] == "completed":
            print(f"\n  [OK] DONE — top ideas: {len(s.get('result', {}).get('top_ideas', []))}")
            print(json.dumps(s["result"], indent=2)[:800])
            return
        if s["status"] == "failed":
            print(f"  ✗ FAILED: {s.get('error', 'unknown')}")
            return
    print("  ✗ Polling timed out")


# ────────────────────────────────────────────────────────────────────
# Convenience export — minimal usage from external scripts
# ────────────────────────────────────────────────────────────────────

def x402_get(url: str, wallet_secret_key: bytes, network: str = "mainnet") -> requests.Response:
    """Five-line entry point: pay + GET + return response."""
    kp = Keypair.from_bytes(wallet_secret_key)
    return x402_request("GET", url, keypair=kp, network=network)


def x402_post(url: str, body: dict[str, Any], wallet_secret_key: bytes, network: str = "mainnet") -> requests.Response:
    kp = Keypair.from_bytes(wallet_secret_key)
    return x402_request("POST", url, keypair=kp, network=network, json_body=body)


# ────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────

def _load_env_secret() -> str | None:
    """Try to load AGENT_TEST_WALLET_SECRET from .env.local for convenience."""
    import os
    env_paths = [".env.local", "../.env.local"]
    for p in env_paths:
        if not os.path.exists(p):
            continue
        with open(p) as f:
            for line in f:
                if line.startswith("AGENT_TEST_WALLET_SECRET="):
                    return line.split("=", 1)[1].strip()
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="GapSmith x402 agent demo")
    parser.add_argument("--mainnet", action="store_true", help="Use mainnet (default: devnet)")
    parser.add_argument("--secret-key", help="Base58 wallet secret. Defaults to AGENT_TEST_WALLET_SECRET in .env.local for devnet.")
    parser.add_argument("--skip-compute", action="store_true", help="Skip the slow ~30 min Compute API demo")
    args = parser.parse_args()

    # Devnet convenience: auto-load test wallet secret from .env.local if no flag given
    if not args.secret_key and not args.mainnet:
        args.secret_key = _load_env_secret()

    network = "mainnet" if args.mainnet else "devnet"

    if network == "mainnet" and not args.secret_key:
        print("ERROR: --mainnet requires --secret-key (with funded USDC + a little SOL).")
        print("Tip: pass --devnet to test for free with faucet USDC + SOL airdrop.")
        sys.exit(1)

    keypair = load_keypair(args.secret_key)
    print(f"Wallet:  {keypair.pubkey()}")
    print(f"Network: {network}")

    if not args.secret_key:
        print("(Ephemeral wallet generated. On devnet, fund via:")
        print(f"   solana airdrop 1 {keypair.pubkey()} --url {rpc_for(network)}")
        print("   plus USDC from https://faucet.circle.com/ )\n")
        print("Aborting before any payment — re-run with --secret-key once funded.")
        sys.exit(0)

    # Sanity: check we have some USDC + SOL
    rpc = Client(rpc_for(network), commitment="confirmed")
    sol_lamports = rpc.get_balance(keypair.pubkey()).value
    print(f"SOL balance: {sol_lamports / 1e9:.6f}")
    if sol_lamports < 5_000_000:  # 0.005 SOL
        print("⚠  Warning: low SOL balance. Need ~0.001 SOL for gas + 0.002 if creating ATA.")

    demo_data_api(keypair, network)
    if not args.skip_compute:
        demo_compute_api(keypair, network)


if __name__ == "__main__":
    main()
