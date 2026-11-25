data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# O segredo é criado vazio. O valor é gravado pelo pipeline a partir dos GitHub Secrets
# (aws secretsmanager put-secret-value), então nunca fica no state do Terraform nem no Git.
resource "aws_secretsmanager_secret" "app" {
  name                    = var.app_secret_name
  description             = "Segredos da aplicacao Mentor (JWT e senha do usuario mentor_app no banco)"
  recovery_window_in_days = 0 # lab: permite destruir e recriar no mesmo dia (em produção real use 7 a 30)
  kms_key_id              = aws_kms_key.app.arn
}

resource "aws_launch_template" "app" {
  name_prefix            = "${var.projeto}-app-"
  image_id               = data.aws_ssm_parameter.al2023.insecure_value
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]
  update_default_version = true

  iam_instance_profile {
    name = var.instance_profile_name
  }

  # IMDSv2 obrigatório (mitiga SSRF roubando credenciais da instância)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = true
  }

  user_data = base64encode(templatefile("${path.module}/user_data.sh.tpl", {
    region        = var.aws_region
    secret_id     = aws_secretsmanager_secret.app.name
    registry      = split("/", aws_ecr_repository.app.repository_url)[0]
    image         = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    log_group     = aws_cloudwatch_log_group.app.name
    cookie_secure = local.https ? "true" : "false"
    origin        = local.https ? "" : "http://${aws_lb.app.dns_name}"
    db_host       = aws_db_instance.main.address
    db_name       = aws_db_instance.main.db_name
    db_secret_arn = aws_db_instance.main.master_user_secret[0].secret_arn
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.projeto}-app" }
  }
  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${var.projeto}-app" }
  }
}

resource "aws_autoscaling_group" "app" {
  name_prefix               = "${var.projeto}-asg-"
  vpc_zone_identifier       = aws_subnet.privada_app[*].id
  min_size                  = var.asg_min
  max_size                  = var.asg_max
  desired_capacity          = var.asg_desired
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 600 # boot: atualizações, Docker, imagem e migrações

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  # Nova imagem => novo launch template => troca gradual das instâncias (sem downtime)
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.projeto}-app"
    propagate_at_launch = true
  }
}

# Escalabilidade horizontal automática por CPU
resource "aws_autoscaling_policy" "cpu" {
  name                   = "${var.projeto}-cpu-60"
  autoscaling_group_name = aws_autoscaling_group.app.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60
  }
}
