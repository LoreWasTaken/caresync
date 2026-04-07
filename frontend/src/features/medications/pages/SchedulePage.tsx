// src/features/medications/pages/SchedulePage.tsx
// Calendar view — consumes GET /medications/schedule, allows recording adherence.
import { useCallback, useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { client } from '../../../shared/api/client'
import { Activity, CalendarDays, X, CheckCircle2, XCircle, Loader2, Clock, Pill, CalendarClock, AlertTriangle } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScheduleEntry {
  id: string | null
  medicationId: string
  name: string
  dosage: string
  compartment: number | null
  scheduledTime: string
  takenAt: string | null
  status: 'taken' | 'late' | 'early' | 'missed' | 'skipped' | 'scheduled' | 'overdue'
}

interface CalendarDay {
  date: string
  medications: ScheduleEntry[]
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<string, { colour: string; label: string; icon: string }> = {
  taken:     { colour: '#22c55e', label: 'Taken',     icon: '✓' },
  early:     { colour: '#22c55e', label: 'Taken Early', icon: '✓' },
  late:      { colour: '#eab308', label: 'Taken Late',  icon: '⚠' },
  missed:    { colour: '#ef4444', label: 'Missed',    icon: '✗' },
  skipped:   { colour: '#9ca3af', label: 'Skipped',   icon: '—' },
  scheduled: { colour: '#6366f1', label: 'Pending',   icon: '◦' },
  overdue:   { colour: '#f59e0b', label: 'Overdue',   icon: '!' },
}

/** Has this dose already been decided (taken/missed/skipped)? */
const isRecorded = (status: string) =>
  ['taken', 'early', 'late', 'missed', 'skipped'].includes(status)

/** Was this dose successfully taken? */
const isTaken = (status: string) =>
  ['taken', 'early', 'late'].includes(status)

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildStart(scheduledTime: string | null | undefined, dayDate: string): string {
  if (scheduledTime) {
    const d = new Date(scheduledTime)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return dayDate
}

function entryToEvent(entry: ScheduleEntry, dayDate: string): EventInput {
  const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.scheduled
  return {
    id: `${entry.id ?? entry.medicationId}-${entry.scheduledTime ?? dayDate}`,
    title: entry.name ?? 'Unknown Medication',
    start: buildStart(entry.scheduledTime, dayDate),
    // Always render as block events (colored background + white text).
    // Dot events (allDay:false) have no background, making white text invisible in light mode.
    allDay: true,
    backgroundColor: cfg.colour,
    borderColor: cfg.colour,
    extendedProps: { ...entry, dayDate },
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const SchedulePage = () => {
  const [events, setEvents] = useState<EventInput[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [selected, setSelected] = useState<(ScheduleEntry & { dayDate: string }) | null>(null)
  const [recording, setRecording] = useState(false)
  // Live inventory map (medicationId -> remainingQuantity). Sourced
  // from /medications so the modal can refuse "Mark Taken" on a
  // depleted medication. Backend will reject too — this is UX only.
  const [stockMap, setStockMap] = useState<Record<string, number | null>>({})

  // Synchronous race-condition lock — prevents the second click of
  // a fast double-click from issuing a duplicate POST before React
  // has flushed the `recording` state update. Backend transaction is
  // the authoritative defence; this just avoids the round-trip.
  const inFlightRef = useRef(false)

  /* Fetch schedule for a ~3-month window centred on today AND fetch
     the medications list so we know which ones are depleted. The two
     requests run in parallel; either failing degrades gracefully. */
  const fetchSchedule = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 0)

      const [scheduleRes, medsRes] = await Promise.allSettled([
        client.get('/medications/schedule', {
          params: {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        }),
        client.get('/medications', { params: { limit: 100, status: 'active' } }),
      ])

      // ── Schedule events ──
      if (scheduleRes.status === 'fulfilled') {
        const payload = scheduleRes.value.data?.data ?? scheduleRes.value.data
        const calendar: CalendarDay[] = Array.isArray(payload?.calendar)
          ? payload.calendar
          : Array.isArray(payload) ? payload : []

        const mapped = calendar.flatMap((day) => {
          const meds = Array.isArray(day.medications) ? day.medications : []
          return meds
            .filter((m) => m && (m.name || m.medicationId))
            .map((m) => entryToEvent(m, day.date))
        })
        setEvents(mapped)
      }

      // ── Stock map for depletion guard ──
      if (medsRes.status === 'fulfilled') {
        const list = medsRes.value.data?.data ?? []
        const next: Record<string, number | null> = {}
        for (const m of list as Array<{ id: string; remainingQuantity: number | null }>) {
          next[m.id] = m.remainingQuantity ?? null
        }
        setStockMap(next)
      }
    } catch {
      // silent — calendar simply shows empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  /* Record adherence (taken / missed). Defends against:
       - Double-click race via inFlightRef (synchronous lock)
       - Depleted-stock TAKEN attempts (UX guard, backend rejects too)
       - Time-traveling TAKEN attempts (backend rejects, UI hides) */
  const recordAdherence = async (status: 'taken' | 'missed') => {
    if (!selected) return
    if (inFlightRef.current) return
    if (status === 'taken') {
      const stock = stockMap[selected.medicationId]
      if (stock != null && stock <= 0) {
        // Should be unreachable thanks to the UI guard, but defend anyway.
        return
      }
    }
    inFlightRef.current = true
    setRecording(true)
    try {
      await client.post('/medications/adherence', {
        medicationId: selected.medicationId,
        status,
        scheduledTime: selected.scheduledTime || new Date(selected.dayDate).toISOString(),
        takenAt: status === 'taken' ? new Date().toISOString() : null,
      })
      await fetchSchedule()
      setSelected(null)
    } catch {
      // keep modal open so user can retry
    } finally {
      inFlightRef.current = false
      setRecording(false)
    }
  }

  const handleEventClick = (info: EventClickArg) => {
    const props = info.event.extendedProps as ScheduleEntry & { dayDate: string }
    setSelected(props)
  }

  /* ---------------------------------------------------------------- */

  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Activity className="animate-spin text-text-muted" size={28} />
      </div>
    )
  }

  // Derive current status config for the selected event
  const selCfg = selected ? (STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.scheduled) : null

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-brand-primary" size={22} />
          <h1 className="text-2xl font-bold tracking-tight text-text-main">Medication Schedule</h1>
        </div>
        <p className="text-sm text-text-muted mt-1">Click an event to record a dose as taken or missed.</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-muted">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.colour }} />
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Calendar */}
      <div className="bg-bg-card border border-border-subtle rounded-2xl shadow-sm p-4 sm:p-6 overflow-hidden fc-theme">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          events={events}
          eventClick={handleEventClick}
          height="auto"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          dayMaxEvents={3}
        />
      </div>

      {/* ---- Click modal ---- */}
      {selected && selCfg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div
            className="bg-bg-card border border-border-subtle rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-bg-hover rounded-md transition-colors">
                <X size={16} className="text-text-muted" />
              </button>
            </div>

            {/* Details */}
            <div className="text-sm text-text-muted space-y-1.5">
              <p className="flex items-center gap-2">
                <Pill size={13} />
                Dosage: <span className="text-text-main font-medium">{selected.dosage}</span>
              </p>
              <p className="flex items-center gap-2">
                <CalendarDays size={13} />
                Date: <span className="text-text-main font-medium">{selected.dayDate}</span>
              </p>
              <p className="flex items-center gap-2">
                <Clock size={13} />
                Time: <span className="text-text-main font-medium">{formatTime(selected.scheduledTime)}</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: selCfg.colour }} />
                Status:{' '}
                <span className="font-semibold" style={{ color: selCfg.colour }}>
                  {selCfg.label}
                </span>
              </p>
            </div>

            {/* ---- Action area ─────────────────────────────────────
                State machine for the modal action buttons:
                  • already recorded → read-only confirmation
                  • future (time-traveling guard) → locked + message
                  • depleted inventory + intends to TAKE → locked + refill
                  • otherwise → Mark Taken / Mark Missed buttons
            */}
            {(() => {
              const isFuture = new Date(selected.scheduledTime) > new Date()
              const stock = stockMap[selected.medicationId]
              const isDepleted = stock != null && stock <= 0

              if (isRecorded(selected.status)) {
                return (
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: selCfg.colour + '15', color: selCfg.colour }}
                  >
                    <span className="text-base">{selCfg.icon}</span>
                    {isTaken(selected.status)
                      ? `This dose was recorded as ${selCfg.label.toLowerCase()}.`
                      : selected.status === 'missed'
                      ? 'This dose was recorded as missed.'
                      : 'This dose was skipped.'}
                  </div>
                )
              }

              if (isFuture) {
                return (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-brand-primary/10 text-brand-primary">
                    <CalendarClock size={16} className="shrink-0" />
                    This dose is scheduled for the future. Actions will be available once the time arrives.
                  </div>
                )
              }

              return (
                <>
                  {isDepleted && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>
                        This medication is <strong>depleted</strong>. Refill before
                        recording it as taken. You can still mark this dose as missed.
                      </span>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => recordAdherence('taken')}
                      disabled={recording || isDepleted}
                      title={isDepleted ? 'Inventory depleted — refill before taking' : 'Record as taken'}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {recording ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Mark Taken
                    </button>
                    <button
                      onClick={() => recordAdherence('missed')}
                      disabled={recording}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {recording ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={16} />}
                      Mark Missed
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

