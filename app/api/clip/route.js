import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { videoUrl, clipFormat } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { success: false, message: 'Video URL is required' },
        { status: 400 }
      );
    }

    // Mock generated clips data based on requested format
    const mockClips = [
      { id: 1, title: 'Highlight Clip 1', timestamp: '00:15 - 00:45', format: clipFormat || 'shorts_9_16' },
      { id: 2, title: 'Highlight Clip 2', timestamp: '01:20 - 01:50', format: clipFormat || 'shorts_9_16' },
    ];

    return NextResponse.json({
      success: true,
      message: 'Clips generated successfully',
      data: {
        sourceUrl: videoUrl,
        selectedFormat: clipFormat || 'shorts_9_16',
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
