import { NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

const BLOB_PATH = 'pro-users.json';

async function loadProUsers() {
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    const match = blobs.find(b => b.pathname === BLOB_PATH);
    if (!match) return new Set();
    const res = await fetch(match.url);
    const data = await res.json();
    return new Set(data.emails || []);
  } catch {
    return new Set();
  }
}

async function saveProUsers(users) {
  const body = JSON.stringify({ emails: Array.from(users), updated: Date.now() });
  await put(BLOB_PATH, body, { access: 'private', addRandomSuffix: false });
}

export async function POST(request) {
  const { email, customerId } = await request.json();
  const users = await loadProUsers();
  if (email) users.add(email.toLowerCase());
  if (customerId) users.add(String(customerId));
  await saveProUsers(users);
  return NextResponse.json({ success: true, count: users.size });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.toLowerCase();
  const users = await loadProUsers();
  const isPro = email ? users.has(email) : false;
  return NextResponse.json({ isPro, email });
}
