create table config (
  key text primary key,
  value text
);

insert into config values ('last_poll_ts', '0');

create table churn_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp default now(),

  -- Slack metadata
  slack_message_ts text unique not null,

  -- Event type
  event_type text not null,
  -- values: 'cancellation', 'discount_accepted'

  -- Customer info (parsed from Slack message)
  customer_email text not null,
  customer_since date,
  plan_amount_dollars numeric,

  -- Churn reason (cancellations only)
  feedback text,
  survey_response text,

  -- Discount info (discount_accepted only)
  discount_amount text,

  -- AI decision (cancellations only)
  ai_score_passed boolean,
  ai_score_reason text,

  -- Status
  -- 'pending'  = cancellation, AI passed, awaiting action
  -- 'skipped'  = cancellation AI failed, or discount_accepted event
  -- 'approved', 'sent', 'rejected' reserved for v0.2
  status text not null default 'pending'
);
