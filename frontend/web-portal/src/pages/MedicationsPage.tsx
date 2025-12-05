import React, { useEffect, useState } from 'react';
import { Plus, Pill, AlertCircle, Edit, Trash2, RefreshCw, X } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { getMedications, deleteMedication, addMedication } from '../api/services';

const MedicationsPage = () => {
  const [meds, setMeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [newMed, setNewMed] = useState({
    name: '',
    dosage: '',
    dosageUnit: 'mg',
    frequency: '1x daily', // simple string for now
    timesPerDay: 1,
    totalQuantity: 30,
    startDate: new Date().toISOString().split('T')[0]
  });

  const loadMeds = async () => {
    try {
      const data = await getMedications();
      setMeds(data.data?.medications || []);
    } catch (err) {
      setError('Failed to load medications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeds();
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addMedication(newMed);
      setShowAddModal(false);
      loadMeds(); // Refresh list
      setNewMed({ name: '', dosage: '', dosageUnit: 'mg', frequency: '1x daily', timesPerDay: 1, totalQuantity: 30, startDate: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to add medication');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure?')) {
      try {
        await deleteMedication(id);
        loadMeds();
      } catch (err) {
        alert('Failed to delete');
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Medications</h1>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-teal-700 text-white px-4 py-2 rounded-lg hover:bg-teal-800 transition-colors"
        >
          <Plus size={18} />
          <span>Add Medication</span>
        </button>
      </div>

      {loading ? <div className="text-center py-10">Loading...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meds.map((med) => (
            <div key={med.id} className="bg-white p-5 rounded-xl border shadow-sm">
              <div className="flex justify-between">
                 <h3 className="font-bold">{med.name}</h3>
                 <button onClick={() => handleDelete(med.id)} className="text-red-500"><Trash2 size={16}/></button>
              </div>
              <p className="text-sm text-gray-500">{med.dosage} {med.dosageUnit}</p>
              <div className="mt-2 text-sm">
                 Stock: {med.remainingQuantity} / {med.totalQuantity}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Medication Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Medication</h2>
              <button onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">Name</label>
                <input type="text" required className="w-full border rounded p-2" 
                  value={newMed.name} onChange={e => setNewMed({...newMed, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-sm font-medium">Dosage</label>
                   <input type="number" required className="w-full border rounded p-2" 
                     value={newMed.dosage} onChange={e => setNewMed({...newMed, dosage: e.target.value})} />
                </div>
                <div>
                   <label className="block text-sm font-medium">Unit</label>
                   <select className="w-full border rounded p-2" 
                     value={newMed.dosageUnit} onChange={e => setNewMed({...newMed, dosageUnit: e.target.value})}>
                     <option>mg</option><option>ml</option><option>pills</option>
                   </select>
                </div>
              </div>
              <div>
                 <label className="block text-sm font-medium">Times per Day</label>
                 <input type="number" min="1" max="4" className="w-full border rounded p-2"
                   value={newMed.timesPerDay} onChange={e => setNewMed({...newMed, timesPerDay: parseInt(e.target.value)})} />
              </div>
              <div>
                 <label className="block text-sm font-medium">Total Stock</label>
                 <input type="number" required className="w-full border rounded p-2"
                   value={newMed.totalQuantity} onChange={e => setNewMed({...newMed, totalQuantity: parseInt(e.target.value)})} />
              </div>
              <button type="submit" className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700">Save Medication</button>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default MedicationsPage;
