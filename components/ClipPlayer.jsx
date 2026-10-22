'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${clip.title} (${clip.timestamp})`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      alert(`Successfully downloaded: ${clip.title} (${clip.format})`);
    }, 1500);
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleCopy}
            style={{ 
              padding: '6px 12px', 
              fontSize: '13px', 
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
    </div>
  );
}
