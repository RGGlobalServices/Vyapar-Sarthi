const { spawn } = require('child_process');
const path = require('path');

// The frontend (Next.js) should be on the externally-exposed port
// because it handles page routes and proxies /api/v1/* to the backend
const EXPOSED_PORT = process.env.PORT || '3000';

// Start backend internally on port 10000
const backend = spawn('node', ['src/index.js'], {
  cwd: path.join(__dirname, 'backend-node'),
  stdio: 'inherit',
  env: { ...process.env, PORT: '10000' },
});

// Start frontend on the exposed port
const frontend = spawn('npx', ['next', 'start', '-p', EXPOSED_PORT], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  env: { ...process.env, PORT: EXPOSED_PORT },
});

function cleanup() {
  backend.kill();
  frontend.kill();
  process.exit();
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
