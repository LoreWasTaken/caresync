// src/features/dashboard/pages/PatientDashboard.tsx
// Real-data dashboard — consumes medication + adherence APIs, renders Recharts.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { client } from '../../../shared/api/client'
import {
  Pill,
  Activity,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Loader2,
  PlusCircle,
  AlertTriangle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MedSummary {
  id: string
  name: string
  dosage: number | string
  dosageUnit: string
  compartment: number | null
  frequency: string
  // Inventory fields — surfaced so the "Take Now" button can disable
  // itself when stock is exhausted (Edge Case 2 frontend guard).
  remainingQuantity: number | null
  totalQuantity: number | null
}

interface DerivedStats {
  rate: number
  total: number
  taken: number
  missed: number
}

interface DailyAdherence {
  date: string
  taken: number
  late: number
  missed: number
  total: number
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const PatientDashboard = () => {
  const [meds, setMeds] = useState<MedSummary[]>([])
  const [totalMeds, setTotalMeds] = useState(0)
  const [stats, setStats] = useState<DerivedStats | null>(null)
  const [dailyData, setDailyData] = useState<DailyAdherence[]>([])
  const [loading, setLoading] = useState(true)
  const [takingNow, setTakingNow] = useState<string | null>(null)
  // ──────────────────────────────────────────────────────────────────
  // DOUBLE-CLICK RACE CONDITION GUARD (frontend layer)
  //
  // The `disabled={takingNow === med.id}` state-based guard does NOT
  // survive a *truly* fast double-click — React batches state updates
  // and the second click can reach handleTakeNow() before `takingNow`
  // has been committed. A ref is synchronous: setting it before the
  // network call closes the gap immediately, so the second click
  // sees the lock and returns.
  //
  // This is the *first* line of defence. The backend transaction +
  // composite UNIQUE index (Adherence model) is the *real* fix.
  // ──────────────────────────────────────────────────────────────────
  const inFlightTakeRef = useRef<Set<string>>(new Set())

  const fetchDashboard = useCallback(async () => {
    try {
      const [medsRes, scheduleRes] = await Promise.allSettled([
        client.get('/medications', { params: { limit: 5, status: 'active' } }),
        client.get('/medications/schedule', {
          params: {
            startDate: new Date(Date.now() - 6 * 86400000).toISOString(),
            endDate: new Date().toISOString(),
          },
        }),
      ])

      // Medications
      if (medsRes.status === 'fulfilled') {
        const d = medsRes.value.data?.data
        const list = Array.isArray(d) ? d : d?.medications ?? []
        // Carry forward inventory fields so the Take Now button can
        // refuse to fire when the medication is depleted.
        const summarised: MedSummary[] = list.slice(0, 5).map((m: any) => ({
          id: m.id,
          name: m.name,
          dosage: m.dosage,
          dosageUnit: m.dosageUnit,
          compartment: m.compartment ?? null,
          frequency: m.frequency,
          remainingQuantity: m.remainingQuantity ?? null,
          totalQuantity: m.totalQuantity ?? null,
        }))
        setMeds(summarised)
        setTotalMeds(medsRes.value.data?.pagination?.totalItems ?? list.length)
      }

      // FIX 1: Derive BOTH the chart data AND the top-card stats from the
      // SAME schedule payload. This eliminates the "split-brain" where the
      // chart showed virtual missed doses but the cards only read from the
      // Adherence DB table (which had no rows for unrecorded doses).
      if (scheduleRes.status === 'fulfilled') {
        const calendar: { date: string; medications: { status: string }[] }[] =
          scheduleRes.value.data?.data?.calendar ?? []

        let weekTaken = 0
        let weekLate = 0
        let weekMissed = 0

        const daily = calendar.map((day) => {
          const resolved = day.medications.filter(
            (m) => m.status !== 'scheduled'
          )
          const taken = resolved.filter(
            (m) => m.status === 'taken' || m.status === 'early'
          ).length
          const late = resolved.filter((m) => m.status === 'late').length
          const missed = resolved.filter(
            (m) => m.status === 'missed' || m.status === 'skipped'
          ).length

          weekTaken += taken + late
          weekLate += late
          weekMissed += missed

          return {
            date: new Date(day.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' }),
            taken,
            late,
            missed,
            total: resolved.length,
          }
        })

        const weekTotal = weekTaken + weekMissed
        setStats({
          rate: weekTotal > 0 ? Math.round((weekTaken / weekTotal) * 100) : 0,
          total: weekTotal,
          taken: weekTaken,
          missed: weekMissed,
        })

        // Filter out days with no resolved doses so the chart
        // doesn't show empty bars for days with only future doses.
        setDailyData(daily.filter((d) => d.total > 0))
      }
    } catch {
      // Individual failures handled by allSettled
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  /* ---- Take Now handler ──────────────────────────────────────────
     Defends against THREE failure modes:
       1. Double-click race: synchronous ref-based lock returns
          immediately on the second click. Backend transaction is
          the authoritative defence, this just avoids the network
          round-trip.
       2. Depleted inventory: refuses if remainingQuantity hits 0.
          Backend will also reject (409 Conflict), this is just UX.
       3. Stale stock display: re-fetches the dashboard after each
          successful dose so the next click sees the new count. */
  const handleTakeNow = async (med: MedSummary) => {
    // Race-condition lock — synchronous, beats React batching.
    if (inFlightTakeRef.current.has(med.id)) return
    // Inventory guard — never POST a dose for a depleted medication.
    if (med.remainingQuantity != null && med.remainingQuantity <= 0) return

    inFlightTakeRef.current.add(med.id)
    setTakingNow(med.id)
    try {
      const now = new Date().toISOString()
      await client.post('/medications/adherence', {
        medicationId: med.id,
        status: 'taken',
        scheduledTime: now,
        takenAt: now,
      })
      await fetchDashboard()
    } catch {
      // silent — user can retry. Backend already rolled back on error.
    } finally {
      inFlightTakeRef.current.delete(med.id)
      setTakingNow(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Activity className="animate-spin text-text-muted" size={28} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ---- Metric cards row ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Pill size={18} />}
          iconBg="bg-brand-primary/10 text-brand-primary"
          label="Active Medications"
          value={totalMeds}
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          iconBg="bg-green-500/10 text-green-500"
          label="Adherence Rate"
          value={stats && stats.total > 0 ? `${stats.rate}%` : '–'}
        />
        <MetricCard
          icon={<CheckCircle2 size={18} />}
          iconBg="bg-emerald-500/10 text-emerald-500"
          label="Doses Taken"
          value={stats && stats.total > 0 ? stats.taken : '–'}
        />
        <MetricCard
          icon={<XCircle size={18} />}
          iconBg="bg-red-500/10 text-red-500"
          label="Doses Missed"
          value={stats && stats.total > 0 ? stats.missed : '–'}
        />
      </div>

      {/* ---- Two-column cards ---- */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming Medications */}
        <div className="bg-bg-card p-6 rounded-2xl border border-border-subtle shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Pill className="text-brand-primary w-5 h-5" />
              <h2 className="font-semibold text-lg text-text-main">Upcoming Doses</h2>
            </div>
            <Link
              to="/app/medications"
              className="text-xs text-brand-primary hover:underline flex items-center gap-0.5"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>

          {meds.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-text-muted">
              <Pill size={28} className="opacity-30 mb-2" />
              <p className="text-sm">No active medications.</p>
              <Link to="/app/medications/add" className="text-xs text-brand-primary hover:underline mt-1">
                Add your first medication
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {meds.map((med) => {
                const isDepleted =
                  med.remainingQuantity != null && med.remainingQuantity <= 0
                const isLoading = takingNow === med.id
                return (
                  <div
                    key={med.id}
                    className="flex justify-between items-center p-3.5 bg-bg-page rounded-xl border border-border-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-text-main flex items-center gap-2">
                        {med.name}
                        {isDepleted && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 font-bold">
                            <AlertTriangle size={10} />
                            Refill Needed
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                        <Clock size={10} />
                        {med.dosage} {med.dosageUnit}
                        {med.frequency ? ` \u2022 ${med.frequency}` : ''}
                      </div>
                    </div>
                    {isDepleted ? (
                      <span
                        className="ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold rounded-lg shrink-0 cursor-not-allowed"
                        title="Inventory depleted — refill before recording the next dose"
                      >
                        <AlertTriangle size={12} />
                        Depleted
                      </span>
                    ) : (
                      <button
                        onClick={() => handleTakeNow(med)}
                        disabled={isLoading}
                        className="ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 shrink-0"
                        title="Record this dose as taken right now"
                      >
                        {isLoading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <PlusCircle size={12} />
                        )}
                        Take Now
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Weekly Adherence Chart */}
        <div className="bg-bg-card p-6 rounded-2xl border border-border-subtle shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="text-green-500 w-5 h-5" />
            <h2 className="font-semibold text-lg text-text-main">Weekly Adherence</h2>
          </div>

          {dailyData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted">
              <Activity size={28} className="opacity-30 mb-2" />
              <p className="text-sm">No adherence data yet.</p>
              <p className="text-xs opacity-60 mt-0.5">Record doses to see your chart.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle, #e5e7eb)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--text-muted, #9ca3af)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--text-muted, #9ca3af)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-card, #fff)',
                    color: 'var(--text-main, #111)',
                    border: '1px solid var(--border-subtle, #e5e7eb)',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                  labelStyle={{ color: 'var(--text-main, #111)' }}
                  itemStyle={{ color: 'var(--text-main, #111)' }}
                  cursor={{ fill: 'var(--bg-hover, rgba(0,0,0,0.05))' }}
                />
                <Bar dataKey="taken" name="On Time" stackId="a" fill="#22c55e" isAnimationActive={false} />
                <Bar dataKey="late" name="Late" stackId="a" fill="#eab308" isAnimationActive={false} />
                <Bar dataKey="missed" name="Missed" stackId="a" fill="#ef4444" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Small metric card sub-component                                    */
/* ------------------------------------------------------------------ */

function MetricCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string | number
}) {
  return (
    <div className="bg-bg-card p-4 rounded-xl border border-border-subtle shadow-sm flex items-center gap-3">
      <div className={`p-2 rounded-lg shrink-0 ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted truncate">{label}</p>
        <p className="text-lg font-bold text-text-main leading-tight">{value}</p>
      </div>
    </div>
  )
}
