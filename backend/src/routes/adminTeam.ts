import { Router } from 'express';
import { prisma } from '../db';
import { usesClerk } from '../config/authMode';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { changeAdminAccess, inviteAdmin, publicAdminAccess } from '../services/adminAccess';
import { AppError } from '../utils/appError';
import { fail, validParams } from '../utils/http';

export const adminTeamRouter = Router();
const base = '/v1/admin/team';
adminTeamRouter.use(base,requireAuth,requireRole('ADMIN'),(req:AuthenticatedRequest,_res,next)=>{
  if (!usesClerk() || req.user?.adminRole !== 'OWNER') return next(new AppError(403,'OWNER_REQUIRED','Only an owner can manage administrator access.'));
  next();
});
adminTeamRouter.get(base,async(req:AuthenticatedRequest,res)=>{
  try {
    const rows = await prisma.adminAccess.findMany({orderBy:[{createdAt:'asc'},{id:'asc'}]});
    res.json({success:true,data:rows.map(row=>({...publicAdminAccess(row),isCurrentUser:row.userId===req.user!.id}))});
  } catch(e) { fail(res,e,'Team could not be loaded'); }
});
adminTeamRouter.post(base,async(req:AuthenticatedRequest,res)=>{
  try { res.status(201).json({success:true,data:publicAdminAccess(await inviteAdmin(req.user!.id,req.body?.email,req.body?.role))}); }
  catch(e) { fail(res,e,'Administrator access could not be added'); }
});
adminTeamRouter.patch(base+'/:id',validParams('id'),async(req:AuthenticatedRequest,res)=>{
  try { res.json({success:true,data:publicAdminAccess(await changeAdminAccess(req.user!.id,req.params.id,req.body?.role))}); }
  catch(e) { fail(res,e,'Administrator role could not be changed'); }
});
adminTeamRouter.delete(base+'/:id',validParams('id'),async(req:AuthenticatedRequest,res)=>{
  try { res.json({success:true,data:publicAdminAccess(await changeAdminAccess(req.user!.id,req.params.id,undefined,true))}); }
  catch(e) { fail(res,e,'Administrator access could not be revoked'); }
});
