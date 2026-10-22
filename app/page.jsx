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
          sourceUrl: url,
          title: urls.length > 1 ? `[${url.slice(0, 15)}...] ${c.title}` : c.title
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
