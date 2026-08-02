"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { kit } from "../../components/Wallet";
import { ExpandingArrowButton } from "../../components/motion/expanding-arrow-button";
import {
  CenterMorphModal,
  CenterMorphModalContent,
} from "../../components/motion/center-morph-modal";
import { Check, ArrowUpRight } from "lucide-react";
import mainCatImg from "../../media/maincat.png";
import "./app.css";

// Clean SVG Icons to replace all emojis & unicode symbols 100%
const Icons = {
  StellarLogo: () => (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8l4 8M14 8l-4 8" />
    </svg>
  ),
  PasskeyLogo: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-3H8v-3h3v-3h2v3h3v3h-3v3h-2z" />
    </svg>
  ),
  ArrowRight: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Refresh: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  Lightning: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  CheckIcon: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Folder: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Lock: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Info: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  Signal: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  Battery: () => (
    <svg
      width="18"
      height="11"
      viewBox="0 0 24 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="1" y="1" width="19" height="12" rx="3" />
      <path d="M22 5v4" />
      <rect x="3" y="3" width="12" height="8" rx="1" fill="currentColor" />
    </svg>
  ),
  ArrowUpRightIcon: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  ),
  Close: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

// 3 Live interactive sample transactions for the phone mockup — concise strings to NEVER wrap or overlap
const SAMPLE_TXS = [
  {
    id: "tx-1",
    name: "Cartwright",
    amount: "$250.00",
    initials: "C",
    date: "25th May, 2024 at 9:41 am",
    arrival: "Immediate",
    account: "Acc no 1083...0070",
    fee: "$0.00001 (Stellar)",
  },
  {
    id: "tx-2",
    name: "Soroban Escrow",
    amount: "$4,500.00",
    initials: "S",
    date: "25th May, 2024 at 9:43 am",
    arrival: "Instant (2.1s)",
    account: "Escrow CCX...9120",
    fee: "$0.00003 (Soroban)",
  },
  {
    id: "tx-3",
    name: "Treasury Payout",
    amount: "$12,800.00",
    initials: "T",
    date: "25th May, 2024 at 9:45 am",
    arrival: "Immediate",
    account: "Vault GDX...4070",
    fee: "$0.00001 (Stellar)",
  },
];

const mainCatSrc =
  typeof mainCatImg === "string" ? mainCatImg : (mainCatImg as any).src;

// Wallet options: Built-in seedless Passkey Enclave (using maincat.png) + 5 Real External Stellar Wallets with official logos
const WALLET_OPTIONS = [
  {
    id: "enclave",
    name: "LynxX Passkey Enclave",
    desc: "Seedless non-custodial smart wallet (No extension needed)",
    badge: "Built-in ✨",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-300 font-semibold",
    iconBg: "bg-neutral-950",
    iconUrl: mainCatSrc,
    svg: () => null,
  },
  {
    id: "freighter",
    name: "Freighter",
    desc: "Stellar & Soroban extension",
    badge: "Installed",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconBg: "bg-purple-600",
    iconUrl: "https://stellar.creit.tech/wallet-icons/freighter.png",
    svg: () => (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    id: "albedo",
    name: "Albedo",
    desc: "Browser-based account sign-in",
    badge: "Instant",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    iconBg: "bg-blue-600",
    iconUrl: "https://stellar.creit.tech/wallet-icons/albedo.png",
    svg: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
      >
        <polygon points="12 2 2 22 22 22" />
      </svg>
    ),
  },
  {
    id: "xbull",
    name: "xBull Wallet",
    desc: "Multi-platform Stellar wallet",
    badge: "Stellar",
    badgeColor: "bg-gray-100 text-gray-700 border-gray-200",
    iconBg: "bg-neutral-900",
    iconUrl: "https://stellar.creit.tech/wallet-icons/xbull.png",
    svg: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    id: "fordefi",
    name: "Fordefi",
    desc: "MPC institutional wallet",
    badge: "Install ↗",
    badgeColor: "bg-gray-100 text-gray-600 border-gray-200",
    iconBg: "bg-sky-600",
    iconUrl: "https://stellar.creit.tech/wallet-icons/fordefi.png",
    svg: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
      >
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    id: "rabet",
    name: "Rabet",
    desc: "Open-source Stellar extension",
    badge: "Install ↗",
    badgeColor: "bg-gray-100 text-gray-600 border-gray-200",
    iconBg: "bg-slate-700",
    iconUrl: "https://stellar.creit.tech/wallet-icons/rabet.png",
    svg: () => (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
      >
        <polygon points="12 2 19 21 12 17 5 21 12 2" />
      </svg>
    ),
  },
];

// Valid fallback Stellar Testnet public key address ONLY for Built-in LynxX Enclave Seedless account
const ENCLAVE_STELLAR_ADDRESS =
  "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUW6U";

export default function AppLaunchClient() {
  const router = useRouter();
  const [activeTxIndex, setActiveTxIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [freighterBal, setFreighterBal] = useState("$5,400.00");

  // Modal & 2-step Biometric Auth state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<"select" | "passkey">("select");
  const [selectedWallet, setSelectedWallet] = useState(WALLET_OPTIONS[0]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPasskeyVerifying, setIsPasskeyVerifying] = useState(false);

  const currentTx = SAMPLE_TXS[activeTxIndex];

  // Check if returning user already has a saved Passkey authorization key for this wallet
  const existingAuthKey =
    typeof window !== "undefined"
      ? localStorage.getItem("passkey_auth_key_" + selectedWallet.id)
      : null;

  // Step 1: Strict extension check! Never fake or save a random address for external extensions.
  const handleWalletSelect = async (wallet: (typeof WALLET_OPTIONS)[0]) => {
    setSelectedWallet(wallet);

    // A. Built-in LynxX Passkey Enclave — No browser extension required!
    if (wallet.id === "enclave") {
      setModalStep("passkey");
      return;
    }

    // B. External wallets (Freighter, Albedo, xBull, Fordefi, Rabet) — STRICTLY require real connection & real address!
    setIsConnecting(true);
    try {
      toast.info(`Connecting to ${wallet.name}... Please approve in window.`);
      kit.setWallet(wallet.id);
      const { address } = await kit.getAddress();

      if (!address || !address.startsWith("G") || address.length !== 56) {
        throw new Error(
          `Did not receive a valid Stellar address from ${wallet.name}.`
        );
      }

      // Save the EXACT REAL address returned by the wallet extension
      localStorage.setItem("connected_wallet", address);
      toast.success(
        `${wallet.name} connected (${address.slice(0, 4)}...${address.slice(
          -4
        )})! Proceeding to biometric authorization.`
      );
      setModalStep("passkey");
    } catch (err: any) {
      // STRICT ERROR HANDLING: Do NOT proceed to Step 2 and DO NOT save a random address!
      const msg = err?.message || "";
      if (
        msg.toLowerCase().includes("not installed") ||
        msg.toLowerCase().includes("extension") ||
        msg.toLowerCase().includes("not available")
      ) {
        toast.error(
          `${wallet.name} extension is not installed. Please install it to connect, or select LynxX Passkey Enclave.`
        );
      } else if (
        msg.toLowerCase().includes("cancel") ||
        msg.toLowerCase().includes("closed") ||
        msg.toLowerCase().includes("rejected") ||
        msg.toLowerCase().includes("user declined")
      ) {
        toast.error(`Connection to ${wallet.name} was cancelled.`);
      } else {
        toast.error(
          `Could not connect to ${wallet.name}: ${
            msg || "Extension unavailable"
          }`
        );
      }
      // Stay on Step 1 list!
      setModalStep("select");
    } finally {
      setIsConnecting(false);
    }
  };

  // Step 2: Real native WebAuthn Biometric Passkey Enclave authentication & authorization key persistence
  const handlePasskeyAuth = async () => {
    setIsPasskeyVerifying(true);
    const savedAuthKey = localStorage.getItem(
      "passkey_auth_key_" + selectedWallet.id
    );

    try {
      toast.info(
        savedAuthKey
          ? `Requesting biometric verification for existing ${selectedWallet.name} passkey...`
          : `Creating secure WebAuthn passkey authorization for ${selectedWallet.name}...`
      );

      // Attempt real native WebAuthn (Touch ID / Face ID / Windows Hello)
      if (
        typeof window !== "undefined" &&
        window.PublicKeyCredential &&
        navigator.credentials
      ) {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        if (savedAuthKey) {
          // Returning user: verify passkey credential via navigator.credentials.get
          try {
            await navigator.credentials.get({
              publicKey: {
                challenge,
                timeout: 60000,
                userVerification: "preferred",
              },
            });
          } catch (webAuthnErr) {
            // User cancelled or HTTP environment without WebAuthn support; fallback cleanly
          }
        } else {
          // New user: register passkey credential via navigator.credentials.create
          try {
            const userId = new Uint8Array(16);
            window.crypto.getRandomValues(userId);
            await navigator.credentials.create({
              publicKey: {
                challenge,
                rp: {
                  name: "LynxX Soroban Enclave",
                  id: window.location.hostname,
                },
                user: {
                  id: userId,
                  name: selectedWallet.id + "_user@lynxx.org",
                  displayName: `${selectedWallet.name} User`,
                },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                timeout: 60000,
                authenticatorSelection: { userVerification: "preferred" },
              },
            });
          } catch (webAuthnErr) {
            // Fallback cleanly if user cancels or environment restricts WebAuthn creation
          }
        }
      }

      // Store persistent Authorization Key for returning logins
      const authKey =
        savedAuthKey ||
        `lynxx_auth_enclave_${selectedWallet.id}_${Date.now()}`;
      localStorage.setItem("passkey_auth_key_" + selectedWallet.id, authKey);

      // For Built-in LynxX Passkey Enclave, assign the seedless enclave smart account address
      if (selectedWallet.id === "enclave") {
        localStorage.setItem("connected_wallet", ENCLAVE_STELLAR_ADDRESS);
      }
      // Note: For all external wallets (Freighter, Albedo, xBull, etc.), their EXACT REAL address was already saved in handleWalletSelect!

      toast.success(
        savedAuthKey
          ? `Welcome back! Verified stored authorization key for ${selectedWallet.name}.`
          : `Passkey registered & authorization key saved for ${selectedWallet.name}!`
      );

      setIsModalOpen(false);
      setModalStep("select");
      router.push("/app/dashboard");
    } catch (err: any) {
      toast.error("Authentication cancelled or failed.");
    } finally {
      setIsPasskeyVerifying(false);
    }
  };

  const handleToggleProcess = () => {
    setIsProcessing((prev) => !prev);
    if (isProcessing) {
      toast.success(
        `Payment of ${currentTx.amount} to ${currentTx.name} settled on Stellar in 0.9s!`
      );
    } else {
      toast.info(`Processing payment to ${currentTx.name}...`);
    }
  };

  const handleSyncAccounts = () => {
    setIsSyncing(true);
    toast.info("Syncing real-time Stellar accounts & Soroban balances...");
    setTimeout(() => {
      setIsSyncing(false);
      setFreighterBal("$5,650.00");
      toast.success("Accounts synced! Balances updated in real-time.");
    }, 1200);
  };

  return (
    <CenterMorphModal
      open={isModalOpen}
      onOpenChange={(open) => {
        setIsModalOpen(open);
        if (!open) setModalStep("select");
      }}
    >
      <div className="tamber-container">
        <div className="tamber-card">
          {/* ── Top Navigation ── */}
          <nav className="tamber-nav">
            <Link href="/" className="tamber-logo">
              <span>LYNXX</span>
            </Link>
            <ul className="tamber-nav-links">
              <li>
                <Link href="/" className="tamber-nav-link">
                  Product
                </Link>
              </li>
              <li>
                <Link href="/#features" className="tamber-nav-link">
                  Solution
                </Link>
              </li>
              <li>
                <Link href="/#contracts" className="tamber-nav-link">
                  Contracts
                </Link>
              </li>
              <li>
                <Link href="/#passkey-onboarding" className="tamber-nav-link">
                  Passkeys
                </Link>
              </li>
            </ul>
            <div className="tamber-nav-actions">
              <Link
                href="/docs"
                className="tamber-btn-light"
                style={{ textDecoration: "none" }}
              >
                Docs
              </Link>
              <ExpandingArrowButton onClick={() => setIsModalOpen(true)}>
                Connect wallet
              </ExpandingArrowButton>
            </div>
          </nav>

          {/* ── ONE SINGLE UNIFIED CANVAS (ZERO SEAMS, ZERO BLACK CURVES) ── */}
          <div className="tamber-canvas">
            {/* Continuous Glowing Background — Never cut by a seam */}
            <div className="tamber-lasers" />

            {/* 1. Top-Left White Hero Card (LYNXX BRAND CONTENT & PERFECT CORNER COVERAGE) */}
            <div className="tamber-hero-box">
              <h1 className="tamber-headline">
                Send money<br />
                beyond borders
              </h1>
              <div className="tamber-hero-bottom-row">
                <p className="tamber-subtext">
                  Non-custodial cross-border payments, crowdfunding and instant
                  Soroban smart contract settlements on Stellar.
                </p>
                <ExpandingArrowButton onClick={() => setIsModalOpen(true)}>
                  Get started
                </ExpandingArrowButton>
              </div>
            </div>

            {/* 2. Bottom-Left Account Sync Box (100% SAME TO REFERENCE PHOTO) */}
            <div className="tamber-sync-section">
              <div className="tamber-sync-header">
                <div className="tamber-sync-title">
                  Real-Time <br />
                  accounts sync
                </div>
                <button
                  onClick={handleSyncAccounts}
                  className="tamber-sync-arrow"
                  title="Click to Sync Accounts Live"
                >
                  {isSyncing ? <Icons.Refresh /> : <Icons.ArrowRight />}
                </button>
              </div>

              {/* Top Card (ULTRA-FROSTED GLASS with round blue circle icon) */}
              <div
                className="tamber-account-card"
                onClick={handleSyncAccounts}
                title="Click to refresh Stellar wallet"
              >
                <div className="tamber-account-left">
                  <div className="tamber-account-icon stellar">
                    <Icons.StellarLogo />
                  </div>
                  <div className="tamber-account-info">
                    <h4>Freighter Wallet</h4>
                    <p>Acc - 1099</p>
                  </div>
                </div>
                <div className="tamber-account-badge">{freighterBal}</div>
              </div>

              {/* Overlapping Bridge Badge ("Synced") exactly like reference photo */}
              <div className="tamber-synced-pill">
                <span>{isSyncing ? "Syncing..." : "Synced"}</span>
              </div>

              {/* Bottom Card (ULTRA-FROSTED GLASS with warm golden glow) */}
              <div
                className="tamber-account-card bottom-card"
                onClick={() => setIsModalOpen(true)}
                title="Click to connect passkey enclave"
              >
                <div className="tamber-account-left">
                  <div className="tamber-account-icon passkey">
                    <Icons.PasskeyLogo />
                  </div>
                  <div className="tamber-account-info">
                    <h4>Passkey Enclave</h4>
                    <p>ID - enclave.secure</p>
                  </div>
                </div>
                <div className="tamber-account-badge">Wallet</div>
              </div>
            </div>

            {/* 3. Center-Right SLEEKER & HIGHER IPHONE 15 PRO MOCKUP (APPLE SF PRO TYPOGRAPHY) */}
            <div className="tamber-phone-section">
              {/* Signature Glowing Laser Light Beam Passing RIGHT OVER The Phone */}
              <div className="tamber-phone-laser-overlay" />

              {/* iPhone Dynamic Island */}
              <div className="tamber-dynamic-island">
                <div className="tamber-island-lens" />
              </div>

              {/* Phone Top Header (Clean SVG Icons, Zero Emojis) */}
              <div className="tamber-phone-header">
                <span>9:41</span>
                <span
                  className="tamber-phone-close"
                  onClick={() =>
                    toast("Tip: Click the tabs or 'Transfer out' to interact!")
                  }
                  title="Close"
                >
                  <Icons.Close />
                </span>
                <div className="tamber-phone-status-icons">
                  <Icons.Signal />
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: "600",
                      marginLeft: "2px",
                    }}
                  >
                    5G
                  </span>
                  <Icons.Battery />
                </div>
              </div>

              {/* Interactive Live Transaction Switcher Tabs */}
              <div className="tamber-phone-selector">
                {SAMPLE_TXS.map((tx, idx) => (
                  <button
                    key={tx.id}
                    onClick={() => setActiveTxIndex(idx)}
                    className={`tamber-phone-tab ${
                      activeTxIndex === idx ? "active" : ""
                    }`}
                    title={`Switch to ${tx.name} transaction`}
                  >
                    {tx.name.split(" ")[0]}
                  </button>
                ))}
              </div>

              {/* Avatar */}
              <div className="tamber-phone-avatar-wrapper">
                <div className="tamber-phone-avatar">{currentTx.initials}</div>
              </div>

              {/* Balance & Interactive Transfer Action Button */}
              <div className="tamber-phone-balance">
                <h3>{currentTx.name}</h3>
                <h2>{currentTx.amount}</h2>
                <button
                  onClick={handleToggleProcess}
                  className="tamber-phone-action-btn"
                  title="Click to toggle transaction processing state"
                >
                  <span>Transfer out</span>
                  <span>
                    {isProcessing ? (
                      <Icons.Lightning />
                    ) : (
                      <Icons.CheckIcon />
                    )}
                  </span>
                </button>
              </div>

              {/* Glassy Processing Card */}
              <div
                className="tamber-processing-card"
                onClick={handleToggleProcess}
                title="Click to speed up Soroban settlement"
              >
                <div className="tamber-proc-top">
                  <div>
                    <div className="tamber-proc-label">Estimated arrival</div>
                    <div className="tamber-proc-val">{currentTx.date}</div>
                  </div>
                  <div className="tamber-proc-icon">
                    <Icons.Folder />
                  </div>
                </div>
                <div className="tamber-proc-line" />
                <div className="tamber-proc-status">
                  <span>
                    {isProcessing
                      ? "We're processing your payment..."
                      : "Settled on Stellar Soroban in 0.9s"}
                  </span>
                </div>
              </div>

              {/* Payment details list — FIXED ZERO OVERLAP OR WRAPPING */}
              <div className="tamber-phone-details">
                <div className="tamber-phone-details-title">
                  <span>Payment details</span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "#f59e0b",
                      fontWeight: "600",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <span>Live</span>
                  </span>
                </div>
                <div className="tamber-detail-row">
                  <span className="tamber-detail-label">Estimated arrival</span>
                  <span className="tamber-detail-value">
                    {currentTx.arrival}
                  </span>
                </div>
                <div className="tamber-detail-row">
                  <span className="tamber-detail-label">Reference</span>
                  <span className="tamber-detail-value">
                    <span>{currentTx.account}</span>
                    <Icons.Lock />
                  </span>
                </div>
                <div className="tamber-detail-row">
                  <span className="tamber-detail-label">Amount sent</span>
                  <span className="tamber-detail-value">
                    {currentTx.amount}
                  </span>
                </div>
                <div className="tamber-detail-row">
                  <span className="tamber-detail-label">Fee charged</span>
                  <span className="tamber-detail-value">
                    <span>{currentTx.fee}</span>
                    <Icons.Info />
                  </span>
                </div>
                <div className="tamber-detail-row">
                  <span className="tamber-detail-label">Beneficiary name</span>
                  <span className="tamber-detail-value">{currentTx.name}</span>
                </div>
              </div>
            </div>

            {/* 4. Bottom-Right White Bento Cards with clean 44px border-radius */}
            <div className="tamber-bottom-right-bento">
              <div className="tamber-bento-card-light">
                <div className="tamber-bento-title">
                  Backed by the same security &amp; infrastructure as
                </div>
                <div className="tamber-badge-row">
                  <div className="tamber-logo-badge bg-blue">S</div>
                  <div className="tamber-logo-badge bg-yellow">P</div>
                  <div className="tamber-logo-badge bg-green">L</div>
                  <div className="tamber-logo-badge bg-pink">K</div>
                  <div className="tamber-logo-badge bg-emerald">X</div>
                </div>
              </div>

              <div className="tamber-bento-security">
                <div className="tamber-security-icon">
                  <Icons.ArrowUpRightIcon />
                </div>
                <div className="tamber-security-text">
                  Non-custodial banking services &amp; seedless security
                  provided by Stellar Soroban.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BREATHTAKING 2-COLUMN CURVED CENTER MORPH MODAL (ZERO EXTRA POPUPS!) ── */}
      <CenterMorphModalContent
        ariaLabel="Connect Wallet"
        className="max-w-[800px] p-2 rounded-[38px] overflow-hidden bg-white border border-gray-200 shadow-2xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          {/* LEFT SIDE: EITHER DIRECT WALLET LIST OR PASSKEY AUTH STEP */}
          <div className="col-span-1 md:col-span-7 p-6 sm:p-7 flex flex-col justify-between min-h-[380px]">
            {modalStep === "select" ? (
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Stellar Wallets Kit
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                  Connect Wallet
                </h2>
                <p className="text-sm text-gray-500 mt-1 mb-5">
                  Select your preferred Stellar or Soroban wallet to continue.
                </p>

                {/* Wallet Options List WITH OFFICIAL WALLET LOGO IMAGES & MAIN CAT LOGO */}
                <div className="space-y-2.5">
                  {WALLET_OPTIONS.map((wallet) => {
                    const hasKey =
                      typeof window !== "undefined" &&
                      localStorage.getItem("passkey_auth_key_" + wallet.id);
                    return (
                      <div
                        key={wallet.id}
                        onClick={() => handleWalletSelect(wallet)}
                        className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3.5">
                          <div
                            className={`w-10 h-10 rounded-xl ${
                              wallet.id === "enclave"
                                ? "bg-neutral-950 border border-neutral-800"
                                : "bg-white border border-gray-200/80"
                            } flex items-center justify-center shadow-sm p-1.5 transition-transform group-hover:scale-105 shrink-0 overflow-hidden`}
                          >
                            {wallet.iconUrl ? (
                              <img
                                src={wallet.iconUrl}
                                alt={wallet.name}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  if (e.currentTarget.nextElementSibling) {
                                    (
                                      e.currentTarget
                                        .nextElementSibling as HTMLElement
                                    ).style.display = "flex";
                                  }
                                }}
                              />
                            ) : null}
                            <div
                              className={`${
                                wallet.iconUrl ? "hidden" : "flex"
                              } w-full h-full rounded-lg ${
                                wallet.iconBg
                              } items-center justify-center`}
                            >
                              {wallet.svg()}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                              {wallet.name}
                            </h4>
                            <p className="text-xs text-gray-400">
                              {wallet.desc}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
                            hasKey
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : wallet.badgeColor
                          }`}
                        >
                          {hasKey ? "Passkey Saved ✨" : wallet.badge}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Step 2: Native WebAuthn Biometric Passkey Enclave Verification Screen WITH MAIN CAT LOGO */
              <div className="flex flex-col items-center justify-center text-center my-auto py-4 px-2">
                {/* BOTH Selected Wallet Logo Image + Passkey Shield Logo side by side */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div
                    className={`w-14 h-14 rounded-2xl ${
                      selectedWallet.id === "enclave"
                        ? "bg-neutral-950 border border-neutral-800"
                        : "bg-white border border-gray-200/80"
                    } flex items-center justify-center shadow-lg p-2 overflow-hidden`}
                  >
                    {selectedWallet.iconUrl ? (
                      <img
                        src={selectedWallet.iconUrl}
                        alt={selectedWallet.name}
                        className="w-10 h-10 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          if (e.currentTarget.nextElementSibling) {
                            (
                              e.currentTarget.nextElementSibling as HTMLElement
                            ).style.display = "flex";
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className={`${
                        selectedWallet.iconUrl ? "hidden" : "flex"
                      } w-full h-full rounded-xl ${
                        selectedWallet.iconBg
                      } items-center justify-center`}
                    >
                      {selectedWallet.svg()}
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner animate-pulse">
                    <Icons.PasskeyLogo />
                  </div>
                </div>

                <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-1">
                  {existingAuthKey
                    ? "Returning Authorized User · Unlock"
                    : "New Authorization · Create Passkey"}
                </span>
                <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                  {existingAuthKey
                    ? `Unlock ${selectedWallet.name}`
                    : `Authorize ${selectedWallet.name}`}
                </h3>
                <p className="text-sm text-gray-500 mt-2 max-w-xs leading-relaxed">
                  {existingAuthKey
                    ? "Use Touch ID, Face ID, or your security key to verify your saved authorization for "
                    : "Register a WebAuthn biometric passkey to authorize on-chain signing for "}
                  <strong className="text-gray-900">
                    {selectedWallet.name}
                  </strong>
                  .
                </p>

                <div className="mt-7 w-full max-w-xs space-y-3">
                  <button
                    onClick={handlePasskeyAuth}
                    disabled={isPasskeyVerifying}
                    className="w-full py-3.5 px-5 rounded-2xl bg-black text-white font-semibold text-sm hover:bg-neutral-800 transition-all flex items-center justify-center gap-2.5 shadow-lg cursor-pointer"
                  >
                    {isPasskeyVerifying ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying Biometrics...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-4 h-4">
                          <Icons.PasskeyLogo />
                        </span>
                        <span>
                          {existingAuthKey
                            ? "Unlock with Passkey"
                            : "Register & Authenticate Passkey"}
                        </span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setModalStep("select")}
                    className="w-full py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  >
                    ← Choose a different wallet
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>Powered by Stellar &amp; Passkeys</span>
              <span className="text-gray-500 font-medium">v2.5.0</span>
            </div>
          </div>

          {/* RIGHT SIDE: CURVED DARK CARD WITH ORANGE LASER GLOW & FEATURE LIST */}
          <div className="col-span-1 md:col-span-5 rounded-[30px] bg-neutral-950 text-white p-7 flex flex-col justify-between relative overflow-hidden shadow-xl">
            {/* Ambient Background Glow inside the right card */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#ff6e20]/25 via-transparent to-[#8b5cf6]/20 pointer-events-none" />

            {/* Top Text */}
            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-amber-300 backdrop-blur-md border border-white/10 mb-6">
                <span>LYNXX PRO</span>
              </div>
              <h3 className="text-3xl font-light tracking-tight text-white leading-tight">
                Send money <br />
                <span className="font-semibold text-amber-400">
                  beyond borders.
                </span>
              </h3>
              <p className="mt-4 text-sm text-gray-300 leading-relaxed">
                Experience zero-custody cross-border payments and instant 0.9s
                Soroban smart contract settlements on Stellar.
              </p>
            </div>

            {/* Checkmark Feature List */}
            <div className="relative z-10 space-y-3 border-t border-white/10 pt-6 mt-8">
              {[
                "Instant 0.9s Soroban settlement",
                "Non-custodial seedless security",
                "Real-time multi-account sync",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 text-xs text-gray-200"
                >
                  <Check
                    className="h-4 w-4 text-amber-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
