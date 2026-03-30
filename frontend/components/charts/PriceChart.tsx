"use client";
// components/charts/PriceChart.tsx
// Zero external dependencies — pure SVG. No react-chartjs-2 / chart.js needed.

import React, { useMemo } from "react";
import type { ForecastPoint, Trend } from "@/lib/api";

const TREND_COLOURS: Record<Trend, { line: string; fill: string }> = {
  RISING:  { line: "#ef4444", fill: "rgba(239,68,68,0.15)"  },
  FALLING: { line: "#22c55e", fill: "rgba(34,197,94,0.15)"  },
  STABLE:  { line: "#3b82f6", fill: "rgba(59,130,246,0.15)" },
};

interface PriceChartProps {
  forecast: ForecastPoint[];
  trend: Trend;
}

function lerp(v: number, a: number, b: number, c: number, d: number) {
  if (b === a) return (c + d) / 2;
  return ((v - a) / (b - a)) * (d - c) + c;
}

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function PriceChart({ forecast, trend }: PriceChartProps) {
  const W = 680, H = 260;
  const PAD = { top: 20, right: 24, bottom: 48, left: 76 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const colours = TREND_COLOURS[trend] ?? TREND_COLOURS.STABLE;

  const paths = useMemo(() => {
    if (!forecast?.length) return null;
    const n = forecast.length;
    const all = forecast.flatMap((p) => [p.lower, p.price, p.upper]);
    const mn = Math.min(...all), mx = Math.max(...all);
    const rng = (mx - mn) || 1;
    const yMin = mn - rng * 0.05, yMax = mx + rng * 0.05;

    const px = (i: number) => lerp(i, 0, n - 1, PAD.left, PAD.left + iW);
    const py = (v: number) => lerp(v, yMin, yMax, PAD.top + iH, PAD.top);
    const toPath = (vals: number[]) =>
      vals.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");

    const upPts = forecast.map((p, i) => `${px(i).toFixed(1)},${py(p.upper).toFixed(1)}`);
    const loPts = [...forecast].reverse().map((p, i) =>
      `${px(n - 1 - i).toFixed(1)},${py(p.lower).toFixed(1)}`
    );

    const xTicks = forecast
      .filter((_, i) => i % 5 === 0 || i === n - 1)
      .map((p) => ({
        x: px(p.day - 1),
        label: new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      }));

    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const value = yMin + ((yMax - yMin) * i) / 4;
      return { value, y: py(value) };
    });

    return {
      price:  toPath(forecast.map((p) => p.price)),
      upper:  toPath(forecast.map((p) => p.upper)),
      lower:  toPath(forecast.map((p) => p.lower)),
      fill:   `M ${upPts.join(" L ")} L ${loPts.join(" L ")} Z`,
      dots:   forecast.filter((_, i) => i % 5 === 0).map((p) => ({
        cx: px(p.day - 1), cy: py(p.price),
      })),
      xTicks,
      yTicks,
    };
  }, [forecast, iW, iH, PAD.left, PAD.top]);

  if (!paths) return null;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", fontFamily: "inherit" }}>
        {/* grid */}
        {paths.yTicks.map((t) => (
          <line key={t.value} x1={PAD.left} x2={PAD.left + iW} y1={t.y} y2={t.y}
            stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        ))}

        {/* CI fill */}
        <path d={paths.fill} fill={colours.fill} />

        {/* CI dashed lines */}
        {[paths.upper, paths.lower].map((d, i) => (
          <path key={i} d={d} fill="none" stroke={colours.line}
            strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />
        ))}

        {/* price line */}
        <path d={paths.price} fill="none" stroke={colours.line}
          strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* dots */}
        {paths.dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={4}
            fill={colours.line} stroke="#1f2937" strokeWidth={2} />
        ))}

        {/* axes */}
        <line x1={PAD.left} x2={PAD.left + iW} y1={PAD.top + iH} y2={PAD.top + iH}
          stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + iH}
          stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

        {/* x labels */}
        {paths.xTicks.map((t) => (
          <text key={t.label} x={t.x} y={PAD.top + iH + 18}
            textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.45)">
            {t.label}
          </text>
        ))}

        {/* y labels */}
        {paths.yTicks.map((t) => (
          <text key={t.value} x={PAD.left - 8} y={t.y + 4}
            textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.45)">
            {fmtINR(t.value)}
          </text>
        ))}

        {/* legend */}
        <g transform={`translate(${PAD.left + 8},${H - 14})`}>
          <line x1={0} x2={16} y1={0} y2={0} stroke={colours.line} strokeWidth={2.5} />
          <text x={20} y={4} fontSize={10} fill="rgba(255,255,255,0.5)">Forecast Price</text>
          <line x1={110} x2={126} y1={0} y2={0} stroke={colours.line}
            strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
          <text x={130} y={4} fontSize={10} fill="rgba(255,255,255,0.5)">Confidence Interval</text>
        </g>
      </svg>
    </div>
  );
}

export default PriceChart;
