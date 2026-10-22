'use client';

import { useState } from 'react';
import ClipPlayer from '../components/ClipPlayer';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [clipFormat, setClipFormat] = useState('shorts_9_16');
  const [isProcessing, setIsProcessing] = useState(false);
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);

  const handleClipping = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    setIsProcessing(true);
    setClips([]);

    try {
      const response = await fetch('/api/clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl, clipFormat }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to process video');
      }

      const newClips = result.data.generatedClips;
      setClips(newClips);

      // Add to session history
      setHistory((prev) => [
        { id: Date.now(), url: videoUrl, format: clipFormat, clips: newClips },
        ...prev.slice(0, 4), // Keep last 5 entries
      ]);
    } catch (error) {
      console.error('Error:', error);
      alert('Error processing video. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setVideoUrl('');
    setClips([]);
  };

  const loadHistoryItem = (item) => {
    setVideoUrl(item.url);
    setClipFormat(item.format);
    setClips(item.clips);
  };

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '650px', margin: '0 auto' }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>Output Format:</label>
          <select 
            value={clipFormat} 
            onChange={(e) => setClipFormat(e.target.value)}
            style={{ padding: '10px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff' }}
          >
            <option value="shorts_9_16">YouTube Shorts / TikTok (9:16 Vertical)</option>
            <option value="landscape_16_9">Standard Landscape (16:9)</option>
            <option value="square_1_1">Square (1:1)</option>
          </select>
        </div>

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Generated Clips:</h2>
            <button 
              onClick={handleReset}
              style={{ 
                padding: '6px 12px', 
                fontSize: '13px', 
                backgroundColor: '#e1e4e8', 
                color: '#333', 
                border: 'none', 
                borderRadius: '4px', 
                cursor: 'pointer' 
              }}
            >
              Clear Results
            </button>
          </div>
          <div style={{ marginTop: '15px' }}>
            {clips.map((clip) => (
              <ClipPlayer key={clip.id} clip={clip} />
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: '40px', borderTop: '1px solid #eaeaea', paddingTop: '20px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Recent Sessions</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map((item) => (
              <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', padding: '10px', borderRadius: '6px', border: '1px solid #eee' }}>
                <span style={{ fontSize: '13px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                  {item.url} ({item.format})
                </span>
                <button 
                  onClick={() => loadHistoryItem(item)}
                  style={{ padding: '4px 10px', fontSize: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Load
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
