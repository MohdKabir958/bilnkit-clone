import { usesClerk } from './config/authMode';
import { retryClerkDeletions } from './services/clerkIdentity';
import express from 'express';
import {installStructuredLogging} from './utils/logger';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './db';
import { databaseReadinessDiagnostic } from './services/readinessDiagnostic';
import { apiRouter } from './routes/api';
import { attachRealtime } from './realtime';
import { startOrderMaintenance } from './services/orderMaintenance';
import { securityHeaders } from './middleware/securityHeaders';
import { globalErrorHandler } from './middleware/errorHandler';
import { assertRuntimeConfig } from './config/runtimeConfig';
import { brand } from './config/brand';
import { installProcessGuards } from './processGuards';
import { initPushProvider, getPushProvider } from './services/push/provider';
import { mountUploads } from './routes/uploads';
import { jsonUnlessMenuImport } from './middleware/bodyLimits';

dotenv.config();
if(process.env.NODE_ENV==='production')installStructuredLogging();

// Anything that is not the test runner must have its secrets; GOOGLE_WEB_CLIENT_ID is only a warning.
if (process.env.NODE_ENV !== 'test') {
  for (const warning of assertRuntimeConfig(process.env).warnings) console.warn(`⚠️  ${warning}`);
}

// Push (FCM): reads FIREBASE_KEY_PATH / FIREBASE_SERVICE_ACCOUNT now so a missing key shows ONE warning at boot; never fails the boot.
if (process.env.NODE_ENV !== 'test') {
  try {
    if (initPushProvider()) {
      console.log('push notifications are ON (FCM): checking the credentials with FCM...');
      // A dry-run send (nothing is delivered) proves FCM accepts the key and project; a revoked or wrong key is visible at boot, not at the first order.
      getPushProvider().verify?.()
        .then((r) => (r.ok ? console.log('push credentials verified with FCM') : console.error(`push credentials NOT accepted by FCM (${r.code ?? 'error'}): check FIREBASE_KEY_PATH and the Firebase project`)))
        .catch(() => console.error('push credential check could not run (network?)'));
    }
  } catch { console.warn('push notifications are OFF: could not start the push provider.'); }
}

// Global process guards (src/processGuards.ts): uncaught exception -> log and exit(1) so PM2 restarts; unhandled rejection -> log and continue.
const guards = installProcessGuards();

const app = express();
app.disable('x-powered-by');
// Production runs behind exactly one proxy (nginx), which sets X-Forwarded-For: req.ip is the real client address.
app.set('trust proxy', 1);
const server = http.createServer(app);

const allowedOrigins = [process.env.CLIENT_URL, process.env.ADMIN_URL,
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000','http://localhost:5173'] : [])
].filter((origin): origin is string => Boolean(origin));
const corsOptions = {
  origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error('Origin is not allowed by CORS.'), { status: 403, code: 'CORS_NOT_ALLOWED' }));
  },
  credentials: true,
};

const io = new SocketIOServer(server, {
  allowRequest: (req, callback) => callback(null, !req.headers.origin || allowedOrigins.includes(req.headers.origin)),
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  },
});

const PORT = Number(process.env.PORT || 5000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

app.use(securityHeaders);
app.use(cors(corsOptions));
// Docs/23: uploaded photos (GET /uploads/*) before the json parser; the global parser skips the menu import (it has its own 400 KB parser after the ADMIN check).
mountUploads(app);
app.use(express.json({
  type: jsonUnlessMenuImport,
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));

// Pass socket.io instance to Express app for route handlers
app.set('io', io);

// Mount API routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: `${brand.name} Delivery API`,
    timestamp: new Date().toISOString(),
  });
});

// Readiness checks the actual database; liveness remains independent of external services.
let lastReadinessFailureAt = 0;
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    lastReadinessFailureAt = 0;
    res.json({ready:true,pushConfigured:getPushProvider().enabled});
  } catch (error) {
    if (!lastReadinessFailureAt || Date.now() - lastReadinessFailureAt >= 60_000) {
      console.error('Database readiness check failed:', databaseReadinessDiagnostic(error, process.env.DATABASE_URL));
      lastReadinessFailureAt = Date.now();
    }
    res.status(503).json({ready:false});
  }
});

// 404 Non-Existent Route Guard
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`
  });
});

// Global Express Error Handler (body-parser errors keep their status; nothing internal reaches the client).
app.use(globalErrorHandler);

// Socket.io: token auth, server-checked rooms, per-viewer order events (src/realtime.ts).
attachRealtime(io);

// A failed listen (EADDRINUSE: a second instance, a restart before the old process freed the port) must not leave a
// half-dead process that still runs the maintenance job: log and exit non-zero so PM2 retries.
server.on('error', guards.onListenError);

// Bind IPv4 explicitly so Render's port scanner and container ingress can reach the API.
server.listen(PORT, '0.0.0.0', () => {
  if (usesClerk()) { const cleanup = setInterval(() => { retryClerkDeletions().catch(() => console.warn('Clerk deletion cleanup will retry.')); },60_000); cleanup.unref(); }
  console.log(`🚀 ${brand.name} Backend Engine listening on http://0.0.0.0:${PORT}`);
  console.log(`📡 WebSockets listening for real-time driver tracking & order alerts`);
  // Order housekeeping every 60 s: expire unpaid orders, auto-cancel unaccepted paid orders, retry refunds.
  // Started only once the port is really ours.
  if (process.env.NODE_ENV !== 'test') startOrderMaintenance();
});
