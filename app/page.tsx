'use client';

import { useState } from 'react';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClipping = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 3000);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white px-4 py-8 flex flex-col justify-between">
      <div className="max-w-md mx-auto w-full space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium">
            ✨ Next-Gen AI Visual Clipper
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Turn Raw Videos Into Viral Shorts</h1>
          <p className="text-sm text-neutral-400">
            Auto-crop action, dance, and streams. Add AI character swaps instantly.
          </p>
        </div>

        {/* Input Box Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-xl space-y-4">
          <form onSubmit={handleClipping} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Paste YouTube Link or MP4 URL
              </label>
              <input
                type="text"
                placeholder="https://youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl text-sm shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isProcessing ? 'Analyzing Video AI...' : 'Generate AI Clips →'}
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-neutral-800"></div>
            <span className="flex-shrink mx-4 text-neutral-600 text-xs uppercase tracking-wider">or upload file</span>
            <div className="flex-grow border-t border-neutral-800"></div>
          </div>

          <label className="border-2 border-dashed border-neutral-800 hover:border-neutral-700 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-neutral-950/50">
            <span className="text-xs text-neutral-300 font-medium">📁 Tap to upload video from phone</span>
            <span className="text-[10px] text-neutral-500 mt-0.5">MP4, MOV up to 2GB</span>
            <input type="file" className="hidden" accept="video/*" />
          </label>
        </div>

        {/* Checkpoints */}
        <div className="grid grid-cols-2 gap-3 text-xs text-neutral-400 pt-2">
          <div className="flex items-center gap-2 bg-neutral-900/50 border border-neutral-800/60 p-2.5 rounded-xl">
            <span className="text-green-400">✓</span> Smart Action Tracking
          </div>
          <div className="flex items-center gap-2 bg-neutral-900/50 border border-neutral-800/60 p-2.5 rounded-xl">
            <span className="text-green-400">✓</span> AI Character Remix
          </div>
        </div>

      </div>

      <footer className="text-center text-xs text-neutral-600 pt-6">
        Powered by High-Performance Serverless GPU AI
      </footer>
    </main>
  );
}
