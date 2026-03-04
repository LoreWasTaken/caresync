// src/features/devices/pages/DevicesPage.tsx
// Device management — list, register (simulated QR), delete.
import { useEffect, useState } from 'react'
import { client } from '../../../shared/api/client'
import {
  Cpu,
  Plus,
  Trash2,
  Activity,
  Wifi,
  WifiOff,
  BatteryMedium,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Device {
  id: string
  deviceId: string
  name: string
  deviceType: string
  model: string | null
  batteryLevel: number | null
  connectionStatus: string | null
  lastSync: string | null
  isActive: boolean
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const DevicesPage = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add-device modal
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchDevices = async () => {
    try {
      const res = await client.get('/devices')
      setDevices(res.data?.data?.devices ?? res.data?.data ?? [])
    } catch {
      setError('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddSubmitting(true)
    setError(null)
    try {
      // Generate a pseudo-random deviceId to simulate a QR scan
      const deviceId = `carebox-${crypto.randomUUID().slice(0, 8)}`
      const res = await client.post('/devices', {
        deviceId,
        name: addName,
        deviceType: 'carebox',
      })
      const newDev = res.data?.data?.device
      if (newDev) setDevices((prev) => [newDev, ...prev])
      setShowAdd(false)
      setAddName('')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to register device')
    } finally {
      setAddSubmitting(false)
    }
  }

  const handleDelete = async (dev: Device) => {
    if (!window.confirm(`Remove "${dev.name}"? This cannot be undone.`)) return
    setDeletingId(dev.id)
    try {
      await client.delete(`/devices/${dev.id}`)
      setDevices((prev) => prev.filter((d) => d.id !== dev.id))
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to remove device')
    } finally {
      setDeletingId(null)
    }
  }

  /* ---------------------------------------------------------------- */

  if (loading) {
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
          <h1 className="text-2xl font-bold tracking-tight">My Devices</h1>
          <p className="text-sm text-text-muted mt-1">
            {devices.length} device{devices.length !== 1 && 's'} linked
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={16} />
          Link New Device
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-500">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-xs underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* Empty state */}
      {devices.length === 0 && (
        <div className="bg-bg-card border border-border-subtle rounded-2xl p-12 text-center">
          <Cpu size={40} className="mx-auto mb-4 text-text-muted opacity-40" />
          <h2 className="text-lg font-semibold">No devices linked</h2>
          <p className="text-sm text-text-muted mt-1 mb-6">Link a CareBox device to start syncing your medication data.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus size={16} />
            Link New Device
          </button>
        </div>
      )}

      {/* Device list */}
      {devices.length > 0 && (
        <div className="space-y-3">
          {devices.map((dev) => (
            <div
              key={dev.id}
              className="bg-bg-card border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors hover:border-brand-primary/30"
            >
              {/* Icon */}
              <div className="shrink-0 hidden sm:flex w-10 h-10 rounded-full bg-brand-primary/10 items-center justify-center">
                <Cpu size={18} className="text-brand-primary" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-text-main truncate">{dev.name}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    {dev.connectionStatus === 'online' ? (
                      <Wifi size={12} className="text-emerald-500" />
                    ) : (
                      <WifiOff size={12} />
                    )}
                    {dev.connectionStatus ?? 'unknown'}
                  </span>
                  {dev.batteryLevel != null && (
                    <span className="flex items-center gap-1">
                      <BatteryMedium size={12} />
                      {dev.batteryLevel}%
                    </span>
                  )}
                  {dev.lastSync && (
                    <span>Last sync: {new Date(dev.lastSync).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => handleDelete(dev)}
                disabled={deletingId === dev.id}
                className="p-2 rounded-lg border border-border-subtle hover:bg-red-500/10 hover:border-red-500/30 transition-colors disabled:opacity-40 shrink-0"
                title="Remove device"
              >
                <Trash2
                  size={15}
                  className={deletingId === dev.id ? 'animate-spin text-red-400' : 'text-text-muted hover:text-red-500'}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---- Add Device Modal ---- */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div
            className="bg-bg-card border border-border-subtle rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-main">Link New Device</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-bg-hover rounded-md">
                <X size={16} className="text-text-muted" />
              </button>
            </div>

            <p className="text-sm text-text-muted">
              A unique device ID will be generated automatically (simulating QR scan).
            </p>

            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-main mb-1.5 ml-0.5">Device Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bedroom CareBox"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-bg-page border border-border-subtle text-text-main focus:ring-2 focus:ring-brand-primary outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={addSubmitting || !addName.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-light text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {addSubmitting && <Loader2 size={14} className="animate-spin" />}
                Register Device
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
