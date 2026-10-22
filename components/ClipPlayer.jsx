'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
  const [copiedInfo, setCopiedInfo] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Editable states initialized from clip props
  const [title, setTitle] = useState(clip.title);
  const [timestamp, setTimestamp] = useState(clip.timestamp);
  const [socialCaption, setSocialCaption] = useState(clip.socialCaption || '');

  const handleCopyInfo = () => {
    navigator.clipboard.writeText(`${title} (${timestamp})`);
    setCopiedInfo(true);
    setTimeout(() => setCopiedInfo(false), 2000);
  };

  const handleCopyCaption = () => {
    if (!socialCaption) return;
    navigator.clipboard.writeText(socialCaption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      alert(`Successfully downloaded: ${title} (${clip.format})`);
    }, 1500);
  };

  const scoreColor = (clip.viralScore || 90) >= 95 ? '#d93025' : '#f29900';

  // Dynamic aspect ratio styling for the preview box
  const getPreviewDimensions = () => {
    if (clip.format === 'landscape_16_9') return { width: '100%', maxWidth: '420px', height: '236px' };
    if (clip.format === 'square_1_1') return { width: '260px', height: '260px' };
    return { width: '220px', height: '390px' }; // Default 9:16 vertical
  };

  return (
    <div style={{ 
      border: '1px solid #e1e4e
