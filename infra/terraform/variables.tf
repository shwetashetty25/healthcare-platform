variable "kube_config_path" {
  type        = string
  description = "Path to the local Kubeconfig file"
  default     = "~/.kube/config"
}

variable "namespace_name" {
  type        = string
  description = "Namespace where resources will be provisioned"
  default     = "healthcare-platform"
}

variable "db_password" {
  type        = string
  description = "Database administrator password"
  default     = "postgres"
}

variable "jwt_secret" {
  type        = string
  description = "JWT algorithm signature key"
  default     = "healthcare_secret_key_jwt_12345"
}

variable "encryption_key" {
  type        = string
  description = "AES-256 symmetric cipher key (must be exactly 32 bytes)"
  default     = "ab12cd34ef56gh78ij90kl12mn34op56"
}

variable "backend_replicas" {
  type        = number
  description = "Replicas count for the node backend server"
  default     = 1
}

variable "frontend_replicas" {
  type        = number
  description = "Replicas count for the frontend static server"
  default     = 1
}
