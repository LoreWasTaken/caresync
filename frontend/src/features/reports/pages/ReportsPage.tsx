// src/features/reports/pages/ReportsPage.tsx
// PDF adherence report generator — calls GET /reports/report/pdf and triggers download.
import { useState } from 'react'
import { client } from '../../../shared/api/client'
import { FileBarChart, Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Last 30 days as default range */
const defaultStart = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}
const defaultEnd = () => new Date().toISOString().slice(0, 10)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const ReportsPage = () => {
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [includeCharts, setIncludeCharts] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await client.get('/reports/report/pdf', {
        params: {
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          includeCharts,
        },
        responseType: 'blob',
      })

      // Build filename from Content-Disposition or fallback
      const disposition = res.headers['content-disposition'] as string | undefined
      let filename = `CareSync_Report_${startDate}_to_${endDate}.pdf`
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match?.[1]) filename = match[1]
      }

      // Trigger browser download via invisible <a>
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (err: any) {
      // Try to extract JSON error from blob
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          const json = JSON.parse(text)
          setError(json.message ?? 'Failed to generate report')
        } catch {
          setError('Failed to generate report')
        }
      } else {
        setError(err.response?.data?.message ?? 'Failed to generate report')
      }
    } finally {
      setGenerating(false)
    }
  }

  const inputCls =
    'w-full px-3.5 py-2.5 text-sm rounded-lg bg-bg-page border border-border-subtle text-text-main focus:ring-2 focus:ring-brand-primary outline-none'
  const labelCls = 'block text-xs font-medium text-text-main mb-1.5 ml-0.5'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <FileBarChart className="text-brand-primary" size={22} />
          <h1 className="text-2xl font-bold tracking-tight">Adherence Reports</h1>
        </div>
        <p className="text-sm text-text-muted mt-1">Generate a downloadable PDF of your medication adherence data.</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-sm text-green-500">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <p>Report downloaded successfully!</p>
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={handleGenerate}
        className="bg-bg-card border border-border-subtle rounded-2xl p-5 sm:p-6 space-y-5"
      >
        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Start Date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>End Date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Options */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-text-main ml-0.5">Options</p>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCharts}
              onChange={(e) => setIncludeCharts(e.target.checked)}
              className="w-4 h-4 rounded border-border-subtle text-brand-primary focus:ring-brand-primary"
            />
            <span className="text-sm text-text-main">Include adherence charts</span>
          </label>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={generating}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {generating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {generating ? 'Generating...' : 'Download Report'}
          </button>
        </div>
      </form>
    </div>
  )
}
