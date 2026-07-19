CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.web_events (
  event_id       String,
  event_type     LowCardinality(String),
  visitor_id     String,
  session_id     String,
  page_path      String,
  section_id     LowCardinality(String),
  target         String,
  label          String,
  value          Float64,
  referrer       String,
  utm_source     LowCardinality(String),
  utm_medium     LowCardinality(String),
  utm_campaign   LowCardinality(String),
  device_type    LowCardinality(String),
  browser        LowCardinality(String),
  os             LowCardinality(String),
  country        LowCardinality(String),
  properties     Map(String, String),
  client_ts      DateTime64(3, 'UTC'),
  server_ts      DateTime64(3, 'UTC') DEFAULT now64(3, 'UTC'),
  event_date     Date DEFAULT toDate(server_ts)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_type, server_ts);
