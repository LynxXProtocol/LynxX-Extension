"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, useSpring, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";

export interface InteractiveOverviewChartProps {
  className?: string;
}

// 12 months of live/simulated market data matching the screenshot curves
const monthlyData = [
  { month: "Jan", current: 2800, last: 4100, currentDisplay: "$18,500", lastDisplay: "$38,200" },
  { month: "Feb", current: 3100, last: 4300, currentDisplay: "$19,200", lastDisplay: "$39,500" },
  { month: "Mar", current: 3300, last: 4100, currentDisplay: "$19,800", lastDisplay: "$38,900" },
  { month: "Apr", current: 3400, last: 4350, currentDisplay: "$19,950", lastDisplay: "$39,800" },
  { month: "May", current: 3550, last: 4800, currentDisplay: "$20,000", lastDisplay: "$40,000" },
  { month: "Jun", current: 4100, last: 3800, currentDisplay: "$24,500", lastDisplay: "$35,400" },
  { month: "July", current: 4900, last: 4000, currentDisplay: "$29,100", lastDisplay: "$37,200" },
  { month: "Aug", current: 4700, last: 4500, currentDisplay: "$27,800", lastDisplay: "$41,000" },
  { month: "Sep", current: 4350, last: 4400, currentDisplay: "$25,400", lastDisplay: "$39,900" },
  { month: "Oct", current: 4600, last: 3500, currentDisplay: "$26,900", lastDisplay: "$33,500" },
  { month: "Nov", current: 5050, last: 3200, currentDisplay: "$30,200", lastDisplay: "$31,100" },
  { month: "Dec", current: 5200, last: 3900, currentDisplay: "$31,800", lastDisplay: "$36,700" },
];

export function InteractiveOverviewChart({ className }: InteractiveOverviewChartProps) {
  // Default to index 4 ("May" exactly like the screenshot!)
  const [activeIndex, setActiveIndex] = useState<number>(4);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Layout dimensions
  const svgWidth = 680;
  const svgHeight = 210;
  const topPad = 25;
  const bottomPad = 35;
  const leftPad = 40;
  const rightPad = 20;

  const chartW = svgWidth - leftPad - rightPad;
  const chartH = svgHeight - topPad - bottomPad;

  // Map value (0 to 5500) to svg Y coordinate
  const valToY = (val: number) => {
    const clamped = Math.max(0, Math.min(5500, val));
    const ratio = clamped / 5500;
    return svgHeight - bottomPad - ratio * chartH;
  };

  // Map month index (0 to 11) to svg X coordinate
  const idxToX = (idx: number) => {
    return leftPad + (idx / 11) * chartW;
  };

  // Generate smooth SVG Cubic Spline Path for data values
  const generateSpline = (values: number[]) => {
    const points = values.map((v, i) => ({ x: idxToX(i), y: valToY(v) }));
    if (points.length < 2) return "";
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(i + 2, points.length - 1)];

      // Catmull-Rom to Cubic Bezier control points
      const cp1x = p1.x + (p2.x - p0.x) * 0.18;
      const cp1y = p1.y + (p2.y - p0.y) * 0.18;
      const cp2x = p2.x - (p3.x - p1.x) * 0.18;
      const cp2y = p2.y - (p3.y - p1.y) * 0.18;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const bluePath = generateSpline(monthlyData.map((d) => d.current));
  const orangePath = generateSpline(monthlyData.map((d) => d.last));

  // Current active data
  const activeData = monthlyData[activeIndex];
  const activeX = idxToX(activeIndex);
  const activeBlueY = valToY(activeData.current);
  const activeOrangeY = valToY(activeData.last);

  // Handle pointer / drag interaction across the chart
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const relX = clientX - rect.left - leftPad;
    const ratio = Math.max(0, Math.min(1, relX / chartW));
    const newIdx = Math.round(ratio * 11);
    if (newIdx !== activeIndex && newIdx >= 0 && newIdx < 12) {
      setActiveIndex(newIdx);
    }
  };

  return (
    <div
      ref={chartRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsDragging(false);
      }}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseMove={handlePointerMove}
      onTouchMove={handlePointerMove}
      className={cn(
        "relative w-full rounded-[36px] bg-white border border-gray-200/80 shadow-sm p-7 flex flex-col justify-between select-none cursor-crosshair transition-shadow hover:shadow-md",
        className
      )}
      style={{ minHeight: "340px" }}
    >
      {/* ── Top Chart Header & Controls ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-gray-900 tracking-tight">
            Overview
          </h3>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Real-time
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            <span>Last 30 days</span>
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
          </button>
        </div>
      </div>

      {/* ── Main Interactive Chart Area ── */}
      <div className="relative w-full flex-1 flex flex-col justify-end pt-8">
        {/* FLOATING HOVER / DRAGGABLE TOOLTIP CARD (Exactly like user screenshot!) */}
        <motion.div
          animate={{
            // Constrain tooltip horizontally so it doesn't overflow left or right edges
            left: `${Math.max(16, Math.min(84, (activeX / svgWidth) * 100))}%`,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="absolute -top-1 -translate-x-1/2 px-5 py-3 rounded-2xl bg-white border border-gray-200/90 shadow-[0_12px_30px_rgba(0,0,0,0.12)] flex items-center gap-6 text-xs z-30 pointer-events-none"
          style={{ minWidth: "220px" }}
        >
          {/* Current Year Item */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-sm" />
              <span>Current Year</span>
            </div>
            <span className="text-base font-extrabold text-gray-900 font-mono tracking-tight">
              {activeData.currentDisplay}
            </span>
          </div>

          <div className="w-px h-8 bg-gray-200" />

          {/* Last Year Item */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-gray-500 font-medium mb-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-sm" />
              <span>Last Year</span>
            </div>
            <span className="text-base font-extrabold text-gray-900 font-mono tracking-tight">
              {activeData.lastDisplay}
            </span>
          </div>
        </motion.div>

        {/* SVG Spline Curves + Grid + Vertical Guide Line + Intersection Dots */}
        <div className="relative w-full h-48">
          {/* Y-Axis Labels (0, 1K, 2K, 3K, 4K, 5K) */}
          <div className="absolute top-0 bottom-6 left-0 flex flex-col justify-between text-[11px] font-medium text-gray-400 pointer-events-none pr-2">
            <span>5K</span>
            <span>4K</span>
            <span>3K</span>
            <span>2K</span>
            <span>1K</span>
            <span>0</span>
          </div>

          <svg
            className="w-full h-full overflow-visible pl-7"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* SVG Defs for gradient line fades */}
            <defs>
              <linearGradient id="blueCurveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.15" />
                <stop offset="30%" stopColor="#2563EB" stopOpacity="1" />
                <stop offset="100%" stopColor="#2563EB" stopOpacity="1" />
              </linearGradient>
              <linearGradient id="orangeCurveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F97316" stopOpacity="0.15" />
                <stop offset="30%" stopColor="#F97316" stopOpacity="1" />
                <stop offset="100%" stopColor="#F97316" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines matching Y-Axis labels */}
            {[0, 1000, 2000, 3000, 4000, 5000].map((val, i) => {
              const yPos = valToY(val);
              return (
                <line
                  key={i}
                  x1={leftPad}
                  y1={yPos}
                  x2={svgWidth - rightPad}
                  y2={yPos}
                  stroke="#F3F4F6"
                  strokeWidth="1.2"
                />
              );
            })}

            {/* VERTICAL INTERACTIVE GUIDE LINE (Moves smoothly to active month x) */}
            <motion.line
              x1={activeX}
              y1={topPad - 10}
              x2={activeX}
              y2={svgHeight - bottomPad}
              stroke="#D1D5DB"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              animate={{ x1: activeX, x2: activeX }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            />

            {/* Orange Line Curve (Last Year) */}
            <path
              d={orangePath}
              stroke="url(#orangeCurveGrad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Blue Line Curve (Current Year) */}
            <path
              d={bluePath}
              stroke="url(#blueCurveGrad)"
              strokeWidth="3.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* ORANGE INTERSECTION DOT */}
            <motion.circle
              cx={activeX}
              cy={activeOrangeY}
              r="6.5"
              fill="#F97316"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              animate={{ cx: activeX, cy: activeOrangeY }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              style={{ filter: "drop-shadow(0 2px 6px rgba(249,115,22,0.45))" }}
            />

            {/* BLUE INTERSECTION DOT */}
            <motion.circle
              cx={activeX}
              cy={activeBlueY}
              r="6.5"
              fill="#2563EB"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              animate={{ cx: activeX, cy: activeBlueY }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              style={{ filter: "drop-shadow(0 2px 6px rgba(37,99,235,0.45))" }}
            />
          </svg>
        </div>

        {/* X-Axis Months Label Row (Jan to Dec) with Active Month highlighted in Bold */}
        <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 pt-3 border-t border-gray-100 pl-7">
          {monthlyData.map((d, idx) => (
            <button
              key={d.month}
              onClick={() => setActiveIndex(idx)}
              className={cn(
                "px-2 py-1 rounded-lg transition-all cursor-pointer font-sans",
                idx === activeIndex
                  ? "text-gray-900 font-extrabold bg-gray-100 scale-110 shadow-sm"
                  : "hover:text-gray-700 hover:bg-gray-50"
              )}
            >
              {d.month}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
