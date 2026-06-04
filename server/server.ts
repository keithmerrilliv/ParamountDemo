// Node.js HTTP-only resolver service.
// Exposes POST /probe-plan, POST /resolve, GET /health.

import http from 'http';
import type { Platform, CapabilityProfile } from '../shared/handshake';
import { resolve } from './resolver';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8088;
const HOST = '0.0.0.0';

interface ProbePlanRequest {
  shellVersion: string;
  platform: Platform;
}

interface ResolveRequest {
  profile: unknown; // CapabilityProfile
}

function handleProbePlan(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const payload: ProbePlanRequest = JSON.parse(body);
      const probePlan = {
        codecs: true,
        drm: true,
        graphics: true,
        runtime: true,
        display: true,
        ttlSeconds: 3600
      };
      sendJson(res, 200, probePlan);
    } catch (e) {
      sendError(res, 400, 'Invalid request body');
    }
  });
}

function handleResolve(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = '';
  req.on('data', chunk => { body += chunk.toString(); });
  req.on('end', () => {
    try {
      const payload: ResolveRequest = JSON.parse(body);
      const verdict = resolve(payload.profile as CapabilityProfile);
      sendJson(res, 200, verdict);
    } catch (e) {
      console.error('Resolver error:', e);
      sendError(res, 500, 'Resolver error');
    }
  });
}

function handleHealth(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true });
  } else {
    sendError(res, 405, 'Method not allowed');
  }
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

const server = http.createServer((req, res) => {
  if (req.url === '/probe-plan' && req.method === 'POST') {
    handleProbePlan(req, res);
  } else if (req.url === '/resolve' && req.method === 'POST') {
    handleResolve(req, res);
  } else if (req.url === '/health' && req.method === 'GET') {
    handleHealth(req, res);
  } else {
    sendError(res, 404, 'Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Resolver service listening on ${HOST}:${PORT}`);
});