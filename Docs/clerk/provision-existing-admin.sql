-- ONE-TIME OPERATOR ACTION in the staging database used by Render.
-- Copy the exact ID of YOUR verified Clerk account, already allowlisted in
-- Render CLERK_ADMIN_USER_IDS. Replace the placeholder below once.
-- This changes an existing linked account only; it creates no identities and
-- never links by email/phone. A vendor/rider identity is not repurposed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('grozo.approved_admin_id', 'PASTE_EXACT_CLERK_USER_ID', true);
DO $grozo_admin$
DECLARE
  subject text := current_setting('grozo.approved_admin_id');
  account record;
BEGIN
  IF subject !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Replace the placeholder with the exact approved Clerk user ID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(subject, 81971));
  SELECT id,role,"deletedAt" INTO account FROM "User" WHERE "clerkUserId"=subject FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No linked Grozo account. Check the database and user ID, then sign in once.';
  END IF;
  IF account."deletedAt" IS NOT NULL OR EXISTS (
    SELECT 1 FROM "ClerkIdentityState" WHERE "clerkUserId"=subject AND
      (deleted OR suspended OR "deleteRequested")
  ) THEN
    RAISE EXCEPTION 'Deleted or suspended identity cannot be provisioned';
  END IF;
  IF account.role NOT IN ('STUDENT','ADMIN') THEN
    RAISE EXCEPTION 'Do not repurpose a vendor or delivery identity as an administrator';
  END IF;
  IF account.role <> 'ADMIN' THEN
    UPDATE "User" SET role='ADMIN',"updatedAt"=CURRENT_TIMESTAMP WHERE id=account.id;
    INSERT INTO "AdminAuditLog" (id,action,"targetType","targetId",summary)
    VALUES (gen_random_uuid()::text,'CLERK_ADMIN_PROVISIONED','USER',account.id,
      'Owner explicitly approved an existing verified, Render-allowlisted Clerk subject through Neon SQL Editor.');
  END IF;
END
$grozo_admin$;
SELECT id,name,role,"clerkUserId" FROM "User"
WHERE "clerkUserId"=current_setting('grozo.approved_admin_id');
COMMIT;
