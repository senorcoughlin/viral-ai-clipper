// Only same-site paths we know are safe to return to after sign-in / OAuth.
const ALLOWED = ['/', '/studio', '/assets', '/channel', '/tools', '/connectors', '/tutorial'];
export function safeNext(p) {
  const s = String(p || '').split('?')[0].split('#')[0];
  return ALLOWED.includes(s) ? s : '/';
}
