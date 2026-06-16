# ==============================================================================
# Terraform Infrastructure as Code for National Healthcare Data Exchange Platform
#
# DESIGN EXPLANATION (AWS EQUIVALENCE):
# In a standard production cloud deployment, this Terraform plan would use the:
# 1. AWS Provider to provision:
#    - AWS EKS (Elastic Kubernetes Service) for container orchestration
#    - AWS RDS PostgreSQL for secure managed patient storage
#    - AWS Secrets Manager to handle sensitive signing keys and db logins
# 2. Kubernetes Provider to deploy application packages inside EKS.
#
# Because this is an academic DevOps demo designed to run fully locally without AWS charges, 
# we utilize the Terraform Kubernetes provider to orchestrate services directly inside 
# Minikube or Kind. The IaC logic is structurally equivalent.
# ==============================================================================

terraform {
  required_version = ">= 1.2.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20.0"
    }
  }
}

provider "kubernetes" {
  config_path = var.kube_config_path
}

# 1. Namespace Definition
resource "kubernetes_namespace" "healthcare" {
  metadata {
    name = var.namespace_name
    labels = {
      managed-by = "terraform"
      app        = "healthcare-exchange"
    }
  }
}

# 2. ConfigMap for Non-sensitive Settings
resource "kubernetes_config_map" "backend_config" {
  metadata {
    name      = "backend-config"
    namespace = kubernetes_namespace.healthcare.metadata[0].name
  }

  data = {
    DB_HOST = "postgres-service"
    DB_PORT = "5432"
    DB_NAME = "healthcare_db"
    DB_USER = "postgres"
  }
}

# 3. Secret for Credentials & Encryption Keys
resource "kubernetes_secret" "backend_secrets" {
  metadata {
    name      = "backend-secrets"
    namespace = kubernetes_namespace.healthcare.metadata[0].name
  }

  type = "Opaque"

  data = {
    DB_PASSWORD    = base64encode(var.db_password)
    JWT_SECRET     = base64encode(var.jwt_secret)
    ENCRYPTION_KEY = base64encode(var.encryption_key)
  }
}

# 4. Backend Deployment
resource "kubernetes_deployment" "backend" {
  metadata {
    name      = "backend"
    namespace = kubernetes_namespace.healthcare.metadata[0].name
    labels = {
      app = "backend"
    }
  }

  spec {
    replicas = var.backend_replicas

    selector {
      match_labels = {
        app = "backend"
      }
    }

    template {
      metadata {
        labels = {
          app = "backend"
        }
      }

      spec {
        container {
          name  = "backend"
          image = "healthcare-exchange-backend:latest"
          
          port {
            container_port = 5000
          }

          resources {
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
          }

          env {
            name  = "DB_HOST"
            value = kubernetes_config_map.backend_config.data["DB_HOST"]
          }
          env {
            name  = "DB_PORT"
            value = kubernetes_config_map.backend_config.data["DB_PORT"]
          }
          env {
            name  = "DB_NAME"
            value = kubernetes_config_map.backend_config.data["DB_NAME"]
          }
          env {
            name  = "DB_USER"
            value = kubernetes_config_map.backend_config.data["DB_USER"]
          }
          env {
            name_from {
              secret_key_ref {
                name = kubernetes_secret.backend_secrets.metadata[0].name
                key  = "DB_PASSWORD"
              }
            }
            name = "DB_PASSWORD"
          }
          env {
            name_from {
              secret_key_ref {
                name = kubernetes_secret.backend_secrets.metadata[0].name
                key  = "JWT_SECRET"
              }
            }
            name = "JWT_SECRET"
          }
          env {
            name_from {
              secret_key_ref {
                name = kubernetes_secret.backend_secrets.metadata[0].name
                key  = "ENCRYPTION_KEY"
              }
            }
            name = "ENCRYPTION_KEY"
          }
        }
      }
    }
  }
}

# 5. Backend Service
resource "kubernetes_service" "backend_service" {
  metadata {
    name      = "backend-service"
    namespace = kubernetes_namespace.healthcare.metadata[0].name
  }

  spec {
    selector = {
      app = "backend"
    }

    port {
      port        = 5000
      target_port = 5000
    }

    type = "ClusterIP"
  }
}

# 6. Frontend Deployment
resource "kubernetes_deployment" "frontend" {
  metadata {
    name      = "frontend"
    namespace = kubernetes_namespace.healthcare.metadata[0].name
    labels = {
      app = "frontend"
    }
  }

  spec {
    replicas = var.frontend_replicas

    selector {
      match_labels = {
        app = "frontend"
      }
    }

    template {
      metadata {
        labels = {
          app = "frontend"
        }
      }

      spec {
        container {
          name  = "frontend"
          image = "healthcare-exchange-frontend:latest"

          port {
            container_port = 80
          }

          env {
            name  = "REACT_APP_API_URL"
            value = "http://localhost:5000"
          }
        }
      }
    }
  }
}

# 7. Frontend Service
resource "kubernetes_service" "frontend_service" {
  metadata {
    name      = "frontend-service"
    namespace = kubernetes_namespace.healthcare.metadata[0].name
  }

  spec {
    selector = {
      app = "frontend"
    }

    port {
      port        = 80
      target_port = 80
    }

    type = "NodePort"
  }
}
