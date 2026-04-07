// src/shared/store/medicationStore.ts
import { create } from 'zustand'
import { client } from '../api/client'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Medication {
  id: string
  userId: string
  name: string
  dosage: number | string
  dosageUnit: string
  frequency: string
  timesPerDay: number
  route: string | null
  instructions: string | null
  startDate: string
  endDate: string | null
  /**
   * PRN ("Pro Re Nata" / As-Needed / SOS) flag.
   * When true, the medication has no scheduled doses — patient takes it
   * ad-hoc via "Take Now". The calendar/SchedulePage skips these entries.
   */
  isPRN: boolean
  remainingQuantity: number | null
  totalQuantity: number | null
  compartment: number | null
  refillReminder: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MedicationFormData {
  name: string
  dosage: string
  dosageUnit: string
  frequency?: string
  timesPerDay?: number
  route?: string
  instructions?: string
  startDate?: string
  endDate?: string
  /** When true, endDate is optional and the calendar skips this med. */
  isPRN?: boolean
  totalQuantity?: number
  compartment?: number
  refillReminder?: boolean
}

interface Pagination {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

interface MedicationState {
  medications: Medication[]
  pagination: Pagination | null
  loading: boolean
  error: string | null

  fetchMedications: (page?: number, limit?: number, status?: string) => Promise<void>
  addMedication: (data: MedicationFormData) => Promise<Medication>
  updateMedication: (id: string, data: Partial<MedicationFormData>) => Promise<Medication>
  deleteMedication: (id: string) => Promise<void>
  clearError: () => void
}

export const useMedicationStore = create<MedicationState>()((set) => ({
  medications: [],
  pagination: null,
  loading: false,
  error: null,

  fetchMedications: async (page = 1, limit = 20, status = 'all') => {
    set({ loading: true, error: null })
    try {
      const res = await client.get('/medications', {
        params: { page, limit, status },
      })
      set({
        medications: res.data.data ?? [],
        pagination: res.data.pagination ?? null,
        loading: false,
      })
    } catch (err: any) {
      set({
        error: err.response?.data?.message ?? 'Failed to load medications',
        loading: false,
      })
    }
  },

  addMedication: async (data) => {
    set({ error: null })
    try {
      const res = await client.post('/medications', data)
      const created: Medication = res.data.data
      set((s) => ({ medications: [created, ...s.medications] }))
      return created
    } catch (err: any) {
      const msg =
        err.response?.data?.errors?.map((e: any) => e.msg).join(', ') ??
        err.response?.data?.message ??
        'Failed to add medication'
      set({ error: msg })
      throw new Error(msg)
    }
  },

  updateMedication: async (id, data) => {
    set({ error: null })
    try {
      const res = await client.put(`/medications/${id}`, data)
      const updated: Medication = res.data.data
      set((s) => ({
        medications: s.medications.map((m) => (m.id === id ? updated : m)),
      }))
      return updated
    } catch (err: any) {
      const msg =
        err.response?.data?.errors?.map((e: any) => e.msg).join(', ') ??
        err.response?.data?.message ??
        'Failed to update medication'
      set({ error: msg })
      throw new Error(msg)
    }
  },

  deleteMedication: async (id) => {
    set({ error: null })
    try {
      await client.delete(`/medications/${id}`)
      set((s) => ({
        medications: s.medications.filter((m) => m.id !== id),
      }))
    } catch (err: any) {
      const msg = err.response?.data?.message ?? 'Failed to delete medication'
      set({ error: msg })
      throw new Error(msg)
    }
  },

  clearError: () => set({ error: null }),
}))
