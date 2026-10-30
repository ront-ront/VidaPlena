CREATE TABLE "ConsentDocumentVersion" (
  "id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "bodyReference" TEXT NOT NULL,
  "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
  "publishedBy" UUID NOT NULL,
  "publishedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentDocumentVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConsentDocumentVersion_kind_version_key" ON "ConsentDocumentVersion"("kind", "version");
CREATE INDEX "ConsentDocumentVersion_kind_effectiveAt_publishedAt_idx" ON "ConsentDocumentVersion"("kind", "effectiveAt", "publishedAt");
ALTER TABLE "ConsentDocumentVersion" ADD CONSTRAINT "ConsentDocumentVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsentEvent" (
  "id" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "documentVersionId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "guardianLinkId" UUID,
  "consentingPersonName" TEXT NOT NULL,
  "consentingRelationship" TEXT,
  "signedFileId" UUID,
  CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsentEvent_action_check" CHECK ("action" IN ('accept','refuse','revoke')),
  CONSTRAINT "ConsentEvent_source_check" CHECK ("source" IN ('portal','onsite')),
  CONSTRAINT "ConsentEvent_onsite_evidence_check" CHECK ("source" <> 'onsite' OR "action" <> 'accept' OR "signedFileId" IS NOT NULL)
);
CREATE INDEX "ConsentEvent_patientId_occurredAt_id_idx" ON "ConsentEvent"("patientId", "occurredAt", "id");
CREATE INDEX "ConsentEvent_documentVersionId_action_idx" ON "ConsentEvent"("documentVersionId", "action");
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "ConsentDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_guardianLinkId_fkey" FOREIGN KEY ("guardianLinkId") REFERENCES "GuardianLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_signedFileId_fkey" FOREIGN KEY ("signedFileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION preserve_consent_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Consent history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER consent_document_no_mutation BEFORE UPDATE OR DELETE ON "ConsentDocumentVersion"
FOR EACH ROW EXECUTE FUNCTION preserve_consent_history();
CREATE TRIGGER consent_document_no_truncate BEFORE TRUNCATE ON "ConsentDocumentVersion"
FOR EACH STATEMENT EXECUTE FUNCTION preserve_consent_history();
CREATE TRIGGER consent_event_no_mutation BEFORE UPDATE OR DELETE ON "ConsentEvent"
FOR EACH ROW EXECUTE FUNCTION preserve_consent_history();
CREATE TRIGGER consent_event_no_truncate BEFORE TRUNCATE ON "ConsentEvent"
FOR EACH STATEMENT EXECUTE FUNCTION preserve_consent_history();
