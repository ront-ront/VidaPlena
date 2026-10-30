CREATE OR REPLACE FUNCTION preserve_signed_consent_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ConsentEvent" WHERE "signedFileId" = OLD."id") THEN
    RAISE EXCEPTION 'Signed consent evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
  RETURN OLD;
END;
$$;
