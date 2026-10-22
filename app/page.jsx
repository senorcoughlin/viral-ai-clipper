'use client';

import { useState } from 'react';

function ClipItem({ clip }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${clip.title} (${clip.timestamp})`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ 
      border: '1px solid #e1e4e8', 
      borderRadius: '8px', 
      padding: '16px', 
      marginBottom: '12px',
      backgroundColor: '#f6f8fa',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{clip.title}</h3>
          <span style={{ fontSize: '14px', color: '#586069' }}>Timestamp: {clip.timestamp}</span>
        </div>
        <button 
          onClick={handleCopy}
          style={{ 
            padding: '6px 12px', 
            fontSize: '14px', 
            backgroundColor: copied ? '#28a745' : '#0070f3', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {copied ? 'Copied!' : 'Copy Info'}
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [clips, setClips] = useState([]);

  const handleClipping = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setClips([]);

    try {
      const response = await fetch('/api/clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to process video');
      }

      setClips(result.data.generatedClips);
    } catch (error) {
      console.error('Error:', error);
      alert('Error processing video. Please try again.');
    } finally {
      setIsProcessing(false);
    }
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
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing Clips...' : 'Generate Viral Clips'}
        </button>
      </form>

      {clips.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h2>Generated Clips:</h2>
          <div style={{ marginTop: '15px' }}>
            {clips.map((clip) => (
              <ClipItem key={clip.id} clip={clip} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
