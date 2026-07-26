# ☕ The Thank-You Wall

> **A Decentralized, Transparent Web3 Micro-Tipping Platform for Webcomic Artists & Digital Creators.**

![The Thank-You Wall](public/artist_avatar.jpg)

## 📖 Story & Vision
A webcomic artist has posted free comic strips for two years. Readers frequently ask how they can chip in for coffee. Traditional tip platforms take hefty cuts, mandate complex tax forms, and block supporters across many international regions.

**The Thank-You Wall** is the simplest possible solution:
A page where a reader connects a browser wallet (MetaMask), sends a few dollars of ETH with a cozy note, and watches their message appear on a live supporter wall. Every tip and message is recorded directly on the Ethereum blockchain — 100% transparent, permanent, and with **zero middleman cut**.

---

## ✨ Features
- **Solidity Smart Contract (`TipJar.sol`)**:
  - `tip(string memory message)`: `payable` function recording sender, amount, message, and block timestamp.
  - `NewTip` Event Emission: On-chain event log serving as the immutable source of truth.
  - `withdraw()`: Restricted to contract `owner` to collect accumulated tips.
  - Input Validation: Capped message length (max 280 chars) and non-zero value requirement.
- **On-Chain Event Sourced Feed**:
  - Reads `NewTip` logs directly via `eth_getLogs` / contract filters (`queryFilter`).
  - Real-time listener (`contract.on("NewTip", ...)`): Wall updates live as transactions mine on-chain.
  - Generates custom SVG gradient avatars for each supporter address.
- **Web3 Wallet Connection & Network Guard**:
  - Native MetaMask / EIP-1193 integration via `ethers.js`.
  - Automatic chain detection (Ethereum Sepolia `11155111` or Localhost `31337`).
  - One-click network switcher (`wallet_switchEthereumChain`).
- **Creator Owner Dashboard**:
  - Automatically detects if the connected wallet address equals `contract.owner()`.
  - Displays Artist Owner Banner with contract ETH balance and 1-click withdrawal button.
- **Interactive Demo Simulator Mode**:
  - Built-in toggle allows instant testing of tipping, on-chain event simulation, stats updates, and wall rendering without needing MetaMask or Sepolia ETH installed!

---

## 🛠️ Project Structure
```text
thank-you-wall/
├── contracts/
│   └── TipJar.sol          # Solidity 0.8.20 Micro-tipping Smart Contract
├── scripts/
│   └── deploy.js           # Hardhat deployment script (outputs src/contracts/TipJar.json)
├── test/
│   └── TipJar.test.js      # Comprehensive Mocha/Chai contract unit tests
├── src/
│   ├── contracts/
│   │   └── TipJar.json     # Compiled ABI & Deployed address configuration
│   ├── main.js             # Web3 provider, event filtering, tip handling, & UI logic
│   └── style.css           # Modern dark-mode glassmorphism design system
├── public/
│   └── artist_avatar.jpg   # Webcomic artist profile illustration
├── hardhat.config.js       # Hardhat network & compiler configuration
├── index.html              # Main HTML entry point
├── package.json            # Node.js dependencies
└── README.md               # Project documentation
```

---

## 🚀 Quickstart Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Smart Contract Tests
Execute all unit tests verifying tip recording, event emissions, message caps, and withdrawal permissions:
```bash
npm run test
```

### 3. Deploy Contract (Local Node or Sepolia)
To run a local Hardhat node & deploy:
```bash
# Terminal 1: Start local node
npm run node

# Terminal 2: Deploy contract to local node
npm run deploy:local
```

To deploy to **Ethereum Sepolia** via QuickNode or public RPC:
```bash
# Set environment variables
export SEPOLIA_RPC_URL="https://your-quicknode-sepolia-endpoint.com"
export PRIVATE_KEY="0xYourBurnerWalletPrivateKey"

# Deploy to Sepolia
npm run deploy:sepolia
```

### 4. Start Frontend Web App
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 📜 Deployed Contract Address

- **Network**: Ethereum Sepolia Testnet / Hardhat Local (Chain ID: `31337` / `11155111`)
- **Contract Address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **Explorer Link**: [https://sepolia.etherscan.io/address/0x5FbDB2315678afecb367f032d93F642f64180aa3](https://sepolia.etherscan.io/address/0x5FbDB2315678afecb367f032d93F642f64180aa3)

---

## 🧠 Why On-Chain Event Logs are the Source of Truth
Client state (such as LocalStorage or in-memory arrays) can be manipulated, cleared, or lost across devices. Smart contract storage (state variables) can also become expensive when storing millions of string messages.

By emitting the `NewTip(address indexed sender, uint256 amount, string message, uint256 timestamp)` event on Ethereum, the data is permanently archived in the EVM transaction log history. The frontend queries `eth_getLogs` to rebuild the supporter wall directly from the blockchain — guaranteeing tamper-proof, transparent, and permanent attribution for every single tip!
