import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { videoUrl, clipFormat, autoSubtitles, aiHook } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, message: 'Video URL is required' },
        { status: 400 }
      );
    }

    // Mock generated clips incorporating enhancement settings
    const mockClips = [
      { 
        id: 1, 
        title: 'Highlight Clip 1 (Viral Hook Applied)', 
        timestamp: '00:15 - 00:45', 
        format: clipFormat || 'shorts_9_16',
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true
      },
      { 
        id: 2, 
        title: 'Highlight Clip 2 (Viral Hook Applied)', 
        timestamp: '01:20 - 01:50', 
        format: clipFormat || 'shorts_9_16',
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true
      },
    ];

    return NextResponse.json({
      success: true,
      message: 'Clips generated successfully with AI enhancements',
      data: {
        sourceUrl: videoUrl,
        selectedFormat: clipFormat || 'shorts_9_16',
        options: { autoSubtitles, aiHook },
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
