'use client';

import { useState, useEffect } from 'react';
import ClipPlayer from '../components/ClipPlayer';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [clipFormat, setClipFormat] = useState('shorts_9_16');
  const [aiStyle, setAiStyle] = useState('character_swap');
  const [autoSubtitles, setAutoSubtitles] = useState(true);
  const [aiHook, setAiHook] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    const savedHistory = localStorage.getItem('viral_clipper_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history from localStorage', e);
      }
    }
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem('viral_clipper_history', JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    if (!isProcessing) return;

    const stages = [
      'Initializing batch processing queue...',
      'Connecting to AI transcription server...',
      'Analyzing video audio and sentiment...',
      'Generating custom AI motion & restyle prompts...',
      'Rendering final video crop & captions...'
    ];

    let index = 0;
    setStatusMessage(stages[0]);

    const interval = setInterval(() => {
      index = (index + 1) % stages.length;
      setStatusMessage(stages[index]);
    }, 1200);

    return () => clearInterval(interval);
  }, [isProcessing]);

  const handleClipping = async (e) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    const urls = videoUrl.split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    setIsProcessing(true);
    setClips([]);

    try {
      let allGeneratedClips = [];

      for (const url of urls) {
        const response = await fetch('/api/clip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoUrl: url, clipFormat, autoSubtitles, aiHook, aiStyle }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Failed to process video');
        }

        const batchClips = result.data.generatedClips.map(c => ({
          ...c,
          title: `[${url.slice(0, 15)}...] ${c.title}`
        }));
        
        allGeneratedClips = [...allGeneratedClips, ...batchClips];
      }

      setClips(allGeneratedClips);

      setHistory((prev) => {
        const updated = [
          { id: Date.now(), url: videoUrl, format: clipFormat, aiStyle, clips: allGeneratedClips },
          ...prev.filter(item => item.url !== videoUrl)
        ].slice(0, 5);
        return updated;
      });
    } catch (error) {
      console.error('Error:', error);
      alert('Error processing video batch. Please try again.');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleReset = () => {
    setVideoUrl('');
    setClips([]);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('viral_clipper_history');
  };

  const loadHistoryItem = (item) => {
    setVideoUrl(item.url);
    setClipFormat(item.format);
    if (item.aiStyle) setAiStyle(item.aiStyle);
    setClips(item.clips);
  };

  const handleCopyAll = () => {
    if (clips.length === 0) return;
    const summaryText = clips.map((c, i) => (
      `Clip ${i + 1}: ${c.title} (${c.timestamp})\n` +
      `Format: ${c.format} | Viral Score: ${c.viralScore || 90}/100\n` +
      `Caption: ${c.socialCaption || 'N/A'}\n` +
      `AI Prompt: ${c.aiPrompt || 'N/A'}`
    )).join('\n\n---\n\n');

    navigator.clipboard.writeText(summaryText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportCSV = () => {
    if (clips.length === 0) return;
    const headers = ['Title', 'Timestamp', 'Format', 'Viral Score', 'Social Caption', 'AI Prompt'];
    const rows = clips.map(c => [
      `"${(c.title || '').replace(/"/g, '""')}"`,
      `"${c.timestamp || ''}"`,
      `"${c.format || ''}"`,
      `"${c.viralScore || ''}"`,
      `"${(c.socialCaption || '').replace(/"/g, '""')}"`,
      `"${(c.aiPrompt || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `viral_clips_batch_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '650px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <h1>Viral AI Clipper</h1>
        <p>Paste video links separated by commas to queue and generate short clips in batch.</p>
        
        <form onSubmit={handleClipping} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
          <textarea 
            placeholder="Paste video URLs here (comma-separated)..." 
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            rows={3}
            style={{ padding: '12px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc', resize: 'vertical' }}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>Output Format:</label>
              <select 
                value={clipFormat} 
                onChange={(e) => setClipFormat(e.target.value)}
                style={{ padding: '10px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff' }}
              >
                <option value="shorts_9_16">Shorts / TikTok (9:16)</option>
                <option value="landscape_16_9">Landscape (16:9)</option>
                <option value="square_1_1">Square (1:1)</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>AI Video Prompt Style:</label>
              <select 
                value={aiStyle} 
                onChange={(e) => setAiStyle(e.target.value)}
                style={{ padding: '10px', fontSize: '14px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff' }}
              >
                <option value="character_swap">🎭 Character Swap & Lip-Sync</option>
                <option value="anime_action">⚡ Anime Action / Fighter Style</option>
                <option value="kids_3d">🦖 3D Kids / Cute Animation</option>
                <option value="clean_viral">🎬 Clean 4K Studio Enhance</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: '#f9f9f9', borderRadius: '6px', border: '1px solid #eee' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>AI Enhancements:</label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoSubtitles} 
                onChange={(e) => setAutoSubtitles(e.target.checked)} 
              />
              Generate dynamic animated captions / subtitles
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={aiHook} 
                onChange={(e) => setAiHook(e.target.checked)} 
              />
              Add viral text hook intro overlay
            </label>
          </div>

          <button 
            type="submit" 
            style={{ padding: '12px', fontSize: '16px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing Batch Queue...' : 'Generate Batch Clips'}
          </button>
        </form>

        {isProcessing && (
          <div style={{ 
            marginTop: '20px', 
            padding: '14px', 
            backgroundColor: '#e6f4ff', 
            border: '1px solid #91caff', 
            borderRadius: '6px', 
            color: '#0958d9', 
            fontSize: '14px', 
            textAlign: 'center',
            fontWeight: '500'
          }}>
            ⚡ {statusMessage}
          </div>
        )}

        {clips.length > 0 && (
          <div style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ margin: 0 }}>Generated Batch Clips ({clips.length}):</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleCopyAll}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '12px', 
                    backgroundColor: copiedAll ? '#28a745' : '#6f42c1', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  {copiedAll ? '✓ Copied All!' : '📋 Copy All Data'}
                </button>
                <button 
                  onClick={handleExportCSV}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '12px', 
                    backgroundColor: '#0958d9', 
                    color: '#fff', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer' 
                  }}
                >
                  ⬇ Export CSV
                </button>
                <button 
                  onClick={handleReset}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '12px', 
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
            </div>
            <div style={{ marginTop: '15px' }}>
              {clips.map((clip, idx) => (
                <ClipPlayer key={`${clip.id}-${idx}`} clip={clip} />
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: '40px', borderTop: '1px solid #eaeaea', paddingTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '16px', margin: 0 }}>Recent Sessions</h3>
              <button 
                onClick={clearHistory}
                style={{ background: 'none', border: 'none', color: '#d9534f', fontSize: '12px', cursor: 'pointer' }}
              >
                Clear History
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map((item) => (
                <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9f9f9', padding: '10px', borderRadius: '6px', border: '1px solid #eee' }}>
                  <span style={{ fontSize: '13px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
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
      </div>

      <footer style={{ marginTop: '50px', borderTop: '1px solid #eaeaea', paddingTop: '20px', textAlign: 'center', fontSize: '13px', color: '#888' }}>
        <p style={{ margin: '0 0 5px 0' }}>Viral AI Clipper v0.4.0 • Powered by Next.js & Vercel</p>
        <p style={{ margin: 0 }}>Built for high-performance automated batch short-form video generation.</p>
      </footer>
    </main>
  );
}
