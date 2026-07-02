const http = require('http');

http.get('http://localhost:3000/api/v1/test-products', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
}).on('error', console.error);
