output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.rag_server.id
}

output "public_ip" {
  description = "Elastic IP (stable across reboots)"
  value       = aws_eip.rag_server.public_ip
}

output "api_url" {
  description = "RAG API base URL"
  value       = "http://${aws_eip.rag_server.public_ip}:${var.api_port}"
}

output "docs_url" {
  description = "FastAPI Swagger UI"
  value       = "http://${aws_eip.rag_server.public_ip}:${var.api_port}/docs"
}

output "grafana_url" {
  description = "grafana"
  value       = "http://${aws_eip.rag_server.public_ip}:3000"
}


output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ${var.ssh_private_key_path} ubuntu@${aws_eip.rag_server.public_ip}"
}

output "ssh_redirect_localhost_command" {
  description = "SSH command to redirect localhost to the instance"
  value       = "ssh -L 8080:localhost:8080 ubuntu@${aws_eip.rag_server.public_ip}"
}


output "ami_used" {
  description = "DLAMI ARM64 AMI ID (via SSM)"
  value       = data.aws_ssm_parameter.dlami_arm64.value
  sensitive   = true
}
