'use client';

import { useState, useEffect } from 'react';
import ClipPlayer from '../components/ClipPlayer';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [clipFormat, setClipFormat] = useState('shorts_9_16');
  const [autoSubtitles, setAutoSubtitles] = useState(true);
  const [aiHook, setAiHook] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [clips, setClips] = useState([]);
  const [history, setHistory] = useState([]);

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
      'Detecting peak viral moments & highlights...',
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

    // Support comma-separated batch URLs
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
          body: JSON.stringify({ videoUrl: url, clipFormat, autoSubtitles, aiHook }),
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
          { id: Date.now(), url: videoUrl, format: clipFormat, clips: allGeneratedClips },
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
    setClips(item.clips);
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>Generated Batch Clips ({clips.length}):</h2>
              <button 
                onClick={handleReset}
                style={{ 
                  padding: '6px 12px', 
                  fontSize: '13px', 
                  backgroundColor: '#e1e4e8', 
                  color: '#333', 
                  border: 'none', 
                  borderRadius
