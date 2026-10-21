import { clerkMiddleware } from '@clerk/express';
import { RequestHandler } from 'express';
import { usesClerk, clerkParties, nativeClerkRequest } from '../config/authMode';

export const grozoClerkMiddleware: RequestHandler = (req,res,next) => {
  if (!usesClerk()) return next();
  // No legacy fallback. API authentication remains JSON 401/403 in requireAuth.
  return clerkMiddleware({publishableKey:process.env.CLERK_PUBLISHABLE_KEY,secretKey:process.env.CLERK_SECRET_KEY,
    jwtKey:process.env.CLERK_JWT_KEY,authorizedParties:nativeClerkRequest(req.headers.origin)?undefined:clerkParties(),audience:process.env.CLERK_AUDIENCE || undefined})(req,res,next);
};
