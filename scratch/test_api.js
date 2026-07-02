const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/products',
  method: 'GET',
  headers: {
    // I need a valid token. Let's just create one or skip it.
    // Wait, the API requires a token.
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.on('error', console.error);
req.end();
