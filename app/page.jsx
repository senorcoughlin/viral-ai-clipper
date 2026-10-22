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

  // Load saved history from localStorage on mount
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

  // Save history to localStorage whenever it updates
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem('viral_clipper_history', JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    if (!isProcessing) return;

    const stages = [
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

    setIsProcessing(true);
    setClips([]);

    try {
      const response = await fetch('/api/clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl, clipFormat, autoSubtitles, aiHook }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to process video');
      }

      const newClips = result.data.generatedClips;
      setClips(newClips);

      setHistory((prev) => {
        const updated = [
          { id: Date.now(), url: videoUrl, format: clipFormat, clips: newClips },
          ...prev.filter(item => item.url !== videoUrl) // Prevent duplicates
        ].slice(0, 5); // Keep last 5 entries
        return updated;
      });
    } catch (error) {
      console.error('Error:', error);
      alert('Error processing video. Please try again.');
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

