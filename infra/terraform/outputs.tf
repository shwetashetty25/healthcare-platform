output "namespace" {
  value       = kubernetes_namespace.healthcare.metadata[0].name
  description = "Target namespace created inside the K8s cluster"
}

output "backend_service_name" {
  value       = kubernetes_service.backend_service.metadata[0].name
  description = "Internal name of the backend service locator"
}

output "frontend_service_name" {
  value       = kubernetes_service.frontend_service.metadata[0].name
  description = "Internal name of the frontend service locator"
}
