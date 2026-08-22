import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePoseLandmarker } from '../hooks/usePoseLandmarker';
import RehabCanvasGame from '../components/RehabCanvasGame'; // <-- Cleanly imported

const calculateAngle = (a, b, c) => {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
};

const drawBone = (ctx, landmarks, indexA, indexB, width, height, isWrongPosture) => {
  const ptA = landmarks[indexA];
  const ptB = landmarks[indexB];
  
  ctx.beginPath();
  ctx.moveTo(ptA.x * width, ptA.y * height);
  ctx.lineTo(ptB.x * width, ptB.y * height);
  ctx.strokeStyle = isWrongPosture ? '#ef4444' : '#0d9488'; // Red for bad, Teal for good
  ctx.lineWidth = 6;
  ctx.stroke();
};

export default function PatientView() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('dashboard'); // 'dashboard' or 'scanner'
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const { poseLandmarker, isLoaded } = usePoseLandmarker();
  const [cameraActive, setCameraActive] = useState(false);
  
  const [armAngle, setArmAngle] = useState(0);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [reps, setReps] = useState(0);
  
  // New state to pass to the external game component
  const [normalizedInput, setNormalizedInput] = useState(0);
  const [isFormValid, setIsFormValid] = useState(true);
  
  const isDownRef = useRef(false);
  const repsRef = useRef(0);
  const lastRepTime = useRef(0);

  // 1. Load User & Exercise Data
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    if (!storedUser || storedUser.role !== 'patient') {
      navigate('/');
      return;
    }
    setUser(storedUser);

    const fetchExercise = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/exercises/Bicep%20Curl');
        if (response.ok) {
          const data = await response.json();
          setCurrentExercise(data);
        }
      } catch (err) {
        console.error("API error:", err);
      }
    };
    fetchExercise();
  }, [navigate]);

  // 2. Camera & Rendering Logic
  useEffect(() => {
    if (mode !== 'scanner' || !isLoaded) return;

    let animationFrameId;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCameraActive(true);
          };
        }
      } catch (err) {
        alert("Camera access is required for AI tracking.");
        setMode('dashboard');
      }
    };

    startCamera();

    const renderLoop = () => {
      if (poseLandmarker && videoRef.current?.readyState >= 2 && canvasRef.current && currentExercise) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const startTimeMs = performance.now();
        const results = poseLandmarker.detectForVideo(video, startTimeMs);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Mirror the camera feed for natural interaction
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const [j1, j2, j3] = currentExercise.target_joints;
          
          const pt1 = landmarks[j1];
          const pt2 = landmarks[j2];
          const pt3 = landmarks[j3];

          // Additional landmarks for posture tracking
          const lShoulder = landmarks[11];
          const rShoulder = landmarks[12];
          const lEar = landmarks[7];

          if (pt1.visibility > 0.65 && pt2.visibility > 0.65 && pt3.visibility > 0.65) {
            const angle = calculateAngle(pt1, pt2, pt3);
            setArmAngle(Math.round(angle));

            // --- 1. DIRECTION-AWARE NORMALIZATION ---
            // If the DB doesn't have rest/target, we default to standard Bicep Curl bounds
            const rest = currentExercise.rest_angle || 160; 
            const target = currentExercise.target_angle || 40; 
            
            let rawProgress = 0;
            if (rest > target) {
              // Decreasing exercise (Bicep Curl: 160 -> 40)
              rawProgress = (rest - angle) / (rest - target);
            } else {
              // Increasing exercise (Arm Raise: 20 -> 140)
              rawProgress = (angle - rest) / (target - rest);
            }
            
            const clampedProgress = Math.min(Math.max(rawProgress, 0.0), 1.0);
            setNormalizedInput(clampedProgress);

            // --- 2. UNIVERSAL POSTURE CHECK ---
            // Check if patient is shrugging or leaning to cheat the curl
            let isBadPosture = false;
            if (lShoulder && rShoulder && Math.abs(lShoulder.y - rShoulder.y) > 0.07) {
              isBadPosture = true; // Shoulders uneven (leaning sideways)
            } else if (lShoulder && lEar && Math.abs(lShoulder.y - lEar.y) < 0.08) {
              isBadPosture = true; // Shrugging shoulder to ear
            }
            setIsFormValid(!isBadPosture);

            // --- 3. FIX REP COUNTING ---
            // Rely on the normalized progress (0.0 to 1.0) rather than raw angles
            if (clampedProgress < 0.2) {
              isDownRef.current = true; // Arm is back at rest
            } else if (clampedProgress > 0.85 && isDownRef.current && !isBadPosture) {
              const currentTime = Date.now();
              if (currentTime - lastRepTime.current > 1000) {
                repsRef.current += 1;
                setReps(repsRef.current);
                isDownRef.current = false; 
                lastRepTime.current = currentTime;
              }
            }

            drawBone(ctx, landmarks, j1, j2, canvas.width, canvas.height, isBadPosture); 
            drawBone(ctx, landmarks, j2, j3, canvas.width, canvas.height, isBadPosture); 
          }
        }
        ctx.restore();
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    if (cameraActive) renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode, cameraActive, poseLandmarker, currentExercise, isLoaded]);

  // 3. Save Session
  const handleSaveSession = async () => {
    try {
      await fetch('http://localhost:5000/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: user.id,
          exerciseName: currentExercise.name,
          reps_completed: reps,
          max_angle_achieved: armAngle
        })
      });
      alert("✅ Session Successfully Saved to your Doctor's Dashboard!");
      setMode('dashboard');
      setReps(0);
      repsRef.current = 0;
    } catch (err) {
      alert("Error saving: " + err.message);
    }
  };

  if (!user) return null;

  // --- VIEW 1: PATIENT DASHBOARD ---
  if (mode === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl p-8 border border-gray-200 shadow-sm mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900">Welcome back, {user.name}</h1>
            <p className="text-gray-500 mt-2">Your Focus: <span className="font-semibold text-gray-700 capitalize">{user.focusArea?.replace('_', ' ')}</span></p>
          </div>

          <h2 className="text-xl font-bold text-gray-800 mb-4">Today's Assigned Exercises</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-6 flex items-center justify-between border-b border-gray-100">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{currentExercise ? currentExercise.name : "Loading..."}</h3>
                <p className="text-gray-500">Target: 15 Repetitions</p>
              </div>
              <button 
                onClick={() => setMode('scanner')}
                className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-xl font-bold shadow-sm transition-colors"
              >
                Start AI Tracking
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: AI SCANNER WITH SPLIT SCREEN GAME ---
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
      <button 
        onClick={() => setMode('dashboard')}
        className="absolute top-8 left-8 text-gray-400 hover:text-white font-medium"
      >
        &larr; Back to Dashboard
      </button>

      <h1 className="text-3xl font-bold mb-6 tracking-tight">Live <span className="text-teal-400">Tracking</span></h1>
      
      {/* Telemetry Header */}
      <div className="flex gap-4 mb-6">
        <div className="bg-gray-800 px-6 py-4 rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Exercise</p>
          <p className="text-xl font-bold text-teal-400">{currentExercise?.name}</p>
        </div>
        <div className="bg-gray-800 px-6 py-4 rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Live Angle</p>
          <p className={`text-xl font-bold ${!isFormValid ? 'text-red-400' : 'text-teal-400'}`}>
            {armAngle}°
          </p>
        </div>
        <div className="bg-gray-800 px-6 py-4 rounded-xl border border-gray-700">
          <p className="text-sm text-gray-400 mb-1">Valid Reps</p>
          <p className="text-xl font-bold text-white">{reps}</p>
        </div>
      </div>

      {/* SPLIT SCREEN LAYOUT */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        
        {/* Left Side: Camera & Skeleton */}
        <div className="relative border-4 border-gray-700 rounded-2xl overflow-hidden shadow-2xl bg-black">
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={canvasRef} className="block w-full h-auto aspect-[4/3] max-w-[640px] max-h-[480px]" />
        </div>

        {/* Right Side: Imported Gamification Canvas */}
        <div className="border-4 border-gray-700 rounded-2xl overflow-hidden shadow-2xl bg-slate-900 flex items-center justify-center relative">
          <RehabCanvasGame 
            normalizedInput={normalizedInput} 
            isFormValid={isFormValid}
            // Passing the internal manual rep counter is optional if the game handles its own internal scoring!
          />
        </div>

      </div>

      <button 
        onClick={handleSaveSession}
        className="px-10 py-4 bg-teal-600 hover:bg-teal-500 rounded-xl font-bold text-lg transition-all shadow-lg"
      >
        Complete & Save Session
      </button>
    </div>
  );
}