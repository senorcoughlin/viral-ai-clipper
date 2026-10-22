import { NextResponse } from 'next/server';

const PRESETS = {
  character_swap: {
    p1: 'Character swap: Replace speaker with reference image, keep clothing, exact lip-sync, static background.',
    p2: 'Motion body swap: Replace subject with reference character, lock dance/hand movements, 4k glitch-free.',
    tags: '#aitools #characterswap #klingai #higgsfield #viralshorts #fyp'
  },
  anime_action: {
    p1: '90s anime fighter restyle: Cel-shaded look, glowing energy aura, speed lines, preserve camera motion.',
    p2: 'Vertical anime drama: Expressive shading, power-up particles, impact frames, exact lip-sync.',
    tags: '#animeedit #dbzstyle #aianimation #verticalanime #shorts #viral'
  },
  kids_3d: {
    p1: '3D cute animation: Tiny 3D dinosaur style, vibrant colors, bouncy motion tracking, studio lighting.',
    p2: 'Playful 3D musical: Rhythmic stomping/dancing 3D character, bright background, synced mouth audio.',
    tags: '#kidsshorts #3danimation #tinydino #singalong #cartoonshorts #fyp'
  },
  clean_viral: {
    p1: 'Studio 4k enhance: Punchy color grading, face tracking on speaker, clean audio, depth of field.',
    p2: 'High-retention cut: Dynamic zoom on vocal emphasis, crisp skin tones, studio lighting.',
    tags: '#podcastclips #viralhighlights #mustwatch #trending #shorts #creator'
  }
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { videoUrl, clipFormat, autoSubtitles, aiHook, aiStyle } = body;

    if (!videoUrl) {
      return NextResponse.json({ success: false, message: 'URL required' }, { status: 400 });
    }

    const preset = PRESETS[aiStyle] || PRESETS.character_swap;
    const fmt = clipFormat || 'shorts_9_16';

    const mockClips = [
      {
        id: Date.now() + 1,
        title: 'Peak Moment Highlight 1',
        timestamp: '00:12 - 00:38',
        format: fmt,
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true,
        viralScore: 98,
        socialCaption: `Wait until the end! 🔥👀 ${preset.tags}`,
        aiPrompt: preset.p1
      },
      {
        id: Date.now() + 2,
        title: 'Engagement Spike Highlight 2',
        timestamp: '01:15 - 01:45',
        format: fmt,
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true,
        viralScore: 94,
        socialCaption: `This breakdown changes everything 💡🚀 ${preset.tags}`,
        aiPrompt: preset.p2
      }
    ];

    return NextResponse.json({
      success: true,
      data: {
        sourceUrl: videoUrl,
        selectedFormat: fmt,
        generatedClips: mockClips
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Server Error' }, { status: 500 });
  }
}
