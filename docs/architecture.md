# NewEvent — Architecture Reference

Two diagrams: how a request/data moves through the running system, and separately, how a commit moves from a laptop into that system.

Both render natively on GitHub, in VS Code's Markdown preview, and by pasting the code blocks into [mermaid.live](https://mermaid.live).

## Solution architecture — request flow & data flow

Solid arrows (`-->`) are request flow. Dashed arrows (`-.->`) are data flow.

```mermaid
flowchart TB
  Browser["Browser"]

  subgraph CLUSTER["k3s cluster - namespace: newevent"]
    Traefik["Traefik Ingress\n(TLS via cert-manager)"]
    Frontend["frontend-service"]
    EventSvc["event-service"]
    ProgramSvc["program-service"]
    RegSvc["registration-service"]
    AuthSvc["auth-service"]
    AnalyticsSvc["analytics-service"]
    Grafana["grafana"]
    Superset["superset"]
    Prometheus[("prometheus")]
    PGExporter["postgres-exporter"]
    Postgres[("postgres")]
    ClickHouse[("clickhouse")]
  end

  subgraph EXT["AWS Lambda and SES"]
    LambdaConfirm["registration-confirmation"]
    LambdaSeats["seats-unavailable-notifier"]
    SES["Amazon SES"]
  end

  Inbox["attendee inbox"]

  Browser -->|"HTTPS, app.*"| Traefik
  Browser -->|"HTTPS, web.analytics.*"| Traefik
  Browser -->|"HTTPS, performance.metrices.*"| Traefik

  Traefik -->|"/"| Frontend
  Traefik -->|"/api/v1/event"| EventSvc
  Traefik -->|"/api/v1/program"| ProgramSvc
  Traefik -->|"/api/v1/registration"| RegSvc
  Traefik -->|"/api/v1/auth"| AuthSvc
  Traefik -->|"/api/v1/collect"| AnalyticsSvc
  Traefik -->|"host"| Grafana
  Traefik -->|"host"| Superset

  RegSvc -->|"check and update seats"| EventSvc
  RegSvc -->|"invoke, async"| LambdaConfirm
  RegSvc -->|"invoke, async"| LambdaSeats

  RegSvc -.->|"insert row"| Postgres
  EventSvc -.->|"read and write"| Postgres
  ProgramSvc -.->|"read and write"| Postgres

  AnalyticsSvc -.->|"buffered writes"| ClickHouse
  Superset -.->|"dashboard queries"| ClickHouse
  Superset -.->|"metadata"| Postgres
  Grafana -.->|"dashboard queries"| Prometheus
  Prometheus -.->|"scrape metrics"| EventSvc
  Prometheus -.->|"scrape metrics"| ProgramSvc
  Prometheus -.->|"scrape metrics"| RegSvc
  Prometheus -.->|"scrape metrics"| AnalyticsSvc
  PGExporter -.->|"read stats"| Postgres

  LambdaConfirm -.->|"send email"| SES
  LambdaSeats -.->|"send email"| SES
  SES -.->|"deliver"| Inbox

  classDef svc fill:#1F2624,stroke:#3A423E,color:#E7E9E4;
  classDef store fill:#232A28,stroke:#3FA6A3,color:#E7E9E4;
  classDef ext fill:#1F2624,stroke:#E0A23D,color:#E7E9E4;
  classDef inbox fill:#1A1F1D,stroke:#3A423E,color:#9AA39C;

  class Frontend,EventSvc,ProgramSvc,RegSvc,AuthSvc,AnalyticsSvc,Grafana,Superset,Traefik,PGExporter svc;
  class Postgres,ClickHouse,Prometheus store;
  class LambdaConfirm,LambdaSeats,SES ext;
  class Inbox inbox;
```

### Component notes

- **Traefik Ingress** — single entry point on 80/443; routes by hostname + path, terminates TLS issued by cert-manager.
- **registration-service** — validates seat availability against event-service, writes the registration, then fires both Lambdas asynchronously; the request never waits on email.
- **Lambda pair** — `registration-confirmation` and `seats-unavailable-notifier` each call SES directly; neither runs inside the cluster.
- **Postgres** — system of record for events, programs, registrations, plus Superset's own metadata database.
- **ClickHouse** — append-only store for web analytics events, flushed in batches by analytics-service.
- **Grafana / Superset** — read-only dashboards over Prometheus and ClickHouse respectively; neither writes back to the app.

## Deployment architecture — commit to cluster

```mermaid
flowchart TB
  Dev["developer"]
  GitHub["GitHub - main"]
  Dev -->|"git push"| GitHub

  subgraph ACTIONS["GitHub Actions"]
    CI["CI workflow, typecheck and test"]
    CD["CD workflow"]
    CI -->|"on success"| CD
  end
  GitHub --> CI

  subgraph STEPS["CD steps"]
    BuildPush["build and push images"]
    LambdaDeploy["deploy Lambda functions"]
    SSHDeploy["SSH deploy"]
  end
  CD --> BuildPush
  CD --> LambdaDeploy
  CD --> SSHDeploy

  DockerHub[("Docker Hub")]
  BuildPush --> DockerHub

  subgraph LAMBDAS["AWS Lambda"]
    L1["registration-confirmation"]
    L2["seats-unavailable-notifier"]
  end
  LambdaDeploy --> LAMBDAS

  subgraph EC2["EC2 instance, Elastic IP, k3s, namespace: newevent"]
    TraefikD["Traefik and cert-manager"]
    BG["blue/green: frontend, event, program, registration, auth, analytics"]
    PG[("postgres")]
    CH[("clickhouse")]
    Prom[("prometheus")]
    Graf["grafana"]
    CAdv["cadvisor, DaemonSet"]
    SupersetD["superset and superset-seed job"]
  end

  SSHDeploy -->|"kubectl apply, blue-green cutover"| TraefikD
  DockerHub -.->|"pulls images"| BG

  DNS["freedev.app, 3 CNAME records"] -->|"resolves to"| TraefikD
  LetsEncrypt["Let's Encrypt"] -.->|"HTTP-01 challenge"| TraefikD

  classDef pipeline fill:#1F2624,stroke:#E0A23D,color:#E7E9E4;
  classDef infra fill:#1F2624,stroke:#3A423E,color:#E7E9E4;
  classDef store fill:#232A28,stroke:#3FA6A3,color:#E7E9E4;
  classDef ext fill:#1A1F1D,stroke:#3A423E,color:#9AA39C;

  class Dev,GitHub,CI,CD,BuildPush,LambdaDeploy,SSHDeploy pipeline;
  class TraefikD,BG,SupersetD,CAdv,Graf infra;
  class PG,CH,Prom,DockerHub store;
  class L1,L2,DNS,LetsEncrypt ext;
```

### Component notes

- **CI workflow** — typecheck + test matrix across every service. Must pass before CD fires automatically.
- **CD workflow** — builds all six service images plus Superset, tagged with the commit SHA, never `latest`, so blue-green rollback stays meaningful.
- **Blue/green services** — each of the six has two Deployments; only one slot takes live traffic at a time, cut over after a smoke test.
- **cert-manager** — watches the Ingress, requests a Let's Encrypt certificate over HTTP-01, renews it automatically.
- **DNS** — three CNAMEs on a domain limited to CNAME/MX/SPF records, all pointing at the instance's Elastic IP hostname.
- **Superset job** — a one-shot Kubernetes Job, not a Deployment; seeds dashboards once per deploy, doesn't run continuously.
