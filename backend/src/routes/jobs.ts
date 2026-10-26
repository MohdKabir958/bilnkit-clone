import { Router } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { fail } from '../utils/http';
import { JobStore } from '../services/jobs';
import { AppError } from '../utils/appError';

export const jobsRouter = Router();
const store = new JobStore();
jobsRouter.use('/admin/jobs', requireAuth, requireRole('ADMIN'));
jobsRouter.get('/admin/jobs', async (_req, res) => {
  try { res.json({ success: true, data: await store.list() }); }
  catch (error) { fail(res, error, 'Background job monitoring'); }
});
jobsRouter.get('/admin/jobs/:name/runs', async (req, res) => {
  try {
    if (!/^[a-z][a-z0-9._-]{1,79}$/.test(req.params.name)) throw new AppError(400, 'BAD_REQUEST', 'Choose a valid job.');
    res.json({ success: true, data: await store.runs(req.params.name) });
  } catch (error) { fail(res, error, 'Background job history'); }
});
jobsRouter.post('/admin/jobs/:name/retry', async (req: AuthenticatedRequest, res) => {
  try {
    if (typeof req.body?.reason !== 'string') throw new AppError(400, 'BAD_JOB_RECOVERY', 'Enter a recovery reason.');
    const changed = await store.retry(req.params.name, req.user!.id, req.body.reason, new Date());
    res.json({ success: true, idempotent: !changed });
  } catch (error) { fail(res, error, 'Background job recovery'); }
});
