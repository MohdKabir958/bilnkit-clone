-- Extend the existing durable outbox to private support replies, including cases without an order.
ALTER TABLE "NotificationIntent" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "NotificationIntent" ADD COLUMN "supportNoteId" TEXT;
CREATE UNIQUE INDEX "NotificationIntent_supportNoteId_key" ON "NotificationIntent"("supportNoteId");
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_supportNoteId_fkey"
  FOREIGN KEY ("supportNoteId") REFERENCES "SupportNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_context_check"
  CHECK ("orderId" IS NOT NULL OR "supportNoteId" IS NOT NULL);
