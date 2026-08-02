# ⚡ LynxX Protocol — Non-Custodial Stellar & Soroban Enclave Extension & Dashboard

<p align="center">
  <a href="https://stellar.org"><img src="https://img.shields.io/badge/Stellar-Network-000000?style=flat-square&logo=stellar" alt="Stellar Network"/></a>
  <a href="https://soroban.stellar.org"><img src="https://img.shields.io/badge/Soroban-Smart_Contracts-7B5EA7?style=flat-square&logo=stellar" alt="Soroban"/></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js" alt="Next.js"/></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React"/></a>
  <a href="https://horizon-testnet.stellar.org"><img src="https://img.shields.io/badge/Settlement-0.9s_Testnet-emerald?style=flat-square" alt="Stellar Testnet"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"/></a>
</p>

---

## ✨ Overview

**LynxX Extension** is a next-generation non-custodial wallet, security enclave, and fintech dashboard built natively for the **Stellar Horizon** and **Soroban Smart Contract** network.

Designed with an **Apple iPhone iOS White/Light aesthetic** and **3D Claymorphism**, LynxX eliminates traditional seed phrase friction by integrating **seedless WebAuthn / Passkey biometrics** (Touch ID, Face ID, Windows Hello) with **sub-second (0.9s) on-chain settlement**.

---

## 💎 Key Architectural & UX Highlights

### 1. 📊 Interactive Real-Time Overview Chart (`InteractiveOverviewChart`)
- **100% Real-Time Hover & Drag:** Smooth SVG cubic-spline bezier curves spanning 12 months (`Jan` to `Dec`).
- **Dynamic Vertical Guide Line & Intersection Dots:** As you hover or drag across the chart, a dotted guide line smoothly tracks your cursor while glowing intersection dots snap to the exact curve values for **Current Year (`Stellar XLM`)** and **Last Year (`Soroban USDC`)**.
- **Floating 2-Column Tooltip Card:** A responsive glass card floating above the line displays real-time asset comparisons without obscuring grid data.

### 2. 🗂️ 3D Claymorphic Wallet Card Sleeve (`WalletCardWidget`)
- **Tactile 3D Claymorphism:** Thick inner highlights and shadows give each card a solid, inflated 3D clay feel.
- **Stellar & Soroban Native Assets:** Features stacked cards for **Stellar XLM**, **Soroban USDC**, and **Stellar EURC**, showing real-time network balances and USD equivalence.
- **Authentic U-Shaped Thumb Notch:** A solid white claymorphic wallet sleeve with an authentic U-curved pocket cutout holding your asset cards.

### 3. 🎯 Ultra-Compact Ticks-Only Navigation (`PreviewRail`)
- **Minimalist Rail (`w-14`):** Compact vertical ticks (`- - - - - -`) positioned at top-start (`pt-6`) to maximize horizontal screen real estate for both web dashboards and extension popup windows (`380px–420px`).
- **`z-[100]` Title-Only Hover Cards:** Clean, minimal glass pill cards pop out in front of all cards and charts displaying clear section titles (*Dashboard Overview*, *Send & Receive Money*, *Soroban Escrows & Vaults*, etc.).

### 4. 🔐 Seedless WebAuthn Passkey Enclave
- Register hardware biometric authenticators directly to your Stellar account.
- Sign instant Soroban transfers, milestone escrow locks, and treasury crowdfunding contributions with zero custodial key exposure.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org) (v18 or v20+)
- [pnpm](https://pnpm.io) or `npm` / `yarn`

### Installation & Launch

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LynxXProtocol/LynxX-Extension.git
   cd LynxX-Extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. **Open the Dashboard:**
   Navigate to [http://localhost:3002/app/dashboard](http://localhost:3002/app/dashboard) (or the port specified in your console) to view the interactive fintech dashboard.

---

## 🛠️ Project & Folder Structure

```
├── src/
│   ├── app/
│   │   ├── app/
│   │   │   ├── dashboard/       # Apple iPhone iOS White Dashboard View
│   │   │   │   ├── DashboardClient.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── AppLaunchClient.tsx # Home / Onboarding Launch Screen
│   │   │   ├── app.css          # White Theme & Apple iOS Typography
│   │   │   └── page.tsx
│   │   └── layout.tsx           # Global App Layout
│   ├── components/
│   │   ├── motion/              # Tailored Motion & UI Primitives
│   │   │   ├── interactive-overview-chart.tsx  # Draggable/Hoverable Spline Chart
│   │   │   ├── wallet-card-widget.tsx          # 3D Claymorphic Wallet Sleeve
│   │   │   ├── preview-rail.tsx                # Compact Ticks z-100 Rail
│   │   │   └── swap/                           # Soroban Asset Swap Primitives
│   │   └── Wallet.js            # Stellar Horizon & Friendbot Integration
│   └── lib/                     # Utilities & Motion Ease Constants
├── contracts/                   # Soroban Smart Contracts (Escrows, Fund, Badges)
├── packages/                    # Maintenance & Bot Tooling
└── README.md
```

---

## 🛰️ Network & RPC Endpoints (Stellar Testnet)

| Service | Endpoint URL | Status |
|---|---|---|
| **Horizon RPC Server** | `https://horizon-testnet.stellar.org` | Connected |
| **Soroban RPC Endpoint** | `https://soroban-testnet.stellar.org` | Connected |
| **Friendbot Faucet** | `https://friendbot.stellar.org` | Active |

---

## 📄 License

This project is licensed under the **MIT License**.
