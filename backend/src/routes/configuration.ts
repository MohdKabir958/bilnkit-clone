import { paymentCapabilities } from '../services/paymentCapabilities';
import { Router } from 'express';
import { publicDeploymentContract } from '../config/deploymentContract';
import { databaseConfiguration } from '../config/databaseConfig';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../db';
import { runtimeReadiness } from '../services/readinessDiagnostic';

export const configurationRouter = Router();
configurationRouter.get('/config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { ...publicDeploymentContract(), paymentCapabilities: paymentCapabilities() } });
});
configurationRouter.get('/admin/diagnostics/configuration', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const readiness = await runtimeReadiness(prisma);
    res.json({ success: true, data: { ...publicDeploymentContract(), database: databaseConfiguration(process.env), storage: { configured: Boolean(process.env.UPLOAD_DIR), writable: readiness.uploadWritable }, schemaReady: readiness.schemaReady } });
  } catch {
    res.status(503).json({ success: false, code: 'CONFIGURATION_NOT_READY', message: 'The deployment schema or persistent storage is not ready. Ask the operator to review safe server diagnostics.' });
  }
});
