// src/features/medications/pages/EditMedicationPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMedicationStore, MedicationFormData } from '../../../shared/store/medicationStore'
import { client } from '../../../shared/api/client'
import { ArrowLeft, Loader2, AlertCircle, Activity, Info, ShieldAlert } from 'lucide-react'

const DOSAGE_UNITS = ['mg', 'ml', 'g', 'mcg', 'IU', 'drops', 'puffs', 'units']
const FREQUENCIES = ['Once daily', 'Twice daily', '3 times daily', 'Every 8 hours', 'Every 12 hours', 'Weekly', 'As needed']

const DURATION_PRESETS: { label: string; days: number }[] = [
  { label: '7 days',  days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
]

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, days: number) => {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const EditMedicationPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { updateMedication } = useMedicationStore()

  const [form, setForm] = useState<MedicationFormData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Adherence-history flag — drives the immutability warning banner.
  const [hasHistory, setHasHistory] = useState(false)

  /* Fetch existing medication */
  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const res = await client.get(`/medications/${id}`)
        const med = res.data.data
        setForm({
          name: med.name ?? '',
          dosage: String(med.dosage ?? ''),
          dosageUnit: med.dosageUnit ?? 'mg',
          frequency: med.frequency ?? 'Once daily',
          timesPerDay: med.timesPerDay ?? 1,
          route: med.route ?? '',
          instructions: med.instructions ?? '',
          startDate: med.startDate ? med.startDate.slice(0, 10) : '',
          endDate: med.endDate ? med.endDate.slice(0, 10) : '',
          isPRN: !!med.isPRN,
          totalQuantity: med.totalQuantity ?? undefined,
          compartment: med.compartment ?? undefined,
          refillReminder: med.refillReminder ?? true,
        })

        // Detect existing adherence history so we can show a warning
        // banner. The backend already prevents destructive edits, but
        // a heads-up gives the user a chance to abort BEFORE they lose
        // their work.
        try {
          const aRes = await client.get('/medications/adherence', {
            params: { medicationId: id, limit: 1 },
          })
          const records = aRes.data?.data ?? []
          setHasHistory(Array.isArray(records) && records.length > 0)
        } catch {
          // Non-fatal — if we can't tell, just don't show the banner.
        }
      } catch (err: any) {
        setLoadError(err.response?.data?.message ?? 'Medication not found')
      }
    }
    load()
  }, [id])

  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          to="/app/medications"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Medications
        </Link>
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>{loadError}</p>
        </div>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="flex items-center justify-center py-24">
        <Activity className="animate-spin text-text-muted" size={28} />
      </div>
    )
  }

  const set = (field: keyof MedicationFormData, value: any) =>
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev))

  const setIsPRN = (next: boolean) => {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        isPRN: next,
        endDate: next
          ? undefined
          : prev.endDate || addDays(prev.startDate || today(), 30),
        frequency: next ? 'As needed' : (prev.frequency === 'As needed' ? 'Once daily' : prev.frequency),
      }
    })
  }

  const validateBeforeSubmit = (): string | null => {
    if (!form) return 'Form not loaded'
    if (!form.name?.trim()) return 'Medication name is required'
    const dosageNum = Number(form.dosage)
    if (!form.dosage || Number.isNaN(dosageNum) || dosageNum <= 0) {
      return 'Dosage must be a number greater than 0'
    }
    if (form.totalQuantity != null && form.totalQuantity < 1) {
      return 'Total Quantity must be at least 1'
    }
    if (!form.isPRN) {
      if (!form.endDate) {
        return 'End Date is required for scheduled medications. Tick "As Needed (PRN)" if this medication has no fixed schedule.'
      }
      if (form.startDate && form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
        return 'End Date must be on or after Start Date'
      }
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !form) return
    setError(null)

    const clientError = validateBeforeSubmit()
    if (clientError) {
      setError(clientError)
      return
    }

    setSubmitting(true)
    try {
      await updateMedication(id, {
        ...form,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.isPRN
          ? undefined
          : form.endDate ? new Date(form.endDate).toISOString() : undefined,
      })
      navigate('/app/medications')
    } catch (err: any) {
      setError(err.message ?? 'Failed to update medication')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm rounded-lg bg-bg-page border border-border-subtle text-text-main focus:ring-2 focus:ring-brand-primary outline-none transition-colors'
  const labelCls = 'block text-xs font-medium text-text-main mb-1.5 ml-0.5'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        to="/app/medications"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors"
      >
        <ArrowLeft size={15} />
        Back to Medications
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit Medication</h1>
        <p className="text-sm text-text-muted mt-1">Update the fields and save your changes.</p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {hasHistory && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-700 dark:text-amber-300">
          <ShieldAlert size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">This medication has adherence history.</p>
            <p className="text-xs mt-1 opacity-90">
              Existing dose records will not be deleted, but be careful when changing
              <strong> Start Date</strong>, <strong>Total Quantity</strong>, or
              <strong> Frequency</strong>. The backend will refuse changes that would orphan
              past records (e.g. moving Start Date after a recorded dose).
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-bg-card border border-border-subtle rounded-2xl p-5 sm:p-6 space-y-5">
        {/* Name */}
        <div>
          <label className={labelCls}>
            Medication Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Dosage + Unit */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              Dosage <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={form.dosage}
              onChange={(e) => set('dosage', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              Unit <span className="text-red-400">*</span>
            </label>
            <select
              value={form.dosageUnit}
              onChange={(e) => set('dosageUnit', e.target.value)}
              className={inputCls}
            >
              {DOSAGE_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* PRN / As-Needed toggle */}
        <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border-subtle bg-bg-page cursor-pointer hover:border-brand-primary/40 transition-colors">
          <input
            type="checkbox"
            checked={!!form.isPRN}
            onChange={(e) => setIsPRN(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-brand-primary cursor-pointer"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-text-main">As Needed (PRN / SOS)</div>
            <div className="text-xs text-text-muted mt-0.5 flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" />
              <span>
                Tick this if the medication has no fixed schedule. The calendar will not
                generate scheduled slots and an End Date is not required.
              </span>
            </div>
          </div>
        </label>

        {/* Frequency + Times per day */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Frequency</label>
            <select
              value={form.frequency}
              onChange={(e) => set('frequency', e.target.value)}
              className={inputCls}
              disabled={form.isPRN}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Times per Day</label>
            <input
              type="number"
              min={1}
              max={24}
              value={form.timesPerDay ?? 1}
              onChange={(e) => set('timesPerDay', parseInt(e.target.value) || 1)}
              className={inputCls}
              disabled={form.isPRN}
            />
          </div>
        </div>

        {/* Start / End dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              value={form.startDate ?? ''}
              onChange={(e) => {
                set('startDate', e.target.value)
                if (
                  !form.isPRN &&
                  e.target.value &&
                  form.endDate &&
                  new Date(form.endDate) < new Date(e.target.value)
                ) {
                  set('endDate', addDays(e.target.value, 30))
                }
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              End Date {form.isPRN ? '(not applicable)' : <span className="text-red-400">*</span>}
            </label>
            <input
              type="date"
              value={form.endDate ?? ''}
              min={form.startDate ?? undefined}
              onChange={(e) => set('endDate', e.target.value)}
              className={inputCls}
              disabled={form.isPRN}
              required={!form.isPRN}
            />
            {!form.isPRN && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => set('endDate', addDays(form.startDate || today(), p.days))}
                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Compartment + Total Quantity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Dispenser Compartment (1-12)</label>
            <input
              type="number"
              min={1}
              max={12}
              value={form.compartment ?? ''}
              onChange={(e) => set('compartment', e.target.value ? parseInt(e.target.value) : undefined)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Total Quantity</label>
            <input
              type="number"
              min={1}
              value={form.totalQuantity ?? ''}
              onChange={(e) => {
                const v = e.target.value ? parseInt(e.target.value) : undefined
                set('totalQuantity', v != null && v < 1 ? 1 : v)
              }}
              className={inputCls}
            />
          </div>
        </div>

        {/* Route */}
        <div>
          <label className={labelCls}>Route of Administration</label>
          <input
            type="text"
            value={form.route ?? ''}
            onChange={(e) => set('route', e.target.value)}
            placeholder="e.g. Oral, Topical, Intravenous"
            className={inputCls}
          />
        </div>

        {/* Instructions */}
        <div>
          <label className={labelCls}>Instructions / Notes</label>
          <textarea
            rows={3}
            value={form.instructions ?? ''}
            onChange={(e) => set('instructions', e.target.value)}
            className={inputCls + ' resize-none'}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to="/app/medications"
            className="px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text-main transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </div>
  )
}
