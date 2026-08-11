# Changelog

All notable changes to **LynxX** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `lynxx-wallet-sdk` package for non-custodial Stellar wallet integration
- Manifest V3 extension runtime in `lynxx-wallet-sdk`:
  - `ProviderQueue`: FIFO signing-request queue guaranteeing exactly one
    confirmation modal at a time; popup dismissal rejects the active request
    with `USER_REJECTED` and advances the queue
  - `LynxxBackground` service worker with origin-isolated message passing —
    every IPC message is validated against `sender.origin` / `sender.frameId`,
    blocking untrusted iframes with `ORIGIN_MISMATCH`
  - `OriginPolicy`: strict CORS-style sender verification (top-frame only,
    opaque-origin rejection, optional origin allowlist, extension-id check
    for popup senders)
  - `window.lynxx` provider bridge + top-frame-only content script
- Soroban smart contracts: `fund` (crowdfunding) and `badge` (donor loyalty tiers)
- React + Next.js frontend with Freighter wallet support
- Cross-contract communication between `fund` and `badge` contracts
- Donor badge tier system: Bronze / Silver / Gold based on cumulative XLM donated
- CI workflow via GitHub Actions
- Comprehensive `docs/` folder covering architecture, API, security, and deployment

### Changed
- N/A

### Fixed
- N/A

---

## [0.1.0] - 2026-06-30

### Added
- Initial release of LynxX crowdfunding dApp
- Soroban `fund` contract deployed to Stellar Testnet
- React frontend connected to Stellar SDK and Freighter API
- Milestone-based withdrawal support
- Refund mechanism for failed campaigns
- Donor unique-count tracking

[Unreleased]: https://github.com/amankoli09/LynxX/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/amankoli09/LynxX/releases/tag/v0.1.0
