terraform {
  required_version = ">= 1.10.0" # use_lockfile (lock nativo no S3) exige 1.10+

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }

  # Estado remoto no S3 com lock nativo (use_lockfile). Configuração passada no init:
  # terraform init -backend-config=backend.hcl
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Projeto    = "mentor-unidavi"
      Gerenciado = "terraform"
      Disciplina = "auditoria-e-seguranca"
    }
  }
}
