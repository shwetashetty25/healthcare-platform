#!/bin/bash
# Script to deploy the National Healthcare Data Exchange Platform on Minikube

set -e

echo "=== 1. Creating Namespace ==="
kubectl apply -f namespace.yaml

echo "=== 2. Applying RBAC Configurations ==="
kubectl apply -f rbac.yaml

echo "=== 3. Deploying Databases & Stores (Postgres, MinIO, Vault) ==="
kubectl apply -f postgres.yaml
kubectl apply -f minio.yaml
kubectl apply -f vault.yaml

echo "=== 4. Waiting for database and services to become healthy ==="
kubectl wait --namespace=healthcare-platform --for=condition=ready pod -l app=postgres --timeout=120s
kubectl wait --namespace=healthcare-platform --for=condition=ready pod -l app=vault --timeout=120s

echo "=== 5. Deploying Web Services & HPA (Backend & Frontend) ==="
kubectl apply -f backend.yaml
kubectl apply -f frontend.yaml

echo "=== 6. Configuring Ingress Rules ==="
kubectl apply -f ingress.yaml

echo "=== Deployments Completed ==="
kubectl get all -n healthcare-platform
