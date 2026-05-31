#!/usr/bin/env node
/**
 * RSC — DFY Pipeline Service
 * Standalone Express server on port 9010.
 * Hosts the client pipeline API and admin dashboard.
 * No dependency on RS core processes.
 */

const express = require('express');
const createRscRouter = require('./routes/rsc');

const PORT = process.env.RSC_PORT || 9010;

// Minimal auth: allow localhost and Tailscale (100.x.x.x)
function rscAuth(req, res, next) {
  const raw = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ip = raw.split(',')[0].trim().replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('100.')) return next();
  res.status(401).json({ error: 'unauthorized' });
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/', rscAuth, createRscRouter());

app.listen(PORT, () => {
  console.log(`[RSC] DFY pipeline service running on port ${PORT}`);
  console.log(`[RSC] Admin dashboard: http://localhost:${PORT}/admin`);
});
