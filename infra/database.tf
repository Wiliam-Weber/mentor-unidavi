# =====================================================================
# Camada de dados: subnets privadas SEM rota para a internet + RDS PostgreSQL
# =====================================================================

resource "aws_subnet" "privada_dados" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 21) # 10.0.21.0/24 e 10.0.22.0/24
  availability_zone = local.azs[count.index]
  tags              = { Name = "${var.projeto}-privada-dados-${count.index + 1}", Tier = "dados" }
}

# Tabela de rotas sem nenhuma rota além da local da VPC: o banco não alcança a internet
# e não é alcançável por ela (nem via NAT, nem via Internet Gateway)
resource "aws_route_table" "dados" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.projeto}-rt-dados-isolada" }
}

resource "aws_route_table_association" "dados" {
  count          = 2
  subnet_id      = aws_subnet.privada_dados[count.index].id
  route_table_id = aws_route_table.dados.id
}

# NACL: só PostgreSQL vindo das subnets da aplicação, e as respostas de volta para elas
resource "aws_network_acl" "dados" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.privada_dados[*].id

  dynamic "ingress" {
    for_each = aws_subnet.privada_app
    content {
      rule_no    = 100 + ingress.key * 10
      protocol   = "tcp"
      action     = "allow"
      cidr_block = ingress.value.cidr_block
      from_port  = 5432
      to_port    = 5432
    }
  }

  dynamic "egress" {
    for_each = aws_subnet.privada_app
    content {
      rule_no    = 100 + egress.key * 10
      protocol   = "tcp"
      action     = "allow"
      cidr_block = egress.value.cidr_block
      from_port  = 1024
      to_port    = 65535
    }
  }

  tags = { Name = "${var.projeto}-nacl-dados" }
}

resource "aws_db_subnet_group" "main" {
  name_prefix = "${var.projeto}-db-"
  description = "Subnets privadas de dados (sem rota para a internet)"
  subnet_ids  = aws_subnet.privada_dados[*].id
}

# Parâmetros: TLS obrigatório e log de comandos que alteram dados (auditoria)
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${var.projeto}-pg16-"
  family      = "postgres16"
  description = "Mentor: TLS obrigatorio e logs de auditoria"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_statement"
    value = "ddl"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # registra consultas com mais de 1 s
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  #checkov:skip=CKV_AWS_157:Multi-AZ controlado pela variavel db_multi_az; desligado no lab por custo e tempo de criacao
  #checkov:skip=CKV_AWS_293:Protecao contra exclusao pela variavel db_deletion_protection; desligada para o workflow destruir.yml funcionar
  #checkov:skip=CKV_AWS_118:Enhanced Monitoring exige criar role IAM, bloqueado no AWS Academy; logs vao para o CloudWatch
  #checkov:skip=CKV_AWS_353:Performance Insights indisponivel nas menores classes do lab; consultas lentas ficam no log do PostgreSQL
  identifier_prefix = "${var.projeto}-db-"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = var.db_instance_class
  db_name           = "mentor"
  username          = "mentor_admin"

  # A senha do administrador é gerada e guardada pelo próprio RDS no Secrets Manager,
  # criptografada com a chave KMS do projeto: não passa pelo Terraform, pelo state nem pelo Git
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.app.key_id

  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.app.arn

  db_subnet_group_name                = aws_db_subnet_group.main.name
  vpc_security_group_ids              = [aws_security_group.db.id]
  publicly_accessible                 = false
  multi_az                            = var.db_multi_az
  parameter_group_name                = aws_db_parameter_group.postgres.name
  iam_database_authentication_enabled = true

  backup_retention_period         = 7
  copy_tags_to_snapshot           = true
  auto_minor_version_upgrade      = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = !var.db_deletion_protection
  final_snapshot_identifier = var.db_deletion_protection ? "${var.projeto}-db-final" : null
  apply_immediately         = true
}
