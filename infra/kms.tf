# Chave KMS gerenciada pelo projeto (CMK) com rotação anual automática.
# Criptografa o segredo da aplicação e os logs do CloudWatch.
data "aws_iam_policy_document" "kms" {
  # Em key policy, resources = "*" significa "esta chave" (padrão exigido pela AWS)
  #checkov:skip=CKV_AWS_111:key policy - o recurso "*" se refere a propria chave
  #checkov:skip=CKV_AWS_356:key policy - o recurso "*" se refere a propria chave
  #checkov:skip=CKV_AWS_109:key policy - administracao restrita a conta dona da chave
  statement {
    sid       = "AdministracaoPelaConta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.atual.account_id}:root"]
    }
  }

  # Instâncias (LabInstanceProfile -> LabRole) leem o segredo e baixam a imagem do ECR
  dynamic "statement" {
    for_each = var.lab_role_name == "" ? [] : [1]
    content {
      sid       = "UsoPelasInstancias"
      actions   = ["kms:Decrypt", "kms:DescribeKey", "kms:GenerateDataKey*"]
      resources = ["*"]
      principals {
        type        = "AWS"
        identifiers = ["arn:aws:iam::${data.aws_caller_identity.atual.account_id}:role/${var.lab_role_name}"]
      }
    }
  }

  statement {
    sid = "CloudWatchLogs"
    actions = [
      "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey",
    ]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }
    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.atual.account_id}:log-group:*"]
    }
  }
}

resource "aws_kms_key" "app" {
  description             = "Chave do projeto Mentor (segredos e logs)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "app" {
  name          = "alias/${var.projeto}-app"
  target_key_id = aws_kms_key.app.key_id
}
