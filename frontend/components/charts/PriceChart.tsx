"use client";
// components/charts/PriceChart.tsx  (FIXED)
// =====================================================================
// Fixes:
//   1. All data comes from props (forecast array from API)
//   2. Chart updates dynamically when forecast changes
//   3. Confidence interval (lower/upper) rendered as shaded area
//   4. No static/hardcoded chart data
// =====================================================================

import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { ForecastPoint, Trend } from "@/lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const TREND_COLOURS: Record<Trend, { line: string; fill: string }> = {
  RISING:  { line: "#ef4444", fill: "rgba(239,68,68,0.12)" },
  FALLING: { line: "#22c55e", fill: "rgba(34,197,94,0.12)" },
  STABLE:  { line: "#3b82f6", fill: "rgba(59,130,246,0.12)" },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PriceChartProps {
  forecast: ForecastPoint[];
  trend: Trend;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function PriceChart({ forecast, trend }: PriceChartProps) {
  if (!forecast || forecast.length === 0) return null;

  const colours = TREND_COLOURS[trend] ?? TREND_COLOURS.STABLE;

  const labels = forecast.map((p) =>
    new Date(p.date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),
  );

  const data = {
    labels,
    datasets: [
      // Upper CI band (invisible line, fills down to lower)
      {
        label: "Upper CI",
        data: forecast.map((p) => p.upper),
        borderColor: "transparent",
        backgroundColor: colours.fill,
        fill: "+1",   // fill to next dataset (lower)
        pointRadius: 0,
        tension: 0.4,
      },
      // Forecast price line
      {
        label: "Forecast Price (₹)",
        data: forecast.map((p) => p.price),
        borderColor: colours.line,
        backgroundColor: colours.line,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: false,
      },
      // Lower CI band
      {
        label: "Lower CI",
        data: forecast.map((p) => p.lower),
        borderColor: "transparent",
        backgroundColor: colours.fill,
        fill: false,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: {
          // Hide CI helper datasets from legend
          filter: (item: { text: string }) =>
            item.text === "Forecast Price (₹)",
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) => {
            if (ctx.dataset.label === "Forecast Price (₹)") {
              return `  ₹${ctx.parsed.y.toLocaleString("en-IN")}`;
            }
            return "";
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          maxTicksLimit: 10,
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: "rgba(0,0,0,0.06)" },
        ticks: {
          callback: (value: number | string) =>
            `₹${Number(value).toLocaleString("en-IN")}`,
          font: { size: 11 },
        },
      },
    },
  };

  return (
    <div style={{ position: "relative", height: 280 }}>
      <Line data={data} options={options} />
    </div>
  );
}

export default PriceChart;
