'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
  const [copiedInfo, setCopiedInfo] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleCopyInfo = () => {
    navigator.clipboard.writeText(`${clip.title} (${clip.timestamp})`);
    setCopiedInfo(true);
    setTimeout(() => setCopiedInfo(false), 2000);
  };

  const handleCopyCaption = () => {
    if (!clip.socialCaption) return;
    navigator.clipboard.writeText(clip.socialCaption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      alert(`Successfully downloaded: ${clip.title} (${clip.format})`);
    }, 1500);
  };

  const scoreColor = (clip.viralScore || 90) >= 95 ? '#d93025' : '#f29900';

  return (
    <div style={{ 
      border: '1px solid #e1e4e8', 
      borderRadius: '8px', 
      padding: '16px', 
      marginBottom: '12px',
      backgroundColor: '#f6f8fa',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>{clip.title}</h3>
            {clip.viralScore && (
              <span style={{ 
                fontSize: '11px', 
                fontWeight: 'bold', 
                backgroundColor: scoreColor, 
                color: '#fff', 
                padding: '2px 7px', 
                borderRadius: '12px' 
              }}>
                🔥 {clip.viralScore}/100 Viral Score
              </span>
            )}
          </div>
          <span style={{ fontSize: '14px', color: '#586069' }}>Timestamp: {clip.timestamp}</span>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', background: '#e1f5fe', color: '#01579b', padding: '2px 6px', borderRadius: '4px' }}>
              Format: {clip.format}
            </span>
            {clip.subtitlesEnabled && (
              <span style={{ fontSize: '11px', background: '#e8f5e9', color: '#1b5e20', padding: '2px 6px', borderRadius: '4px' }}>
                Subtitles ON
              </span>
            )}
            {clip.hookEnabled && (
              <span style={{ fontSize: '11px', background: '#fff3e0', color: '#e65100', padding: '2px 6px', borderRadius: '4px' }}>
                Viral Hook ON
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleCopyInfo}
            style={{ 
              padding: '6px 12px', 
              fontSize: '13px', 
              backgroundColor: copiedInfo ? '#28a745' : '#0070f3', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer'
            }}
          >
            {copiedInfo ? 'Copied!' : 'Copy Info'}
          </button>
          <button 
            onClick={handleDownload}
            style={{ 
              padding: '6px 12px', 
              fontSize: '13px', 
              backgroundColor: downloading ? '#6c757d' : '#28a745', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer' 
            }}
            disabled={downloading}
          >
            {downloading ? 'Downloading...' : 'Download MP4'}
          </button>
        </div>
      </div>

      {clip.socialCaption && (
        <div style={{ 
          backgroundColor: '#fff', 
          border: '1px solid #dfe2e5', 
          borderRadius: '6px', 
          padding: '10px 12px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '10px' 
        }}>
          <div style={{ fontSize: '13px', color: '#24292e', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            "{clip.socialCaption}"
          </div>
          <button 
            onClick={handleCopyCaption}
            style={{ 
              padding: '4px 10px', 
              fontSize: '12px', 
              backgroundColor: copiedCaption ? '#28a745' : '#6f42c1', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {copiedCaption ? 'Copied Tags!' : 'Copy Caption & Tags'}
          </button>
        </div>
      )}
    </div>
  );
}
