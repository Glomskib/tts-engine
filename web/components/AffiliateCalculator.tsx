'use client';

import { useState } from 'react';
import { TrendingUp, Calendar, DollarSign } from 'lucide-react';

export default function AffiliateCalculator() {
  const [monthlyGMV, setMonthlyGMV] = useState(10000);
  const [commissionRate, setCommissionRate] = useState(30);
  const [videosPerMonth, setVideosPerMonth] = useState(50);
  const [retainerFee, setRetainerFee] = useState(0);
  const [flatFeePerVideo, setFlatFeePerVideo] = useState(0);
  const [itemsSold, setItemsSold] = useState(400); // Now editable

  // Calculations
  const estCommission = monthlyGMV * (commissionRate / 100);
  const estFlatFee = flatFeePerVideo * videosPerMonth;
  const commissionBase = monthlyGMV;
  const totalMonthlyEarnings = estCommission + estFlatFee + retainerFee;
  const projectedAnnual = totalMonthlyEarnings * 12;
  const dailyEarnings = totalMonthlyEarnings / 30;
  const avgEarningsPerVideo = videosPerMonth > 0 ? totalMonthlyEarnings / videosPerMonth : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <p className="text-sm font-medium text-zinc-500 uppercase tracking-widest mb-4">
          See What You Could Earn
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          TikTok Shop Earnings Calculator
        </h2>
        <p className="text-zinc-400 text-lg">
          Calculate your potential affiliate commission earnings
        </p>
      </div>

      {/* Calculator Card */}
      <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 p-8 mb-8">
        {/* Input Controls */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {/* Monthly GMV */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Monthly GMV ($)</label>
            <input
              type="range"
              min="0"
              max="100000"
              step="1000"
              value={monthlyGMV}
              onChange={(e) => setMonthlyGMV(Number(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <div className="text-right text-zinc-300 font-semibold mt-1">
              {formatCurrency(monthlyGMV)}
            </div>
          </div>

          {/* Commission Rate */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Commission Rate (%)</label>
            <input
              type="range"
              min="5"
              max="50"
              step="1"
              value={commissionRate}
              onChange={(e) => setCommissionRate(Number(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <div className="text-right text-zinc-300 font-semibold mt-1">{commissionRate}%</div>
          </div>

          {/* Videos per Month */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Videos per Month</label>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={videosPerMonth}
              onChange={(e) => setVideosPerMonth(Number(e.target.value))}
              className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-teal-500"
            />
            <div className="text-right text-zinc-300 font-semibold mt-1">{videosPerMonth}</div>
          </div>

          {/* Items Sold - NOW EDITABLE */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Items Sold</label>
            <input
              type="number"
              min="0"
              step="10"
              value={itemsSold}
              onChange={(e) => setItemsSold(Number(e.target.value))}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-300 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Retainer Fee */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Monthly Retainer ($)</label>
            <input
              type="number"
              min="0"
              step="100"
              value={retainerFee}
              onChange={(e) => setRetainerFee(Number(e.target.value))}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-300 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Flat Fee per Video */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Flat Fee per Video ($)</label>
            <input
              type="number"
              min="0"
              step="5"
              value={flatFeePerVideo}
              onChange={(e) => setFlatFeePerVideo(Number(e.target.value))}
              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-zinc-300 focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* GMV */}
          <StatCard label="GMV" value={formatCurrency(monthlyGMV)} trend="+12.5%" />

          {/* Items Sold */}
          <StatCard label="Items Sold" value={formatNumber(itemsSold)} trend="+8.2%" />

          {/* Est. Commission */}
          <StatCard
            label="Est. Commission"
            value={formatCurrency(estCommission)}
            trend="+15.3%"
            highlight
          />

          {/* Est. Flat Fee */}
          <StatCard label="Est. Flat Fee" value={formatCurrency(estFlatFee)} trend="+5.1%" />

          {/* Commission Base */}
          <StatCard label="Commission Base" value={formatCurrency(commissionBase)} trend="+12.5%" />

          {/* Monthly Retainer */}
          <StatCard label="Monthly Retainer" value={formatCurrency(retainerFee)} />

          {/* Daily Earnings - NEW */}
          <StatCard label="Daily Earnings" value={formatCurrency(dailyEarnings)} trend="+10.2%" />

          {/* Avg Earnings per Video - NEW */}
          <StatCard
            label="Avg per Video"
            value={formatCurrency(avgEarningsPerVideo)}
            trend="+7.8%"
          />

          {/* Total Monthly Earnings - Highlighted */}
          <StatCard
            label="Total Monthly Earnings"
            value={formatCurrency(totalMonthlyEarnings)}
            trend="+18.4%"
            highlight
            large
          />
        </div>

        {/* Monthly + Annual Projection Side by Side */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
                Monthly Earnings
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {formatCurrency(totalMonthlyEarnings)}
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
                Annual Projection
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {formatCurrency(projectedAnnual)}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-zinc-600 text-center mt-4">
          For illustration only. Actual earnings depend on your niche, content quality, audience, and platform conditions. FlashFlow does not guarantee any specific results.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  highlight = false,
  large = false,
}: {
  label: string;
  value: string;
  trend?: string;
  highlight?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-xl border transition-all hover:border-zinc-600 ${
        highlight
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-zinc-800/50 border-zinc-700'
      }`}
    >
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div
        className={`font-bold ${highlight ? 'text-emerald-400' : 'text-white'} ${
          large ? 'text-3xl' : 'text-2xl'
        }`}
      >
        {value}
      </div>
      {trend && (
        <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          {trend}
        </div>
      )}
    </div>
  );
}
