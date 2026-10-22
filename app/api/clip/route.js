import { NextResponse } from 'next/server';

const P = {
  swap: {
    p1: 'Character swap with reference image, exact lip-sync.',
    p2: 'Motion body swap, lock dance movements, 4k glitch-free.',
    tags: '#aitools #swap #shorts'
  },
  anime: {
    p1: '90s anime fighter restyle, cel-shaded, aura glow.',
    p2: 'Vertical anime drama, expressive shading, impact frames.',
    tags: '#anime #shorts #viral'
  },
  kids: {
    p1: '3D cute animation style, vibrant colors, studio lighting.',
    p2: 'Playful 3D musical short, rhythmic dancing character.',
    tags: '#kids #cartoon #3d'
  },
  clean: {
    p1: 'Studio 4k enhance, punchy color grading, face tracking.',
    p2: 'High-retention zoom on vocal emphasis, crisp skin tones.',
    tags: '#podcast #highlights #trending'
  }
};

export async function POST(req) {
  try {
    const body = await req.json();
    const url = body.videoUrl;
    if (!url) return NextResponse.json({ success: false }, { status: 400 });

    const pr = P[body.aiStyle] || P.swap;
    const fmt = body.clipFormat || 'shorts_9_16';

    const clips = [
      {
        id: 1,
        title: 'Highlight 1',
        timestamp: '00:12 - 00:38',
        format: fmt,
        subtitlesEnabled: body.autoSubtitles ?? true,
        hookEnabled: body.aiHook ?? true,
        viralScore: 98,
        socialCaption: `Wait until the end! 🔥 ${pr.tags}`,
        aiPrompt: pr.p1
      },
      {
        id: 2,
        title: 'Highlight 2',
        timestamp: '01:15 - 01:45',
        format: fmt,
        subtitlesEnabled: body.autoSubtitles ?? true,
        hookEnabled: body.aiHook ?? true,
        viralScore: 94,
        socialCaption: `This changes everything! 🚀 ${pr.tags}`,
        aiPrompt: pr.p2
      }
    ];

    return NextResponse.json({ success: true, data: { generatedClips: clips } });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
