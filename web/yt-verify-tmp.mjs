import ytdl from '@distube/ytdl-core';

const url = 'https://youtu.be/bCljOfCH8Ms';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';

console.log('[verify] testing user URL:', url);
const t0 = Date.now();
try {
  const info = await ytdl.getInfo(url, {
    requestOptions: { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } },
  });
  console.log('[verify] getInfo OK in', Date.now() - t0, 'ms');
  console.log('  videoId:', info.videoDetails.videoId);
  console.log('  title:', info.videoDetails.title);
  console.log('  duration:', info.videoDetails.lengthSeconds, 'sec');
  console.log('  total formats:', info.formats.length);

  // Same selection logic as the real code
  const targetHeight = 720;
  const formats = info.formats
    .filter(f => f.hasVideo && f.hasAudio && (f.container === 'mp4' || f.mimeType?.includes('mp4')))
    .filter(f => !f.height || f.height <= targetHeight)
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  const fmt = formats[0];
  console.log('[verify] progressive mp4 video formats:', formats.length);
  if (fmt) {
    console.log('  picked:', fmt.qualityLabel, fmt.container, 'itag=' + fmt.itag);
    console.log('  has URL:', !!fmt.url, 'len=' + (fmt.url?.length || 0));
  } else {
    console.log('[verify] WARN: no progressive mp4 — would fall back to "no progressive format" error');
    // Show what's available
    const sample = info.formats.filter(f => f.hasVideo).slice(0, 5).map(f => ({
      itag: f.itag, q: f.qualityLabel, hasAudio: f.hasAudio, container: f.container,
    }));
    console.log('  available video formats (first 5):', sample);
  }

  // Audio path test
  const audio = info.formats.filter(f => f.hasAudio && !f.hasVideo).sort((a,b)=>(b.audioBitrate||0)-(a.audioBitrate||0))[0];
  console.log('[verify] best audio-only:', audio?.itag, audio?.audioBitrate, 'kbps', audio?.container);

} catch (e) {
  console.error('[verify] FAIL:', e?.message || e);
  process.exit(1);
}
