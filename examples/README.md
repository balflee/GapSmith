# GapSmith Agent API Examples

Reference implementations showing how AI agents pay GapSmith via x402 on Solana.

## `agent_demo.py`

Self-contained Python script demonstrating:
1. Building + signing an SPL USDC `transferChecked` transaction
2. Encoding the X-PAYMENT header per x402 spec
3. Hitting all 4 Data API endpoints (~$0.40 total)
4. Triggering an async Compute API call (Forge ideate, 15 USDC)
5. Polling job status until completion

### Setup

```bash
pip install solders solana spl-token requests base58
```

### Run on devnet (free, get test USDC from https://faucet.circle.com/)

```bash
# Generate fresh wallet
python examples/agent_demo.py
# → prints wallet pubkey + airdrop instructions, exits

# Fund wallet:
#   solana airdrop 1 <PUBKEY> --url devnet
#   plus get devnet USDC from faucet.circle.com

# Run with funded wallet
python examples/agent_demo.py --secret-key <BASE58_PRIVATE_KEY> --skip-compute
```

### Run on mainnet (real USDC)

```bash
python examples/agent_demo.py --mainnet --secret-key <BASE58_PRIVATE_KEY>
```

Required: ~0.50 USDC + ~0.005 SOL in the wallet (Data API only is ~$0.40,
adding Compute API is +$15).

## What it shows

The demo proves three things to hackathon judges:

1. **Real x402 flow** — proper 402 → sign → retry pattern, not a mock
2. **Real Solana settlement** — every API call has an on-chain tx receipt
3. **Real autonomous agent** — no API key, no signup; the wallet IS the identity

The same script can run inside a LangChain tool, an OpenAI Assistants
function, or any AutoGen agent — anywhere your agent has HTTP access and
can sign Solana transactions.

## Use as library

```python
from examples.agent_demo import x402_get

resp = x402_get(
    "https://gapsmith.draftlabs.org/api/v1/scout/gaps?sector=ai-ml",
    wallet_secret_key=your_keypair_bytes,
)
gaps = resp.json()["gaps"]
```
