'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
  const [copied, setCopied] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(clip.title || 'Untitled Clip');
  const [hook, setHook] = useState(clip.hook || '');
  const [caption, setCaption] = useState(clip.caption || clip.socialCaption || '');

  const copy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const score = clip.score || clip.viralScore || 85;
  const scoreColor = score >= 90 ? 'bg-emerald-500' : score >= 80 ? 'bg-amber-500' : 'bg-slate-500';

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          {isEditing ? (
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium" />
          ) : (
            <h3 className="font-semibold text-slate-100">{title}</h3>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${scoreColor}`}>{score}</span>
            <span>{clip.duration || '0:15'}</span>
            <span>·</span>
            <span className="capitalize">{clip.style || 'viral'}</span>
          </div>
        </div>
        <button onClick={() => setIsEditing(!isEditing)} className="text-xs text-slate-500 hover:text-slate-300">
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {hook && (
        <div className="mb-3">
          <p className="text-xs text-slate-500 mb-1">Hook</p>
          {isEditing ? (
            <input value={hook} onChange={e => setHook(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm" />
          ) : (
            <p className="text-sm text-indigo-300">“{hook}”</p>
          )}
        </div>
      )}

      {caption && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-1">Caption</p>
          {isEditing ? (
            <textarea value={caption} onChange={e => setCaption(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm min-h-[60px]" />
          ) : (
            <p className="text-sm text-slate-300">{caption}</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => copy(hook, 'hook')} className="flex-1 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700">
          {copied === 'hook' ? 'Copied' : 'Copy Hook'}
        </button>
        <button onClick={() => copy(caption, 'cap')} className="flex-1 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700">
          {copied === 'cap' ? 'Copied' : 'Copy Caption'}
        </button>
      </div>
    </div>
  );
}
