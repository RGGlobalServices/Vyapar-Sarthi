const fetch = require('node-fetch');

async function test() {
  const apiKey = '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';
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
      headers: { 
        'Authorization': `Bearer ${apiKey}`
      }
    });
    const data = await response.json();
    console.log('Models:', data.data.map(m => m.id).join(', '));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

test();
