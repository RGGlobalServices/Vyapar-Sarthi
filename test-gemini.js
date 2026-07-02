const fetch = require('node-fetch');

async function test() {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=invalid_key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      })
    });
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', data);
  } catch (err) {
    console.log('Error:', err.message);
  }
}

test();
