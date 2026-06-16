# AWS → Open-Source Software Mapping Table

To run this project fully locally on a laptop without incurring AWS cloud platform charges, we have replaced each AWS service with its industry-standard open-source equivalent. The APIs and architectures are directly comparable.

| Original (AWS-based) requirement | Replacement used here | Why it satisfies the requirement |
|---|---|---|
| **AWS EKS** (Kubernetes orchestration) | **Minikube / Kind** (local Kubernetes) | Runs the same Kubernetes YAML manifests and API structures. The deployment, service, ingress, HPA, and namespace structures are identical. |
| **AWS RDS** (managed Postgres) | **PostgreSQL** container / StatefulSet | Runs the exact same PostgreSQL database relational engine, configured via stateful persistent volumes. |
| **AWS S3** (object storage for documents/backups) | **MinIO** | Implements the identical S3-API specs. Can be interacted with using standard S3 clients, AWS CLI, or `mc` tools. |
| **AWS IAM** (identity & access mgmt) | **JWT Auth + RBAC middleware** and **K8s RBAC** | Provides the same role/permission-based access delegation model on API routes and cluster permissions. |
| **AWS API Gateway** | **NGINX Reverse Proxy / Ingress** | Routes, rewrites, and balances web traffic to API services, performing TLS termination. |
| **AWS CloudWatch** | **Prometheus + Grafana** | Captures real-time metrics, scrapes endpoints, and visualizes system charts and performance dashboards. |
