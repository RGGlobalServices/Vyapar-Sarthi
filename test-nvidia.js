const fetch = require('node-fetch');

async function test() {
  const apiKey = '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';
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-70b-instruct",
        messages: [{ role: 'user', content: 'Reply with JSON: {"hello": "world"}' }],
        response_format: { type: "json_object" }
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

test();
