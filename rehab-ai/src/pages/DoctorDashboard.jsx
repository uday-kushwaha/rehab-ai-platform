import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Real Data States
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // 1. Security & Data Fetching
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    if (!storedUser || storedUser.role !== 'doctor') {
      navigate('/');
      return;
    }
    setUser(storedUser);

    // Fetch real patients from MongoDB
    const fetchPatients = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/users/patients');
        const data = await response.json();
        setPatients(data);
        if (data.length > 0) setSelectedPatient(data[0]);
      } catch (err) {
        console.error("Failed to fetch patients:", err);
      }
    };
    fetchPatients();
  }, [navigate]);

  // 2. Accept Patient Logic
  const handleAcceptPatient = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/users/patients/${selectedPatient._id}/assign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId: user.id })
      });
      if (!response.ok) throw new Error('Failed to update patient');
      
      const updatedPatient = await response.json();
      
      // Update local state to reflect the acceptance instantly
      setPatients(patients.map(p => p._id === updatedPatient._id ? updatedPatient : p));
      setSelectedPatient(updatedPatient);
    } catch (err) {
      alert(err.message);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar: Real Patient Roster */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-[calc(100vh-64px)] overflow-y-auto sticky top-16">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">My Patients</h2>
          <p className="text-sm text-gray-500 mt-1">Review requests & progress</p>
        </div>
        <div className="flex-1 p-4 space-y-3">
          {patients.map((p) => {
            const isAssigned = p.assignedDoctorId === user.id;
            return (
              <div 
                key={p._id} 
                onClick={() => setSelectedPatient(p)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedPatient?._id === p._id 
                    ? 'border-teal-500 bg-teal-50 shadow-sm' 
                    : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-gray-900">{p.name}</h3>
                  {!isAssigned && (
                    <span className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5" title="Pending Approval"></span>
                  )}
                </div>
                <p className="text-sm text-gray-600 truncate capitalize">{p.focusArea?.replace('_', ' ')}</p>
              </div>
            );
          })}
          {patients.length === 0 && (
            <p className="text-center text-gray-400 mt-10">No patients registered yet.</p>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8">
        {selectedPatient ? (
          <div className="max-w-5xl mx-auto">
            {/* Patient Header */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm mb-8 flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-extrabold text-gray-900">{selectedPatient.name}</h1>
                <p className="text-gray-500 mt-1">Focus: <span className="font-semibold text-gray-700 capitalize">{selectedPatient.focusArea?.replace('_', ' ')}</span></p>
                <p className="text-xs text-gray-400 mt-1">{selectedPatient.email}</p>
              </div>
              
              {selectedPatient.assignedDoctorId === user.id ? (
                <span className="bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-bold border border-green-200">
                  Active Patient
                </span>
              ) : (
                <button 
                  onClick={handleAcceptPatient}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Accept Patient
                </button>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex space-x-6 border-b border-gray-200 mb-8">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`pb-4 text-sm font-bold transition-colors ${activeTab === 'overview' ? 'border-b-2 border-teal-600 text-teal-600' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Daily Progress Tracker
              </button>
            </div>

            {/* View: Progress Tracker (We will connect session data here next) */}
            {activeTab === 'overview' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                 <p className="text-gray-500 text-center py-10">Session logs will appear here once the patient completes workouts.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            Select a patient from the roster to view their profile.
          </div>
        )}
      </div>
    </div>
  );
}