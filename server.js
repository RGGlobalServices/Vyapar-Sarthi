// Hostinger / cPanel / Production entry point
// Automatically binds to Hostinger's dynamic PORT and environment

const path = require('path');
const fs = require('fs');

const standaloneServerPath = path.join(__dirname, '.next', 'standalone', 'server.js');

if (fs.existsSync(standaloneServerPath)) {
  // If standalone build exists, run the standalone server
  require(standaloneServerPath);
} else {
  // Fallback to standard Next.js custom server
  const { createServer } = require('http');
  const { parse } = require('url');
  const next = require('next');

  const dev = process.env.NODE_ENV !== 'production';
  const hostname = process.env.HOSTNAME || '0.0.0.0';
  const port = parseInt(process.env.PORT || '3000', 10);

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    })
      .once('error', (err) => {
        console.error('Server error:', err);
        process.exit(1);
      })
      .listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
      });
  }).catch((err) => {
    console.error('Failed to prepare Next.js app:', err);
    process.exit(1);
  });
}
