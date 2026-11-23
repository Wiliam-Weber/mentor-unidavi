# Cadeia de Security Groups: Internet -> ALB -> App. Nada acessa a EC2 diretamente.
resource "aws_security_group" "alb" {
  name_prefix = "${var.projeto}-alb-"
  description = "Load Balancer: entrada HTTP/HTTPS da internet"
  vpc_id      = aws_vpc.main.id
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP (redireciona para HTTPS quando ha certificado)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "alb_para_app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Somente para as instancias da aplicacao"
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}

resource "aws_security_group" "app" {
  name_prefix = "${var.projeto}-app-"
  description = "Aplicacao: entrada somente a partir do ALB"
  vpc_id      = aws_vpc.main.id
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "app_do_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "Porta da aplicacao, apenas do ALB"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}

resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS: Secrets Manager, CloudWatch, GHCR, atualizacoes"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "app_supabase_pooler" {
  security_group_id = aws_security_group.app.id
  description       = "Supabase (pooler em modo transacao)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 6543
  to_port           = 6543
}

resource "aws_vpc_security_group_egress_rule" "app_supabase_direto" {
  security_group_id = aws_security_group.app.id
  description       = "Supabase (conexao de sessao)"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
}
