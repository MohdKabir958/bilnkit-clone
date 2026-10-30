import { RequestHandler } from 'express';
import { clientCompatibility, publicDeploymentContract } from '../config/deploymentContract';

/** These headers describe deployment compatibility, never grant identity or permission. */
export const clientContractMiddleware: RequestHandler = (req, res, next) => {
  const contract = publicDeploymentContract();
  res.set('X-Grozo-Protocol', String(contract.protocolVersion));
  res.set('X-Grozo-Auth-Provider', contract.auth.provider);
  // Providers authenticate their own webhooks; no browser/mobile contract is required there.
  if (req.path === '/config' || req.path.startsWith('/webhooks/') || req.path === '/payments/webhook') return next();
  const result = clientCompatibility({ mode: req.get('X-Grozo-Auth-Mode'), protocol: req.get('X-Grozo-Client-Protocol'), clerkInstance: req.get('X-Grozo-Clerk-Frontend') });
  if (!result.compatible) return void res.set('Cache-Control', 'no-store').status(409).json({ success: false, code: 'DEPLOYMENT_MISMATCH', message: result.message, configuration: contract });
  next();
};
