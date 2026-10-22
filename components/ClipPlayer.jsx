'use client';

import { useState } from 'react';

export default function ClipPlayer({ clip }) {
  const [copiedInfo, setCopiedInfo] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [title, setTitle] = useState(clip.title);
  const [timestamp, setTimestamp] = useState(clip.timestamp);
  const [socialCaption, setSocialCaption] = useState(clip.socialCaption || '');
  const [aiPrompt, setAiPrompt] = useState(clip.aiPrompt || '');

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

  const handleCopyPrompt = () => {
    if (!aiPrompt) return;
    navigator.clipboard.writeText(aiPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      alert(`Successfully downloaded: ${title} (${clip.format})`);
    }, 1500);
  };

  const scoreColor = (clip.viralScore || 90) >= 95 ? '#d93025' : '#f29900';

  const getPreviewDimensions = () => {
    if (clip.format === 'landscape_16_9') return { width: '100%', maxWidth: '420px', height: '236px' };
    if (clip.format === 'square_1_1') return { width: '260px', height: '260px' };
    return { width: '220px', height: '390px' };
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
      gap: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
              <input 
                type="text" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                style={{ padding: '6px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
                placeholder="Clip Title"
              />
              <input 
                type="text" 
                value={timestamp} 
                onChange={(e) => setTimestamp(e.target.value)}
                style={{ padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }}
                placeholder="00:00 - 00:30"
              />
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>{title}</h3>
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
              <span style={{ fontSize: '14px', color: '#586069' }}>Timestamp: {timestamp}</span>
            </>
          )}
          
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

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setShowPreview(!showPreview)}
            style={{ 
              padding: '6px 10px', 
              fontSize: '12px', 
              backgroundColor: showPreview ? '#444d56' : '#eff3f6', 
              color: showPreview ? '#fff' : '#24292e', 
              border: '1px solid #d1d5da', 
              borderRadius: '4px', 
              cursor: 'pointer'
            }}
          >
            {showPreview ? 'Hide Preview' : '▶ Preview'}
          </button>
          <button 
            onClick={() => setIsEditing(!isEditing)}
            style={{ 
              padding: '6px 10px', 
              fontSize: '12px', 
              backgroundColor: isEditing ? '#0366d6' : '#eff3f6', 
              color: isEditing ? '#fff' : '#24292e', 
              border: '1px solid #d1d5da', 
              borderRadius: '4px', 
              cursor: 'pointer'
            }}
          >
            {isEditing ? '✓ Save' : '✎ Edit'}
          </button>
          <button 
            onClick={handleCopyInfo}
            style={{ 
              padding: '6px 10px', 
              fontSize: '12px', 
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
              padding: '6px 10px', 
              fontSize: '12px', 
              backgroundColor: downloading ? '#6c757d' : '#28a745', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer' 
            }}
            disabled={downloading}
          >
            {downloading ? 'Saving...' : 'Download MP4'}
          </button>
        </div>
      </div>

      {showPreview && (
        <div style={{ 
          marginTop: '10px', 
          padding: '16px', 
          backgroundColor: '#1b1f23', 
          borderRadius: '8px', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}>
          <div style={{ 
            ...getPreviewDimensions(), 
            backgroundColor: '#000', 
            borderRadius: '10px', 
            border: '2px solid #333', 
            position: 'relative', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'space-between', 
            padding: '14px',
            boxSizing: 'border-box',
            backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(20,20,30,0.9) 50%, rgba(0,0,0,0.8) 100%)',
            color: '#fff',
            textAlign: 'center'
          }}>
            {clip.hookEnabled ? (
              <div style={{ 
                backgroundColor: '#ff0050', 
                color: '#fff', 
                padding: '6px 10px', 
                borderRadius: '6px', 
                fontSize: '12px', 
                fontWeight: 'bold', 
                textTransform: 'uppercase',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
              }}>
                ⚡ WAIT FOR IT... ({timestamp})
              </div>
            ) : <div />}

            <div style={{ margin: 'auto 0' }}>
              <div style={{ fontSize: '28px', marginBottom: '6px' }}>🎬</div>
              <div style={{ fontSize: '12px', color: '#bbb' }}>AI Crop Preview ({clip.format})</div>
            </div>

            {clip.subtitlesEnabled ? (
              <div style={{ 
                backgroundColor: 'rgba(0, 0, 0, 0.75)', 
                color: '#ffeb3b', 
                padding: '6px 8px', 
                borderRadius: '4px', 
                fontSize: '13px', 
                fontWeight: '800', 
                textShadow: '1px 1px 2px #000',
                border: '1px solid rgba(255,235,59,0.3)'
              }}>
                "THIS CHANGES EVERYTHING!" 🔥
              </div>
            ) : <div />}
          </div>
        </div>
      )}

      {(socialCaption || isEditing) && (
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
          {isEditing ? (
            <input 
              type="text" 
              value={socialCaption} 
              onChange={(e) => setSocialCaption(e.target.value)}
              style={{ flex: 1, padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #ccc' }}
              placeholder="Enter custom social caption and hashtags..."
            />
          ) : (
            <div style={{ fontSize: '13px', color: '#24292e', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              "{socialCaption}"
            </div>
          )}
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

      {/* AI Video-to-Video & Motion Prompt Box */}
      {(aiPrompt || isEditing) && (
        <div style={{ 
          backgroundColor: '#f0f4ff', 
          border: '1px solid #adc6ff', 
          borderRadius: '6px', 
          padding: '10px 12px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '10px' 
        }}>
          {isEditing ? (
            <input 
              type="text" 
              value={aiPrompt} 
              onChange={(e) => setAiPrompt(e.target.value)}
              style={{ flex: 1, padding: '6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #91caff' }}
              placeholder="Enter AI Video-to-Video / Motion Prompt..."
            />
          ) : (
            <div style={{ fontSize: '12px', color: '#1d39c4', lineHeight: '1.4' }}>
              <strong>🤖 AI Restyle Prompt:</strong> {aiPrompt}
            </div>
          )}
          <button 
            onClick={handleCopyPrompt}
            style={{ 
              padding: '4px 10px', 
              fontSize: '12px', 
              backgroundColor: copiedPrompt ? '#28a745' : '#2f54eb', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {copiedPrompt ? 'Copied Prompt!' : 'Copy AI Prompt'}
          </button>
        </div>
      )}
    </div>
  );
}
