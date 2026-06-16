# Architecture Overview - National Healthcare Data Exchange Platform

This document describes the high-level design of the cloud-native, open-source National Healthcare Data Exchange Platform.

## System Topology & Data Flow

```mermaid
graph TD
    subgraph Client Layer
        F[React SPA Frontend]
    end

    subgraph Security & Secret Store
        V[HashiCorp Vault]
    end

    subgraph Service Layer
        B[Node/Express API Server]
        LH[Legacy Adapter Endpoint]
    end

    subgraph Relational Database
        P[(PostgreSQL Database)]
    end

    subgraph Object Storage
        M[(MinIO Backup Storage)]
    end

    subgraph Monitoring
        PR[Prometheus Scraper]
        G[Grafana Dashboards]
    end

    F -->|JWT / REST API| B
    F -->|Socket.io Sync| B
    LH -->|Parse XML/CSV| B
    B -->|Fetch credentials| V
    B -->|Query & Write| P
    B -->|AES Encrypted Columns| P
    B -->|Metrics /metrics| PR
    PR -->|Scrape| G
    B -.->|pg_dump Stream| M
```

## Core Architectural Modules

1. **Frontend Client (React SPA)**: Served using Nginx in containers. Distributes role-based views (Hospital Staff, Lab Tech, Pharmacist, Insurance Agent, Admin).
2. **Backend API (Node.js/Express)**: Exposes endpoints, handles request validation, executes authorization checks using JWT tokens and Role-Based Access Control (RBAC) middleware, and emits real-time updates via Socket.io.
3. **Database (PostgreSQL)**: Persists schemas for clinical, billing, and system audit logging.
4. **Secrets Manager (HashiCorp Vault)**: Isolates database passwords and JWT signing keys, exposing them dynamically to the backend at boot.
5. **Real-time Event Broker (Socket.io)**: Synchronizes user interface states automatically when mutations occur in the exchange database.
6. **Object Storage (MinIO)**: S3-compatible local bucket storage acting as the disaster recovery backup registry.
7. **Scraper & Monitoring Engine (Prometheus & Grafana)**: Polls metric indicators (latencies, counts) from the API `/metrics` endpoint.
