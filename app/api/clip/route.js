import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { videoUrl, clipFormat, autoSubtitles, aiHook, aiStyle } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, message: 'Video URL is required' },
        { status: 400 }
      );
    }

    const stylePresets = {
      character_swap: {
        prompt1: 'Video-to-video character replacement: Swap primary speaker with reference character image, keep exact clothing, replicate facial expressions and flawless lip-sync, preserve original background environment, zero flickering.',
        prompt2: 'Motion control body swap: Replace subject with reference image character, lock exact dance/body movement and hand gestures, maintain scene lighting and shadows, glitch-free 4k output.',
        tags: '#aitools #characterswap #klingai #higgsfield #viralshorts #fyp'
      },
      anime_action: {
        prompt1: '90s anime action restyle: Transform subject into sharp cel-shaded anime fighter, intense aura energy glow, dramatic speed lines on movement, high-contrast Z-fighter aesthetic, preserve camera motion.',
        prompt2: 'Dynamic anime drama shot: Convert scene to vertical anime series style, expressive character shading, glowing power-up particles, cinematic impact frames, keep exact lip-sync and head motion.',
        tags: '#animeedit #dbzstyle #aianimation #verticalanime #shorts #viral'
      },
      kids_3d: {
        prompt1: '3D Pixar/Cute animation restyle: Transform character into cute tiny 3D animated dinosaur/character, vibrant saturated colors, bouncy playful motion tracking, smooth studio lighting, kid-friendly aesthetic.',
        prompt2: 'Playful 3D musical short: Convert movement into rhythmic stomping and dancing 3D cartoon character, bright cheerful background, synchronized mouth movement for sing-along audio.',
        tags: '#kidsshorts #3danimation #tinydino #singalong #cartoonshorts #fyp'
      },
      clean_viral: {
        prompt1: 'Studio quality enhancement: Upscale to crisp 4k, apply punchy high-retention color grading, lock face tracking on speaker, remove background noise, subtle cinematic depth of field.',
        prompt2: 'High-retention podcast/highlight cut: Dynamic zoom-in on key vocal emphasis, crisp skin tones, clean studio lighting, zero motion blur.',
        tags: '#podcastclips #viralhighlights #mustwatch #trending #shorts #creator'
      }
    };

    const selectedPreset = stylePresets[aiStyle] || stylePresets.character_swap;

    const mockClips = [
      { 
        id: Date.now() + 1, 
        title: 'Peak Moment Highlight 1', 
        timestamp: '00:12 - 00:38', 
        format: clipFormat || 'shorts_9_16',
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true,
        viralScore: 98,
        socialCaption: `Wait until the end... nobody saw this coming! 🔥👀 ${selectedPreset.tags}`,
        aiPrompt: selectedPreset.prompt1
      },
      { 
        id: Date.now() + 2, 
        title: 'Engagement Spike Highlight 2', 
        timestamp: '01:15 - 01:45', 
        format: clipFormat || 'shorts_9_16',
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true,
        viralScore: 94,
        socialCaption: `This 30-second breakdown changes everything 💡🚀 ${selectedPreset.tags}`,
        aiPrompt: selectedPreset.prompt2
      },
    ];

    return NextResponse.json({
      success: true,
      message: 'Batch clip queue processed successfully',
      data: {
        sourceUrl: videoUrl,
        selectedFormat: clipFormat || 'shorts_9_16',
        options: { autoSubtitles, aiHook, aiStyle },
        generatedClips: mockClips,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
