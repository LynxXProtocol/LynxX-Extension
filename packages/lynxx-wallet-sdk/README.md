# lynxx-wallet-sdk

> Non-custodial Stellar wallet integration SDK for dApps built on Soroban.

[![npm version](https://img.shields.io/npm/v/lynxx-wallet-sdk.svg)](https://www.npmjs.com/package/lynxx-wallet-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

`lynxx-wallet-sdk` wraps wallet connection and transaction signing for
Stellar/Soroban dApps into a small, dependency-light API. Under the hood it
uses [`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit),
so it supports Freighter, xBull, Albedo, and every other wallet the kit
ships with — your dApp code only ever talks to `LynxxWalletProvider`.

> A runnable example app lives at [`/example`](../../example) in this
> repository.

---

## Installation

```bash
npm install lynxx-wallet-sdk @stellar/stellar-sdk
```

`@stellar/stellar-sdk` is a peer dependency — you need it in your project
anyway to build transactions, so the SDK doesn't bundle its own copy.

---

## Quick Start

```ts
import { initLynxx } from "lynxx-wallet-sdk";

// 1. Initialize the SDK
const wallet = initLynxx({ network: "TESTNET" });

// 2. Connect — opens the wallet-selection modal
const address = await wallet.connect();
console.log(`Connected: ${address}`);

// 3. Sign a transaction built with @stellar/stellar-sdk
const signedXdr = await wallet.signTransaction(transaction.toXDR());
```

---

## Initialization

`initLynxx(config?)` is the SDK's entry point. It creates and returns a
`LynxxWalletProvider` configured for the given network.

```ts
import { initLynxx } from "lynxx-wallet-sdk";

const wallet = initLynxx({
  network: "TESTNET", // "TESTNET" | "PUBLIC" — defaults to "TESTNET"
});
```

Create the provider once (e.g. at module scope, or in a React context) and
reuse it for the lifetime of your app — don't call `initLynxx()` on every
render.

---

## Connecting a Wallet

```ts
import { initLynxx, LynxxWalletError } from "lynxx-wallet-sdk";

const wallet = initLynxx();

try {
  const address = await wallet.connect();
  console.log(`Connected: ${address}`);
} catch (error) {
  if (error instanceof LynxxWalletError && error.code === "ModalClosed") {
    console.log("User closed the wallet selection modal.");
  } else {
    console.error(error);
  }
}
```

`connect()` opens a wallet-selection modal, lets the user pick a wallet
(Freighter, xBull, Albedo, ...), and resolves with the connected Stellar
public key (`G...`). Once connected, `wallet.getAddress()` and
`wallet.isConnected()` reflect the current session.

---

## Signing a Transaction

Build your transaction with `@stellar/stellar-sdk` as usual, then hand its
XDR to `signTransaction()`:

```ts
import {
  Horizon,
  TransactionBuilder,
  Networks,
  Asset,
  Operation,
} from "@stellar/stellar-sdk";
import { initLynxx, LynxxWalletError } from "lynxx-wallet-sdk";

const wallet = initLynxx({ network: "TESTNET" });
const server = new Horizon.Server("https://horizon-testnet.stellar.org");

async function sendPayment(destination: string, amount: string) {
  const sender = wallet.getAddress();
  if (!sender) throw new Error("Connect a wallet first.");

  const account = await server.loadAccount(sender);
  const fee = await server.fetchBaseFee();

  const transaction = new TransactionBuilder(account, {
    fee: fee.toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      }),
    )
    .setTimeout(30)
    .build();

  try {
    // Opens the wallet for the user to review and approve.
    const signedXdr = await wallet.signTransaction(transaction.toXDR());
    const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    const result = await server.submitTransaction(signedTx);
    return result.hash;
  } catch (error) {
    if (error instanceof LynxxWalletError && error.code === "SigningRejected") {
      console.log("User rejected the transaction.");
      return;
    }
    throw error;
  }
}
```

---

## API

### `initLynxx(config?)`

Creates a new `LynxxWalletProvider`. This is the primary entry point for
dApps integrating the SDK.

| Parameter | Type | Description |
|---|---|---|
| `config.network` | `"TESTNET" \| "PUBLIC"` | Stellar network to connect to. Defaults to `"TESTNET"`. |

### `LynxxWalletProvider`

The core provider class for managing wallet connections and signing on the
Stellar network.

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<string>` | Opens the wallet-selection modal and connects to the chosen wallet. Resolves with the public key. |
| `signTransaction(xdr)` | `Promise<string>` | Signs a base64 XDR transaction with the connected wallet. Resolves with the signed XDR. |
| `getAddress()` | `string \| null` | The connected public key, or `null` if not connected. |
| `isConnected()` | `boolean` | Whether a wallet is currently connected. |
| `disconnect()` | `void` | Clears local connection state (does not revoke wallet permissions). |

### `LynxxWalletError`

Thrown by `connect()` and `signTransaction()` on failure. Extends `Error`
with a machine-readable `code`:

| Code | Thrown by | Meaning |
|---|---|---|
| `ModalClosed` | `connect()` | The user closed the wallet-selection modal without connecting. |
| `NotConnected` | `signTransaction()` | Called before `connect()` resolved. |
| `SigningRejected` | `signTransaction()` | The user rejected the signing request in their wallet. |

### `LynxxConfig`

TypeScript interface for SDK configuration.

```ts
interface LynxxConfig {
  network?: "TESTNET" | "PUBLIC"; // defaults to "TESTNET"
}
```

---

## Browser Extension (Manifest V3)

Alongside the wallet-provider API, the SDK ships the client-side extension
runtime that backs `window.lynxx` for dApps. These modules live under
`src/extension/` and are consumed by the extension's background service
worker and content script (a full manifest/UI lives in the host app).

### Architecture

```
in-page provider (window.lynxx)  ──postMessage──▶  content script  ──chrome.runtime──▶  background worker
        ▲                                                                                   │
        └──────────────  LynxxResponse (postMessage) ◀── resolve/reject ◀── confirmation popup
```

### `LynxxBackground` — service worker

- **FIFO request queue.** `ProviderQueue` guarantees exactly one signing
  modal is open at a time, so concurrent calls from multiple tabs cannot
  overlap popups or corrupt nonce sequencing. Each queued request is keyed
  by an internal id, so identical client ids from different tabs can never
  collide.
- **Popup dismissal.** Closing the confirmation window rejects the active
  request with `USER_REJECTED` and immediately advances to the next queued
  request.
- **Origin isolation.** Every IPC message is validated against the
  browser-provided `sender.origin` / `sender.frameId`; requests from
  `frameId !== 0`, opaque (`"null"`) origins, or origins outside an optional
  allowlist are rejected with `ORIGIN_MISMATCH` before they can open a modal.
  Popup messages must come from the extension itself (extension id + URL).
- **Clean lifecycle.** `dispose()` unregisters every listener and settles
  all in-flight requests, so long-lived workers leak nothing.

```ts
import { LynxxBackground } from "lynxx-wallet-sdk/src/extension/background";

const background = new LynxxBackground({
  popupUrl: "popup/sign.html",
  allowedOrigins: ["https://app.example.com"],
}).start();
```

### Wire protocol

| Channel | Direction | Purpose |
|---|---|---|
| `lynxx:rpc-request` | content script → worker | `signTransaction` / `signAuthEntry` |
| `lynxx:popup-fetch` | popup → worker | fetch request details to render |
| `lynxx:popup-decision` | popup → worker | user approve / reject |
| `lynxx:rpc-response` | worker → caller | result or error |
| `lynxx:ack` | worker → popup | decision recorded |

Error codes: `USER_REJECTED`, `ORIGIN_MISMATCH`, `NOT_CONNECTED`,
`POPUP_OPEN_FAILED`, `INVALID_REQUEST`, `INTERNAL_ERROR`.

---

## Requirements

- [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) >= 10.0.0 (peer dependency)
- A supported wallet extension, e.g. [Freighter](https://freighter.app/)

---

## Part of LynxX

This SDK is part of the [LynxX](https://github.com/amankoli09/LynxX) open-source crowdfunding dApp built on Stellar Soroban.

- 🌐 [GitHub Repository](https://github.com/amankoli09/LynxX)
- 📦 [npm Package](https://www.npmjs.com/package/lynxx-wallet-sdk)
- 🧪 [Example App](../../example)
- 📄 [Changelog](../../CHANGELOG.md)

---

## License

MIT © [Aman Koli](https://github.com/amankoli09)
