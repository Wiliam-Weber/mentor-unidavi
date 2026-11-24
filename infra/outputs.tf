output "url_aplicacao" {
  value = local.https ? "https://${aws_lb.app.dns_name}" : "http://${aws_lb.app.dns_name}"
}

output "asg_nome" {
  value = aws_autoscaling_group.app.name
}

output "segredo_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "bucket_logs" {
  value = aws_s3_bucket.logs.id
}

output "ecr_repositorio" {
  value = aws_ecr_repository.app.repository_url
}

output "segredo_nome" {
  value = aws_secretsmanager_secret.app.name
}

output "banco_endpoint" {
  description = "Endereço privado do RDS (só resolve/conecta de dentro da VPC)"
  value       = aws_db_instance.main.address
}
