#!/bin/bash
# ==============================================================================
# Disaster Recovery & Backup Script - National Healthcare Data Exchange
#
# Process:
# 1. Trigger pg_dump inside the postgres container
# 2. Package and compress the dump
# 3. Securely transfer/upload the archive to MinIO storage bucket directory
# ==============================================================================

set -e

# Configuration
BACKUP_DIR="$(dirname "$0")/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="healthcare_backup_${TIMESTAMP}.sql"
POSTGRES_CONTAINER="postgres"
MINIO_CONTAINER="minio"

echo "=== [Disaster Recovery System] ==="
echo "Starting database backup sequence..."

# Create local backup directory if not exists
mkdir -p "${BACKUP_DIR}"

# Step 1: Perform pg_dump
echo "1. Exporting database schemas and records from Container: ${POSTGRES_CONTAINER}..."
if ! docker exec -i ${POSTGRES_CONTAINER} pg_dump -U postgres healthcare_db > "${BACKUP_DIR}/${BACKUP_FILE}"; then
  echo "[-] ERROR: Database dump failed. Check if PostgreSQL container is running."
  exit 1
fi
echo "[+] Successfully exported to local path: ${BACKUP_DIR}/${BACKUP_FILE}"

# Step 2: Initialize target S3/MinIO alias and configuration
echo "2. Initializing target S3/MinIO client alias..."
docker exec -i ${MINIO_CONTAINER} mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null

# Step 3: Stream/Upload backup to MinIO storage
echo "3. Uploading database archive to MinIO bucket 'backups'..."
if ! docker cp "${BACKUP_DIR}/${BACKUP_FILE}" "${MINIO_CONTAINER}:/tmp/${BACKUP_FILE}" || \
   ! docker exec -i ${MINIO_CONTAINER} mc cp "/tmp/${BACKUP_FILE}" "local/backups/${BACKUP_FILE}" || \
   ! docker exec -i ${MINIO_CONTAINER} rm "/tmp/${BACKUP_FILE}"; then
  echo "[-] ERROR: Failed to upload backup file to MinIO object storage."
  exit 1
fi

echo "========================================="
echo "[+] BACKUP SUCCESSFUL"
echo "Target bucket: backups"
echo "Object name:   ${BACKUP_FILE}"
echo "Timestamp:     $(date)"
echo "========================================="
