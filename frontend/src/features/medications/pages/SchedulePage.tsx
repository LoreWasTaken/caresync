// src/features/medications/pages/SchedulePage.tsx
// Calendar view — consumes GET /medications/schedule, allows recording adherence.
import { useCallback, useEffect, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput } from '@fullcalendar/core'
import { client } from '../../../shared/api/client'
import { Activity, CalendarDays, X, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScheduleEntry {
  id: string
  medicationId: string
  name: string
  dosage: string
  compartment: number | null
  scheduledTime: string
  takenAt: string | null
  status: 'taken' | 'late' | 'early' | 'missed' | 'skipped' | string
}

interface CalendarDay {
  date: string
  medications: ScheduleEntry[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const statusColour: Record<string, string> = {
  taken: '#22c55e',
  early: '#22c55e',
  late: '#eab308',
  missed: '#ef4444',
  skipped: '#9ca3af',
  scheduled: '#6366f1',
}

/**
 * Build a valid ISO-8601 start value for FullCalendar.
 * - If the backend provides a full scheduledTime ISO string, use it.
 * - Otherwise fall back to the day date (YYYY-MM-DD).
 * FullCalendar requires `start` (not `date`) as a Date or ISO string.
 */
function buildStart(scheduledTime: string | null | undefined, dayDate: string): string {
  if (scheduledTime) {
    // Ensure it's parseable — if not, fall back to the day
    const d = new Date(scheduledTime)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // dayDate is "YYYY-MM-DD" — valid for FullCalendar all-day events
  return dayDate
}

function entryToEvent(entry: ScheduleEntry, dayDate: string): EventInput {
  const colour = statusColour[entry.status] ?? '#6366f1'
  return {
    id: `${entry.id ?? entry.medicationId}-${dayDate}`,
    title: entry.name ?? 'Unknown Medication',
    start: buildStart(entry.scheduledTime, dayDate),
    allDay: !entry.scheduledTime,
    backgroundColor: colour,
    borderColor: colour,
    extendedProps: { ...entry, dayDate },
  }
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

      // Debug: log the raw response so we can see the exact shape
      console.log('Raw Schedule Data:', res.data)

      // ApiResponse wraps in { success, data: { calendar, dateRange } }
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

      console.log('Mapped FullCalendar events:', mapped)
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
        ...(status === 'taken' ? { takenAt: new Date().toISOString() } : {}),
      })
      // Refresh calendar to reflect the new status
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="text-brand-primary" size={22} />
          <h1 className="text-2xl font-bold tracking-tight">Medication Schedule</h1>
        </div>
        <p className="text-sm text-text-muted mt-1">Click an event to record a dose as taken or missed.</p>
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
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="bg-bg-card border border-border-subtle rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">{selected.name}</h3>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-bg-hover rounded-md">
                <X size={16} className="text-text-muted" />
              </button>
            </div>

            <div className="text-sm text-text-muted space-y-1">
              <p>Dosage: <span className="text-text-main font-medium">{selected.dosage}</span></p>
              <p>Date: <span className="text-text-main font-medium">{selected.dayDate}</span></p>
              <p>
                Status:{' '}
                <span
                  className="font-semibold"
                  style={{ color: statusColour[selected.status] ?? '#6366f1' }}
                >
                  {selected.status}
                </span>
              </p>
            </div>

            {/* Action buttons — show for scheduled, missed, skipped (not already taken) */}
            {!['taken', 'early', 'late'].includes(selected.status) && (
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
            )}

            {['taken', 'early', 'late'].includes(selected.status) && (
              <p className="text-xs text-emerald-500 font-medium pt-1">This dose has already been recorded.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
