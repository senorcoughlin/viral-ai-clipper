'use client';

import { useState } from 'react';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClipping = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 2000);
  };

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Viral AI Clipper</h1>
      <p>Paste your long-form video link below to generate short clips instantly.</p>
      
      <form onSubmit={handleClipping} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        <input 
          type="text" 
          placeholder="Paste video URL here..." 
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          style={{ padding: '12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc' }}
          required
        />
        <button 
          type="submit" 
          style={{ padding: '12px', fontSize: '16px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          {isProcessing ? 'Processing Clips...' : 'Generate Viral Clips'}
        </button>
      </form>
    </main>
  );
}
