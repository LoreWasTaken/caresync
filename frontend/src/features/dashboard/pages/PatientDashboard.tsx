// src/features/dashboard/pages/PatientDashboard.tsx
// Real-data dashboard — consumes medication + adherence APIs, renders Recharts.
import { useCallback, useEffect, useState } from 'react'
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
        setMeds(list.slice(0, 5))
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

  /* ---- Take Now handler ---- */
  const handleTakeNow = async (med: MedSummary) => {
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
      // silent — user can retry
    } finally {
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
              {meds.map((med) => (
                <div
                  key={med.id}
                  className="flex justify-between items-center p-3.5 bg-bg-page rounded-xl border border-border-subtle"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-text-main">{med.name}</div>
                    <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {med.dosage} {med.dosageUnit}
                      {med.frequency ? ` \u2022 ${med.frequency}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleTakeNow(med)}
                    disabled={takingNow === med.id}
                    className="ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 shrink-0"
                    title="Record this dose as taken right now"
                  >
                    {takingNow === med.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <PlusCircle size={12} />
                    )}
                    Take Now
                  </button>
                </div>
              ))}
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
