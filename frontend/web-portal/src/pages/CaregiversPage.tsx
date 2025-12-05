import { useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, Mail, Check, X } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import {
  getCaregivers,
  inviteCaregiver,
  removeCaregiver,
  getPendingInvitations,
  acceptInvitation,
  declineInvitation,
  getPatients
} from '../api/services';
import useAuthStore from '../store/useAuthStore';

const CaregiversPage = () => {
  const [caregivers, setCaregivers] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({ email: '', relationship: '' });
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    loadData();
  }, []);

    const loadData = async () => {
    try {
      const [caregiversData, patientsData, pendingData] = await Promise.all([
        getCaregivers(),
        getPatients(),
        getPendingInvitations()
      ]);

      // If user is a CAREGIVER, show patients. If PATIENT, show caregivers.
      if (user?.role === 'caregiver') {
        // For caregivers, the "main list" is the patients list
        const list = patientsData.data || [];
        setCaregivers(Array.isArray(list) ? list : []);
      } else {
        // For patients, the "main list" is the caregivers list
        const list = caregiversData.data?.caregivers || caregiversData.caregivers || [];
        setCaregivers(Array.isArray(list) ? list : []);
      }

      // Set pending invites (Index 2)
      const pendingList = pendingData.data || [];
      setPendingInvites(Array.isArray(pendingList) ? pendingList : []);

    } catch (err) {
      console.error(err);
      setCaregivers([]);
      setPendingInvites([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inviteCaregiver(inviteData.email, inviteData.relationship);
      setShowInviteModal(false);
      setInviteData({ email: '', relationship: '' });
      loadData();
      alert('Invitation sent successfully!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to send invitation');
    }
  };

  const handleRemove = async (id: string) => {
    if (window.confirm('Are you sure you want to remove this caregiver?')) {
      try {
        await removeCaregiver(id);
        loadData();
      } catch (err) {
        alert('Failed to remove caregiver');
      }
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await acceptInvitation(id);
      loadData();
      alert('Invitation accepted!');
    } catch (err) {
      alert('Failed to accept invitation');
    }
  };

  const handleDecline = async (id: string) => {
    if (window.confirm('Are you sure you want to decline this invitation?')) {
      try {
        await declineInvitation(id);
        loadData();
      } catch (err) {
        alert('Failed to decline invitation');
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user?.role === 'caregiver' ? 'My Patients' : 'My Caregivers'}
        </h1>
        {user?.role === 'patient' && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors"
          >
            <UserPlus size={18} />
            <span>Invite Caregiver</span>
          </button>
        )}
      </div>

      {/* PENDING INVITATIONS (for caregivers) */}
      {user?.role === 'caregiver' && pendingInvites.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-bold text-yellow-900 mb-4">Pending Invitations</h2>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="bg-white p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-bold text-gray-900">{invite.patientName}</p>
                  <p className="text-sm text-gray-600">{invite.patientEmail}</p>
                  <p className="text-xs text-gray-500">Relationship: {invite.relationship}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(invite.id)}
                    className="flex items-center gap-1 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700"
                  >
                    <Check size={16} />
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(invite.id)}
                    className="flex items-center gap-1 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700"
                  >
                    <X size={16} />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CAREGIVERS LIST */}
      {loading ? (
        <div className="text-center py-20 text-gray-500">Loading...</div>
      ) : caregivers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="text-gray-300 mx-auto mb-4" size={64} />
          <p className="text-gray-500 text-lg mb-2">
            {user?.role === 'caregiver' ? 'No patients yet' : 'No caregivers yet'}
          </p>
          <p className="text-gray-400 text-sm">
            {user?.role === 'caregiver'
              ? 'You will see patients here once they invite you'
              : 'Invite someone to help manage your medication'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {caregivers.map((caregiver) => (
            <div key={caregiver.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                    <Users className="text-teal-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">
                      {caregiver.caregiver?.firstName} {caregiver.caregiver?.lastName}
                    </h3>
                    <p className="text-sm text-gray-600">{caregiver.relationship || 'Caregiver'}</p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Mail size={12} />
                      {caregiver.caregiver?.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(caregiver.id)}
                  className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                  title="Remove caregiver"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">Status: <span className={caregiver.status === 'Active' ? 'text-green-600' : 'text-yellow-600'}>{caregiver.status}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* INVITE MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Invite Caregiver</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Relationship</label>
                <input
                  type="text"
                  placeholder="e.g., Family, Friend, Nurse"
                  value={inviteData.relationship}
                  onChange={(e) => setInviteData({ ...inviteData, relationship: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700"
                >
                  Send Invitation
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default CaregiversPage;
