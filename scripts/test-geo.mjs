import test from 'node:test';
import assert from 'node:assert/strict';
import { cityOf, visitorId } from '../lib/geo.js';

const H = (o) => new Map(Object.entries(o));
test('cityOf decodes Vercel geo headers', () => {
  assert.equal(cityOf(H({ 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country-region': 'SP', 'x-vercel-ip-country': 'br' })), 'São Paulo, SP, BR');
  assert.equal(cityOf(H({ 'x-vercel-ip-city': 'Pooler', 'x-vercel-ip-country-region': 'GA', 'x-vercel-ip-country': 'US' })), 'Pooler, GA, US');
  assert.equal(cityOf(H({})), 'Unknown');
  assert.equal(cityOf(H({ 'x-vercel-ip-country': 'IN' })), 'Unknown city, IN');
  assert.equal(cityOf(H({ 'x-vercel-ip-city': 'Bad%E0%A4', 'x-vercel-ip-country': 'US' })), 'Bad%E0%A4, US');
  assert.ok(!cityOf(H({ 'x-vercel-ip-city': 'a,b|c', 'x-vercel-ip-country': 'US' })).includes('|'));
});
test('visitorId is short, stable per day, and not the IP', () => {
  const a = visitorId('1.2.3.4', 'UA', '2026-11-19');
  assert.equal(a.length, 16);
  assert.equal(a, visitorId('1.2.3.4', 'UA', '2026-11-19'));
  assert.notEqual(a, visitorId('1.2.3.4', 'UA', '2026-11-20'));
  assert.ok(!a.includes('1.2.3.4'));
});
