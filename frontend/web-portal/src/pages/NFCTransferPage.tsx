import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { useWebNfc } from '../hooks/useWebNfc';
import { getMedications } from '../api/services';
import { Radio, UploadCloud, WifiOff } from 'lucide-react';

type Medication = {
  id?: string;
  name?: string;
  dosage?: string | number;
  dosageUnit?: string;
  timesPerDay?: number;
  frequency?: string;
};

const NFCTransferPage = () => {
  const { supported, reading, writing, error, lastMessage, startReading, stopReading, write } = useWebNfc();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loadingMeds, setLoadingMeds] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingMeds(true);
      try {
        const data = await getMedications();
        setMedications(data.data?.medications || []);
      } catch {
        setMedications([]);
      } finally {
        setLoadingMeds(false);
      }
    };
    load();
  }, []);

  const encodedPayload = useMemo(() => {
    const compact = medications.slice(0, 5).map((m) => ({
      name: m.name,
      dose: `${m.dosage ?? ''} ${m.dosageUnit ?? ''}`.trim(),
      freq: m.frequency || `${m.timesPerDay ?? 1}x/day`,
    }));
    return JSON.stringify({ meds: compact });
  }, [medications]);

  const handleWrite = async () => {
    await write([
      {
        recordType: 'text',
        data: encodedPayload,
      },
    ]);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Radio className="text-teal-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">NFC Transfer</h1>
            <p className="text-sm text-gray-600">
              Share a compact medication summary with CareBox/CareBand via Web NFC.
            </p>
          </div>
        </div>

        {!supported && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg">
            <WifiOff size={20} />
            <span>Web NFC is not supported on this device/browser. Try Chrome on Android with NFC enabled.</span>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
            <h2 className="font-semibold text-gray-900">Outgoing payload</h2>
            <p className="text-sm text-gray-600">First 5 medications will be encoded as JSON text.</p>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-800 overflow-auto">{encodedPayload}</pre>
            <button
              onClick={handleWrite}
              disabled={!supported || writing}
              className="inline-flex items-center gap-2 bg-teal-700 text-white px-4 py-2 rounded-lg hover:bg-teal-800 disabled:opacity-50"
            >
              <UploadCloud size={18} />
              {writing ? 'Writing...' : 'Write to NFC tag'}
            </button>
          </div>

          <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
            <h2 className="font-semibold text-gray-900">Read from tag</h2>
            <p className="text-sm text-gray-600">Start scanning and hold a tag near your device.</p>
            <div className="flex gap-2">
              <button
                onClick={startReading}
                disabled={!supported || reading}
                className="bg-teal-100 text-teal-800 px-4 py-2 rounded-lg hover:bg-teal-200 disabled:opacity-50"
              >
                {reading ? 'Listening...' : 'Start scan'}
              </button>
              <button
                onClick={stopReading}
                disabled={!reading}
                className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Stop
              </button>
            </div>
            {lastMessage && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <div className="font-semibold">Last tag message</div>
                <pre className="text-xs whitespace-pre-wrap break-words">{lastMessage}</pre>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                {error}
              </div>
            )}
            {loadingMeds && <div className="text-sm text-gray-500">Loading medications...</div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default NFCTransferPage;
