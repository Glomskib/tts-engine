import { shotstackRequest } from '../lib/shotstack';

async function testShotstack() {
  console.log('Testing Shotstack connection...');

  const result = await shotstackRequest('/render', {
    method: 'POST',
    body: JSON.stringify({
      timeline: {
        background: '#000000',
        tracks: [{
          clips: [{
            asset: { type: 'title', text: 'FlashFlow Test', style: 'minimal' },
            start: 0,
            length: 3,
          }],
        }],
      },
      output: { format: 'mp4', resolution: 'sd' },
    }),
  });

  console.log('Render submitted:', result);
  console.log('Render ID:', result.response?.id);

  if (result.response?.id) {
    let status = 'queued';
    while (status === 'queued' || status === 'fetching' || status === 'rendering') {
      await new Promise(r => setTimeout(r, 3000));
      const check = await shotstackRequest(`/render/${result.response.id}`);
      status = check.response?.status;
      console.log('Status:', status);
      if (status === 'done') {
        console.log('Video URL:', check.response?.url);
      }
    }
  }
}

testShotstack().catch(console.error);
