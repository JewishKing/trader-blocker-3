'use client'

import { useState, useMemo, useRef } from 'react'
import {
  BarChart3, TrendingUp, TrendingDown, ShieldAlert, AlertTriangle,
  Trophy, Zap, DollarSign, Activity, Target, Flame, Info,
  Plus, Trash2, ChevronDown, ChevronUp, FileText, Settings2,
  CheckCircle2, XCircle, AlertCircle, Eye, EyeOff,
} from 'lucide-react'

/* ════════════════════════════════════════════════════
   TYPES
════════════════════════════════════════════════════ */
type TradeResult = 'win' | 'loss'
type PerformanceRating = 'PROFITABLE' | 'BREAK-EVEN' | 'UNPROFITABLE'
type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH'

interface TradeEntry {
  id: string
  result: TradeResult
  rr: number          // RR for this trade (win gives +rr, loss gives -1)
  note: string
  timestamp: number
}

interface Analysis {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  lossRate: number
  expectancy: number
  totalR: number
  avgRPerTrade: number
  consecutiveLosses: number         // current streak
  maxConsecutiveLosses: number
  equityCurve: number[]
  finalBalance: number
  peakBalance: number
  maxDrawdownPct: number
  currentDrawdownPct: number
  lossesTo30Pct: number
  lossesTo50Pct: number
  rating: PerformanceRating
  confidence: ConfidenceLevel
  riskWarning: string | null
  suggestedRisk: number | null
  breakEvenWinRate: number
}

/* ════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════ */
function uid() { return Math.random().toString(36).slice(2, 9) }

function consecutiveLossesFor(ddPct: number, riskPct: number): number {
  if (riskPct <= 0) return 999
  return Math.ceil(Math.log(1 - ddPct / 100) / Math.log(1 - riskPct / 100))
}

function runAnalysis(trades: TradeEntry[], startBalance: number, riskPct: number): Analysis {
  const total = trades.length
  const wins  = trades.filter(t => t.result === 'win').length
  const losses = trades.filter(t => t.result === 'loss').length
  const winRate  = total > 0 ? (wins / total) * 100 : 0
  const lossRate = total > 0 ? (losses / total) * 100 : 0

  // Average RR (weighted by actual per-trade RR)
  const totalR = trades.reduce((s, t) => s + (t.result === 'win' ? t.rr : -1), 0)
  const avgRPerTrade = total > 0 ? totalR / total : 0

  // Expectancy uses average RR of wins
  const winRR  = wins > 0
    ? trades.filter(t => t.result === 'win').reduce((s, t) => s + t.rr, 0) / wins
    : 0
  const expectancy = total > 0
    ? (winRate / 100 * winRR) - (lossRate / 100 * 1)
    : 0

  const breakEvenWinRate = winRR > 0 ? (1 / (1 + winRR)) * 100 : 50

  // Equity curve with compounding
  const curve: number[] = [startBalance]
  let bal = startBalance
  for (const t of trades) {
    if (t.result === 'win') bal *= (1 + (riskPct / 100) * t.rr)
    else bal *= (1 - riskPct / 100)
    curve.push(Math.max(0, bal))
  }

  // Drawdown metrics
  let peak = startBalance
  let maxDD = 0
  for (const v of curve) {
    if (v > peak) peak = v
    const dd = peak - v
    if (dd > maxDD) maxDD = dd
  }
  const finalBalance    = curve[curve.length - 1]
  const peakBalance     = peak
  const maxDrawdownPct  = peak > 0 ? (maxDD / peak) * 100 : 0
  const currentDrawdownPct = peakBalance > 0 ? Math.max(0, (peakBalance - finalBalance) / peakBalance * 100) : 0

  // Consecutive loss streak tracking
  let curLoss = 0, maxConsecLoss = 0
  for (const t of trades) {
    if (t.result === 'loss') { curLoss++; maxConsecLoss = Math.max(maxConsecLoss, curLoss) }
    else curLoss = 0
  }
  const consecutiveLosses = (() => {
    let streak = 0
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].result === 'loss') streak++
      else break
    }
    return streak
  })()

  // Survival thresholds
  const lossesTo30Pct = consecutiveLossesFor(30, riskPct)
  const lossesTo50Pct = consecutiveLossesFor(50, riskPct)

  // Performance Rating
  let rating: PerformanceRating
  if (totalR > 0.5 && expectancy > 0) rating = 'PROFITABLE'
  else if (Math.abs(totalR) <= 0.5 || (totalR > 0 && expectancy <= 0)) rating = 'BREAK-EVEN'
  else rating = 'UNPROFITABLE'

  // Confidence level
  let confidence: ConfidenceLevel
  if (total < 20)  confidence = 'LOW'
  else if (total < 50) confidence = 'MEDIUM'
  else confidence = 'HIGH'

  // Risk feedback
  let riskWarning: string | null = null
  let suggestedRisk: number | null = null
  if (riskPct >= 5 && maxDrawdownPct >= 25) {
    riskWarning = `Your ${riskPct}% risk is aggressive — account hit ${maxDrawdownPct.toFixed(1)}% drawdown. A losing streak of ${lossesTo30Pct} trades already reaches 30% DD.`
    suggestedRisk = maxDrawdownPct >= 40 ? 2 : 3
  } else if (riskPct >= 5 && maxConsecLoss >= lossesTo30Pct - 2) {
    riskWarning = `You're ${lossesTo30Pct - maxConsecLoss} consecutive losses away from a 30% drawdown at ${riskPct}% risk.`
    suggestedRisk = 3
  } else if (riskPct > 7) {
    riskWarning = `${riskPct}% risk per trade is very high for a swing trader. A few losses can wipe significant capital.`
    suggestedRisk = 3
  }

  return {
    totalTrades: total, wins, losses,
    winRate, lossRate, expectancy,
    totalR, avgRPerTrade,
    consecutiveLosses, maxConsecutiveLosses: maxConsecLoss,
    equityCurve: curve,
    finalBalance, peakBalance: peak,
    maxDrawdownPct, currentDrawdownPct,
    lossesTo30Pct, lossesTo50Pct,
    rating, confidence, riskWarning, suggestedRisk,
    breakEvenWinRate,
  }
}

/* ════════════════════════════════════════════════════
   SVG EQUITY CURVE
════════════════════════════════════════════════════ */
function EquityCurve({ curve, startBalance }: { curve: number[]; startBalance: number }) {
  if (curve.length < 2) return null
  const W = 400, H = 90, pad = 6
  const vals = curve
  const minV = Math.min(...vals) * 0.98
  const maxV = Math.max(...vals) * 1.02
  const range = maxV - minV || 1
  const toX = (i: number) => pad + (i / (vals.length - 1)) * (W - pad * 2)
  const toY = (v: number) => H - pad - ((v - minV) / range) * (H - pad * 2)
  const pts = vals.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
  const pathD = `M ${pts.join(' L ')}`
  const fillD = `M ${pts[0]} L ${pts.join(' L ')} L ${toX(vals.length-1)},${H} L ${pad},${H} Z`
  const isProfit = vals[vals.length - 1] >= startBalance
  const lineColor = isProfit ? '#34d399' : '#f87171'
  const startY = toY(startBalance)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
      <line x1={pad} y1={startY} x2={W-pad} y2={startY}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1" strokeDasharray="4 3" />
      <path d={fillD} fill={isProfit ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.07)'} />
      <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2"
        style={{ filter: `drop-shadow(0 0 5px ${lineColor}80)` }} />
      {(() => {
        const [lx, ly] = pts[pts.length-1].split(',').map(Number)
        return <circle cx={lx} cy={ly} r="3.5" fill={lineColor}
          style={{ filter: `drop-shadow(0 0 8px ${lineColor})` }} />
      })()}
      {/* Trade markers */}
      {vals.slice(1).map((_, i) => {
        const x = toX(i + 1), y = toY(vals[i + 1])
        const up = vals[i + 1] >= vals[i]
        return <circle key={i} cx={x} cy={y} r="2.5"
          fill={up ? 'rgba(52,211,153,0.6)' : 'rgba(248,113,113,0.6)'} />
      })}
    </svg>
  )
}

/* ════════════════════════════════════════════════════
   CIRCULAR GAUGE
════════════════════════════════════════════════════ */
function Arc({ value, max = 100, size = 78, stroke = 6, color, label, sub }: {
  value: number; max?: number; size?: number; stroke?: number;
  color: string; label: string; sub?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(value / max, 1))
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 5px ${color}60)` }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-bold text-sm" style={{ color }}>{label}</span>
        </div>
      </div>
      {sub && <span className="text-[9px] text-muted-foreground/60 text-center leading-tight">{sub}</span>}
    </div>
  )
}

/* ════════════════════════════════════════════════════
   BADGE / CHIP COMPONENTS
════════════════════════════════════════════════════ */
function Chip({ label, value, color = '#94a3b8', accent = false }: {
  label: string; value: string; color?: string; accent?: boolean
}) {
  return (
    <div className="glass-inner rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
      style={accent ? { borderWidth: 1, borderColor: `${color}35` } : {}}>
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground/55">{label}</span>
      <span className="font-mono text-sm font-bold leading-none" style={{ color }}>{value}</span>
    </div>
  )
}

const RATING_CONFIG = {
  PROFITABLE:   { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.22)',  icon: Trophy,       desc: 'Positive R total & positive expectancy. Keep the discipline.' },
  'BREAK-EVEN': { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)',   icon: Target,       desc: 'Total R near zero. Edge is unclear — focus on consistency.' },
  UNPROFITABLE: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: AlertTriangle, desc: 'Negative R total. Review strategy before risking more capital.' },
} as const

const CONFIDENCE_CONFIG = {
  LOW:    { color: '#f87171', label: 'LOW CONFIDENCE',    desc: '< 20 trades — sample is too small for statistical meaning.' },
  MEDIUM: { color: '#fbbf24', label: 'MEDIUM CONFIDENCE', desc: '20–50 trades — trends are forming. Keep logging.' },
  HIGH:   { color: '#34d399', label: 'HIGH CONFIDENCE',   desc: '50+ trades — statistically meaningful. Trust the data.' },
} as const

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════ */
export function WinrateCalculator() {
  // ── Account config ─────────────────────────
  const [startBalance, setStartBalance] = useState(500)
  const [riskPct,      setRiskPct]      = useState(5)

  // ── Trade entry state ──────────────────────
  const [trades,      setTrades]      = useState<TradeEntry[]>([])
  const [entryResult, setEntryResult] = useState<TradeResult>('win')
  const [entryRR,     setEntryRR]     = useState(2)
  const [entryNote,   setEntryNote]   = useState('')
  const [useAvgRR,    setUseAvgRR]    = useState(false)
  const [avgRR,       setAvgRR]       = useState(2)

  // ── UI state ───────────────────────────────
  const [activeTab,    setActiveTab]    = useState<'log' | 'analysis' | 'equity' | 'survival'>('log')
  const [showConfig,   setShowConfig]   = useState(false)
  const [showNotes,    setShowNotes]    = useState(false)
  const [showAllTrades,setShowAllTrades]= useState(false)

  // ── Analysis ───────────────────────────────
  const analysis = useMemo(
    () => runAnalysis(trades, startBalance, riskPct),
    [trades, startBalance, riskPct],
  )

  // ── Add trade ──────────────────────────────
  function addTrade() {
    const rr = useAvgRR ? avgRR : entryRR
    setTrades(prev => [...prev, {
      id: uid(),
      result: entryResult,
      rr,
      note: entryNote.trim(),
      timestamp: Date.now(),
    }])
    setEntryNote('')
  }

  function removeTrade(id: string) {
    setTrades(prev => prev.filter(t => t.id !== id))
  }

  // ── Colour helpers ─────────────────────────
  const ratingCfg     = RATING_CONFIG[analysis.rating]
  const confidenceCfg = CONFIDENCE_CONFIG[analysis.confidence]
  const RatingIcon    = ratingCfg.icon
  const winRateColor  = analysis.winRate >= analysis.breakEvenWinRate + 5 ? '#34d399'
    : analysis.winRate >= analysis.breakEvenWinRate ? '#fbbf24' : '#f87171'
  const expColor      = analysis.expectancy > 0.2 ? '#34d399' : analysis.expectancy > 0 ? '#fbbf24' : '#f87171'
  const ddColor       = analysis.currentDrawdownPct < 20 ? '#34d399' : analysis.currentDrawdownPct < 40 ? '#fbbf24' : '#f87171'
  const balColor      = analysis.finalBalance >= startBalance ? '#34d399' : '#f87171'
  const riskAmount    = startBalance * (riskPct / 100)
  const displayTrades = showAllTrades ? [...trades].reverse() : [...trades].reverse().slice(0, 8)

  return (
    <div className="glass-card gradient-border rounded-2xl overflow-hidden">
      {/* ─── HEADER ──────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center animate-pulse-glow">
            <BarChart3 size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Trade Analyzer</h2>
            <p className="text-[10px] text-muted-foreground/55">Swing trader · compounding performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Confidence pill */}
          {trades.length > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest"
              style={{ background: `${confidenceCfg.color}15`, color: confidenceCfg.color }}
            >
              <Activity size={9} />
              {confidenceCfg.label}
            </div>
          )}
          <button
            id="analyzer-config-toggle"
            onClick={() => setShowConfig(s => !s)}
            className="p-2 rounded-lg glass-surface text-muted-foreground hover:text-primary transition-colors"
            title="Account settings"
          >
            <Settings2 size={13} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* ─── ACCOUNT CONFIG (collapsible) ────── */}
        {showConfig && (
          <div className="glass-surface rounded-xl p-4 space-y-3 animate-fade-in-up">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 flex items-center gap-1.5">
              <Settings2 size={9} /> Account Configuration
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ta-balance" className="text-[10px] text-muted-foreground/65 uppercase tracking-widest mb-1.5 block">Account Size</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">$</span>
                  <input id="ta-balance" type="number" min={1} value={startBalance}
                    onChange={e => setStartBalance(Math.max(1, Number(e.target.value)))}
                    className="w-full glass-inner rounded-lg pl-6 pr-3 py-2.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all" />
                </div>
              </div>
              <div>
                <label htmlFor="ta-risk" className="text-[10px] text-muted-foreground/65 uppercase tracking-widest mb-1.5 block">Risk Per Trade</label>
                <div className="relative">
                  <input id="ta-risk" type="number" min={0.5} max={100} step={0.5} value={riskPct}
                    onChange={e => setRiskPct(Math.min(100, Math.max(0.5, Number(e.target.value))))}
                    className="w-full glass-inner rounded-lg pl-3 pr-7 py-2.5 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="glass-inner rounded-lg px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mb-0.5">Risk $</p>
                <p className="font-mono text-sm font-bold text-red-400">${riskAmount.toFixed(2)}</p>
              </div>
              <div className="glass-inner rounded-lg px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mb-0.5">To 30% DD</p>
                <p className="font-mono text-sm font-bold text-yellow-400">{analysis.lossesTo30Pct}L</p>
              </div>
              <div className="glass-inner rounded-lg px-3 py-2 text-center">
                <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest mb-0.5">To 50% DD</p>
                <p className="font-mono text-sm font-bold text-orange-400">{analysis.lossesTo50Pct}L</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── TRADE ENTRY ─────────────────────── */}
        <div className="glass-surface rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 flex items-center gap-1.5">
              <Plus size={9} /> Log New Trade
            </p>
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
              <div
                onClick={() => setUseAvgRR(s => !s)}
                className={`w-7 h-4 rounded-full transition-all relative cursor-pointer ${useAvgRR ? 'bg-primary/40' : 'bg-white/10'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${useAvgRR ? 'left-3.5' : 'left-0.5'}`} />
              </div>
              Use avg RR
            </label>
          </div>

          {/* Win / Loss toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              id="entry-win-btn"
              onClick={() => setEntryResult('win')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 ${
                entryResult === 'win'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10'
                  : 'glass-inner text-muted-foreground hover:text-emerald-400 border border-transparent'
              }`}
            >
              <TrendingUp size={14} /> Win
            </button>
            <button
              id="entry-loss-btn"
              onClick={() => setEntryResult('loss')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 ${
                entryResult === 'loss'
                  ? 'bg-red-500/20 border border-red-500/40 text-red-400 shadow-lg shadow-red-500/10'
                  : 'glass-inner text-muted-foreground hover:text-red-400 border border-transparent'
              }`}
            >
              <TrendingDown size={14} /> Loss
            </button>
          </div>

          {/* RR input */}
          {useAvgRR ? (
            <div className="glass-inner rounded-lg px-3 py-2 flex items-center gap-2">
              <Info size={10} className="text-primary/50 shrink-0" />
              <span className="text-[10px] text-muted-foreground/60">
                Using avg RR:
              </span>
              <input
                id="entry-avg-rr"
                type="number" min={0.1} step={0.1} value={avgRR}
                onChange={e => setAvgRR(Math.max(0.1, Number(e.target.value)))}
                className="w-16 glass-inner rounded-lg px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 ml-auto"
              />
              <span className="text-[10px] text-muted-foreground/50">R</span>
            </div>
          ) : (
            <div>
              <label htmlFor="entry-rr" className="text-[10px] text-muted-foreground/55 uppercase tracking-widest mb-1.5 block">
                RR Ratio for this trade
                <span className="ml-2 font-mono normal-case text-primary/60">
                  {entryResult === 'win' ? `+${entryRR}R` : '−1R'}
                </span>
              </label>
              <div className="flex gap-1.5">
                {[1, 1.5, 2, 2.5, 3, 4].map(v => (
                  <button
                    key={v}
                    id={`rr-preset-${v}`}
                    onClick={() => setEntryRR(v)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-mono font-semibold transition-all ${
                      entryRR === v
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'glass-inner text-muted-foreground/60 hover:text-foreground'
                    }`}
                  >
                    {v}R
                  </button>
                ))}
                <input
                  id="entry-rr"
                  type="number" min={0.1} step={0.1} value={entryRR}
                  onChange={e => setEntryRR(Math.max(0.1, Number(e.target.value)))}
                  className="w-14 glass-inner rounded-lg px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 text-center"
                />
              </div>
            </div>
          )}

          {/* Note field */}
          <div>
            <button
              id="toggle-note"
              onClick={() => setShowNotes(s => !s)}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1"
            >
              <FileText size={9} />
              {showNotes ? 'Hide note' : 'Add note (optional)'}
            </button>
            {showNotes && (
              <input
                id="entry-note"
                type="text"
                placeholder="e.g. Followed plan, EURUSD HTF signal..."
                value={entryNote}
                onChange={e => setEntryNote(e.target.value)}
                className="mt-1.5 w-full glass-inner rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
              />
            )}
          </div>

          {/* Add button */}
          <button
            id="add-trade-btn"
            onClick={addTrade}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 ${
              entryResult === 'win'
                ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-500/40'
                : 'bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 hover:border-red-500/40'
            }`}
          >
            <Plus size={14} />
            Log {entryResult === 'win' ? 'Win' : 'Loss'}
            <span className="font-mono text-xs opacity-60">
              ({entryResult === 'win' ? `+${useAvgRR ? avgRR : entryRR}R` : '−1R'})
            </span>
          </button>
        </div>

        {/* ─── TABS ────────────────────────────── */}
        {trades.length > 0 && (
          <>
            <div className="flex gap-1 glass-surface rounded-lg p-1">
              {(['log', 'analysis', 'equity', 'survival'] as const).map(tab => (
                <button
                  key={tab}
                  id={`analyzer-tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 rounded-md py-1.5 text-[9px] font-semibold uppercase tracking-widest transition-all duration-200 ${
                    activeTab === tab
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground/50 hover:text-foreground'
                  }`}
                >
                  {tab === 'log' ? 'Log' : tab === 'analysis' ? 'Analysis' : tab === 'equity' ? 'Equity' : 'Drawdown'}
                </button>
              ))}
            </div>

            {/* ══════════ TRADE LOG TAB ══════════ */}
            {activeTab === 'log' && (
              <div className="space-y-3 animate-fade-in-up">
                {/* Summary row */}
                <div className="grid grid-cols-4 gap-2">
                  <Chip label="Trades" value={`${analysis.totalTrades}`} color="#94a3b8" />
                  <Chip label="Wins" value={`${analysis.wins}`} color="#34d399" />
                  <Chip label="Losses" value={`${analysis.losses}`} color="#f87171" />
                  <Chip label="Total R" value={`${analysis.totalR >= 0 ? '+' : ''}${analysis.totalR.toFixed(2)}R`}
                    color={analysis.totalR >= 0 ? '#34d399' : '#f87171'} accent />
                </div>

                {/* Trade list */}
                <div className="space-y-1">
                  {displayTrades.map((trade, i) => {
                    const rMultiple = trade.result === 'win' ? trade.rr : -1
                    return (
                      <div key={trade.id}
                        className="flex items-center gap-2 group glass-inner rounded-lg px-3 py-2 animate-fade-in-up">
                        <span className="text-[9px] font-mono text-muted-foreground/30 w-4 text-right shrink-0">
                          {trades.length - i}
                        </span>
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${trade.result === 'win' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <span className={`font-mono text-xs font-bold shrink-0 ${trade.result === 'win' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {trade.result === 'win' ? 'WIN' : 'LOSS'}
                        </span>
                        <span className={`font-mono text-xs ml-auto shrink-0 ${rMultiple >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {rMultiple >= 0 ? '+' : ''}{rMultiple.toFixed(1)}R
                        </span>
                        {trade.note && (
                          <span className="text-[9px] text-muted-foreground/40 truncate max-w-[100px]" title={trade.note}>
                            {trade.note}
                          </span>
                        )}
                        <button
                          id={`del-trade-${trade.id}`}
                          onClick={() => removeTrade(trade.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-red-500/20 text-red-400/60 hover:text-red-400"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                {trades.length > 8 && (
                  <button
                    id="show-all-trades-btn"
                    onClick={() => setShowAllTrades(s => !s)}
                    className="w-full text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center justify-center gap-1 py-1"
                  >
                    {showAllTrades ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {showAllTrades ? 'Show less' : `Show ${trades.length - 8} more trades`}
                  </button>
                )}
              </div>
            )}

            {/* ══════════ ANALYSIS TAB ══════════ */}
            {activeTab === 'analysis' && (
              <div className="space-y-4 animate-fade-in-up">
                {/* Rating banner */}
                <div className="rounded-xl p-4 flex items-start gap-3 border"
                  style={{ background: ratingCfg.bg, borderColor: ratingCfg.border }}>
                  <div className="rounded-lg p-2 shrink-0" style={{ background: `${ratingCfg.color}15` }}>
                    <RatingIcon size={15} style={{ color: ratingCfg.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-bold" style={{ color: ratingCfg.color }}>
                        {analysis.rating}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5"
                        style={{ background: `${confidenceCfg.color}15`, color: confidenceCfg.color }}>
                        {confidenceCfg.label}
                      </span>
                      {analysis.totalTrades < 30 && (
                        <span className="text-[9px] text-yellow-400/70">⚠ Low sample</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/60">{ratingCfg.desc}</p>
                  </div>
                </div>

                {/* 3-gauge row */}
                <div className="glass-surface rounded-xl p-4">
                  <div className="flex items-center justify-around gap-2">
                    <Arc value={analysis.winRate} size={80} stroke={6} color={winRateColor}
                      label={`${analysis.winRate.toFixed(0)}%`}
                      sub={`Win Rate${analysis.totalTrades < 30 ? '\n(low conf)' : ''}`} />
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/55 text-center">Expectancy / Trade</p>
                      <p className="font-mono text-3xl font-black leading-none" style={{ color: expColor }}>
                        {analysis.expectancy >= 0 ? '+' : ''}{analysis.expectancy.toFixed(3)}
                        <span className="text-base font-normal opacity-60">R</span>
                      </p>
                      <p className="text-[9px] text-muted-foreground/40 font-mono">
                        (WR×RR) − (LR×1)
                      </p>
                      {analysis.totalTrades < 30 && (
                        <span className="text-[9px] text-yellow-400/60">Low confidence</span>
                      )}
                    </div>
                    <Arc value={Math.min(analysis.currentDrawdownPct, 100)} size={80} stroke={6}
                      color={ddColor} label={`${analysis.currentDrawdownPct.toFixed(0)}%`} sub="Cur. DD" />
                  </div>
                </div>

                {/* R-Multiples block */}
                <div className="glass-surface rounded-xl p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 flex items-center gap-1.5">
                    <Zap size={9} /> R-Multiples Tracking
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Chip label="Total R Gained/Lost" value={`${analysis.totalR >= 0 ? '+' : ''}${analysis.totalR.toFixed(2)}R`}
                      color={analysis.totalR >= 0 ? '#34d399' : '#f87171'} accent />
                    <Chip label="Avg R Per Trade" value={`${analysis.avgRPerTrade >= 0 ? '+' : ''}${analysis.avgRPerTrade.toFixed(3)}R`}
                      color={analysis.avgRPerTrade >= 0 ? '#34d399' : '#f87171'} accent />
                    <Chip label="Win Rate" value={`${analysis.winRate.toFixed(1)}%`} color={winRateColor} />
                    <Chip label="Break-even WR" value={`${analysis.breakEvenWinRate.toFixed(1)}%`} color="#94a3b8" />
                    <Chip label="Win Count" value={`${analysis.wins}W`} color="#34d399" />
                    <Chip label="Loss Count" value={`${analysis.losses}L`} color="#f87171" />
                  </div>
                  {/* R visual bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-muted-foreground/50">
                      <span>R per trade breakdown</span>
                      <span className="font-mono">
                        {trades.length > 0 ? `${analysis.wins} × (+RR) + ${analysis.losses} × (−1R)` : ''}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden flex">
                      {analysis.wins > 0 && (
                        <div className="h-full rounded-l-full bg-emerald-400/60 transition-all duration-700"
                          style={{ width: `${(analysis.wins / analysis.totalTrades) * 100}%` }} />
                      )}
                      {analysis.losses > 0 && (
                        <div className="h-full rounded-r-full bg-red-400/60 transition-all duration-700"
                          style={{ width: `${(analysis.losses / analysis.totalTrades) * 100}%` }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Key metrics grid */}
                <div className="grid grid-cols-2 gap-2">
                  <Chip label="Final Balance" value={`$${analysis.finalBalance.toFixed(2)}`} color={balColor} accent />
                  <Chip label="Net P&L" value={`${analysis.finalBalance - startBalance >= 0 ? '+' : ''}$${(analysis.finalBalance - startBalance).toFixed(2)}`} color={balColor} accent />
                  <Chip label="Max Drawdown" value={`${analysis.maxDrawdownPct.toFixed(1)}%`} color={analysis.maxDrawdownPct > 30 ? '#f87171' : '#fbbf24'} />
                  <Chip label="Current Drawdown" value={`${analysis.currentDrawdownPct.toFixed(1)}%`} color={ddColor} />
                  <Chip label="Max Loss Streak" value={`${analysis.maxConsecutiveLosses}`} color={analysis.maxConsecutiveLosses >= analysis.lossesTo30Pct - 2 ? '#f87171' : '#94a3b8'} />
                  <Chip label="Live Loss Streak" value={`${analysis.consecutiveLosses}L`} color={analysis.consecutiveLosses >= 3 ? '#fbbf24' : '#94a3b8'} />
                </div>

                {/* Risk warning */}
                {analysis.riskWarning && (
                  <div className="rounded-xl border border-red-500/25 bg-red-500/6 p-3 flex items-start gap-2 animate-glow-border-danger">
                    <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-400 mb-0.5">Risk Warning</p>
                      <p className="text-[10px] text-muted-foreground/65 leading-relaxed">{analysis.riskWarning}</p>
                      {analysis.suggestedRisk && (
                        <p className="text-[10px] text-yellow-400/80 mt-1">
                          💡 Suggested risk: <span className="font-mono font-bold">{analysis.suggestedRisk}%</span>
                          {' '}(to 30% DD: {consecutiveLossesFor(30, analysis.suggestedRisk)} losses)
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Confidence detail */}
                <div className="rounded-xl p-3 border flex items-start gap-2"
                  style={{ background: `${confidenceCfg.color}06`, borderColor: `${confidenceCfg.color}20` }}>
                  <Info size={12} style={{ color: confidenceCfg.color }} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold" style={{ color: confidenceCfg.color }}>
                      Confidence: {confidenceCfg.label} ({analysis.totalTrades} trades)
                    </p>
                    <p className="text-[10px] text-muted-foreground/55 mt-0.5">{confidenceCfg.desc}</p>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════ EQUITY CURVE TAB ══════════ */}
            {activeTab === 'equity' && (
              <div className="space-y-4 animate-fade-in-up">
                <div className="glass-surface rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55">
                      Compounded Equity Curve
                    </p>
                    <span className="text-[9px] font-mono text-muted-foreground/40">
                      {riskPct}% risk · {analysis.totalTrades} trades
                    </span>
                  </div>
                  <div className="h-36 w-full">
                    <EquityCurve curve={analysis.equityCurve} startBalance={startBalance} />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-muted-foreground/35">
                    <span>$0</span>
                    <span>Start: ${startBalance}</span>
                    <span>Peak: ${analysis.peakBalance.toFixed(0)}</span>
                    <span>Now: ${analysis.finalBalance.toFixed(0)}</span>
                  </div>
                </div>

                {/* Balance progression */}
                <div className="glass-surface rounded-xl p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 mb-3">Balance Snapshot</p>
                  {[startBalance, ...analysis.equityCurve.slice(1)].filter((_, i, a) =>
                    i === 0 || i === Math.floor(a.length / 4) || i === Math.floor(a.length / 2)
                    || i === Math.floor(3 * a.length / 4) || i === a.length - 1
                  ).map((val, i, arr) => {
                    const tradeNum = i === 0 ? 0
                      : i === 1 ? Math.floor(analysis.totalTrades / 4)
                      : i === 2 ? Math.floor(analysis.totalTrades / 2)
                      : i === 3 ? Math.floor(3 * analysis.totalTrades / 4)
                      : analysis.totalTrades
                    const pct = ((val - startBalance) / startBalance) * 100
                    const clr = val >= startBalance ? '#34d399' : '#f87171'
                    return (
                      <div key={i} className="flex items-center gap-2 glass-inner rounded-lg px-3 py-2">
                        <span className="text-[9px] font-mono text-muted-foreground/40 w-14 shrink-0">Trade {tradeNum}</span>
                        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, (val / startBalance) * 50))}%`, background: clr, opacity: 0.7 }} />
                        </div>
                        <span className="font-mono text-xs shrink-0" style={{ color: clr }}>${val.toFixed(2)}</span>
                        <span className="font-mono text-[9px] text-muted-foreground/40 w-16 text-right shrink-0">
                          {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Risk comparison */}
                <div className="glass-surface rounded-xl p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 flex items-center gap-1.5">
                    <ShieldAlert size={9} /> How Lower Risk Improves Survival
                  </p>
                  {[1, 2, 3, 5, 7].map(r => {
                    const ddAt30 = consecutiveLossesFor(30, r)
                    const ddAt50 = consecutiveLossesFor(50, r)
                    const isCurrent = r === riskPct
                    return (
                      <div key={r}
                        className={`glass-inner rounded-lg px-3 py-2 flex items-center gap-3 ${isCurrent ? 'border border-primary/25' : ''}`}>
                        <span className="font-mono text-xs font-bold w-6 shrink-0" style={{ color: isCurrent ? 'var(--color-primary)' : '#94a3b8' }}>
                          {r}%
                        </span>
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between text-[9px] text-muted-foreground/50">
                            <span>30% DD after</span>
                            <span className="font-mono text-yellow-400">{ddAt30 >= 999 ? '∞' : ddAt30}L</span>
                          </div>
                          <div className="flex justify-between text-[9px] text-muted-foreground/50">
                            <span>50% DD after</span>
                            <span className="font-mono text-orange-400">{ddAt50 >= 999 ? '∞' : ddAt50}L</span>
                          </div>
                        </div>
                        {isCurrent && <span className="text-[9px] text-primary/60 font-semibold shrink-0">← current</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ══════════ DRAWDOWN / SURVIVAL TAB ══════════ */}
            {activeTab === 'survival' && (
              <div className="space-y-4 animate-fade-in-up">
                {/* Threshold cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-surface rounded-xl p-4 text-center border border-yellow-500/20">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/55 mb-1">30% Drawdown</p>
                    <p className="font-mono text-3xl font-black text-yellow-400">
                      {analysis.lossesTo30Pct >= 999 ? '∞' : analysis.lossesTo30Pct}
                    </p>
                    <p className="text-[9px] text-muted-foreground/45 mt-1">consecutive losses</p>
                    <p className="text-[9px] text-yellow-400/55 mt-0.5 font-mono">
                      bal &lt; ${(startBalance * 0.7).toFixed(0)}
                    </p>
                  </div>
                  <div className="glass-surface rounded-xl p-4 text-center border border-orange-500/20">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground/55 mb-1">50% Drawdown</p>
                    <p className="font-mono text-3xl font-black text-orange-400">
                      {analysis.lossesTo50Pct >= 999 ? '∞' : analysis.lossesTo50Pct}
                    </p>
                    <p className="text-[9px] text-muted-foreground/45 mt-1">consecutive losses</p>
                    <p className="text-[9px] text-orange-400/55 mt-0.5 font-mono">
                      bal &lt; ${(startBalance * 0.5).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Current streak alert */}
                {analysis.consecutiveLosses >= 2 && (
                  <div className={`rounded-xl p-3 border flex items-center gap-2 ${
                    analysis.consecutiveLosses >= analysis.lossesTo30Pct - 2
                      ? 'border-red-500/30 bg-red-500/6 animate-glow-border-danger'
                      : 'border-yellow-500/20 bg-yellow-500/5'
                  }`}>
                    <Flame size={13} className={analysis.consecutiveLosses >= analysis.lossesTo30Pct - 2 ? 'text-red-400' : 'text-yellow-400'} />
                    <p className={`text-xs font-semibold ${analysis.consecutiveLosses >= analysis.lossesTo30Pct - 2 ? 'text-red-400' : 'text-yellow-400'}`}>
                      Active losing streak: {analysis.consecutiveLosses} trades
                      {analysis.consecutiveLosses >= analysis.lossesTo30Pct - 2 && ' — approaching 30% DD threshold!'}
                    </p>
                  </div>
                )}

                {/* Compounding breakdown */}
                <div className="glass-surface rounded-xl p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/55 mb-1">
                    Consecutive Loss Scenario ({riskPct}% risk)
                  </p>
                  {[1, 2, 3, 5, 7, 10, 15].map(n => {
                    const bal = startBalance * Math.pow(1 - riskPct / 100, n)
                    const ddPct = ((startBalance - bal) / startBalance) * 100
                    const clr  = ddPct < 25 ? '#34d399' : ddPct < 45 ? '#fbbf24' : '#f87171'
                    const atThreshold = n === analysis.lossesTo30Pct || n === analysis.lossesTo50Pct
                    return (
                      <div key={n}
                        className={`flex items-center gap-2 glass-inner rounded-lg px-3 py-2 ${atThreshold ? 'border border-yellow-500/20' : ''}`}>
                        <span className="text-[9px] font-mono text-muted-foreground/40 w-12 shrink-0">
                          {n}L streak
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(0, 100 - ddPct)}%`, background: clr, opacity: 0.7 }} />
                        </div>
                        <span className="font-mono text-xs shrink-0" style={{ color: clr }}>${bal.toFixed(2)}</span>
                        <span className="font-mono text-[9px] text-muted-foreground/35 shrink-0 w-14 text-right">−{ddPct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>

                {/* Strategy sustainability */}
                <div className="glass-surface rounded-xl p-3 flex items-start gap-2">
                  <Info size={11} className="text-primary/50 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground/70 mb-0.5">Long-term Sustainability</p>
                    <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                      {analysis.expectancy > 0
                        ? `✅ Positive expectancy (+${analysis.expectancy.toFixed(3)}R). With consistent execution, this strategy grows over time despite losing streaks.`
                        : `⚠️ Negative or zero expectancy (${analysis.expectancy.toFixed(3)}R). The strategy is not sustainable long-term without improving win rate or RR.`
                      }
                      {' '}
                      {analysis.totalTrades < 20 && 'Note: fewer than 20 trades — results are not statistically significant yet.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── EMPTY STATE ─────────────────────── */}
        {trades.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/5 flex items-center justify-center mb-3">
              <Target size={22} className="text-primary/25" />
            </div>
            <p className="text-sm text-muted-foreground/50">No trades logged yet</p>
            <p className="text-xs text-muted-foreground/30 mt-1">
              Defaults: $500 account · 5% risk · compounding
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
