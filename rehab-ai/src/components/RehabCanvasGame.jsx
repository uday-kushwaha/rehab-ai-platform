import React, { useEffect, useRef, useState } from 'react';

export default function RehabCanvasGame({ normalizedInput = 0, isFormValid = true, onRepComplete }) {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [hasStarted, setHasStarted] = useState(false);

  // Advanced Game State
  const gameStateRef = useRef({
    playerY: 280,
    groundY: 280,
    skyY: 80,
    targetOrb: { x: 600, y: 80, radius: 16, collected: false, phase: 0 },
    particles: [],
    floatingTexts: [],
    bgStars: Array.from({ length: 50 }, () => ({
      x: Math.random() * 600,
      y: Math.random() * 400,
      size: Math.random() * 2,
      speed: Math.random() * 2 + 0.5
    })),
    trail: [], // Engine jet trail
    holdTimer: 0.0,
    requiredHold: 1.5,
    inRepZone: false,
    score: 0,
    streak: 0,
    shake: 0 // Screen shake effect
  });

  // --- AUDIO SYNTHESIS (Zero Assets Needed) ---
  const playSound = (type) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'charge') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.5);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.5);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      osc.start();
      osc.stop(ctx.currentTime + 1.5);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  };

  // Init Audio on first click (Browser Policy)
  const handleStart = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    setHasStarted(true);
  };

  useEffect(() => {
    if (!hasStarted) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let lastTime = performance.now();

    const loop = (currentTime) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      const state = gameStateRef.current;

      // 1. UPDATE PHYSICS & LOGIC
      // Screen Shake decay
      if (state.shake > 0) state.shake *= 0.9;

      if (!isFormValid) {
        if (state.streak > 0) playSound('error');
        state.streak = 0; // Reset streak on bad form
        state.shake = Math.min(state.shake + 2, 10);
      } else {
        const targetY = state.groundY - (normalizedInput * (state.groundY - state.skyY));
        state.playerY += (targetY - state.playerY) * 0.15;

        // Trail logic
        state.trail.unshift({ x: 90, y: state.playerY });
        if (state.trail.length > 15) state.trail.pop();

        // Orb Logic
        state.targetOrb.x -= (2 + (state.streak * 0.2)); // Speeds up slightly with streak
        state.targetOrb.phase += 5 * dt;
        if (state.targetOrb.x < -40) {
          state.targetOrb.x = canvas.width + 50;
          state.targetOrb.collected = false;
        }

        // Isometric Hold Logic
        if (normalizedInput >= 0.90 && !state.inRepZone && !state.targetOrb.collected) {
          if (state.holdTimer === 0) playSound('charge');
          state.holdTimer += dt;
          
          if (state.holdTimer >= state.requiredHold) {
            // SUCCESSFUL REP
            state.inRepZone = true;
            state.targetOrb.collected = true;
            state.holdTimer = 0;
            state.streak += 1;
            const points = 100 * state.streak;
            state.score += points;
            
            playSound('success');
            if (onRepComplete) onRepComplete();
            
            // Visual Juice: Floating text & Explosion
            state.floatingTexts.push({ x: 90, y: state.playerY - 20, text: `+${points} ${state.streak > 1 ? 'COMBO!' : ''}`, alpha: 1 });
            for (let i = 0; i < 25; i++) {
              const angle = (Math.PI * 2 * i) / 25;
              const speed = 2 + Math.random() * 5;
              state.particles.push({
                x: 90, y: state.playerY,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 1.0, color: state.streak >= 3 ? '#f97316' : '#38bdf8'
              });
            }
          }
        } else if (normalizedInput < 0.20) {
          state.inRepZone = false;
          state.holdTimer = 0;
        } else if (normalizedInput < 0.90 && !state.inRepZone) {
          state.holdTimer = Math.max(0, state.holdTimer - dt * 2);
        }
      }

      // Update Background Stars
      state.bgStars.forEach(star => {
        star.x -= star.speed;
        if (star.x < 0) {
          star.x = canvas.width;
          star.y = Math.random() * canvas.height;
        }
      });

      // Update Particles
      state.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= dt * 1.5; });
      state.particles = state.particles.filter(p => p.life > 0);

      // Update Floating Text
      state.floatingTexts.forEach(ft => { ft.y -= dt * 30; ft.alpha -= dt; });
      state.floatingTexts = state.floatingTexts.filter(ft => ft.alpha > 0);

      // 2. RENDER SCENE
      ctx.save();
      // Apply screen shake
      if (state.shake > 0.5) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }

      // Space Background Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#020617'); // Dark slate
      grad.addColorStop(1, '#1e1b4b'); // Deep indigo
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Stars
      ctx.fillStyle = '#ffffff';
      state.bgStars.forEach(star => {
        ctx.globalAlpha = star.size / 2;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Draw Target Orb
      if (!state.targetOrb.collected) {
        const floatY = state.targetOrb.y + Math.sin(state.targetOrb.phase) * 8;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#facc15';
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(state.targetOrb.x, floatY, state.targetOrb.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw Trail
      if (state.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(state.trail[0].x, state.trail[0].y);
        for (let i = 1; i < state.trail.length; i++) {
          ctx.lineTo(state.trail[i].x - (i * 4), state.trail[i].y);
        }
        ctx.strokeStyle = state.streak >= 3 ? 'rgba(249, 115, 22, 0.4)' : 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw Glider
      ctx.translate(90, state.playerY);
      ctx.fillStyle = !isFormValid ? '#ef4444' : (state.streak >= 3 ? '#f97316' : '#38bdf8');
      ctx.shadowBlur = 15;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-16, -14);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-16, 14);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Hold Ring
      if (state.holdTimer > 0) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 4;
        ctx.beginPath();
        const progress = state.holdTimer / state.requiredHold;
        ctx.arc(0, 0, 32, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * progress));
        ctx.stroke();
      }
      ctx.restore(); // Restore from Glider translation & Shake

      // Draw Particles
      state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Draw Floating Text
      state.floatingTexts.forEach(ft => {
        ctx.fillStyle = `rgba(52, 211, 153, ${ft.alpha})`;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(ft.text, ft.x, ft.y);
      });

      // UI Overlay (Score & Streak)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`Score: ${state.score}`, 16, 24);
      if (state.streak >= 2) {
        ctx.fillStyle = '#f97316'; // Orange
        ctx.fillText(`🔥 ${state.streak}x STREAK!`, 16, 48);
      }

      // Bad Form Warning
      if (!isFormValid) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ POSTURE FAULT! STREAK RESET!', canvas.width / 2, canvas.height - 15);
        ctx.textAlign = 'start';
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [normalizedInput, isFormValid, hasStarted]);

  return (
    <div className="relative w-full h-full">
      {!hasStarted && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm rounded-xl">
          <button 
            onClick={handleStart}
            className="px-6 py-3 bg-teal-500 text-slate-900 font-bold rounded-xl shadow-[0_0_20px_rgba(20,184,166,0.5)] hover:scale-105 transition-transform"
          >
            ▶ Start Game Arena
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={600}
        height={380}
        className="w-full h-full block rounded-xl"
      />
    </div>
  );
}   