// src/features/medications/components/PrescriptionUploadWizard.tsx
//
// Upload wizard with react-pdf Canvas + Text Layer highlight verification.
// Extracted terms are color-coded on the document. Focusing a form field
// pulses the corresponding highlight in the PDF — like a high-end AI
// extraction tool.

import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
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
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  X,
  Pill,
  Info,
  Eye,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Zap,
  Brain,
  AlertTriangle,
} from 'lucide-react'

// PDF.js worker — Vite resolves new URL(…, import.meta.url) to a same-origin asset
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

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

interface HighlightToken {
  word: string        // single lowercase word/number (e.g. "lisinopril", "10", "comprimido")
  medIdx: number
  field: string       // 'name' | 'dosage' | 'form' | 'frequency' | 'duration'
}

interface ActiveHighlight {
  medIdx: number
  field: string
}

/* Portuguese stop words + common noise to exclude from highlighting.
   These appear in boilerplate headers/footers of SNS prescriptions and
   in parsed duration/frequency strings — NOT medication-specific data. */
const PT_STOP_WORDS = new Set([
  // Portuguese articles / prepositions / conjunctions
  'com', 'para', 'por', 'dia', 'dias', 'das', 'dos', 'nos', 'nas', 'uma', 'uns',
  'que', 'não', 'num', 'umas', 'sem', 'ser', 'ter', 'mais',
  // Posology verbs
  'tomar', 'toma', 'tome', 'tomes', 'tomas',
  // Frequency / duration filler
  'cada', 'vez', 'vezes', 'antes', 'depois', 'durante', 'entre',
  'horas', 'hora', 'meses', 'semanas', 'semana',
  // Administration route
  'via', 'oral', 'uso',
  // SNS prescription boilerplate words that cause false positives
  'úteis', 'uteis', 'contacte', 'linha', 'medicamento', 'fale',
  'médico', 'medico', 'farmacêutico', 'farmaceutico',
  'prescrição', 'prescricao', 'receita', 'tratamento', 'utente',
  'guia', 'documento', 'farmácia', 'farmacia', 'código', 'codigo',
  'validade', 'encargos', 'preços', 'precos', 'válido', 'valido',
  'blister', 'unidade', 'unidades', 'embalagem',
  // English (from mapped values — don't appear in Portuguese PDFs)
  'the', 'and', 'for', 'with', 'from', 'take',
  'every', 'hours', 'daily', 'weekly', 'times', 'once', 'twice',
  'needed', 'capsule', 'tablet', 'tablets', 'capsules',
  // Diluição / administration instructions
  'diluído', 'diluido', 'copo', 'água', 'agua',
])

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

const LEGEND_ITEMS = [
  { label: 'Drug Name', tw: 'bg-blue-400', field: 'name' },
  { label: 'Dosage', tw: 'bg-emerald-400', field: 'dosage' },
  { label: 'Form', tw: 'bg-purple-500', field: 'form' },
  { label: 'Frequency', tw: 'bg-amber-400', field: 'frequency' },
  { label: 'Duration', tw: 'bg-pink-400', field: 'duration' },
]

/* ------------------------------------------------------------------ */
/*  Shared Tailwind classes                                            */
/* ------------------------------------------------------------------ */

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg bg-bg-page border border-border-subtle text-text-main focus:ring-2 focus:ring-brand-primary outline-none transition-colors'
const labelCls = 'block text-[11px] font-medium text-text-muted mb-1'

/* ------------------------------------------------------------------ */
/*  Highlight CSS (injected as <style> in the review step)             */
/* ------------------------------------------------------------------ */

const HIGHLIGHT_CSS = `
/* Highlighted spans inside the react-pdf text layer */
.react-pdf__Page__textContent span[class*="pdf-hl-"] {
  border-radius: 2px;
  transition: opacity 0.3s ease, background 0.3s ease, box-shadow 0.3s ease;
}

/* Field-specific colors — passive state */
.pdf-hl-name     { background: rgba(96, 165, 250, 0.35) !important; }
.pdf-hl-dosage   { background: rgba(52, 211, 153, 0.35) !important; }
.pdf-hl-form     { background: rgba(168, 85, 247, 0.35) !important; }
.pdf-hl-frequency{ background: rgba(251, 191, 36, 0.35) !important; }
.pdf-hl-duration { background: rgba(244, 114, 182, 0.35) !important; }

/* Active highlight — bright + pulsing glow */
.pdf-hl-active {
  animation: hl-glow 1.5s ease-in-out infinite;
}
.pdf-hl-active.pdf-hl-name     { background: rgba(96, 165, 250, 0.65) !important; box-shadow: 0 0 8px rgba(96, 165, 250, 0.5); }
.pdf-hl-active.pdf-hl-dosage   { background: rgba(52, 211, 153, 0.65) !important; box-shadow: 0 0 8px rgba(52, 211, 153, 0.5); }
.pdf-hl-active.pdf-hl-form     { background: rgba(168, 85, 247, 0.65) !important; box-shadow: 0 0 8px rgba(168, 85, 247, 0.5); }
.pdf-hl-active.pdf-hl-frequency{ background: rgba(251, 191, 36, 0.65) !important; box-shadow: 0 0 8px rgba(251, 191, 36, 0.5); }
.pdf-hl-active.pdf-hl-duration { background: rgba(244, 114, 182, 0.65) !important; box-shadow: 0 0 8px rgba(244, 114, 182, 0.5); }

/* When a field is focused, dim all non-active highlights */
.pdf-focus-active .react-pdf__Page__textContent span[class*="pdf-hl-"]:not(.pdf-hl-active) {
  opacity: 0.2;
}

@keyframes hl-glow {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.4); }
}
`

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
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
  const [engine, setEngine] = useState<'regex' | 'ai'>('regex')

  // Parse result
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [editableMeds, setEditableMeds] = useState<ParsedMedMapped[]>([])
  const [reviewed, setReviewed] = useState<boolean[]>([])
  const [expandedRaw, setExpandedRaw] = useState<number | null>(null)

  // Saving
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveTotal, setSaveTotal] = useState(0)

  // PDF viewer
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null)
  const [scale, setScale] = useState(1.5)
  const pdfScrollRef = useRef<HTMLDivElement>(null)

  const zoomIn = () => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))
  const zoomFit = () => setScale(1.0)

  /* ---------------------------------------------------------------- */
  /*  Tokenized Highlighting — defeats PDF text-layer fragmentation    */
  /* ---------------------------------------------------------------- */

  // Step 1: Extract every non-empty string from raw + mapped, split into
  //         individual words, deduplicate, and filter out noise/stop words.
  const highlightTokens = useMemo<HighlightToken[]>(() => {
    if (!parseResult?.medications) return []
    const seen = new Set<string>() // "word::medIdx::field"
    const tokens: HighlightToken[] = []

    // Medical units that must NOT be filtered even though they're short
    const MEDICAL_UNITS = new Set(['mg', 'ml', 'mcg', 'iu', 'ui'])

    const tokenize = (text: string, medIdx: number, field: string) => {
      if (!text) return
      // Split on whitespace, punctuation boundaries, parentheses, slashes, +
      const words = text.split(/[\s/+(),:;]+/).filter(Boolean)
      for (const raw of words) {
        const w = raw.toLowerCase().replace(/[.'"]/g, '') // strip stray punctuation
        if (w.length < 2) continue                         // skip single characters only
        if (w.length === 2 && !MEDICAL_UNITS.has(w) && !/\d/.test(w)) continue // 2-char: only allow units & numbers
        if (PT_STOP_WORDS.has(w)) continue                 // skip stop words
        const key = `${w}::${medIdx}::${field}`
        if (seen.has(key)) continue
        seen.add(key)
        tokens.push({ word: w, medIdx, field })
      }
    }

    // Also add "important" short numeric tokens that ARE meaningful
    const addNumeric = (text: string, medIdx: number, field: string) => {
      if (!text) return
      // Extract numbers with units e.g. "10mg", "200", "0,035"
      const nums = text.match(/\d+[.,]?\d*/g)
      if (!nums) return
      for (const n of nums) {
        if (n.length < 2) continue // skip single digits
        const key = `${n}::${medIdx}::${field}`
        if (seen.has(key)) continue
        seen.add(key)
        tokens.push({ word: n, medIdx, field })
      }
    }

    parseResult.medications.forEach((med, idx) => {
      const r = med.raw
      const m = med.mapped
      // Raw Portuguese — these strings appear LITERALLY in the PDF text layer.
      // Only tokenize raw values; mapped English values don't appear in PT PDFs.
      tokenize(r.drug_name, idx, 'name')
      tokenize(r.dose_str, idx, 'dosage')
      tokenize(r.form, idx, 'form')
      tokenize(r.frequency_pt, idx, 'frequency')
      // Duration raw strings often contain generic words ("durante 5 dias"),
      // so we only extract the numeric part, NOT the filler words.
      addNumeric(r.duration, idx, 'duration')
      // Drug name from mapped (often identical to raw, but sometimes cleaned up)
      tokenize(m.name, idx, 'name')
      // Numeric values that matter (dosage numbers, quantities)
      addNumeric(r.dose_str, idx, 'dosage')
      addNumeric(m.dosage, idx, 'dosage')
      if (r.quantity > 0) {
        const q = String(r.quantity)
        if (q.length >= 2) {
          const key = `${q}::${idx}::dosage`
          if (!seen.has(key)) { seen.add(key); tokens.push({ word: q, medIdx: idx, field: 'dosage' }) }
        }
      }
    })

    // Sort longest-first so longer tokens match before their substrings
    return tokens.sort((a, b) => b.word.length - a.word.length)
  }, [parseResult])

  // Step 2: Build a single master regex from all unique token words.
  //         The regex matches any token as a standalone word fragment.
  //         The lookup stores ALL tokens per word (multiple meds may share a word).
  const { tokenRegex, tokenLookup } = useMemo(() => {
    if (highlightTokens.length === 0) return { tokenRegex: null, tokenLookup: new Map<string, HighlightToken[]>() }

    // Lookup: lowercase word → ALL HighlightTokens for that word
    const lookup = new Map<string, HighlightToken[]>()
    const uniqueWords: string[] = []

    for (const t of highlightTokens) {
      const existing = lookup.get(t.word)
      if (existing) {
        existing.push(t)
      } else {
        lookup.set(t.word, [t])
        uniqueWords.push(t.word)
      }
    }

    // Sort longest-first for greedy alternation
    uniqueWords.sort((a, b) => b.length - a.length)
    const pattern = uniqueWords.map(escapeRegex).join('|')
    let regex: RegExp | null = null
    try {
      // Case-insensitive, global — matches individual word tokens inside any text span
      regex = new RegExp(`(${pattern})`, 'gi')
    } catch { /* malformed pattern — degrade gracefully */ }

    return { tokenRegex: regex, tokenLookup: lookup }
  }, [highlightTokens])

  // Step 3: Post-render DOM walking — concatenate ALL text layer spans into
  //         one string, match tokens against the full text, then apply CSS
  //         classes back to the overlapping DOM spans. This correctly handles
  //         words split across multiple <span> elements by PDF.js.
  const applyHighlights = useCallback(() => {
    if (!tokenRegex || !pdfScrollRef.current) return

    const textLayer = pdfScrollRef.current.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLSpanElement[]
    if (spans.length === 0) return

    // 1. Build a map: for each character index in the concatenated string,
    //    record which span it belongs to
    let fullText = ''
    const charToSpan: { span: HTMLSpanElement; localIdx: number }[] = []

    for (const span of spans) {
      const text = span.textContent ?? ''
      for (let i = 0; i < text.length; i++) {
        charToSpan.push({ span, localIdx: i })
      }
      fullText += text
    }

    // 2. Clear any previous highlights
    for (const span of spans) {
      span.className = span.className
        .replace(/\bpdf-hl-\S+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    }

    // 3. Run the master regex across the FULL concatenated text
    const fullTextLower = fullText.toLowerCase()
    tokenRegex.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = tokenRegex.exec(fullTextLower)) !== null) {
      const matchedWord = match[0]
      const tokens = tokenLookup.get(matchedWord.toLowerCase())
      if (!tokens || tokens.length === 0) continue

      const startIdx = match.index
      const endIdx = startIdx + matchedWord.length

      // 4. Apply the highlight class to every span that overlaps this match
      const touchedSpans = new Set<HTMLSpanElement>()
      for (let ci = startIdx; ci < endIdx && ci < charToSpan.length; ci++) {
        touchedSpans.add(charToSpan[ci].span)
      }

      // Apply ALL matching field classes (a word may belong to multiple meds/fields)
      for (const token of tokens) {
        const hlClass = `pdf-hl-${token.field}`
        for (const span of touchedSpans) {
          if (!span.classList.contains(hlClass)) {
            span.classList.add(hlClass)
          }
          // Store token data for active highlight. For multi-token spans,
          // store as comma-separated to support multiple meds.
          const existing = span.dataset.hlMedIdx ?? ''
          const entry = `${token.medIdx}:${token.field}`
          if (!existing.includes(entry)) {
            span.dataset.hlMedIdx = existing ? `${existing},${entry}` : entry
          }
        }
      }
    }
  }, [tokenRegex, tokenLookup])

  // Step 4: Update active highlight classes when user focuses a form field
  const updateActiveClasses = useCallback(() => {
    if (!pdfScrollRef.current) return
    const textLayer = pdfScrollRef.current.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    const highlightedSpans = textLayer.querySelectorAll('span[class*="pdf-hl-"]') as NodeListOf<HTMLSpanElement>
    for (const span of highlightedSpans) {
      // data-hl-med-idx stores entries like "0:name,1:form" (comma-separated)
      const entries = span.dataset.hlMedIdx ?? ''

      if (
        activeHighlight &&
        entries.includes(`${activeHighlight.medIdx}:${activeHighlight.field}`)
      ) {
        if (!span.classList.contains('pdf-hl-active')) {
          span.classList.add('pdf-hl-active')
        }
      } else {
        span.classList.remove('pdf-hl-active')
      }
    }
  }, [activeHighlight])

  // Re-apply active classes whenever activeHighlight changes
  useEffect(() => {
    updateActiveClasses()
  }, [updateActiveClasses])

  // Stable refs so the MutationObserver callback always calls the LATEST
  // versions of applyHighlights / updateActiveClasses — avoids stale closures.
  const applyHighlightsRef = useRef(applyHighlights)
  const updateActiveClassesRef = useRef(updateActiveClasses)
  useEffect(() => { applyHighlightsRef.current = applyHighlights }, [applyHighlights])
  useEffect(() => { updateActiveClassesRef.current = updateActiveClasses }, [updateActiveClasses])

  // MutationObserver ref — watches for text layer to be populated with spans
  const observerRef = useRef<MutationObserver | null>(null)

  // After each page render: use MutationObserver to reliably detect when
  // PDF.js finishes populating the text layer <span>s, THEN apply highlights.
  // This is the same pattern Mozilla's pdf.js viewer uses for search highlighting.
  const handlePageRenderSuccess = useCallback(() => {
    const el = pdfScrollRef.current
    if (!el) return

    // Clean up any previous observer
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    const tryApply = () => {
      const textLayer = el.querySelector('.react-pdf__Page__textContent')
      if (!textLayer) return false
      const spans = textLayer.querySelectorAll('span')
      if (spans.length === 0) return false
      // Always call via ref to get the LATEST closure with current tokenRegex
      applyHighlightsRef.current()
      updateActiveClassesRef.current()
      return true
    }

    // Text layer might already be populated (fast re-renders)
    if (tryApply()) {
      // Auto-scroll past the SNS prescription header
      requestAnimationFrame(() => {
        el.scrollTop = Math.min(200 * scale, el.scrollHeight - el.clientHeight)
      })
      return
    }

    // Otherwise, observe the scroll container for child additions (text layer spans).
    // Debounce: wait 200ms after the last mutation before applying, so we catch
    // ALL spans rather than applying on the first few.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new MutationObserver((_mutations, obs) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (tryApply()) {
          obs.disconnect()
          observerRef.current = null
          requestAnimationFrame(() => {
            el.scrollTop = Math.min(200 * scale, el.scrollHeight - el.clientHeight)
          })
        }
      }, 150)
    })

    observer.observe(el, { childList: true, subtree: true })
    observerRef.current = observer

    // Safety: disconnect after 5s to prevent leaks if text layer never appears
    setTimeout(() => {
      if (observerRef.current === observer) {
        observer.disconnect()
        observerRef.current = null
      }
    }, 5000)
  }, [scale])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [])

  // Re-apply highlights when tokenRegex changes (e.g. after parse completes).
  // Debounce with 300ms to let the text layer finish populating all spans.
  useEffect(() => {
    if (!tokenRegex) return
    const timer = setTimeout(() => {
      applyHighlights()
      updateActiveClasses()
    }, 300)
    return () => clearTimeout(timer)
  }, [tokenRegex, applyHighlights, updateActiveClasses])

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
      formData.append('engine', engine)

      const res = await client.post('/medications/parse-prescription', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: engine === 'ai' ? 60000 : 30000, // AI needs more time
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
      setCurrentPage(1)
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

  /* ---- Highlight interaction ---- */
  const handleFieldFocus = useCallback((medIdx: number, field: string) => {
    setActiveHighlight({ medIdx, field })
  }, [])

  const handleFieldBlur = useCallback(() => {
    setActiveHighlight(null)
  }, [])

  /* ---- Open PDF in new tab ---- */
  const openPdfInNewTab = useCallback(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }, [file])

  /* ---- Confirm & Save ──────────────────────────────────────────
     Translates each parsed medication into the strict shape required
     by the new state machine:
       - "As needed" frequency  → isPRN: true (no schedule, no endDate)
       - any other frequency    → endDate REQUIRED. We auto-default to
         start+30 days if the parser couldn't extract a duration, so
         the backend's mandatory-endDate validator never fires for a
         legitimate Rx. The user already had a chance to override
         this in the per-row review step. */
  const handleConfirm = async () => {
    setStep('saving')
    setError(null)
    setSaveTotal(editableMeds.length)
    setSaveProgress(0)

    try {
      for (let i = 0; i < editableMeds.length; i++) {
        const m = editableMeds[i]
        const isPRN = (m.frequency || '').toLowerCase().includes('as needed')

        // Default endDate fallback for non-PRN meds with missing duration:
        // start + 30 days. Mirrors AddMedicationPage's default and keeps
        // the backend validator happy.
        let endDateIso: string | undefined
        if (!isPRN) {
          const startBase = m.startDate ? new Date(m.startDate) : new Date()
          if (m.endDate) {
            endDateIso = new Date(m.endDate).toISOString()
          } else {
            const fallback = new Date(startBase)
            fallback.setDate(fallback.getDate() + 30)
            endDateIso = fallback.toISOString()
          }
        }

        const payload: MedicationFormData = {
          name: m.name,
          dosage: m.dosage,
          dosageUnit: m.dosageUnit,
          frequency: m.frequency,
          timesPerDay: m.timesPerDay,
          startDate: m.startDate ? new Date(m.startDate).toISOString() : undefined,
          endDate: endDateIso,
          isPRN,
          // Reject quantity 0 from upstream parser by clamping to undefined.
          totalQuantity: m.totalQuantity != null && m.totalQuantity > 0
            ? m.totalQuantity
            : undefined,
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

        {/* Engine selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-main">Extraction Engine</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Regex option */}
            <button
              type="button"
              onClick={() => setEngine('regex')}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                engine === 'regex'
                  ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/30'
                  : 'border-border-subtle bg-bg-card hover:border-border-subtle/80'
              }`}
            >
              <div
                className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  engine === 'regex'
                    ? 'bg-brand-primary/15 text-brand-primary'
                    : 'bg-bg-page text-text-muted'
                }`}
              >
                <Zap size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-main">Standard (Regex)</p>
                <p className="text-[11px] text-text-muted leading-snug mt-0.5">
                  Lightning fast (~20ms). Best for standard, digitally generated SNS prescriptions.
                </p>
              </div>
            </button>

            {/* AI option */}
            <button
              type="button"
              onClick={() => setEngine('ai')}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                engine === 'ai'
                  ? 'border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/30'
                  : 'border-border-subtle bg-bg-card hover:border-border-subtle/80'
              }`}
            >
              <div
                className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  engine === 'ai'
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'bg-bg-page text-text-muted'
                }`}
              >
                <Brain size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-main">Deep AI (LLM)</p>
                <p className="text-[11px] text-text-muted leading-snug mt-0.5">
                  Slower (15-30s). Best for complex, handwritten, or heavily formatted documents.
                </p>
              </div>
            </button>
          </div>

          {/* AI warning */}
          {engine === 'ai' && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
              <span>
                Deep AI requires <strong>Ollama</strong> running locally with the{' '}
                <code className="font-mono bg-amber-500/10 px-1 rounded">qwen2.5:3b</code> model.
                If Ollama is unavailable, parsing will return 0 results.
              </span>
            </div>
          )}
        </div>

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
            className={`inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-40 ${
              engine === 'ai'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-brand-primary hover:bg-brand-light'
            }`}
          >
            {engine === 'ai' ? <Brain size={16} /> : <Sparkles size={16} />}
            {engine === 'ai' ? 'Parse with AI' : 'Parse Prescription'}
          </button>
        </div>
      </div>
    )
  }

  // ---- STEP: Parsing (spinner) ----
  if (step === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 size={36} className={`animate-spin mb-4 ${engine === 'ai' ? 'text-amber-500' : 'text-brand-primary'}`} />
        <p className="font-semibold text-text-main">
          {engine === 'ai' ? 'AI is analyzing your prescription...' : 'Analyzing prescription...'}
        </p>
        <p className="text-xs text-text-muted mt-1">
          {engine === 'ai'
            ? 'Qwen 2.5 is extracting medication data via Ollama. This may take 15-30 seconds.'
            : 'Running regex extraction. This should take under a second.'}
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

  // ---- STEP: Review (split-screen with react-pdf highlights) ----
  return (
    <div className="space-y-4">
      {/* Inject highlight CSS */}
      <style>{HIGHLIGHT_CSS}</style>

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
            medication receives a <strong>Confidence Score (0&ndash;5)</strong> based on how many
            fields were successfully extracted.
          </p>
          <p>
            If the confidence is <strong>below 2</strong>, or the regex engine finds nothing, an
            <strong> AI model (Ollama / Qwen 2.5)</strong> is used as a fallback to attempt
            extraction from unstructured text.
          </p>
          <p>
            <strong className="text-text-main">
              Regardless of score, you must manually verify every field.
            </strong>{' '}
            Mark each medication as &ldquo;Reviewed&rdquo; before confirming.
          </p>
        </div>
      </details>

      {/* Extraction Map legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-text-muted px-1">
        <span className="font-semibold text-text-main text-[11px]">Extraction Map</span>
        {LEGEND_ITEMS.map((item) => (
          <span key={item.field} className="inline-flex items-center gap-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${item.tw} opacity-70`} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Split-screen: PDF highlight viewer | editable cards */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
        {/* LEFT: PDF with canvas + text layer highlights */}
        <div
          className={`w-full lg:w-1/2 shrink-0 ${activeHighlight ? 'pdf-focus-active' : ''}`}
        >
          <div className="bg-bg-card border border-border-subtle rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
              <FileText size={16} className="text-brand-primary" />
              <span className="text-sm font-semibold text-text-main">Source Document</span>
              <span className="ml-auto text-[10px] text-text-muted">
                {parseResult?.pageCount} page{parseResult?.pageCount !== 1 ? 's' : ''}
              </span>
              <button
                onClick={openPdfInNewTab}
                className="inline-flex items-center gap-1 text-[10px] text-brand-primary hover:underline"
                title="Open PDF in new tab"
              >
                <ExternalLink size={10} />
                Open
              </button>
            </div>

            {/* Zoom + Page toolbar */}
            <div className="hidden sm:flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-bg-page/60 text-xs">
              {/* Zoom controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={zoomOut}
                  disabled={scale <= 0.5}
                  className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 text-text-muted"
                  title="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="w-12 text-center font-mono text-text-muted">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={zoomIn}
                  disabled={scale >= 3}
                  className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 text-text-muted"
                  title="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={zoomFit}
                  className="p-1 rounded hover:bg-bg-hover text-text-muted ml-1"
                  title="Fit to width (100%)"
                >
                  <Maximize2 size={13} />
                </button>
              </div>

              {/* Page navigation */}
              <div className="flex items-center gap-2">
                {numPages > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 text-text-muted"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-text-muted">
                      <span className="font-semibold text-text-main">{currentPage}</span>/{numPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                      disabled={currentPage >= numPages}
                      className="p-1 rounded hover:bg-bg-hover disabled:opacity-30 text-text-muted"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Desktop: react-pdf Canvas + Text Layer (scrollable, zoomable) */}
            <div
              ref={pdfScrollRef}
              className="hidden sm:block overflow-auto bg-neutral-100 dark:bg-neutral-900"
              style={{ maxHeight: '780px' }}
            >
              {file && (
                <Document
                  file={file}
                  onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                  loading={
                    <div className="flex items-center justify-center py-24">
                      <Loader2 size={28} className="animate-spin text-brand-primary" />
                    </div>
                  }
                  error={
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                      <AlertCircle size={24} className="text-red-500 mb-2" />
                      <p className="text-sm text-text-muted">Failed to render PDF</p>
                    </div>
                  }
                >
                  <Page
                    pageNumber={currentPage}
                    scale={scale}
                    renderAnnotationLayer={false}
                    onRenderSuccess={handlePageRenderSuccess}
                    loading={
                      <div className="flex items-center justify-center py-24">
                        <Loader2 size={24} className="animate-spin text-brand-primary" />
                      </div>
                    }
                  />
                </Document>
              )}
            </div>

            {/* Mobile: raw text fallback (canvas is heavy on mobile) */}
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
              onFieldFocus={(field) => handleFieldFocus(idx, field)}
              onFieldBlur={handleFieldBlur}
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
  onFieldFocus,
  onFieldBlur,
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
  onFieldFocus: (field: string) => void
  onFieldBlur: () => void
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
        <div
          className="hidden sm:flex items-center gap-1.5 ml-1"
          title={`Confidence: ${confidence}/5 (${confidencePct}%)`}
        >
          <div className="w-12 h-1.5 bg-border-subtle rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                confidencePct >= 60
                  ? 'bg-emerald-500'
                  : confidencePct >= 30
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="text-[9px] text-text-muted">{confidence}/5</span>
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

      {/* Editable fields — onFocus highlights the corresponding term in the PDF */}
      <div className="px-4 py-3 space-y-3">
        {/* Row 1: Name */}
        <div>
          <label className={labelCls}>
            <FieldDot field="name" />
            Medication Name
          </label>
          <input
            type="text"
            value={med.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            onFocus={() => onFieldFocus('name')}
            onBlur={onFieldBlur}
            className={inputCls}
          />
        </div>

        {/* Row 2: Dosage + Unit + Form */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>
              <FieldDot field="dosage" />
              Dosage
            </label>
            <input
              type="text"
              value={med.dosage}
              onChange={(e) => onUpdate('dosage', e.target.value)}
              onFocus={() => onFieldFocus('dosage')}
              onBlur={onFieldBlur}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>
              <FieldDot field="dosage" />
              Unit
            </label>
            <select
              value={med.dosageUnit}
              onChange={(e) => onUpdate('dosageUnit', e.target.value)}
              onFocus={() => onFieldFocus('dosage')}
              onBlur={onFieldBlur}
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
            <label className={labelCls}>
              <FieldDot field="form" />
              Form
            </label>
            <input
              type="text"
              value={med.form}
              onChange={(e) => onUpdate('form', e.target.value)}
              onFocus={() => onFieldFocus('form')}
              onBlur={onFieldBlur}
              className={inputCls}
            />
          </div>
        </div>

        {/* Row 3: Frequency + Times/day + Quantity */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>
              <FieldDot field="frequency" />
              Frequency
            </label>
            <select
              value={med.frequency}
              onChange={(e) => onUpdate('frequency', e.target.value)}
              onFocus={() => onFieldFocus('frequency')}
              onBlur={onFieldBlur}
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
            <label className={labelCls}>
              <FieldDot field="frequency" />
              Times/Day
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={med.timesPerDay}
              onChange={(e) => onUpdate('timesPerDay', parseInt(e.target.value) || 1)}
              onFocus={() => onFieldFocus('frequency')}
              onBlur={onFieldBlur}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              type="number"
              min={0}
              value={med.totalQuantity ?? ''}
              onChange={(e) =>
                onUpdate('totalQuantity', e.target.value ? parseInt(e.target.value) : null)
              }
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
            <label className={labelCls}>
              <FieldDot field="duration" />
              End Date
            </label>
            <input
              type="date"
              value={med.endDate ?? ''}
              onChange={(e) => onUpdate('endDate', e.target.value || null)}
              onFocus={() => onFieldFocus('duration')}
              onBlur={onFieldBlur}
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
              Reviewed &mdash; Click to Undo
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

/** Color dot matching the highlight color for a given field type */
function FieldDot({ field }: { field: string }) {
  const colorMap: Record<string, string> = {
    name: 'bg-blue-400',
    dosage: 'bg-emerald-400',
    form: 'bg-purple-500',
    frequency: 'bg-amber-400',
    duration: 'bg-pink-400',
  }
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${colorMap[field] ?? 'bg-transparent'} mr-1 align-middle`}
    />
  )
}

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
