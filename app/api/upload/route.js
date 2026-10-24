export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { handleUpload } from '@vercel/blob/client';
import { allowAttempt, clientIp } from '../../../lib/ratelimit';
import { routeGuard } from '../../../lib/ratelimit';

const MAX_BYTES = 500 * 1024 * 1024;

// Issues short-lived client-upload tokens so browsers upload MP4s straight to Vercel Blob.
export async function POST(request) {
  const limited = await routeGuard(request, 'upload', 60, 3600);
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const ip = clientIp(request);
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await allowAttempt(`upload:${ip}`, 10, 24 * 3600))) throw new Error('Upload limit reached for today');
        if (!/\.(mp4|mov|m4v|webm)$/i.test(pathname)) throw new Error('Upload an MP4, MOV or WebM video');
        return {
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 400 });
  }
}
