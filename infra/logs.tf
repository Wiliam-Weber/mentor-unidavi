data "aws_caller_identity" "atual" {}
data "aws_elb_service_account" "principal" {}

# Bucket central de logs (Flow Logs + access logs do ALB).
# O bucket em si é criado pelo pipeline (como o bucket do state): no AWS Academy uma SCP nega
# s3:GetBucketObjectLockConfiguration, que o recurso aws_s3_bucket sempre lê. Toda a configuração
# de segurança dele (bloqueio público, criptografia, versionamento, retenção, política) continua aqui.
data "aws_s3_bucket" "logs" {
  bucket = var.logs_bucket
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = data.aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = data.aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = data.aws_s3_bucket.logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Access logs do ALB só aceitam SSE-S3 (AES256)
resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = data.aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = data.aws_s3_bucket.logs.id
  rule {
    id     = "retencao-90-dias"
    status = "Enabled"
    filter {}
    expiration {
      days = 90
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "logs" {
  statement {
    sid       = "AlbAccessLogs"
    actions   = ["s3:PutObject"]
    resources = ["${data.aws_s3_bucket.logs.arn}/alb/AWSLogs/${data.aws_caller_identity.atual.account_id}/*"]
    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.principal.arn]
    }
  }

  statement {
    sid       = "FlowLogsWrite"
    actions   = ["s3:PutObject"]
    resources = ["${data.aws_s3_bucket.logs.arn}/vpc-flow-logs/AWSLogs/${data.aws_caller_identity.atual.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.atual.account_id]
    }
  }

  statement {
    sid       = "FlowLogsAcl"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [data.aws_s3_bucket.logs.arn]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
  }

  statement {
    sid     = "SomenteHTTPS"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      data.aws_s3_bucket.logs.arn,
      "${data.aws_s3_bucket.logs.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket     = data.aws_s3_bucket.logs.id
  policy     = data.aws_iam_policy_document.logs.json
  depends_on = [aws_s3_bucket_public_access_block.logs]
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.projeto}/app"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.app.arn
}

# Alarme: 5xx no ALB indica falha da aplicação
resource "aws_cloudwatch_metric_alarm" "erros_5xx" {
  alarm_name          = "${var.projeto}-alb-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.app.arn_suffix
  }
}
