# Eve Frontier — LLM Agent Integration Kickoff
*Research compiled March 25, 2026*

---

## What Is Eve Frontier?

A survival MMO by CCP Games set in the Eve Online universe. Players mine, build bases, fly ships, and fight — but the twist is a **programmable infrastructure layer** running on the **Sui blockchain**. Smart gates, turrets, and storage units can all be controlled by on-chain Move smart contracts. This is where LLM agents can plug in.

Currently in **Cycle 5 ("Shroud of Fear")** on **Sui Testnet**.

---

## The Technical Surface

### 1. World API (REST — read-only game state)

**Base URL:** `https://blockchain-gateway-stillness.live.tech.evefrontier.com`
**Docs:** `https://docs.evefrontier.com/SwaggerWorldApi`

| Endpoint Area       | What You Get                                              |
|---------------------|-----------------------------------------------------------|
| Smart Assemblies    | Locations, types, tribe ownership, status of all deployables |
| Characters          | On-chain identity data (soul-bound Sui objects)           |
| Killmails           | Victim/killer IDs, addresses, solar system, timestamps    |
| Solar Systems       | System IDs, region IDs, names, coordinates                |
| Items               | Type IDs, descriptions, attributes                        |
| Market Prices       | Highest/lowest/average prices, order quantities           |

**WebSocket also available** at `wss://blockchain-gateway-stillness.live.tech.evefrontier.com`

No auth required for public GET queries. This is your easiest entry point.

### 2. Programmable Smart Assemblies (on-chain, Move contracts)

This is the real integration surface. Three assembly types can run custom logic:

**Smart Gates** — Control who can jump between solar systems:
- `gate::issue_jump_permit` — grant/deny traversal
- `gate::jump_with_permit` — execute a permitted jump
- `gate::authorize_extension` — attach custom logic
- Use cases: tribe-only gates, reputation gates, toll gates, bounty-submission gates

**Smart Turrets** — Define automated targeting strategies:
- Aggression rules, proximity triggers, ship filtering, scoring
- Use cases: defense perimeters, faction enforcement, pirate deterrence

**Smart Storage Units** — Programmable inventory access:
- `storage_unit.deposit_item` / `storage_unit.withdraw_by_owner`
- Use cases: vending machines, bounty collection, access-controlled warehouses

### 3. PODs (Provable Object Data)

Signed JSON attestations of in-game events — jumps, kills, locations, market prices. Verifiable off-chain. Think of them as trustless receipts from the game.

**Docs:** `https://docs.evefrontier.com/pods`
**Verify endpoint:** `POST /pod/verify`

Use cases: threat intelligence, market analysis, alliance coordination, audit trails.

### 4. What You CANNOT Automate

CCP intentionally keeps core gameplay manual:
- **No ship piloting API** — you fly with your hands
- **No mining automation** — you drill with your hands
- **No combat API** — beyond turret targeting rules
- **No market order placement** — read-only price data only

The programmable layer is infrastructure, not the joystick.

---

## Developer Resources

### Official

| Resource | URL |
|----------|-----|
| **Documentation Portal** | https://docs.evefrontier.com |
| **Builder Scaffold (SDK)** | https://github.com/evefrontier/builder-scaffold |
| **DApps Monorepo** | https://github.com/evefrontier/dapps |
| **Eve Vault (wallet)** | https://github.com/evefrontier/evevault |
| **Org GitHub** | https://github.com/evefrontier |

### Builder Scaffold — Your Starting Point

The official SDK for writing smart assembly extensions:
- Move contract templates for gates, turrets, storage units
- TypeScript scripts for deploying and calling contracts
- zkLogin integration tools
- Docker-based local dev environment
- **Dependencies:** Git, Docker OR (Sui CLI + Node.js)

Three deployment paths: Docker (local), Host (local/testnet), Existing World.

### DApp Kit

`@evefrontier/dapp-kit` — TypeScript library for building web apps that talk to the World API and on-chain data. If you're building a dashboard or ops tool, start here.

### Authentication

- **Reading data:** No auth needed (public on-chain data)
- **Writing transactions:** zkLogin (OAuth → Sui wallet via zero-knowledge proofs). Players auth with Google/Twitch/Facebook/EVE. No private key management.
- **Gas fees:** Sponsored by CCP — you don't need SUI tokens
- **Contract deployment:** Sui CLI + wallet keypair, configured via `.env`

---

## Community Projects Worth Studying

| Project | What It Does | GitHub |
|---------|-------------|--------|
| **frontier-flow** | Visual node editor → generates Move contracts | `Scetrov/frontier-flow` |
| **eve-agent-skills** | Agent skills framework with session login | `olicand/eve-agent-skills` |
| **watchtower** | Chain archaeology + oracle intelligence | `AreteDriver/watchtower` |
| **frontier-tribe-os** | Tribe/Syndicate ops platform | `AreteDriver/frontier-tribe-os` |
| **eve-tracker** | Crowdsourced intel + star map + route planner | `nhatlapross/eve-tracker` |
| **ef-map.com** | Community mapping tool (FastAPI + React) | ef-map.com |

**`eve-agent-skills`** and **`frontier-flow`** are the most relevant to what you're building.

---

## The Hackathon

**EVE Frontier x Sui Hackathon 2026**
- **Dates:** March 11–31, 2026 (6 days left)
- **Prize pool:** $80,000
- **Theme:** "A Toolkit for Civilization"
- **Registration:** http://deepsurge.xyz/evefrontier2026

**Two tracks:**
1. **In-world mods** — Smart Assembly extensions (Move contracts)
2. **External tools** — Maps, analytics, coordination platforms

An LLM-powered ops/strategy agent fits squarely in Track 2 with potential for Track 1 if it generates Move contracts.

---

## Where to Start Learning (Priority Order)

### Day 1–2: Foundations
1. **Read the docs** — https://docs.evefrontier.com, especially Smart Assemblies and PODs sections
2. **Hit the World API** — Open the Swagger docs, make some GET requests. Pull solar systems, assemblies, killmails. Get a feel for the data shape.
3. **Clone builder-scaffold** — `git clone https://github.com/evefrontier/builder-scaffold.git` and walk through the README. Get the local Docker env running.
4. **Study `eve-agent-skills`** — This is closest to what you want to build. Understand the session/auth pattern.

### Day 3–4: Build the Core
5. **Stand up a World API client** — Node.js or Python, pull and cache game state (systems, assemblies, killmails, market data)
6. **Wire an LLM to the data** — Feed game state as context, let it answer questions: "Where should I mine?" "What's dangerous right now?" "Who controls this system?"
7. **Add POD consumption** — Parse and verify PODs for real-time event intelligence

### Day 5–6: Ship It
8. **Move contract generation** (stretch goal) — If the LLM can generate valid Move code for turret/gate configs from natural language, that's your killer feature
9. **Polish the UI** — Dashboard, map overlay, alert system
10. **Record a demo** — Hackathons are won on demos, not code

### Key Technologies to Know
- **Sui blockchain** — Object-centric model, very different from Ethereum. Read https://docs.sui.io
- **Move language** — Sui's smart contract language. Resource-oriented, type-safe. Start with the Sui Move tutorials.
- **zkLogin** — Sui's OAuth-to-wallet bridge. The builder-scaffold handles most of this.

---

## LLM Agent Architecture (Sketch)

```
┌─────────────────────────────────────────────┐
│              LLM Agent Core                  │
│  (strategy, analysis, contract generation)   │
└──────────┬──────────────┬───────────────────┘
           │              │
     ┌─────▼─────┐  ┌────▼────────────┐
     │ World API  │  │  Sui On-Chain   │
     │  Client    │  │  Client         │
     │ (read)     │  │ (read + write)  │
     └─────┬─────┘  └────┬────────────┘
           │              │
     ┌─────▼─────┐  ┌────▼────────────┐
     │ Game State │  │ Smart Assembly  │
     │ Cache      │  │ Deployment      │
     │ (systems,  │  │ (gates, turrets,│
     │  kills,    │  │  storage)       │
     │  market)   │  │                 │
     └─────┬─────┘  └────┬────────────┘
           │              │
     ┌─────▼──────────────▼───────────┐
     │         POD Ingestion          │
     │   (verified event stream)      │
     └────────────────────────────────┘
```

**Recommended stack:** Node.js (you already live here), `@evefrontier/dapp-kit` for chain interaction, any LLM API for the brain.

---

## Risks and Gotchas

- **Sui Testnet** — Everything is testnet. Data resets are possible between cycles.
- **Move is new** — Fewer tutorials, smaller ecosystem than Solidity. The builder-scaffold templates are your best friend.
- **No direct gameplay automation** — Don't pitch "AI plays the game for you." Pitch "AI makes you smarter at playing the game."
- **zkLogin complexity** — Session management with ephemeral keypairs can be tricky. Study the Eve Vault source.
- **Migration residue** — Some docs/repos still reference the old EVM/MUD/Solidity stack. If you see Solidity, you're looking at legacy. Sui/Move is current.

---

## Quick Links

- Eve Frontier Docs: https://docs.evefrontier.com
- World API Swagger: https://docs.evefrontier.com/SwaggerWorldApi
- Builder Scaffold: https://github.com/evefrontier/builder-scaffold
- DApps Kit: https://github.com/evefrontier/dapps
- Sui Docs: https://docs.sui.io
- Move Language: https://move-language.github.io/move/
- Hackathon Registration: http://deepsurge.xyz/evefrontier2026
