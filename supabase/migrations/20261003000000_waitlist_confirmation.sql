-- When the signup confirmation email was accepted by the email provider.
-- Null means not sent yet (email not configured, or the send failed), so
-- those signups can be found and re-sent.
alter table waitlist_signups add column confirmation_sent_at timestamptz;
