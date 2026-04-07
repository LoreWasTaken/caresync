// src/features/medications/pages/MyMedicationsPage.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMedicationStore, Medication } from '../../../shared/store/medicationStore'
import {
  Plus,
  Pill,
  Pencil,
  Trash2,
  Activity,
  AlertCircle,
  Clock,
  Package,
  FileUp,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'

export const MyMedicationsPage = () => {
  const { medications, loading, error, fetchMedications, deleteMedication, clearError } =
    useMedicationStore()

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchMedications()
  }, [fetchMedications])

  const handleDelete = async (med: Medication) => {
    if (!window.confirm(`Delete "${med.name}" permanently? This cannot be undone.`)) return
    setDeletingId(med.id)
    try {
      await deleteMedication(med.id)
    } finally {
      setDeletingId(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  if (loading && medications.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Activity className="animate-spin text-text-muted" size={28} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Medications</h1>
          <p className="text-sm text-text-muted mt-1">
            {medications.length} medication{medications.length !== 1 && 's'} registered
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/app/medications/add?mode=upload"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-bg-card border border-border-subtle hover:border-brand-primary/50 text-text-main text-sm font-semibold rounded-lg transition-colors"
          >
            <FileUp size={15} className="text-brand-primary" />
            <span className="hidden sm:inline">Upload Prescription</span>
          </Link>
          <Link
            to="/app/medications/add"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Medication
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            <button onClick={clearError} className="underline text-xs mt-1 opacity-70 hover:opacity-100">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && medications.length === 0 && (
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-12 text-center">
          <Pill size={40} className="mx-auto mb-4 text-text-muted opacity-40" />
          <h2 className="text-lg font-semibold">No medications yet</h2>
          <p className="text-sm text-text-muted mt-1 mb-6">
            Add your first medication to start tracking doses and adherence.
          </p>
          <Link
            to="/app/medications/add"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Medication
          </Link>
        </div>
      )}

      {/* Medication list */}
      {medications.length > 0 && (
        <div className="space-y-3">
          {medications.map((med) => (
            <div
              key={med.id}
              className="bg-bg-card border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors hover:border-brand-primary/30"
            >
              {/* Left: compartment badge */}
              <div className="shrink-0 hidden sm:flex w-10 h-10 rounded-full bg-brand-primary/10 items-center justify-center text-brand-primary font-bold text-sm">
                {med.compartment ?? '–'}
              </div>

              {/* Center: details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-text-main truncate">{med.name}</h3>
                  {!med.isActive && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 font-medium">
                      inactive
                    </span>
                  )}
                  {med.isPRN && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-400 font-medium">
                      <Sparkles size={10} />
                      PRN
                    </span>
                  )}
                  {med.totalQuantity != null && med.remainingQuantity != null && med.remainingQuantity <= 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 font-bold animate-pulse">
                      <AlertTriangle size={10} />
                      Depleted &mdash; Refill Needed
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Pill size={12} />
                    {med.dosage} {med.dosageUnit}
                  </span>
                  {med.frequency && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {med.frequency}{med.timesPerDay > 1 ? ` (${med.timesPerDay}x/day)` : ''}
                    </span>
                  )}
                  {med.totalQuantity != null && (
                    <span
                      className={`flex items-center gap-1 ${
                        med.remainingQuantity != null && med.remainingQuantity <= 0
                          ? 'text-red-500 font-bold'
                          : ''
                      }`}
                    >
                      <Package size={12} />
                      {med.remainingQuantity ?? '?'}/{med.totalQuantity} remaining
                    </span>
                  )}
                </div>

                {med.instructions && (
                  <p className="text-xs text-text-muted/70 mt-1 truncate max-w-md italic">
                    {med.instructions}
                  </p>
                )}
              </div>

              {/* Right: actions */}
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/app/medications/${med.id}/edit`}
                  className="p-2 rounded-lg border border-border-subtle hover:bg-bg-hover transition-colors"
                  title="Edit"
                >
                  <Pencil size={15} className="text-text-muted" />
                </Link>
                <button
                  onClick={() => handleDelete(med)}
                  disabled={deletingId === med.id}
                  className="p-2 rounded-lg border border-border-subtle hover:bg-red-500/10 hover:border-red-500/30 transition-colors disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2
                    size={15}
                    className={deletingId === med.id ? 'animate-spin text-red-400' : 'text-text-muted hover:text-red-500'}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
