'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
  const [copied, setCopied] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [timestamp, setTimestamp] = useState(clip.timestamp);
  const [socialCaption, setSocialCaption] = useState(clip.socialCaption || '');
  const [aiPrompt, setAiPrompt] = useState(clip.aiPrompt || '');

  const copy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  const score = clip.viralScore || 90;
  const scoreColor = score >= 95 ? 'bg-red-600' : score >= 90 ? 'bg-orange-500' : 'bg-yellow-500';

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" />
              <input value={timestamp} onChange={e => setTimestamp(e.target.value)} className="w-32 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium truncate">{title}</h3>
                <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full ${scoreColor}`}>
                  {score}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{timestamp}</p>
            </>
          )}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <span className="text-[10px] bg-sky-900/60 text-sky-300 px-1.5 py-0.5 rounded">{clip.format}</span>
            {clip.subtitlesEnabled && <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-1.5 py-0.5 rounded">Captions</span>}
            {clip.hookEnabled && <span className="text-[10px] bg-orange-900/60 text-orange-300 px-1.5 py-0.5 rounded">Hook</span>}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setShowPreview(!showPreview)} className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700">{showPreview ? 'Hide' : 'Preview'}</button>
          <button onClick={() => setIsEditing(!isEditing)} className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700">{isEditing ? 'Done' : 'Edit'}</button>
          <button onClick={() => copy(`${title} (${timestamp})`, 'info')} className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500">{copied === 'info' ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      {showPreview && (
        <div className="mt-3 flex justify-center">
          <div className="w-40 h-72 bg-black rounded-xl border border-slate-700 flex flex-col justify-between p-3 text-center text-xs">
            {clip.hookEnabled && <div className="bg-pink-600 rounded px-1 py-0.5 font-bold">WAIT FOR IT</div>}
            <div className="text-3xl">🎬</div>
            {clip.subtitlesEnabled && <div className="bg-black/80 text-yellow-300 rounded px-1 py-0.5 font-bold">THIS CHANGES EVERYTHING</div>}
          </div>
        </div>
      )}

      {(socialCaption || isEditing) && (
        <div className="mt-3 flex items-center gap-2 bg-slate-950/50 rounded-lg px-3 py-2">
          {isEditing ? (
            <input value={socialCaption} onChange={e => setSocialCaption(e.target.value)} className="flex-1 bg-transparent text-xs outline-none" />
          ) : (
            <p className="flex-1 text-xs italic text-slate-300 truncate">"{socialCaption}"</p>
          )}
          <button onClick={() => copy(socialCaption, 'cap')} className="text-[10px] px-2 py-1 rounded bg-purple-600">{copied === 'cap' ? 'Copied' : 'Copy'}</button>
        </div>
      )}

      {(aiPrompt || isEditing) && (
        <div className="mt-2 flex items-center gap-2 bg-indigo-950/40 rounded-lg px-3 py-2">
          {isEditing ? (
            <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} className="flex-1 bg-transparent text-xs outline-none" />
          ) : (
            <p className="flex-1 text-xs text-indigo-300"><strong>AI:</strong> {aiPrompt}</p>
          )}
          <button onClick={() => copy(aiPrompt, 'prompt')} className="text-[10px] px-2 py-1 rounded bg-indigo-600">{copied === 'prompt' ? 'Copied' : 'Copy'}</button>
        </div>
      )}
    </div>
  );
}
