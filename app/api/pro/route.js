import { NextResponse } from 'next/server';

// Placeholder for persistent Pro status.
// Later replace with Vercel KV, Postgres, or Redis keyed by email/customer id.
const proUsers = new Set(); // in-memory only — resets on cold start

export async function POST(request) {
  const { email, customerId } = await request.json();
  if (email) proUsers.add(email.toLowerCase());
  if (customerId) proUsers.add(customerId);
  return NextResponse.json({ success: true });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.toLowerCase();
  const isPro = email ? proUsers.has(email) : false;
  return NextResponse.json({ isPro, email });
}
