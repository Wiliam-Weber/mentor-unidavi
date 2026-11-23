variable "aws_region" {
  description = "Região AWS (AWS Academy Learner Lab libera us-east-1 e us-west-2)"
  type        = string
  default     = "us-east-1"
}

variable "projeto" {
  description = "Prefixo dos recursos"
  type        = string
  default     = "mentor"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "image_tag" {
  description = "Tag da imagem no ECR (o pipeline usa o SHA do commit). Imagem inexistente = instâncias ficam aguardando."
  type        = string
  default     = "latest"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "asg_min" {
  type    = number
  default = 2
}

variable "asg_max" {
  description = "O Learner Lab limita a quantidade de instâncias simultâneas; 4 é seguro"
  type        = number
  default     = 4
}

variable "asg_desired" {
  type    = number
  default = 2
}

variable "instance_profile_name" {
  description = "No AWS Academy não é possível criar roles IAM; usa-se o perfil pronto LabInstanceProfile"
  type        = string
  default     = "LabInstanceProfile"
}

variable "app_secret_name" {
  description = "Nome do segredo no Secrets Manager com DATABASE_URL, JWT_SECRET e DB_SSL_CA_BASE64"
  type        = string
  default     = "mentor/app"
}

variable "certificate_arn" {
  description = "ARN do certificado ACM. Vazio = sem HTTPS (lab sem domínio). Em produção é obrigatório."
  type        = string
  default     = ""
}

variable "alb_deletion_protection" {
  type    = bool
  default = false
}

variable "habilitar_waf" {
  description = "Cria o AWS WAF na frente do ALB (desative se a conta do lab não permitir WAFv2)"
  type        = bool
  default     = true
}

variable "lab_role_name" {
  description = "Role usada pelo LabInstanceProfile no AWS Academy (recebe permissão explícita na chave KMS). Vazio = não adiciona."
  type        = string
  default     = "LabRole"
}
