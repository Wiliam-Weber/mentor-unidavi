# Registro privado das imagens da aplicação. O pipeline faz o push com a tag do commit.
resource "aws_ecr_repository" "app" {
  name                 = var.projeto
  image_tag_mutability = "IMMUTABLE" # uma tag nunca é sobrescrita (rastreabilidade do que está em produção)
  force_delete         = true        # permite destruir o ambiente do lab ao final

  image_scanning_configuration {
    scan_on_push = true # scan de vulnerabilidades da própria AWS, além do Trivy no pipeline
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.app.arn
  }
}

# Guarda só as 10 imagens mais recentes
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Manter as 10 imagens mais recentes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
