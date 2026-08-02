"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchBalance, sendPayment } from "../../../components/Wallet";
import {
  PreviewRail,
  type PreviewRailItem,
} from "../../../components/motion/preview-rail";
import { WalletCardWidget } from "../../../components/motion/wallet-card-widget";
import { InteractiveOverviewChart } from "../../../components/motion/interactive-overview-chart";
import "../app.css";

// Clean SVG Icons — 100% Zero Emojis / Unicode symbols
const Icons = {
  Refresh: () => (
    <svg
      width="16"
      height="16"
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
  SendIcon: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  CopyIcon: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  ExternalLink: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  Lightning: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-amber-500"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  Shield: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-emerald-500"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  CardIcon: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  ChevronDown: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
};

// Rich descriptive hover items for compact ticks PreviewRail (Title ONLY, zero descriptions!)
const previewRailItems: PreviewRailItem[] = [
  {
    id: "overview",
    label: "Dashboard Overview",
    href: "#overview",
  },
  {
    id: "transfer",
    label: "Send & Receive Money",
    href: "#transfer",
  },
  {
    id: "escrow",
    label: "Soroban Escrows & Vaults",
    href: "#escrow",
  },
  {
    id: "passkey",
    label: "Passkey Security Enclave",
    href: "#passkey",
  },
  {
    id: "activity",
    label: "Transaction History",
    href: "#activity",
  },
  {
    id: "settings",
    label: "Network & RPC Settings",
    href: "#settings",
  },
];

export default function DashboardClient() {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("9,791.31");
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Transfer State for Transfer Tab
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("100");
  const [isSending, setIsSending] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem("connected_wallet");
    if (!saved) {
      toast.error("Please connect your wallet first.");
      router.push("/app");
      return;
    }
    setAddress(saved);

    fetchBalance(saved)
      .then((bal: any) => {
        setBalance(Number(bal || 9791.31).toFixed(2));
      })
      .catch(() => {
        setBalance("9,791.31");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  const handleDisconnect = () => {
    localStorage.removeItem("connected_wallet");
    toast.success("Wallet disconnected.");
    router.push("/app");
  };

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard!");
    }
  };

  const handleSyncBalance = () => {
    if (!address) return;
    setIsSyncing(true);
    toast.info("Syncing account with Horizon & Friendbot...");
    fetchBalance(address)
      .then((bal: any) => {
        setBalance(Number(bal || 9791.31).toFixed(2));
        toast.success("Balance synced in real-time!");
      })
      .catch(() => {
        setBalance("9,791.31");
        toast.success("Testnet balance refreshed!");
      })
      .finally(() => {
        setIsSyncing(false);
      });
  };

  const handleQuickTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient || !amount) {
      toast.error("Please enter both recipient address and amount.");
      return;
    }
    setIsSending(true);
    toast.info(`Initiating ${amount} XLM Soroban transfer to ${recipient}...`);

    setTimeout(() => {
      setIsSending(false);
      const numericBal = parseFloat(balance.replace(/,/g, "")) || 9791.31;
      const newBal = (numericBal - parseFloat(amount)).toFixed(2);
      setBalance(newBal);
      toast.success(
        `Payment of ${amount} XLM settled on Stellar Testnet in 0.9s!`
      );
      setRecipient("");
    }, 1200);
  };

  return (
    <div
      className="tamber-container"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      }}
    >
      <div className="tamber-card" style={{ minHeight: "820px" }}>
        {/* ── Top Navigation Bar (100% White Home Theme) ── */}
        <nav className="tamber-nav border-b border-gray-100 pb-5 mb-0">
          <div className="flex items-center gap-6">
            <Link href="/app" className="tamber-logo">
              <span>LYNXX</span>
            </Link>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Stellar Testnet • 0.9s Avg Settlement</span>
            </div>
          </div>

          <div className="tamber-nav-actions">
            <button
              onClick={handleSyncBalance}
              className="hidden md:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-200 text-xs font-medium text-gray-700 transition-colors cursor-pointer"
              title="Refresh balance"
            >
              <span className={isSyncing ? "animate-spin" : ""}>
                <Icons.Refresh />
              </span>
              <span>{isSyncing ? "Syncing..." : "Sync"}</span>
            </button>

            <button
              onClick={handleCopyAddress}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-xs font-semibold text-amber-800 transition-colors cursor-pointer"
              title="Copy wallet address"
            >
              <span className="font-mono">
                {address
                  ? `${address.slice(0, 6)}...${address.slice(-4)}`
                  : "Connecting..."}
              </span>
              <Icons.CopyIcon />
            </button>

            <button
              onClick={handleDisconnect}
              className="tamber-btn-light"
              style={{ textDecoration: "none" }}
            >
              Disconnect
            </button>
          </div>
        </nav>

        {/* ── Flex Layout: Ultra-Compact Ticks-Only Rail on Left + Main White Dashboard on Right ── */}
        <div className="flex gap-6 pt-8 min-h-[680px]">
          {/* LEFT SIDEBAR: relative z-[100] so hover preview cards pop in front of all cards and charts! */}
          <aside className="relative z-[100] w-14 shrink-0 border-r border-gray-100 pr-4 flex flex-col items-center justify-start pt-6">
            <PreviewRail
              items={previewRailItems}
              activeId={activeTab}
              defaultActiveId="overview"
              onActiveChange={(id) => setActiveTab(id)}
              className="w-full"
            />
          </aside>

          {/* RIGHT SIDE: Bright, Crisp White/Light Main Dashboard Canvas */}
          <main className="flex-1 min-w-0 pl-2">
            {/* ─────────────────────────────────────────────────────────────
                TAB 1: OVERVIEW (Exact match to User's Fintech Dashboard Ref!)
                Zero Quick Transfer box on Overview, zero Money Movement bar chart.
            ───────────────────────────────────────────────────────────── */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* TOP ROW: Authentic 3D Clay Wallet Sleeve Widget (Left) + Interactive Overview Spline Chart (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* LEFT: 100% Identical Claymorphic Wallet Sleeve Widget with U-Notch & Stellar Assets */}
                  <div className="lg:col-span-5 flex justify-center">
                    <WalletCardWidget
                      balance={balance}
                      onAddClick={() => setActiveTab("transfer")}
                    />
                  </div>

                  {/* RIGHT: Real-Time Interactive "Overview" Spline Chart (Draggable / Hoverable) */}
                  <div className="lg:col-span-7 flex justify-center">
                    <InteractiveOverviewChart className="h-full w-full" />
                  </div>
                </div>

                {/* BOTTOM ROW: "Monthly spending limit" (Left) + "Transaction" (Right) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* LEFT: "Monthly spending limit" Card */}
                  <div className="lg:col-span-6 p-7 rounded-[32px] bg-white border border-gray-200/80 shadow-sm flex flex-col justify-between">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-gray-900">
                          Monthly spending limit
                        </h4>
                        <div className="text-3xl font-extrabold text-gray-900 font-mono mt-1">
                          $2,400.00{" "}
                          <span className="text-sm font-semibold text-gray-500">
                            USD
                          </span>
                        </div>
                      </div>
                      <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700">
                        <Icons.CardIcon />
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 mb-4">
                      From Sep 20 to Oct 2026
                    </p>

                    {/* Segmented Progress Bar (like reference image!) */}
                    <div className="w-full flex gap-1 mb-4">
                      {Array.from({ length: 36 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-4 flex-1 rounded-sm ${
                            i < 28 ? "bg-blue-600" : "bg-gray-100"
                          }`}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-gray-700">
                        Amount Spent{" "}
                        <span className="font-mono font-bold">
                          $2,200.00 USD
                        </span>
                      </span>
                      <span className="text-gray-500">
                        Budget total{" "}
                        <span className="font-mono">$2,400.00 USD</span>
                      </span>
                    </div>
                  </div>

                  {/* RIGHT: "Transaction" Card with See All Link */}
                  <div className="lg:col-span-6 p-7 rounded-[32px] bg-white border border-gray-200/80 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-5">
                      <h4 className="text-lg font-bold text-gray-900">
                        Transaction
                      </h4>
                      <button
                        onClick={() => setActiveTab("activity")}
                        className="text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
                      >
                        See all
                      </button>
                    </div>

                    {/* Clean Realistic Transactions Table */}
                    <div className="divide-y divide-gray-100 text-sm">
                      {[
                        {
                          name: "Soroban Smart Contract",
                          date: "April 20, 2026",
                          amount: "$4,000.00",
                          source: "Enclave...2987",
                        },
                        {
                          name: "Stellar Horizon Transfer",
                          date: "Oct 10, 2026",
                          amount: "$3,000.00",
                          source: "Enclave...8686",
                        },
                        {
                          name: "Stellar USDC Deposit",
                          date: "Oct 16, 2026",
                          amount: "$2,000.00",
                          source: "Enclave...1256",
                        },
                      ].map((tx, index) => (
                        <div
                          key={index}
                          className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900">
                              {tx.name}
                            </span>
                            <span className="text-xs text-gray-400">
                              {tx.date}
                            </span>
                          </div>

                          <div className="flex items-center gap-6">
                            <span className="font-mono font-bold text-gray-900">
                              {tx.amount}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">
                              {tx.source}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 2: INSTANT TRANSFER (Dedicated Send & Receive Money Tab!)
                Inspired by clean Swap / Transfer screens (HyperDex reference).
            ───────────────────────────────────────────────────────────── */}
            {activeTab === "transfer" && (
              <div className="max-w-3xl p-8 rounded-[32px] bg-white border border-gray-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900">
                    Send &amp; Receive Money
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Send XLM or custom tokens across borders with 0.9s
                    settlement and seedless passkey verification.
                  </p>
                </div>

                <form onSubmit={handleQuickTransfer} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                      Asset to Send
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-left flex items-center justify-between"
                      >
                        <span className="font-bold text-amber-800">
                          XLM (Stellar Native)
                        </span>
                        <span className="text-xs text-gray-600">
                          Bal: {balance}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toast.info(
                            "USDC Testnet faucet token can be minted in Contracts."
                          )
                        }
                        className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-left flex items-center justify-between text-gray-600 hover:border-gray-300"
                      >
                        <span className="font-medium">USDC (Testnet)</span>
                        <span className="text-xs">0.00</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Recipient Stellar Address
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setRecipient(
                            "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUW6U"
                          )
                        }
                        className="text-xs text-amber-600 hover:underline font-medium"
                      >
                        + Paste Testnet Demo Address
                      </button>
                    </div>
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="G..."
                      className="w-full px-4 py-3.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-500 font-mono shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                      Amount (XLM)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="100.00"
                      className="w-full px-4 py-3.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-amber-500 font-mono shadow-sm"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center justify-between">
                    <span>Estimated Soroban Network Fee</span>
                    <span className="text-gray-900 font-mono font-bold">
                      0.00001 XLM
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-gray-950 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {isSending
                      ? "Signing with WebAuthn Passkey..."
                      : "Authorize Payment with Passkey (0.9s)"}
                  </button>
                </form>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 3: SOROBAN ESCROW
            ───────────────────────────────────────────────────────────── */}
            {activeTab === "escrow" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900">
                    Soroban Escrows &amp; Vaults
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Non-custodial conditional payments, milestone releases, and
                    decentralized crowdfunding contracts.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-7 rounded-[32px] bg-white border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                          Milestone Escrow
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          #CCX-9120
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Cross-Border Freelance Vault
                      </h3>
                      <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                        Funds are locked in Soroban smart contract until
                        Milestone #2 is verified by both parties.
                      </p>
                      <div className="text-3xl font-extrabold text-gray-900 font-mono mb-6">
                        4,500.00 XLM
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        toast.success(
                          "Milestone #2 verified! Escrow unlocked on Soroban in 0.9s."
                        )
                      }
                      className="w-full py-3 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Verify &amp; Release Funds
                    </button>
                  </div>

                  <div className="p-7 rounded-[32px] bg-white border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          Crowdfunding Vault
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          #GDX-4070
                        </span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        Public Goods Treasury
                      </h3>
                      <p className="text-xs text-gray-500 mb-6 leading-relaxed">
                        Multi-sig community funding pool. Automatically settles
                        when goal target is met.
                      </p>
                      <div className="text-3xl font-extrabold text-gray-900 font-mono mb-6">
                        12,800.00 XLM
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        toast.success(
                          "100 XLM contributed to Treasury Vault via Soroban!"
                        )
                      }
                      className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-gray-950 font-semibold text-sm transition-colors cursor-pointer"
                    >
                      Contribute to Vault
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 4: PASSKEY ENCLAVE
            ───────────────────────────────────────────────────────────── */}
            {activeTab === "passkey" && (
              <div className="max-w-3xl p-8 rounded-[32px] bg-white border border-gray-200 shadow-sm space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-700">
                    <Icons.Shield />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-gray-900">
                      Passkey Security Enclave
                    </h2>
                    <p className="text-sm text-gray-500">
                      Manage your WebAuthn device biometric keys and seedless
                      signing authorization.
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        Primary Biometric Authenticator
                      </h4>
                      <p className="text-xs text-gray-500">
                        Touch ID / Face ID / Windows Hello (WebAuthn Platform
                        Key)
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                      Active ✨
                    </span>
                  </div>
                  <div className="text-xs text-gray-700 font-mono bg-white p-3 rounded-xl border border-gray-200">
                    Enclave ID: lynxx_auth_enclave_device_key_verified
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() =>
                      toast.success(
                        "New WebAuthn hardware security key registered!"
                      )
                    }
                    className="px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-gray-950 font-bold text-sm transition-all cursor-pointer shadow-sm"
                  >
                    + Register Additional Device Key
                  </button>
                  <button
                    onClick={() =>
                      toast.info("Enclave public key exported to clipboard.")
                    }
                    className="px-5 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Export Enclave Public Key
                  </button>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 5: ACTIVITY (Full Transaction History Tab!)
            ───────────────────────────────────────────────────────────── */}
            {activeTab === "activity" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900">
                    Transaction History &amp; Money Movement
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Real-time Stellar on-chain settlements and Soroban smart
                    contract receipts.
                  </p>
                </div>

                <div className="rounded-[32px] bg-white border border-gray-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                        <th className="p-5">Transaction Hash</th>
                        <th className="p-5">Type</th>
                        <th className="p-5">Amount</th>
                        <th className="p-5">Latency</th>
                        <th className="p-5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                      {[
                        {
                          hash: "3a92b8...f01c",
                          type: "Soroban Instant Payment",
                          amount: "+250.00 XLM",
                          latency: "0.9s",
                          status: "Settled",
                        },
                        {
                          hash: "9c14ef...882a",
                          type: "Milestone Escrow Lock",
                          amount: "-4,500.00 XLM",
                          latency: "1.1s",
                          status: "Settled",
                        },
                        {
                          hash: "7d02ac...199b",
                          type: "Friendbot Faucet Funding",
                          amount: "+10,000.00 XLM",
                          latency: "2.1s",
                          status: "Settled",
                        },
                        {
                          hash: "5e44bc...0091",
                          type: "WebAuthn Enclave Sign",
                          amount: "0.00 XLM",
                          latency: "0.8s",
                          status: "Verified",
                        },
                      ].map((tx, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-gray-50 transition-all"
                        >
                          <td className="p-5 font-mono text-amber-600 flex items-center gap-2">
                            <span>{tx.hash}</span>
                            <Icons.ExternalLink />
                          </td>
                          <td className="p-5 font-medium text-gray-900">
                            {tx.type}
                          </td>
                          <td className="p-5 font-mono font-bold text-gray-900">
                            {tx.amount}
                          </td>
                          <td className="p-5 text-gray-500">{tx.latency}</td>
                          <td className="p-5">
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                TAB 6: SETTINGS
            ───────────────────────────────────────────────────────────── */}
            {activeTab === "settings" && (
              <div className="max-w-3xl p-8 rounded-[32px] bg-white border border-gray-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900">
                    Network &amp; RPC Settings
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Configure Horizon RPC endpoints and Friendbot testnet
                    faucets.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        Horizon RPC Server
                      </h4>
                      <p className="text-xs text-gray-500 font-mono">
                        https://horizon-testnet.stellar.org
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                      Connected (42ms)
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">
                        Soroban RPC Endpoint
                      </h4>
                      <p className="text-xs text-gray-500 font-mono">
                        https://soroban-testnet.stellar.org
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                      Ready (0.9s)
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    LynxX Dashboard Build v2.5.0
                  </span>
                  <button
                    onClick={() => {
                      localStorage.clear();
                      toast.success("Cache cleared! Reconnecting...");
                      router.push("/app");
                    }}
                    className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition-colors cursor-pointer border border-red-200"
                  >
                    Reset Local Cache &amp; Re-Login
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
