#!/usr/bin/env node
// Operator console only, never an HTTP endpoint. Build first; use secure environment configuration.
import 'dotenv/config';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {linkClerkIdentity,provisionClerkAdmin}=require('../dist/services/clerkIdentity.js');
const {prisma}=require('../dist/db.js');
const [operation,subject,internalId]=process.argv.slice(2),operator=process.env.CLERK_OPERATOR_REFERENCE;
try {
  if (!operator || !['link','admin'].includes(operation) || !subject || (operation==='link'&&!internalId)) throw Error('Usage: CLERK_OPERATOR_REFERENCE=<approved-ticket> node scripts/clerk-identity.mjs link <clerkUserId> <internalUUID> OR admin <clerkUserId>. Verify ownership and record approval before linking.');
  const result=operation==='link'?await linkClerkIdentity(internalId,subject,operator):await provisionClerkAdmin(subject,operator);
  console.log(JSON.stringify({success:true,...result}));
} catch(error) {
  console.error(error?.code==='LINK_CONFLICT'?'Identity conflict; nothing reassociated.':error?.status===403?'Subject not approved for this operation.':'Identity operation failed. Check secure configuration, connectivity and operator approval; no credentials are logged.');
  process.exitCode=1;
} finally {await prisma.$disconnect();}
