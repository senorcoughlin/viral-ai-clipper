import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const videoUrl = body.videoUrl;

    if (!videoUrl) {
      return NextResponse.json({ success: false, message: 'URL required' }, { status: 400 });
    }

    const styles = ['Character Swap', 'Anime Action', '3D Kids', 'Clean 4K'];
    const hooks = ['Wait for the ending!', 'This changes everything', 'Nobody talks about this', 'I was shocked'];
    
    const clips = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, (_, i) => {
      const score = 85 + Math.floor(Math.random() * 15);
      return {
        id: Date.now() + i,
        title: `Viral Moment ${i + 1}`,
        timestamp: `00:${String(10 + i * 15).padStart(2, '0')} - 00:${String(35 + i * 15).padStart(2, '0')}`,
        format: body.clipFormat || 'shorts_9_16',
        subtitlesEnabled: body.autoSubtitles !== false,
        hookEnabled: body.aiHook !== false,
        viralScore: score,
        socialCaption: `${hooks[i % hooks.length]} 🔥 #viral #shorts #fyp`,
        aiPrompt: `${styles[i % styles.length]} style, cinematic lighting, perfect lip-sync, high energy, 4K`,
        aiStyle: body.aiStyle || 'character_swap',
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        sourceUrl: videoUrl,
        generatedClips: clips
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
  }
}
