CREATE FUNCTION preserve_signed_consent_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ConsentEvent" WHERE "signedFileId" = OLD."id") THEN
    RAISE EXCEPTION 'Signed consent evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER signed_consent_evidence_no_mutation BEFORE UPDATE OR DELETE ON "FileObject"
FOR EACH ROW EXECUTE FUNCTION preserve_signed_consent_evidence();
