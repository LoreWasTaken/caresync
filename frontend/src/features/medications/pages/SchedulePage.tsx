// src/features/medications/pages/SchedulePage.tsx
// Calendar view — consumes GET /medications/schedule, allows recording adherence.
import { useCallback, useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { client } from '../../../shared/api/client'
import { Activity, CalendarDays, X, CheckCircle2, XCircle, Loader2, Clock, Pill, CalendarClock } from 'lucide-react'

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
  status: 'taken' | 'late' | 'early' | 'missed' | 'skipped' | 'scheduled'
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

  /* Fetch schedule for a 60-day window centred on today */
  const fetchSchedule = useCallback(async () => {
    setLoading(true)
    try {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 2, 0)
      const res = await client.get('/medications/schedule', {
        params: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        },
      })

      const payload = res.data?.data ?? res.data
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
    } catch {
      // silent — calendar simply shows empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSchedule()
  }, [fetchSchedule])

  /* Record adherence (taken / missed) */
  const recordAdherence = async (status: 'taken' | 'missed') => {
    if (!selected) return
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

            {/* ---- Action area ---- */}
            {(() => {
              const isFuture = new Date(selected.scheduledTime) > new Date()

              if (isRecorded(selected.status)) {
                // Already recorded — show read-only confirmation
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
                // Future dose — lock buttons, show informational message
                return (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-brand-primary/10 text-brand-primary">
                    <CalendarClock size={16} className="shrink-0" />
                    This dose is scheduled for the future. Actions will be available once the time arrives.
                  </div>
                )
              }

              // Past/present unrecorded dose — show action buttons
              return (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => recordAdherence('taken')}
                    disabled={recording}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
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
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

