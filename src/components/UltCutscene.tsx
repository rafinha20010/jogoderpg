'use client';

import { useEffect, useState, useCallback } from 'react';
import { GameState } from '@/lib/types';
import { CLASSES } from '@/lib/gameData';

interface UltCutsceneProps {
  ult: NonNullable<GameState['activeUlt']>;
  onComplete: () => void;
}

export default function UltCutscene({ ult, onComplete }: UltCutsceneProps) {
  const [phase, setPhase] = useState<'intro' | 'lines' | 'name' | 'flash' | 'done'>('intro');
  const [lineIndex, setLineIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const skip = useCallback(() => {
    if (skipped) return;
    setSkipped(true);
    setVisible(false);
    setTimeout(onComplete, 300);
  }, [skipped, onComplete]);

  const isBossUlt = !!(ult as any).isBossUlt;

  useEffect(() => {
    setVisible(true);
    const t1 = setTimeout(() => setPhase('lines'), 600);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (skipped) return;
    if (phase !== 'lines') return;
    if (lineIndex < ult.ultLines.length - 1) {
      const t = setTimeout(() => setLineIndex(i => i + 1), 1100);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setPhase('name'), 1200);
      return () => clearTimeout(t);
    }
  }, [phase, lineIndex, ult.ultLines.length, skipped]);

  useEffect(() => {
    if (skipped) return;
    if (phase !== 'name') return;
    const t = setTimeout(() => setPhase('flash'), 1400);
    return () => clearTimeout(t);
  }, [phase, skipped]);

  useEffect(() => {
    if (skipped) return;
    if (phase !== 'flash') return;
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 500);
    }, 900);
    return () => clearTimeout(t);
  }, [phase, onComplete, skipped]);

  const cls = !isBossUlt ? CLASSES[ult.classType] : null;
  const bossName = (ult as any).bossName ?? ult.playerName;

  return (
    <div
      onClick={skip}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: ult.ultBg,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.5s ease',
        overflow: 'hidden',
        flexDirection: 'column',
        gap: 0,
        cursor: 'pointer',
      }}
    >
      {/* Skip hint */}
      <div style={{
        position: 'absolute',
        bottom: 28,
        right: 32,
        fontFamily: '"Cinzel", serif',
        fontSize: 13,
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: '0.15em',
        zIndex: 10,
        pointerEvents: 'none',
        animation: 'ultPulse 1.5s ease-in-out infinite alternate',
      }}>
        CLIQUE PARA PULAR ▶
      </div>

      {/* Animated bg rings */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: `${i * 200}px`, height: `${i * 200}px`,
            marginLeft: `${-i * 100}px`, marginTop: `${-i * 100}px`,
            borderRadius: '50%',
            border: `${isBossUlt ? 2 : 1}px solid ${ult.ultColor}`,
            opacity: phase === 'name' || phase === 'flash' ? (isBossUlt ? 0.5 : 0.3) : 0,
            transform: phase === 'flash' ? `scale(${1 + i * 0.3})` : 'scale(1)',
            transition: `all ${0.6 + i * 0.15}s ease`,
          }} />
        ))}
        {Array.from({ length: isBossUlt ? 30 : 20 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            top: `${10 + Math.random() * 80}%`,
            left: `${5 + Math.random() * 90}%`,
            width: `${(isBossUlt ? 3 : 2) + Math.random() * 4}px`,
            height: `${(isBossUlt ? 3 : 2) + Math.random() * 4}px`,
            borderRadius: '50%',
            background: ult.ultColor,
            opacity: (phase === 'lines' || phase === 'name') ? 0.6 + Math.random() * 0.4 : 0,
            transition: `opacity ${0.3 + Math.random() * 0.5}s ease`,
            boxShadow: `0 0 ${isBossUlt ? 12 : 8}px ${ult.ultColor}`,
          }} />
        ))}
        {isBossUlt && (phase === 'name' || phase === 'flash') && Array.from({ length: 8 }).map((_, i) => (
          <div key={`crack-${i}`} style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: `${150 + Math.random() * 300}px`,
            height: '2px',
            background: `linear-gradient(to right, ${ult.ultColor}, transparent)`,
            transform: `rotate(${i * 45 + Math.random() * 20}deg) translateX(${30 + Math.random() * 50}px)`,
            opacity: phase === 'flash' ? 0 : 0.8,
            transition: 'opacity 0.3s ease',
          }} />
        ))}
      </div>

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '20px 32px',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
        opacity: phase === 'intro' ? 0 : 1,
        transform: phase === 'intro' ? 'translateY(-20px)' : 'translateY(0)',
        transition: 'all 0.5s ease',
      }}>
        <span style={{ fontSize: isBossUlt ? 40 : 32 }}>{ult.ultEmoji}</span>
        <div>
          {isBossUlt ? (
            <>
              <div style={{ fontFamily: '"Cinzel", serif', fontSize: 11, color: '#ff5e5e', letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: 2 }}>
                ⚠️ BOSS ULTIMATE
              </div>
              <div style={{ fontFamily: '"Cinzel", serif', fontSize: 20, color: '#fff', letterSpacing: '0.1em' }}>
                {bossName}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: '"Cinzel", serif', fontSize: 13, color: ult.ultColor, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2 }}>
                {cls?.name}
              </div>
              <div style={{ fontFamily: '"Cinzel", serif', fontSize: 18, color: '#fff', letterSpacing: '0.1em' }}>
                {ult.playerName}
              </div>
            </>
          )}
        </div>
        <div style={{
          marginLeft: 'auto',
          fontFamily: '"Cinzel", serif', fontSize: 12,
          color: ult.ultColor, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.8,
        }}>
          {isBossUlt ? '💀 ULTIMATE' : 'ULTIMATE'}
        </div>
      </div>

      {/* Center content */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 32, padding: '0 40px', textAlign: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          fontSize: phase === 'name' || phase === 'flash' ? (isBossUlt ? '140px' : '120px') : (isBossUlt ? '100px' : '80px'),
          filter: `drop-shadow(0 0 ${isBossUlt ? 60 : 40}px ${ult.ultColor}) drop-shadow(0 0 ${isBossUlt ? 100 : 80}px ${ult.ultColor})`,
          transition: 'all 0.6s ease',
          opacity: phase === 'intro' ? 0 : 1,
          transform: phase === 'flash' ? 'scale(1.4)' : phase === 'name' ? 'scale(1.15)' : 'scale(1)',
        }}>
          {ult.ultEmoji}
        </div>

        <div style={{ minHeight: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {phase === 'lines' && ult.ultLines.map((line, i) => (
            <div key={i} style={{
              fontFamily: '"Cinzel", serif',
              fontSize: `clamp(${isBossUlt ? 16 : 14}px, 2.5vw, ${isBossUlt ? 24 : 20}px)`,
              color: i === lineIndex ? (isBossUlt ? '#ff6b6b' : '#fff') : 'rgba(255,255,255,0.35)',
              letterSpacing: '0.12em',
              opacity: i <= lineIndex ? 1 : 0,
              transform: i <= lineIndex ? 'translateY(0)' : 'translateY(15px)',
              transition: 'all 0.4s ease',
              textShadow: i === lineIndex ? `0 0 30px ${ult.ultColor}` : 'none',
              fontStyle: 'italic',
            }}>
              {line}
            </div>
          ))}
        </div>

        {(phase === 'name' || phase === 'flash') && (
          <div style={{
            fontFamily: '"Cinzel", serif',
            fontSize: `clamp(${isBossUlt ? 32 : 28}px, 6vw, ${isBossUlt ? 72 : 64}px)`,
            fontWeight: 900,
            color: ult.ultColor,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            textShadow: `0 0 60px ${ult.ultColor}, 0 0 120px ${ult.ultColor}${isBossUlt ? `, 0 0 200px ${ult.ultColor}` : ''}`,
            animation: 'ultPulse 0.5s ease-in-out infinite alternate',
            opacity: phase === 'flash' ? 0 : 1,
            transition: 'opacity 0.4s ease',
            lineHeight: 1.1,
          }}>
            {isBossUlt && <span style={{ fontSize: '60%', display: 'block', marginBottom: 4 }}>⚠️</span>}
            {ult.ultName}
          </div>
        )}

        {phase === 'flash' && (
          <div style={{
            position: 'fixed', inset: 0,
            background: `radial-gradient(ellipse at center, ${ult.ultColor}${isBossUlt ? '99' : '66'} 0%, transparent 70%)`,
            animation: 'ultFlash 0.8s ease-out forwards',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: isBossUlt ? 5 : 3,
        background: `linear-gradient(to right, transparent, ${ult.ultColor}, transparent)`,
        opacity: phase !== 'intro' ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }} />

      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 2px)',
        zIndex: 2,
      }} />

      <style>{`
        @keyframes ultPulse {
          from { letter-spacing: 0.2em; }
          to { letter-spacing: 0.28em; text-shadow: 0 0 80px ${ult.ultColor}, 0 0 160px ${ult.ultColor}; }
        }
        @keyframes ultFlash {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}