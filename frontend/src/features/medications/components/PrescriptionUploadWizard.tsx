// src/features/medications/components/PrescriptionUploadWizard.tsx
//
// Three-step wizard: Upload PDF -> Verify parsed data -> Confirm & save.
// Mobile-first responsive design. Dark/light mode via CSS vars.

import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { client } from '../../../shared/api/client'
import {
  useMedicationStore,
  MedicationFormData,
} from '../../../shared/store/medicationStore'
import {
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Sparkles,
  X,
  Pill,
  Info,
  Eye,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ParsedMedRaw {
  drug_name: string
  dose_str: string
  form: string
  frequency_pt: string
  duration: string
  quantity: number
}

interface ParsedMedMapped {
  name: string
  dosage: string
  dosageUnit: string
  frequency: string
  timesPerDay: number
  startDate: string
  endDate: string | null
  totalQuantity: number | null
  form: string
  instructions: string
}

interface ParsedMedication {
  index: number
  confidence: number
  parseMethod: string
  raw: ParsedMedRaw
  mapped: ParsedMedMapped
}

interface ParseResult {
  success: boolean
  duration_ms: number
  mode: string
  medications: ParsedMedication[]
  rawText: string
  pageCount: number
}

const DOSAGE_UNITS = ['mg', 'ml', 'g', 'mcg', 'IU', 'drops', 'puffs', 'units']
const FREQUENCIES = [
  'Once daily',
  'Twice daily',
  '3 times daily',
  'Every 4 hours',
  'Every 6 hours',
  'Every 8 hours',
  'Every 12 hours',
  'Weekly',
  'As needed',
]

/* ------------------------------------------------------------------ */
/*  Shared Tailwind classes                                            */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg bg-bg-page border border-border-subtle text-text-main focus:ring-2 focus:ring-brand-primary outline-none transition-colors'
const labelCls = 'block text-[11px] font-medium text-text-muted mb-1'

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PrescriptionUploadWizard({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate()
  const { addMedication } = useMedicationStore()
  const fileRef = useRef<HTMLInputElement>(null)

  // Wizard state
  const [step, setStep] = useState<'upload' | 'parsing' | 'review' | 'saving'>('upload')
  const [error, setError] = useState<string | null>(null)

  // Upload
  const [file, setFile] = useState<File | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Parse result
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [editableMeds, setEditableMeds] = useState<ParsedMedMapped[]>([])
  const [reviewed, setReviewed] = useState<boolean[]>([])
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null)

  // Saving
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveTotal, setSaveTotal] = useState(0)

  // Derive pdfUrl from file — cleanup ONLY on file change or unmount
  useEffect(() => {
    if (!file) {
      setPdfUrl(null)
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setPdfUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  /* ---- File handling ---- */
  const handleFile = useCallback((f: File) => {
    if (f.type !== 'application/pdf') {
      setError('Only PDF files are supported.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB.')
      return
    }
    setError(null)
    setFile(f)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile]
  )

  /* ---- Parse ---- */
  const handleParse = async () => {
    if (!file) return
    setStep('parsing')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('prescription', file)

      const res = await client.post('/medications/parse-prescription', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })

      const data: ParseResult = res.data?.data
      if (!data?.success || data.medications.length === 0) {
        setError(
          'No medications could be extracted from this document. Please try a different file or enter medications manually.'
        )
        setStep('upload')
        return
      }

      setParseResult(data)
      setEditableMeds(data.medications.map((m) => ({ ...m.mapped })))
      setReviewed(data.medications.map(() => false))
      setStep('review')
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to parse prescription')
      setStep('upload')
    }
  }

  /* ---- Update a medication field ---- */
  const updateMed = (idx: number, field: keyof ParsedMedMapped, value: any) => {
    setEditableMeds((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  /* ---- Explicitly mark a medication as reviewed ---- */
  const toggleReviewed = (idx: number) => {
    setReviewed((prev) => {
      const next = [...prev]
      next[idx] = !next[idx]
      return next
    })
  }

  /* ---- Remove a medication ---- */
  const removeMed = (idx: number) => {
    setEditableMeds((prev) => prev.filter((_, i) => i !== idx))
    setReviewed((prev) => prev.filter((_, i) => i !== idx))
  }

  /* ---- Confirm & Save ---- */
  const handleConfirm = async () => {
    setStep('saving')
    setError(null)
    setSaveTotal(editableMeds.length)
    setSaveProgress(0)

    try {
      for (let i = 0; i < editableMeds.length; i++) {
        const m = editableMeds[i]
        const payload: MedicationFormData = {
          name: m.name,
          dosage: m.dosage,
          dosageUnit: m.dosageUnit,
          frequency: m.frequency,
          timesPerDay: m.timesPerDay,
          startDate: m.startDate ? new Date(m.startDate).toISOString() : undefined,
          endDate: m.endDate ? new Date(m.endDate).toISOString() : undefined,
          totalQuantity: m.totalQuantity ?? undefined,
          instructions: m.instructions || undefined,
        }
        await addMedication(payload)
        setSaveProgress(i + 1)
      }
      navigate('/app/medications')
    } catch (err: any) {
      setError(err.message ?? 'Failed to save medications')
      setStep('review')
    }
  }

  const allReviewed = reviewed.length > 0 && reviewed.every(Boolean)

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  // ---- STEP: Uploading / dropzone ----
  if (step === 'upload') {
    return (
      <div className="space-y-5">
        {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="group cursor-pointer border-2 border-dashed border-border-subtle hover:border-brand-primary rounded-2xl p-10 sm:p-14 flex flex-col items-center justify-center text-center transition-colors bg-bg-card"
        >
          <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Upload size={24} className="text-brand-primary" />
          </div>
          <p className="font-semibold text-text-main text-base">
            {file ? file.name : 'Upload SNS Prescription'}
          </p>
          <p className="text-xs text-text-muted mt-1.5">
            Drag & drop a PDF here, or click to browse. Max 10 MB.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </div>

        {file && (
          <div className="flex items-center gap-3 p-3 bg-bg-card border border-border-subtle rounded-xl">
            <FileText size={20} className="text-brand-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-main truncate">{file.name}</p>
              <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setFile(null)
              }}
              className="p-1 rounded hover:bg-bg-hover text-text-muted"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text-main transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleParse}
            disabled={!file}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
          >
            <Sparkles size={16} />
            Parse Prescription
          </button>
        </div>
      </div>
    )
  }

  // ---- STEP: Parsing (spinner) ----
  if (step === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 size={36} className="animate-spin text-brand-primary mb-4" />
        <p className="font-semibold text-text-main">Analyzing prescription...</p>
        <p className="text-xs text-text-muted mt-1">
          Extracting medication data with regex &amp; AI. This may take a few seconds.
        </p>
      </div>
    )
  }

  // ---- STEP: Saving (progress) ----
  if (step === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 size={36} className="animate-spin text-brand-primary mb-4" />
        <p className="font-semibold text-text-main">
          Saving medications... ({saveProgress}/{saveTotal})
        </p>
        <div className="w-48 h-2 bg-border-subtle rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-brand-primary rounded-full transition-all duration-300"
            style={{ width: `${saveTotal > 0 ? (saveProgress / saveTotal) * 100 : 0}%` }}
          />
        </div>
      </div>
    )
  }

  // ---- STEP: Review (the big split-screen) ----
  return (
    <div className="space-y-4">
      {error && <ErrorBanner msg={error} onDismiss={() => setError(null)} />}

      {/* Safety banner */}
      <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
        <ShieldAlert size={18} className="shrink-0 mt-0.5 text-amber-500" />
        <div className="text-amber-700 dark:text-amber-400">
          <span className="font-bold">AI-Extracted Data &mdash; Verification Required.</span>{' '}
          Parsed via <span className="font-mono">{parseResult?.mode}</span> in{' '}
          {parseResult?.duration_ms}ms. Please review every field before confirming.
        </div>
      </div>

      {/* Confidence & AI explanation */}
      <details className="group text-xs">
        <summary className="flex items-center gap-1.5 cursor-pointer text-text-muted hover:text-text-main transition-colors select-none">
          <Info size={13} className="shrink-0" />
          <span>How does the parser work?</span>
          <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
        </summary>
        <div className="mt-2 p-3 bg-bg-card border border-border-subtle rounded-xl text-text-muted leading-relaxed space-y-1.5">
          <p>
            <strong className="text-text-main">Dual-Engine Parser:</strong> First, a deterministic
            regex engine scans the PDF text for known Portuguese prescription patterns. Each
            medication receives a <strong>Confidence Score (0–5)</strong> based on how many fields
            were successfully extracted.
          </p>
          <p>
            If the confidence is <strong>below 2</strong>, or the regex engine finds nothing, an
            <strong> AI model (Ollama / Qwen 2.5)</strong> is used as a fallback to attempt
            extraction from unstructured text.
          </p>
          <p>
            <strong className="text-text-main">Regardless of score, you must manually verify every
            field.</strong> Mark each medication as "Reviewed" before confirming.
          </p>
        </div>
      </details>

      {/* Split-screen: PDF preview | editable cards */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
        {/* LEFT: Document preview */}
        <div className="w-full lg:w-1/2 shrink-0">
          <div className="bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
              <FileText size={16} className="text-brand-primary" />
              <span className="text-sm font-semibold text-text-main">Source Document</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {parseResult?.pageCount} page{parseResult?.pageCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* PDF embed via <object> — works with blob: URLs */}
            <div className="hidden sm:block">
              {pdfUrl ? (
                <object
                  data={pdfUrl}
                  type="application/pdf"
                  className="w-full h-full min-h-[800px]"
                >
                  <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
                    <p className="text-sm text-text-muted mb-4">
                      Your browser does not support inline PDF preview.
                    </p>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-primary underline text-sm"
                    >
                      Click here to open the PDF
                    </a>
                  </div>
                </object>
              ) : (
                <div className="flex items-center justify-center min-h-[800px] text-text-muted text-sm">
                  No document selected
                </div>
              )}
            </div>

            {/* Mobile: show raw text instead of PDF embed */}
            <div className="sm:hidden max-h-52 overflow-y-auto p-3 text-[11px] text-text-muted font-mono whitespace-pre-wrap leading-relaxed bg-bg-page">
              {parseResult?.rawText ?? 'No text extracted.'}
            </div>
          </div>
        </div>

        {/* RIGHT: Editable medication cards */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-text-main">
              {editableMeds.length} Medication{editableMeds.length !== 1 ? 's' : ''} Detected
            </p>
            <span className="text-[10px] text-text-muted">
              {reviewed.filter(Boolean).length}/{reviewed.length} reviewed
            </span>
          </div>

          {editableMeds.map((med, idx) => (
            <MedicationReviewCard
              key={idx}
              index={idx}
              med={med}
              raw={parseResult?.medications[idx]?.raw ?? null}
              confidence={parseResult?.medications[idx]?.confidence ?? 0}
              isReviewed={reviewed[idx]}
              expandedRaw={expandedRaw === idx}
              onToggleRaw={() => setExpandedRaw(expandedRaw === idx ? null : idx)}
              onUpdate={(field, value) => updateMed(idx, field, value)}
              onRemove={() => removeMed(idx)}
              onToggleReviewed={() => toggleReviewed(idx)}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2 border-t border-border-subtle">
        <button
          onClick={() => {
            setStep('upload')
            setParseResult(null)
            setEditableMeds([])
          }}
          className="px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text-main transition-colors w-full sm:w-auto text-center"
        >
          Upload Different File
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 text-sm font-medium text-text-muted hover:text-text-main transition-colors w-full sm:w-auto text-center"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!allReviewed || editableMeds.length === 0}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto"
          title={!allReviewed ? 'You must review all medications before confirming' : ''}
        >
          <CheckCircle2 size={16} />
          {allReviewed
            ? `Confirm & Add ${editableMeds.length} Medication${editableMeds.length !== 1 ? 's' : ''}`
            : `Review All to Confirm (${reviewed.filter(Boolean).length}/${reviewed.length})`}
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  MedicationReviewCard                                               */
/* ================================================================== */

function MedicationReviewCard({
  index,
  med,
  raw,
  confidence,
  isReviewed,
  expandedRaw,
  onToggleRaw,
  onUpdate,
  onRemove,
  onToggleReviewed,
}: {
  index: number
  med: ParsedMedMapped
  raw: ParsedMedRaw | null
  confidence: number
  isReviewed: boolean
  expandedRaw: boolean
  onToggleRaw: () => void
  onUpdate: (field: keyof ParsedMedMapped, value: any) => void
  onRemove: () => void
  onToggleReviewed: () => void
}) {
  const confidencePct = Math.min(100, Math.round((confidence / 5) * 100))

  return (
    <div
      className={`bg-bg-card border rounded-xl overflow-hidden transition-colors ${
        isReviewed ? 'border-emerald-500/40' : 'border-amber-500/40'
      }`}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-bg-page/50">
        <Pill size={14} className="text-brand-primary shrink-0" />
        <span className="text-sm font-semibold text-text-main flex-1 truncate">
          #{index + 1} &mdash; {med.name || 'Unknown'}
        </span>

        {/* Review badge */}
        {isReviewed ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={10} /> Reviewed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
            <ShieldAlert size={10} /> Needs Review
          </span>
        )}

        {/* Confidence meter */}
        <div className="hidden sm:flex items-center gap-1.5 ml-1" title={`Confidence: ${confidencePct}%`}>
          <div className="w-12 h-1.5 bg-border-subtle rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                confidencePct >= 60 ? 'bg-emerald-500' : confidencePct >= 30 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="text-[9px] text-text-muted">{confidencePct}%</span>
        </div>

        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-500 shrink-0"
          title="Remove this medication"
        >
          <X size={13} />
        </button>
      </div>

      {/* Collapsible raw data */}
      {raw && (
        <button
          onClick={onToggleRaw}
          className="w-full flex items-center gap-2 px-4 py-1.5 text-[10px] text-text-muted hover:bg-bg-hover transition-colors"
        >
          {expandedRaw ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Parser Output (Raw)
        </button>
      )}
      {expandedRaw && raw && (
        <div className="px-4 pb-2.5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
          <RawField label="Drug Name" value={raw.drug_name} />
          <RawField label="Dose" value={raw.dose_str} />
          <RawField label="Form" value={raw.form} />
          <RawField label="Frequency (PT)" value={raw.frequency_pt} />
          <RawField label="Duration" value={raw.duration} />
          <RawField label="Quantity" value={String(raw.quantity)} />
        </div>
      )}

      {/* Editable fields */}
      <div className="px-4 py-3 space-y-3">
        {/* Row 1: Name */}
        <div>
          <label className={labelCls}>Medication Name</label>
          <input
            type="text"
            value={med.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Row 2: Dosage + Unit + Form */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Dosage</label>
            <input
              type="text"
              value={med.dosage}
              onChange={(e) => onUpdate('dosage', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <select
              value={med.dosageUnit}
              onChange={(e) => onUpdate('dosageUnit', e.target.value)}
              className={inputCls}
            >
              {DOSAGE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Form</label>
            <input
              type="text"
              value={med.form}
              onChange={(e) => onUpdate('form', e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Row 3: Frequency + Times/day + Quantity */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Frequency</label>
            <select
              value={med.frequency}
              onChange={(e) => onUpdate('frequency', e.target.value)}
              className={inputCls}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Times/Day</label>
            <input
              type="number"
              min={1}
              max={24}
              value={med.timesPerDay}
              onChange={(e) => onUpdate('timesPerDay', parseInt(e.target.value) || 1)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              type="number"
              min={0}
              value={med.totalQuantity ?? ''}
              onChange={(e) => onUpdate('totalQuantity', e.target.value ? parseInt(e.target.value) : null)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Row 4: Start / End dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              value={med.startDate ?? ''}
              onChange={(e) => onUpdate('startDate', e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input
              type="date"
              value={med.endDate ?? ''}
              onChange={(e) => onUpdate('endDate', e.target.value || null)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Row 5: Instructions */}
        <div>
          <label className={labelCls}>Instructions / Posology</label>
          <input
            type="text"
            value={med.instructions}
            onChange={(e) => onUpdate('instructions', e.target.value)}
            placeholder="e.g. Take with food"
            className={inputCls}
          />
        </div>

        {/* Explicit review toggle */}
        <button
          type="button"
          onClick={onToggleReviewed}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-colors ${
            isReviewed
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
          }`}
        >
          {isReviewed ? (
            <>
              <CheckCircle2 size={14} />
              Reviewed — Click to Undo
            </>
          ) : (
            <>
              <Eye size={14} />
              Mark as Reviewed
            </>
          )}
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Tiny sub-components                                                */
/* ================================================================== */

function RawField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-muted">{label}:</span>{' '}
      <span className="text-text-main font-medium">{value || '—'}</span>
    </div>
  )
}

function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <p className="flex-1">{msg}</p>
      <button onClick={onDismiss} className="shrink-0 p-0.5 hover:opacity-70">
        <X size={14} />
      </button>
    </div>
  )
}
