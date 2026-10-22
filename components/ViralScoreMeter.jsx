'use client';

import { useEffect, useState } from 'react';

const C = 264; // circumference for r=42 in a 100-unit viewBox

export function scoreTier(score) {
  if (score >= 95) return { color: '#C6FF3D', label: 'Post this one' };
  if (score >= 90) return { color: '#7C5CFF', label: 'Strong' };
  return { color: '#FFB64D', label: 'Good — sharpen the hook' };
}

export default function ViralScoreMeter({ score = 0, size = 56, stroke = 11 }) {
  const clamped = Math.min(100, Math.max(0, score));
  const target = Math.round(C - (C * clamped) / 100);
  const [offset, setOffset] = useState(C);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const { color, label } = scoreTier(clamped);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Viral score ${clamped}: ${label}`}>
      <circle cx="50" cy="50" r="42" fill="none" stroke="#23232E" strokeWidth={stroke} />
      <circle
        cx="50" cy="50" r="42" fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)' }}
      />
      <text x="50" y="59" textAnchor="middle" fontSize="30" fontWeight="600" fill="#fff" className="font-mono">{clamped}</text>
    </svg>
  );
}
