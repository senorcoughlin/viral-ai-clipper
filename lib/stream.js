// Stream sources: Twitch VODs / clips / live channels and Kick VODs.
// We resolve them to plain HLS (or MP4) media URLs on the server so RenderIO's
// ffmpeg can seek straight into the window we need instead of downloading a
// multi-hour file. YouTube live replays stay on the normal yt-dlp path.

const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // Twitch's public web client id
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class StreamError extends Error {
  constructor(message, code = 'stream') { super(message); this.code = code; this.userFacing = true; }
}

// Classify a URL. Returns null for anything that isn't a stream source we handle here.
export function parseStreamUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'clips.twitch.tv' && parts[0]) return { kind: 'twitch_clip', slug: parts[0] };
  if (host === 'twitch.tv') {
    if (parts[0] === 'videos' && /^\d+$/.test(parts[1] || '')) return { kind: 'twitch_vod', id: parts[1] };
    if (parts[1] === 'clip' && parts[2]) return { kind: 'twitch_clip', slug: parts[2] };
    if (parts[1] === 'video' && /^\d+$/.test(parts[2] || '')) return { kind: 'twitch_vod', id: parts[2] };
    if (parts.length === 1 && /^[a-zA-Z0-9_]{2,25}$/.test(parts[0]) && !['videos', 'directory', 'downloads', 'settings', 'search', 'p'].includes(parts[0].toLowerCase())) {
      return { kind: 'twitch_channel', login: parts[0].toLowerCase() };
    }
    return { kind: 'twitch_unknown' };
  }
  if (host === 'kick.com') {
    // kick.com/<channel>/videos/<uuid> and kick.com/video/<uuid>
    const uuid = (parts[1] === 'videos' ? parts[2] : parts[0] === 'video' ? parts[1] : null);
    if (uuid && /^[0-9a-f-]{36}$/i.test(uuid)) return { kind: 'kick_vod', id: uuid };
    if (parts.length === 1 && /^[\w-]{2,30}$/.test(parts[0])) return { kind: 'kick_channel', login: parts[0].toLowerCase() };
    return { kind: 'kick_unknown' };
  }
  return null;
}

async function fetchT(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' }); }
  finally { clearTimeout(t); }
}

async function gql(query) {
  const r = await fetchT('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  }).catch(() => null);
  if (!r || !r.ok) throw new StreamError('Twitch is not responding right now. Try again in a minute.', 'upstream');
  const j = await r.json().catch(() => null);
  if (!j?.data) throw new StreamError('Twitch is not responding right now. Try again in a minute.', 'upstream');
  return j.data;
}

// Parse a master playlist into variants [{ name, height, bw, url }].
function parseMaster(text, base) {
  const lines = text.split('\n').map(l => l.trim());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
    const inf = lines[i];
    const url = lines.slice(i + 1).find(l => l && !l.startsWith('#'));
    if (!url) continue;
    const res = inf.match(/RESOLUTION=\d+x(\d+)/);
    out.push({
      name: (inf.match(/VIDEO="([^"]+)"/) || [])[1] || '',
      height: res ? Number(res[1]) : 0,
      bw: Number((inf.match(/BANDWIDTH=(\d+)/) || [])[1] || 0),
      url: new URL(url, base).toString(),
    });
  }
  return out;
}

// Pick ~720p for cutting and the lightest rendition for audio extraction.
function pickVariants(variants) {
  const video = variants.filter(v => v.height > 0).sort((a, b) => b.height - a.height);
  const cut = video.find(v => v.height <= 720) || video[video.length - 1];
  const audio = variants.find(v => v.name === 'audio_only') || video[video.length - 1] || cut;
  return { videoUrl: cut?.url, audioUrl: audio?.url };
}

// Total seconds listed in a media playlist (VOD or growing DVR playlist).
async function playlistSeconds(url) {
  const r = await fetchT(url, { headers: { 'User-Agent': UA } }).catch(() => null);
  if (!r || !r.ok) return null;
  const text = await r.text();
  let sum = 0;
  for (const m of text.matchAll(/#EXTINF:([\d.]+)/g)) sum += Number(m[1]) || 0;
  return sum > 0 ? sum : null;
}

async function twitchVodMedia(id) {
  const d = await gql(`{ video(id:"${id}"){ id lengthSeconds status broadcastType title owner{ login displayName } }
    videoPlaybackAccessToken(id:"${id}", params:{platform:"web",playerBackend:"mediaplayer",playerType:"site"}){ value signature } }`);
  const v = d.video;
  if (!v) throw new StreamError('That Twitch VOD was not found. It may be private, deleted, or expired (Twitch keeps VODs for 7 to 60 days).', 'not_found');
  const tok = d.videoPlaybackAccessToken;
  if (!tok?.value) throw new StreamError('Twitch would not give us access to that VOD.', 'restricted');
  const qs = new URLSearchParams({ sig: tok.signature, token: tok.value, allow_source: 'true', allow_audio_only: 'true', player: 'twitchweb', p: String(Math.floor(Math.random() * 1e6)) });
  const r = await fetchT(`https://usher.ttvnw.net/vod/${id}.m3u8?${qs}`, { headers: { 'User-Agent': UA } }).catch(() => null);
  if (!r) throw new StreamError('Twitch is not responding right now. Try again in a minute.', 'upstream');
  const body = await r.text();
  if (r.status === 403 || /vod_manifest_restricted|unauthorized_entitlements/i.test(body)) {
    throw new StreamError('That VOD is for subscribers only, so we cannot access it. Try a public VOD.', 'sub_only');
  }
  if (!r.ok) throw new StreamError('That Twitch VOD is unavailable (it may be private, region-locked or still processing).', 'unavailable');
  const { videoUrl, audioUrl } = pickVariants(parseMaster(body, `https://usher.ttvnw.net/vod/${id}.m3u8`));
  if (!videoUrl) throw new StreamError('That Twitch VOD has no playable video.', 'unavailable');
  const length = (await playlistSeconds(videoUrl)) || Number(v.lengthSeconds) || 0;
  return { videoUrl, audioUrl, duration: length, recording: v.status === 'RECORDING', title: v.title || '', channel: v.owner?.login || '' };
}

async function twitchClipMedia(slug) {
  const safe = String(slug).replace(/[^\w-]/g, '');
  const d = await gql(`{ clip(slug:"${safe}"){ durationSeconds title broadcaster{ login } videoQualities{ quality sourceURL }
    playbackAccessToken(params:{platform:"web",playerBackend:"mediaplayer",playerType:"site"}){ signature value } } }`);
  const c = d.clip;
  if (!c || !c.videoQualities?.length) throw new StreamError('That Twitch clip was not found. It may have been deleted.', 'not_found');
  const q = [...c.videoQualities].sort((a, b) => Number(b.quality) - Number(a.quality));
  const pick = q.find(x => Number(x.quality) <= 720) || q[q.length - 1];
  const tok = c.playbackAccessToken;
  const url = `${pick.sourceURL}?${new URLSearchParams({ sig: tok?.signature || '', token: tok?.value || '' })}`;
  return { videoUrl: url, audioUrl: url, duration: Number(c.durationSeconds) || 30, mp4: true, title: c.title || '', channel: c.broadcaster?.login || '' };
}

async function twitchChannelLive(login) {
  const d = await gql(`{ user(login:"${login}"){ login displayName stream{ id type title archiveVideo{ id status } } } }`);
  const u = d.user;
  if (!u) throw new StreamError(`There is no Twitch channel called "${login}".`, 'not_found');
  if (!u.stream) throw new StreamError(`${u.displayName || login} is offline right now. Paste a VOD link (twitch.tv/videos/…) to clip a past stream.`, 'offline');
  const archive = u.stream.archiveVideo;
  if (!archive?.id) {
    throw new StreamError(`${u.displayName || login} is live, but this channel does not save broadcasts, so the last few minutes cannot be grabbed. Try again after the stream as a clip link, or ask the streamer to turn on "Store past broadcasts".`, 'no_archive');
  }
  const media = await twitchVodMedia(archive.id).catch((e) => {
    if (e?.code === 'sub_only') throw new StreamError(`${u.displayName || login}'s broadcast is for subscribers only, so it cannot be clipped.`, 'sub_only');
    throw e;
  });
  return { ...media, live: true, channel: u.login, title: u.stream.title || media.title };
}

async function kickJson(path) {
  const r = await fetchT(`https://kick.com${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } }).catch(() => null);
  if (!r) throw new StreamError('Kick is not responding right now. Try again in a minute.', 'upstream');
  if (r.status === 404) return null;
  if (!r.ok) throw new StreamError('Kick blocked the request. Download the VOD and upload the MP4 instead.', 'blocked');
  return r.json().catch(() => { throw new StreamError('Kick blocked the request. Download the VOD and upload the MP4 instead.', 'blocked'); });
}

async function kickVodMedia(id) {
  const v = await kickJson(`/api/v1/video/${id}`);
  if (!v?.source) throw new StreamError('That Kick VOD was not found or is private.', 'not_found');
  if (v.is_private) throw new StreamError('That Kick VOD is private.', 'private');
  const r = await fetchT(v.source, { headers: { 'User-Agent': UA } }).catch(() => null);
  if (!r || !r.ok) throw new StreamError('That Kick VOD is unavailable.', 'unavailable');
  const { videoUrl, audioUrl } = pickVariants(parseMaster(await r.text(), v.source));
  if (!videoUrl) throw new StreamError('That Kick VOD has no playable video.', 'unavailable');
  const duration = (await playlistSeconds(videoUrl)) || Math.round(Number(v.livestream?.duration || 0) / 1000);
  return { videoUrl, audioUrl, duration, title: v.livestream?.session_title || '', channel: v.livestream?.channel?.slug || '' };
}

// Resolve to { videoUrl, audioUrl, duration, live?, mp4? }.
export async function resolveStream(info) {
  switch (info?.kind) {
    case 'twitch_vod': return twitchVodMedia(info.id);
    case 'twitch_clip': return twitchClipMedia(info.slug);
    case 'twitch_channel': return twitchChannelLive(info.login);
    case 'kick_vod': return kickVodMedia(info.id);
    case 'kick_channel': throw new StreamError('Live Kick channels are not supported yet. Paste a Kick VOD link (kick.com/<channel>/videos/…) after the stream.', 'unsupported');
    case 'twitch_unknown': throw new StreamError('That Twitch link isn\'t a VOD, clip or channel. Use twitch.tv/videos/<id>, a clip link, or twitch.tv/<channel> while they are live.', 'invalid');
    case 'kick_unknown': throw new StreamError('That Kick link isn\'t a VOD. Use kick.com/<channel>/videos/<id>.', 'invalid');
    default: return null;
  }
}

// Light-weight status for the UI (is this a live channel?).
export async function probeStream(raw) {
  const info = parseStreamUrl(raw);
  if (!info) return { kind: null };
  if (info.kind === 'twitch_channel') {
    const d = await gql(`{ user(login:"${info.login}"){ displayName stream{ id archiveVideo{ id } } } }`);
    if (!d.user) return { kind: info.kind, exists: false };
    return { kind: info.kind, exists: true, live: !!d.user.stream, archive: !!d.user.stream?.archiveVideo?.id, name: d.user.displayName };
  }
  return { kind: info.kind };
}

// RenderIO can't seek efficiently inside a long remote HLS playlist, so for every job we
// build a tiny playlist holding only the segments that cover [start, start+len] (absolute
// segment URLs), upload it to RenderIO file storage and hand that URL to ffmpeg.
// Returns { url, offset } where offset is the seek inside the trimmed playlist.
const playlistCache = new Map();
async function mediaSegments(mediaUrl) {
  const hit = playlistCache.get(mediaUrl);
  if (hit && Date.now() - hit.at < 20000) return hit.segs;
  const r = await fetchT(mediaUrl, { headers: { 'User-Agent': UA } }, 10000).catch(() => null);
  if (!r || !r.ok) throw new StreamError('The stream playlist could not be read. Try again in a minute.', 'upstream');
  const lines = (await r.text()).split('\n').map(l => l.trim());
  const segs = [];
  let t = 0, dur = null, header = [];
  for (const l of lines) {
    if (l.startsWith('#EXT-X-MAP') || l.startsWith('#EXT-X-KEY')) {
      header.push(l.replace(/URI="([^"]+)"/, (_, u) => `URI="${new URL(u, mediaUrl)}"`));
    } else if (l.startsWith('#EXTINF:')) dur = Number(l.slice(8).split(',')[0]) || 0;
    else if (l && !l.startsWith('#') && dur != null) {
      segs.push({ start: t, dur, url: new URL(l, mediaUrl).toString() });
      t += dur; dur = null;
    }
  }
  segs.header = header;
  playlistCache.set(mediaUrl, { at: Date.now(), segs });
  if (playlistCache.size > 30) playlistCache.delete(playlistCache.keys().next().value);
  return segs;
}

export async function windowPlaylist(mediaUrl, start, len, key) {
  const segs = await mediaSegments(mediaUrl);
  const end = start + len;
  const pick = segs.filter(s => s.start + s.dur > start && s.start < end);
  if (!pick.length) throw new StreamError('That part of the stream is not available yet.', 'unavailable');
  const target = Math.ceil(Math.max(...pick.map(s => s.dur)));
  const text = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${target}`, '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD', ...(segs.header || []),
    ...pick.flatMap(s => [`#EXTINF:${s.dur.toFixed(3)},`, s.url]), '#EXT-X-ENDLIST', ''].join('\n');
  const form = new FormData();
  form.append('file', new Blob([text], { type: 'application/vnd.apple.mpegurl' }), 'window.m3u8');
  const up = await fetchT('https://renderio.dev/api/v1/files/upload', { method: 'POST', headers: { 'X-API-KEY': key }, body: form }, 15000).catch(() => null);
  const j = up && up.ok ? await up.json().catch(() => null) : null;
  if (!j?.storage_url) throw new Error('renderio playlist upload failed ' + (up?.status || 'unreachable'));
  return { url: j.storage_url, offset: Math.max(0, start - pick[0].start) };
}
