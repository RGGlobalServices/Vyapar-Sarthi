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
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: 'user', content: 'You extract data. Return JSON structure: {"stock": [{"productName": "string", "quantity": 0}]}. Data: Apple 10, Banana 5' }],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.2
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', data.choices[0].message.content);
  } catch (err) {
    console.log('Error:', err.message);
  }
}

test();
