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

    const mockClips = [
      { 
        id: Date.now() + 1, 
        title: 'Peak Moment Highlight 1', 
        timestamp: '00:12 - 00:38', 
        format: clipFormat || 'shorts_9_16',
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true
      },
      { 
        id: Date.now() + 2, 
        title: 'Engagement Spike Highlight 2', 
        timestamp: '01:15 - 01:45', 
        format: clipFormat || 'shorts_9_16',
        subtitlesEnabled: autoSubtitles ?? true,
        hookEnabled: aiHook ?? true
      },
    ];

    return NextResponse.json({
      success: true,
      message: 'Batch clip queue processed successfully',
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
