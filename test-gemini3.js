const fetch = require('node-fetch');

// Usage: GEMINI_API_KEY=your_key node test-gemini3.js
const API_KEY = process.env.GEMINI_API_KEY;

async function test() {
  if (!API_KEY) { console.error('Set GEMINI_API_KEY env var'); process.exit(1); }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
        }),
      }
    );
    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

test();
