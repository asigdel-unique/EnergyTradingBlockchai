# EnergyTradingBlockchain

A decentralized peer-to-peer energy trading marketplace built with Solidity and Hardhat, featuring automatic offer/request matching and a React frontend.

## How it works

- Users register with a display name and post **sell offers** (energy + price) or **buy requests** (energy needed + max price, escrowed in ETH).
- `autoMatch()` scans all active buy requests and settles every trade it can find against a fitting offer — no manual ID entry needed.
- Settled trades (seller, buyer, energy, price, timestamp) are recorded on-chain and viewable in the frontend's trade history.

## Project layout

```
contracts/        Solidity source files (*.sol) and unit tests (*.t.sol)
test/              TypeScript integration tests
ignition/          Hardhat Ignition deployment modules
scripts/           Deployment scripts run with `hardhat run`
frontend/          React + ethers.js UI
hardhat.config.ts
```

## Usage

### Install dependencies

```shell
npm install
cd frontend && npm install
```

### Run a local chain

```shell
npx hardhat node
```

### Deploy the marketplace contract

```shell
npx hardhat run scripts/deploy-marketplace.js
```

Copy the printed contract address into `CONTRACT_ADDRESS` in `frontend/src/App.jsx`.

### Run the frontend

```shell
cd frontend && npm run dev
```

Open the printed local URL, connect MetaMask to the Hardhat network (chain ID `31337`, RPC `http://127.0.0.1:8545`), and start trading.

### Run tests

```shell
npx hardhat test solidity
```
