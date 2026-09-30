// Dev: Vite client (hot reload) + Node server. Ports: DEV_PORT (5173), SERVER_PORT (8787); lanes use their own (CLAUDE.md).
import { spawn } from 'node:child_process';
const devPort = process.env.DEV_PORT ?? '5173';
const serverPort = process.env.SERVER_PORT ?? '8787';
const procs = [
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'apps/client', '--port', devPort, '--strictPort'], { stdio: 'inherit', env: { ...process.env, SERVER_PORT: serverPort, VITE_SERVER_PORT: serverPort } }),
  spawn(process.execPath, ['apps/server/src/main.ts', '--port', serverPort, '--static', 'apps/client/dist'], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (c) => { if (c) { console.error(`[dev] child exited ${c}`); stop(); } });
