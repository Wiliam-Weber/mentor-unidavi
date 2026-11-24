locals {
  # Zonas fixas (determinístico; não muda se a AWS adicionar novas AZs)
  azs = ["${var.aws_region}a", "${var.aws_region}b"]
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${var.projeto}-vpc" }
}

# Security group padrão sem nenhuma regra (nada usa o default)
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.projeto}-igw" }
}

# Subnets públicas: apenas ALB e NAT Gateway
resource "aws_subnet" "publica" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + 1)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false
  tags                    = { Name = "${var.projeto}-publica-${count.index + 1}", Tier = "publica" }
}

# Subnets privadas: instâncias EC2 da aplicação (sem IP público)
resource "aws_subnet" "privada_app" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 11)
  availability_zone = local.azs[count.index]
  tags              = { Name = "${var.projeto}-privada-app-${count.index + 1}", Tier = "privada" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.projeto}-nat-eip" }
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.publica[0].id
  tags          = { Name = "${var.projeto}-nat" }
  depends_on    = [aws_internet_gateway.igw]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
  tags = { Name = "${var.projeto}-rt-publica" }
}

resource "aws_route_table" "privada" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }
  tags = { Name = "${var.projeto}-rt-privada" }
}

resource "aws_route_table_association" "publica" {
  count          = 2
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

resource "aws_route_table_association" "privada" {
  count          = 2
  subnet_id      = aws_subnet.privada_app[count.index].id
  route_table_id = aws_route_table.privada.id
}

# ---------- NACLs (segunda camada, stateless) ----------
resource "aws_network_acl" "publica" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.publica[*].id

  # Bloqueia explicitamente acesso administrativo vindo da internet
  ingress {
    rule_no    = 50
    protocol   = "tcp"
    action     = "deny"
    cidr_block = "0.0.0.0/0"
    from_port  = 22
    to_port    = 22
  }
  ingress {
    rule_no    = 60
    protocol   = "tcp"
    action     = "deny"
    cidr_block = "0.0.0.0/0"
    from_port  = 3389
    to_port    = 3389
  }

  ingress {
    rule_no    = 100
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 80
    to_port    = 80
  }
  ingress {
    rule_no    = 110
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 443
    to_port    = 443
  }
  ingress {
    rule_no    = 120
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }
  egress {
    rule_no    = 100
    protocol   = "-1"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }
  tags = { Name = "${var.projeto}-nacl-publica" }
}

resource "aws_network_acl" "privada" {
  vpc_id     = aws_vpc.main.id
  subnet_ids = aws_subnet.privada_app[*].id

  # Bloqueia explicitamente acesso administrativo vindo da internet
  ingress {
    rule_no    = 50
    protocol   = "tcp"
    action     = "deny"
    cidr_block = "0.0.0.0/0"
    from_port  = 22
    to_port    = 22
  }
  ingress {
    rule_no    = 60
    protocol   = "tcp"
    action     = "deny"
    cidr_block = "0.0.0.0/0"
    from_port  = 3389
    to_port    = 3389
  }

  ingress {
    rule_no    = 100
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 8080
    to_port    = 8080
  }
  # Respostas das conexões de saída (Secrets Manager, ECR, CloudWatch, atualizações)
  ingress {
    rule_no    = 110
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 1024
    to_port    = 65535
  }
  egress {
    rule_no    = 100
    protocol   = "tcp"
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 443
    to_port    = 443
  }
  # Banco: somente para as subnets privadas de dados
  egress {
    rule_no    = 110
    protocol   = "tcp"
    action     = "allow"
    cidr_block = cidrsubnet(var.vpc_cidr, 8, 21)
    from_port  = 5432
    to_port    = 5432
  }
  egress {
    rule_no    = 120
    protocol   = "tcp"
    action     = "allow"
    cidr_block = cidrsubnet(var.vpc_cidr, 8, 22)
    from_port  = 5432
    to_port    = 5432
  }
  egress {
    rule_no    = 130
    protocol   = "tcp"
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 1024
    to_port    = 65535
  }
  tags = { Name = "${var.projeto}-nacl-privada" }
}

# ---------- VPC Flow Logs (auditoria de tráfego) ----------
resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.main.id
  traffic_type         = "ALL"
  log_destination_type = "s3"
  log_destination      = "${aws_s3_bucket.logs.arn}/vpc-flow-logs/"
  depends_on           = [aws_s3_bucket_policy.logs]
}
