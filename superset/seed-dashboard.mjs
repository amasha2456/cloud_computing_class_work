const SUPERSET_URL = process.env.SUPERSET_URL || "http://localhost:8088";
const ADMIN_USERNAME = process.env.SUPERSET_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.SUPERSET_ADMIN_PASSWORD;
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD;

const DATABASE_NAME = "ClickHouse Analytics";
const DATASET_TABLE = "web_events";
const DATASET_SCHEMA = "analytics";
const DASHBOARD_TITLE = "New Event — Visitor & Registration Analytics";

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

async function waitForSuperset() {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SUPERSET_URL}/health`);
      if (res.ok) {
        log("Superset is healthy");
        return;
      }
    } catch (e) {
      // not up yet
    }
    log("Waiting for Superset...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Timed out waiting for Superset to become healthy");
}

async function login() {
  const res = await fetch(`${SUPERSET_URL}/api/v1/security/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      provider: "db",
      refresh: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function getCsrf(token) {
  const res = await fetch(`${SUPERSET_URL}/api/v1/security/csrf_token/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`CSRF fetch failed: ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];
  const data = await res.json();
  return { csrf: data.result, cookie };
}

class SupersetClient {
  constructor(token, csrf, cookie) {
    this.token = token;
    this.csrf = csrf;
    this.cookie = cookie;
  }

  async request(method, path, body) {
    const res = await fetch(`${SUPERSET_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "X-CSRFToken": this.csrf,
        Cookie: this.cookie,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    }
    return data;
  }

  get(path) {
    return this.request("GET", path);
  }

  post(path, body) {
    return this.request("POST", path, body);
  }

  put(path, body) {
    return this.request("PUT", path, body);
  }
}

async function findByField(client, resource, field, value) {
  const data = await client.get(`/api/v1/${resource}/?q=(page_size:100)`);
  return (data.result || []).find((r) => r[field] === value);
}

async function ensureDatabase(client) {
  const existing = await findByField(client, "database", "database_name", DATABASE_NAME);
  if (existing) {
    log(`Database "${DATABASE_NAME}" already exists (id=${existing.id})`);
    return existing.id;
  }
  const created = await client.post("/api/v1/database/", {
    database_name: DATABASE_NAME,
    sqlalchemy_uri: `clickhousedb://default:${CLICKHOUSE_PASSWORD}@clickhouse:8123/analytics`,
    expose_in_sqllab: true,
  });
  log(`Created database "${DATABASE_NAME}" (id=${created.id})`);
  return created.id;
}

async function ensureDataset(client, databaseId) {
  const existing = await findByField(client, "dataset", "table_name", DATASET_TABLE);
  if (existing) {
    log(`Dataset "${DATASET_TABLE}" already exists (id=${existing.id})`);
    return existing.id;
  }
  const created = await client.post("/api/v1/dataset/", {
    database: databaseId,
    schema: DATASET_SCHEMA,
    table_name: DATASET_TABLE,
  });
  log(`Created dataset "${DATASET_TABLE}" (id=${created.id})`);
  return created.id;
}

function simpleFilter(subject, operator, comparator) {
  return { clause: "WHERE", expressionType: "SIMPLE", subject, operator, comparator };
}

function adhocColumn(sqlExpression, label) {
  return { expressionType: "SQL", sqlExpression, label };
}

function adhocMetric(sqlExpression, label) {
  return {
    expressionType: "SQL",
    sqlExpression,
    label,
    optionName: `metric_${label.replace(/\s+/g, "_")}`,
  };
}

function chartDefs(datasourceId) {
  const datasource = `${datasourceId}__table`;
  const base = { datasource_id: datasourceId, datasource_type: "table" };

  return [
    {
      ...base,
      slice_name: "Registration Funnel",
      viz_type: "funnel",
      params: {
        datasource,
        viz_type: "funnel",
        groupby: ["event_type"],
        metric: "count",
        adhoc_filters: [
          simpleFilter("event_type", "IN", [
            "registration_form_started",
            "registration_submitted",
            "registration_success",
          ]),
        ],
        row_limit: 100,
      },
    },
    {
      ...base,
      slice_name: "Sold-Out Rejections Over Time",
      viz_type: "echarts_timeseries_bar",
      params: {
        datasource,
        viz_type: "echarts_timeseries_bar",
        x_axis: "event_date",
        x_axis_sort_asc: true,
        groupby: [],
        metrics: ["count"],
        adhoc_filters: [simpleFilter("event_type", "==", "registration_failed")],
        row_limit: 100,
        order_desc: true,
        seriesType: "bar",
        show_legend: true,
      },
    },
    {
      ...base,
      slice_name: "Section Attention Funnel",
      viz_type: "funnel",
      params: {
        datasource,
        viz_type: "funnel",
        groupby: ["section_id"],
        metric: "count",
        adhoc_filters: [simpleFilter("event_type", "==", "section_view")],
        row_limit: 100,
      },
    },
    {
      ...base,
      slice_name: "Program / Track Interest",
      viz_type: "echarts_timeseries_bar",
      params: {
        datasource,
        viz_type: "echarts_timeseries_bar",
        x_axis: adhocColumn("properties['track']", "track"),
        groupby: [],
        metrics: ["count"],
        adhoc_filters: [simpleFilter("event_type", "==", "program_card_click")],
        row_limit: 100,
        order_desc: true,
        seriesType: "bar",
        show_legend: true,
      },
    },
    {
      ...base,
      slice_name: "Speaker Interest",
      viz_type: "echarts_timeseries_bar",
      params: {
        datasource,
        viz_type: "echarts_timeseries_bar",
        x_axis: "target",
        groupby: [],
        metrics: ["count"],
        adhoc_filters: [simpleFilter("event_type", "==", "speaker_card_click")],
        row_limit: 100,
        order_desc: true,
        seriesType: "bar",
        show_legend: true,
      },
    },
    {
      ...base,
      slice_name: "Video Engagement",
      viz_type: "echarts_timeseries_bar",
      params: {
        datasource,
        viz_type: "echarts_timeseries_bar",
        x_axis: "event_type",
        groupby: [],
        metrics: ["count"],
        adhoc_filters: [
          simpleFilter("event_type", "IN", ["video_play", "video_progress", "video_complete"]),
        ],
        row_limit: 100,
        order_desc: true,
        seriesType: "bar",
        show_legend: true,
      },
    },
    {
      ...base,
      slice_name: "Traffic Sources",
      viz_type: "pie",
      params: {
        datasource,
        viz_type: "pie",
        groupby: ["utm_source"],
        metric: "count",
        adhoc_filters: [simpleFilter("event_type", "==", "session_start")],
        row_limit: 100,
      },
    },
    {
      ...base,
      slice_name: "Device Mix",
      viz_type: "pie",
      params: {
        datasource,
        viz_type: "pie",
        groupby: ["device_type"],
        metric: adhocMetric("COUNT(DISTINCT session_id)", "sessions"),
        adhoc_filters: [],
        row_limit: 100,
      },
    },
    {
      ...base,
      slice_name: "Browser Mix",
      viz_type: "pie",
      params: {
        datasource,
        viz_type: "pie",
        groupby: ["browser"],
        metric: adhocMetric("COUNT(DISTINCT session_id)", "sessions"),
        adhoc_filters: [],
        row_limit: 100,
      },
    },
  ];
}

async function ensureChart(client, def) {
  const desiredParams = JSON.stringify(def.params);
  const existing = await findByField(client, "chart", "slice_name", def.slice_name);

  if (existing) {
    const current = await client.get(`/api/v1/chart/${existing.id}`);
    if (current.result.viz_type !== def.viz_type || current.result.params !== desiredParams) {
      await client.put(`/api/v1/chart/${existing.id}`, {
        viz_type: def.viz_type,
        params: desiredParams,
      });
      log(`Updated chart "${def.slice_name}" (id=${existing.id})`);
    } else {
      log(`Chart "${def.slice_name}" already up to date (id=${existing.id})`);
    }
    return existing.id;
  }

  const created = await client.post("/api/v1/chart/", {
    slice_name: def.slice_name,
    viz_type: def.viz_type,
    datasource_id: def.datasource_id,
    datasource_type: def.datasource_type,
    params: desiredParams,
  });
  log(`Created chart "${def.slice_name}" (id=${created.id})`);
  return created.id;
}

async function ensureDashboard(client) {
  const existing = await findByField(client, "dashboard", "dashboard_title", DASHBOARD_TITLE);
  if (existing) {
    log(`Dashboard "${DASHBOARD_TITLE}" already exists (id=${existing.id})`);
    return existing.id;
  }
  const created = await client.post("/api/v1/dashboard/", {
    dashboard_title: DASHBOARD_TITLE,
  });
  log(`Created dashboard "${DASHBOARD_TITLE}" (id=${created.id})`);
  return created.id;
}

async function attachChartToDashboard(client, chartId, dashboardId) {
  const chart = await client.get(`/api/v1/chart/${chartId}`);
  const dashboards = (chart.result.dashboards || []).map((d) => d.id);
  if (dashboards.includes(dashboardId)) {
    return;
  }
  dashboards.push(dashboardId);
  await client.put(`/api/v1/chart/${chartId}`, { dashboards });
}

async function main() {
  if (!ADMIN_PASSWORD || !CLICKHOUSE_PASSWORD) {
    throw new Error("SUPERSET_ADMIN_PASSWORD and CLICKHOUSE_PASSWORD are required");
  }

  await waitForSuperset();

  const token = await login();
  const { csrf, cookie } = await getCsrf(token);
  const client = new SupersetClient(token, csrf, cookie);

  const databaseId = await ensureDatabase(client);
  const datasetId = await ensureDataset(client, databaseId);

  const chartIds = [];
  for (const def of chartDefs(datasetId)) {
    const id = await ensureChart(client, def);
    chartIds.push(id);
  }

  const dashboardId = await ensureDashboard(client);
  for (const chartId of chartIds) {
    await attachChartToDashboard(client, chartId, dashboardId);
  }

  log(`Done. Dashboard "${DASHBOARD_TITLE}" (id=${dashboardId}) has ${chartIds.length} charts.`);
  log(`Open ${SUPERSET_URL}/superset/dashboard/${dashboardId}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
