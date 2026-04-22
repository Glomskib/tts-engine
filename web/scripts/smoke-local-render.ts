import { renderClipLocal } from '@/lib/video-engine/render-local';

async function main() {
  const t0 = Date.now();
  const r = await renderClipLocal({
    sourceBucket: 'renders',
    sourcePath: 'creator-clips/979c7be9-0823-4227-8830-88732e96fa99/job-mo21y769/0-1776378593895.MOV',
    startSec: 0,
    endSec: 8,
    userId: '979c7be9-0823-4227-8830-88732e96fa99',
    clipId: 'smoketest-' + Date.now(),
  });
  console.log('OK in', ((Date.now() - t0) / 1000).toFixed(1) + 's:');
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
