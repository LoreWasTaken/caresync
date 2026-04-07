// src/features/dashboard/pages/CaregiverDashboard.tsx
import { useEffect, useState } from 'react';
import { Users, UserPlus, CheckCircle2, XCircle, HeartPulse, Loader2, Calendar } from 'lucide-react';
import { client } from '../../../shared/api/client';

interface Patient {
  id: string; // Relationship ID
  patientId: string;
  patient: {
    firstName: string;
    lastName: string;
    email: string;
  };
  permissions: {
    canViewMedications: boolean;
    canViewAdherence: boolean;
  };
  isActive: boolean;
}

interface Invitation {
  id: string; // The CaregiverPatient relationship ID
  patient: {
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
}

export const CaregiverDashboard = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [patientsRes, invitesRes] = await Promise.all([
        client.get('/patients'),
        client.get('/caregivers/pending')
      ]);
      
      const pts = patientsRes.data?.data?.patients || patientsRes.data?.data || [];
      const invs = invitesRes.data?.data || [];

      setPatients(Array.isArray(pts) ? pts : []);
      setInvitations(Array.isArray(invs) ? invs : []);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInvitation = async (id: string, action: 'accept' | 'decline') => {
    setActionLoading(id);
    try {
      await client.post(`/caregivers/${id}/${action}`);
      await fetchData();
    } catch (err) {
      console.error(`Failed to ${action} invitation`, err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-text-muted" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <Users className="text-brand-primary" size={28} />
        <h1 className="text-3xl font-bold tracking-tight text-text-main">Caregiver Dashboard</h1>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-text-main">
            <UserPlus size={20} className="text-brand-primary" />
            Pending Invitations
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="bg-brand-primary/5 border border-brand-primary/20 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-text-main">{inv.patient?.firstName} {inv.patient?.lastName}</h3>
                    <p className="text-sm text-text-muted">{inv.patient?.email}</p>
                  </div>
                  <div className="text-xs text-text-muted bg-bg-main px-2 py-1 rounded-md border border-border-subtle">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleInvitation(inv.id, 'accept')}
                    disabled={actionLoading === inv.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {actionLoading === inv.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Accept
                  </button>
                  <button
                    onClick={() => handleInvitation(inv.id, 'decline')}
                    disabled={actionLoading === inv.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-bg-card hover:bg-red-500 hover:text-white text-text-main text-sm font-semibold rounded-lg border border-border-subtle hover:border-transparent transition-colors disabled:opacity-50"
                  >
                    {actionLoading === inv.id ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Patients */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-text-main">
          <HeartPulse size={20} className="text-brand-primary" />
          Active Patients
        </h2>
        
        {patients.length === 0 ? (
          <div className="bg-bg-card p-10 rounded-2xl border border-border-subtle shadow-sm flex flex-col items-center justify-center text-text-muted">
            <HeartPulse size={48} className="mb-4 text-brand-primary/60" />
            <p className="text-lg font-semibold text-text-main">No active patients yet</p>
            <p className="text-sm mt-2 max-w-sm text-center opacity-80">When a patient invites you to manage their schedule, their information will appear here once you accept.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {patients.map((p) => (
              <div key={p.id} className="bg-bg-card border border-border-subtle rounded-2xl p-5 shadow-sm group hover:shadow-md transition-all hover:border-brand-primary/30 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary opacity-40 group-hover:opacity-100 transition-opacity"></div>
                
                <h3 className="font-bold text-lg text-text-main mb-1 truncate mt-1">
                  {p.patient?.firstName} {p.patient?.lastName}
                </h3>
                <p className="text-sm text-text-muted truncate mb-5">{p.patient?.email}</p>
                
                <div className="p-3 bg-bg-main/50 rounded-xl space-y-2 mb-5">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-1.5"><CheckCircle2 size={12}/>Permissions</h4>
                  <div className="flex items-center gap-2 text-sm text-text-main">
                    <CheckCircle2 size={14} className={p.permissions?.canViewMedications ? "text-emerald-500" : "text-border-subtle"} />
                    <span className={!p.permissions?.canViewMedications ? "text-text-muted line-through opacity-50" : ""}>Manage Medications</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text-main">
                    <CheckCircle2 size={14} className={p.permissions?.canViewAdherence ? "text-emerald-500" : "text-border-subtle"} />
                    <span className={!p.permissions?.canViewAdherence ? "text-text-muted line-through opacity-50" : ""}>Monitor Adherence</span>
                  </div>
                </div>

                <button 
                  onClick={() => window.location.href = `/dashboard/caregiver/patient/${p.patientId}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-primary text-white font-semibold text-sm rounded-lg transition-transform active:scale-[0.98] hover:bg-brand-primary/90 shadow-sm"
                >
                  <Calendar size={16} />
                  View Schedule
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
