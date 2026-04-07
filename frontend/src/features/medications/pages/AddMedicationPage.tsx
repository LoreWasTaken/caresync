// src/features/medications/pages/AddMedicationPage.tsx
import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useMedicationStore, MedicationFormData } from '../../../shared/store/medicationStore'
import { ArrowLeft, Loader2, AlertCircle, FileUp, PenLine, Info } from 'lucide-react'
import { PrescriptionUploadWizard } from '../components/PrescriptionUploadWizard'

const DOSAGE_UNITS = ['mg', 'ml', 'g', 'mcg', 'IU', 'drops', 'puffs', 'units']
const FREQUENCIES = ['Once daily', 'Twice daily', '3 times daily', 'Every 8 hours', 'Every 12 hours', 'Weekly', 'As needed']

// Quick-pick presets for endDate so chronic patients don't have to
// pick a date manually. "Indefinite" still requires a real upper bound
// (1 year from start) so the calendar generation stays bounded.
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

export const AddMedicationPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addMedication } = useMedicationStore()

  // Mode: 'choose' (landing), 'manual', or 'upload'
  const initialMode = searchParams.get('mode') === 'upload' ? 'upload' : 'choose'
  const [mode, setMode] = useState<'choose' | 'manual' | 'upload'>(initialMode)

  const [form, setForm] = useState<MedicationFormData>({
    name: '',
    dosage: '',
    dosageUnit: 'mg',
    frequency: 'Once daily',
    timesPerDay: 1,
    startDate: today(),
    endDate: addDays(today(), 30), // sensible default to defeat infinite calendar
    isPRN: false,
    instructions: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof MedicationFormData, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  // When the user toggles PRN on, we clear endDate (it's now optional and
  // would be misleading to show a date for an as-needed med). When they
  // toggle it back off, restore a 30-day default so the form is valid.
  const setIsPRN = (next: boolean) => {
    setForm((prev) => ({
      ...prev,
      isPRN: next,
      endDate: next
        ? undefined
        : prev.endDate || addDays(prev.startDate || today(), 30),
      frequency: next ? 'As needed' : (prev.frequency === 'As needed' ? 'Once daily' : prev.frequency),
    }))
  }

  const validateBeforeSubmit = (): string | null => {
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
    setError(null)

    const clientError = validateBeforeSubmit()
    if (clientError) {
      setError(clientError)
      return
    }

    setSubmitting(true)
    try {
      await addMedication({
        ...form,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.isPRN
          ? undefined
          : form.endDate ? new Date(form.endDate).toISOString() : undefined,
      })
      navigate('/app/medications')
    } catch (err: any) {
      setError(err.message ?? 'Failed to create medication')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm rounded-lg bg-bg-page border border-border-subtle text-text-main focus:ring-2 focus:ring-brand-primary outline-none transition-colors'
  const labelCls = 'block text-xs font-medium text-text-main mb-1.5 ml-0.5'

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/app/medications"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors"
      >
        <ArrowLeft size={15} />
        Back to Medications
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Add Medication</h1>
        <p className="text-sm text-text-muted mt-1">
          {mode === 'choose'
            ? 'Choose how you want to add your medication.'
            : mode === 'upload'
            ? 'Upload a prescription PDF and verify the extracted data.'
            : 'Fill in the details below and save.'}
        </p>
      </div>

      {/* ---- Mode chooser ---- */}
      {mode === 'choose' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => setMode('upload')}
            className="group bg-bg-card border border-border-subtle hover:border-brand-primary/50 rounded-2xl p-6 sm:p-8 text-left transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <FileUp size={22} className="text-brand-primary" />
            </div>
            <h3 className="font-semibold text-text-main text-base">Upload SNS Prescription</h3>
            <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
              Upload a PDF prescription and let our parser extract the medication data automatically.
              You will review and verify everything before saving.
            </p>
          </button>

          <button
            onClick={() => setMode('manual')}
            className="group bg-bg-card border border-border-subtle hover:border-brand-primary/50 rounded-2xl p-6 sm:p-8 text-left transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <PenLine size={22} className="text-emerald-500" />
            </div>
            <h3 className="font-semibold text-text-main text-base">Enter Manually</h3>
            <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
              Type in the medication name, dosage, frequency, and other details by hand.
            </p>
          </button>
        </div>
      )}

      {/* ---- Upload wizard ---- */}
      {mode === 'upload' && (
        <PrescriptionUploadWizard onCancel={() => setMode('choose')} />
      )}

      {/* ---- Manual entry form ---- */}
      {mode === 'manual' && (
        <>
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {/* Switch to upload */}
          <button
            onClick={() => setMode('upload')}
            className="inline-flex items-center gap-1.5 text-xs text-brand-primary hover:underline"
          >
            <FileUp size={13} />
            Or upload a prescription PDF instead
          </button>

          <form onSubmit={handleSubmit} className="bg-bg-card border border-border-subtle rounded-2xl p-5 sm:p-6 space-y-5 max-w-2xl">
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
                placeholder="e.g. Lisinopril"
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
                  placeholder="e.g. 10"
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
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* PRN / As-Needed toggle ─────────────────────────────────
                When ON, the medication has no fixed schedule (calendar
                slots are not generated) and the End Date field becomes
                hidden. The patient still records doses ad-hoc via "Take
                Now" on the dashboard. */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border-subtle bg-bg-page cursor-pointer hover:border-brand-primary/40 transition-colors">
              <input
                type="checkbox"
                checked={!!form.isPRN}
                onChange={(e) => setIsPRN(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-brand-primary cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-text-main">
                  As Needed (PRN / SOS)
                </div>
                <div className="text-xs text-text-muted mt-0.5 flex items-start gap-1.5">
                  <Info size={11} className="mt-0.5 shrink-0" />
                  <span>
                    Tick this if the medication has no fixed schedule (e.g. painkillers taken
                    only when needed). The calendar will not generate scheduled slots and an
                    End Date is not required.
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
                    <option key={f} value={f}>
                      {f}
                    </option>
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
                    // If the new start date jumps past the current
                    // endDate, push endDate forward by 30 days. Avoids
                    // leaving the form in a sub-second invalid state.
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
                  placeholder="Optional"
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
                    // Reject 0 / negatives at the input layer too — backend
                    // and model both refuse, but a friendly client guard
                    // gives instant feedback.
                    set('totalQuantity', v != null && v < 1 ? 1 : v)
                  }}
                  placeholder="Optional (min 1)"
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
                placeholder="e.g. Take with food"
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
                Save Medication
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
