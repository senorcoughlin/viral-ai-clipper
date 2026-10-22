'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
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
