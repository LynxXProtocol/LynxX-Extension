"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface WalletCardWidgetProps {
  balance?: string;
  onAddClick?: () => void;
  className?: string;
}

export function WalletCardWidget({
  balance = "9,791.31",
  onAddClick,
  className,
}: WalletCardWidgetProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  // Stellar & Soroban Native Assets with 3D Claymorphism Styling
  const cards = [
    {
      id: 1,
      name: "Stellar XLM",
      amount: "9,791.31 XLM",
      gradient: "from-[#4B73FF] via-[#6384F9] to-[#86A6FC]",
      // 3D Claymorphism: Inner top white highlight + inner bottom dark rim + drop shadow
      clayShadow:
        "inset 0 3px 6px rgba(255, 255, 255, 0.55), inset 0 -5px 12px rgba(0, 0, 0, 0.25), 0 8px 18px rgba(75, 115, 255, 0.25)",
      topOffset: "top-0",
      zIndex: "z-10",
    },
    {
      id: 2,
      name: "Soroban USDC",
      amount: "4,250.00 USDC",
      gradient: "from-[#F7931A] via-[#F99D2A] to-[#FCAE40]",
      clayShadow:
        "inset 0 3px 6px rgba(255, 255, 255, 0.55), inset 0 -5px 12px rgba(0, 0, 0, 0.25), 0 8px 18px rgba(247, 147, 26, 0.25)",
      topOffset: "top-10",
      zIndex: "z-20",
    },
    {
      id: 3,
      name: "Stellar EURC",
      amount: "1,800.00 EURC",
      gradient: "from-[#A855F7] via-[#C084F5] to-[#D8B4FE]",
      clayShadow:
        "inset 0 3px 6px rgba(255, 255, 255, 0.6), inset 0 -5px 12px rgba(0, 0, 0, 0.25), 0 8px 18px rgba(168, 85, 247, 0.25)",
      topOffset: "top-20",
      zIndex: "z-30",
    },
  ];

  return (
    <div
      className={cn(
        "relative w-full max-w-sm rounded-[36px] bg-[#EEF2FA] p-4 select-none overflow-visible",
        className
      )}
      style={{
        minHeight: "340px",
        boxShadow:
          "inset 0 3px 6px rgba(255, 255, 255, 0.9), inset 0 -4px 10px rgba(0, 0, 0, 0.05), 0 15px 35px -10px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* ── 3 STACKED 3D CLAYMORPHIC STELLAR ASSET CARDS ── */}
      <div className="relative h-44 w-full">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            onHoverStart={() => setHoveredCard(card.id)}
            onHoverEnd={() => setHoveredCard(null)}
            animate={{
              y: hoveredCard === card.id ? -6 : 0,
              scale: hoveredCard === card.id ? 1.02 : 1,
            }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            style={{ boxShadow: card.clayShadow }}
            className={cn(
              "absolute left-1.5 right-1.5 h-24 rounded-[28px] bg-gradient-to-r px-6 pt-4 flex items-start justify-between text-white cursor-pointer transition-transform",
              card.topOffset,
              card.gradient,
              card.zIndex
            )}
          >
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-wide drop-shadow-sm">
                {card.name}
              </span>
              <span className="text-[10px] text-white/80 font-medium">
                Stellar Network
              </span>
            </div>
            <span className="font-mono font-extrabold text-sm drop-shadow-sm">
              {card.amount}
            </span>
          </motion.div>
        ))}
      </div>

      {/* ── WHITE CLAYMORPHIC WALLET SLEEVE COVER (With authentic U-Shaped Thumb Notch!) ── */}
      <div className="relative z-40 -mt-10">
        <div className="relative w-full drop-shadow-[0_20px_35px_rgba(0,0,0,0.12)]">
          <svg
            className="w-full h-auto block"
            viewBox="0 0 340 185"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Solid Clay White sleeve path with center smooth U-curve notch */}
            <path
              d="M 30 0 
                 L 125 0 
                 C 138 0, 142 38, 170 38 
                 C 198 38, 202 0, 215 0 
                 L 310 0 
                 C 328 0, 340 14, 340 30 
                 L 340 155 
                 C 340 172, 328 185, 310 185 
                 L 30 185 
                 C 12 185, 0 172, 0 155 
                 L 0 30 
                 C 0 14, 12 0, 30 0 Z"
              fill="#FFFFFF"
            />
          </svg>

          {/* Overlay Content positioned inside the White Clay Wallet Sleeve */}
          <div className="absolute inset-0 p-6 flex flex-col justify-between">
            {/* Top Row inside Sleeve: "3 Stellar Assets" Pill + Glowing Blue "+" Button */}
            <div className="flex items-center justify-between pt-2">
              <div
                className="px-3.5 py-1.5 rounded-xl bg-white border border-gray-200/90 text-xs font-bold text-gray-800"
                style={{
                  boxShadow:
                    "inset 0 2px 4px rgba(255, 255, 255, 0.9), 0 3px 8px rgba(0, 0, 0, 0.05)",
                }}
              >
                3 Stellar Assets
              </div>

              <button
                type="button"
                onClick={onAddClick}
                className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer"
                style={{
                  boxShadow:
                    "inset 0 2px 4px rgba(255, 255, 255, 0.45), inset 0 -3px 6px rgba(0, 0, 0, 0.25), 0 8px 20px rgba(37, 99, 235, 0.45)",
                }}
                title="Send / Receive Asset"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* Bottom Row inside Sleeve: LYNXX Enclave Net Balance & XLM value */}
            <div className="pb-1">
              <div className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1">
                <span>Enclave balance</span>
                <span className="text-emerald-600 font-bold">+ 32.8%</span>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight font-mono">
                {balance} XLM
              </div>
              <div className="text-[11px] font-medium text-gray-400 mt-0.5">
                ≈ ${(parseFloat(balance.replace(/,/g, "")) * 0.54).toFixed(2)} USD • Stellar Testnet
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
