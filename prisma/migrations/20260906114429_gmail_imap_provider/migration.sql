-- Gmail reachable over IMAP with an app password, as an alternative to the
-- OAuth path. A Google Cloud OAuth client in "Testing" publishing status
-- issues refresh tokens that expire after 7 days, which breaks the background
-- poller weekly; going to Production instead requires Google verification plus
-- an annual CASA security assessment, because gmail.readonly is a restricted
-- scope. An app password sidesteps both.
--
-- Additive only: existing GOOGLE (OAuth) accounts keep working.
ALTER TYPE "MailProvider" ADD VALUE 'GMAIL_IMAP';
