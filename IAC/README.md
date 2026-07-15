# Déploiement AWS t4g.2xlarge — RAG LlamaIndex

## Architecture

```
Internet
    │
    ▼
Elastic IP (fixe)
    │
    ▼
t4g.2xlarge (ARM64 Graviton2)
├── root EBS 30 GB  (OS + Docker images)
└── data EBS 50 GB  (ChromaDB + HF models + Ollama weights)
        mounted → /data
        ├── chroma_db/
        ├── hf_cache/
        └── ollama_data/

Conteneurs Docker :
├── rag-api     (FastAPI + LlamaIndex)  :8000
└── ollama      (LLM local ARM64)       :11434
```

---

## Prérequis

```bash
# Terraform >= 1.6
brew install terraform       # macOS
# ou https://developer.hashicorp.com/terraform/install


wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform


# Ansible >= 2.15
pip install ansible

# Collection Docker pour Ansible
ansible-galaxy collection install -r ansible/requirements.yml

# AWS CLI configuré
aws configure
# ou export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION
```


---

## Étape 1 — Terraform (provisionner l'infra)

```bash
cd terraform/

# Copier et adapter les variables
cp terraform.tfvars.example terraform.tfvars
# Éditer terraform.tfvars :
#   - aws_region (eu-west-3 = Paris, supporte Graviton)
#   - ssh_public_key_path
#   - allowed_ssh_cidr  ← IMPORTANT : restreindre à votre IP !

# Initialiser et appliquer
terraform init
terraform plan
terraform apply

# Récupérer l'IP publique
terraform output public_ip
terraform output ssh_command
```

Terraform génère automatiquement `ansible/inventory.ini`.

---

## Étape 2 — Ansible (installer Docker + déployer l'app)

```bash
cd ansible/

# Vérifier la connexion SSH
ansible all -m ping

# Déploiement complet
ansible-playbook site.yml

# Ou étape par étape
ansible-playbook site.yml --tags system    # Base + EBS mount
ansible-playbook site.yml --tags docker    # Docker Engine
ansible-playbook site.yml --tags app       # docker compose up
```

### Variables sensibles (optionnelles)

Si vous utilisez OpenAI ou Anthropic, passer les clés via vault ou extra-vars :

```bash
ansible-playbook site.yml \
  -e openai_api_key=sk-... \
  -e anthropic_api_key=sk-ant-...
```

Ou avec Ansible Vault :
```bash
ansible-vault create ansible/vars/secrets.yml
# Ajouter : openai_api_key: "sk-..."
ansible-playbook site.yml --ask-vault-pass
```

---

## Étape 3 — Vérification

```bash
# Health check
curl http://<ELASTIC_IP>:8000/health

# Stats de l'index
curl http://<ELASTIC_IP>:8000/stats

# Swagger UI
open http://<ELASTIC_IP>:8000/docs

# Ingestion d'une vidéo YouTube
curl -X POST http://<ELASTIC_IP>:8000/ingest/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID", "metadata": {"title": "test"}}'

# Chat
curl -X POST http://<ELASTIC_IP>:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "De quoi parle cette vidéo ?", "top_k": 3}'
```

---

## Mise à jour du code

```bash
# Re-déployer l'application uniquement (rebuild + restart)
ansible-playbook ansible/site.yml --tags app
```

---

## Coûts estimés (eu-west-3, à la demande)

| Ressource         | Coût estimé      |
|-------------------|-----------------|
| t4g.2xlarge       | ~0.27 €/h        |
| EBS gp3 30 GB     | ~3 €/mois        |
| EBS gp3 50 GB     | ~5 €/mois        |
| Elastic IP        | Gratuit si attaché |
| **Total ~720h**   | **~205 €/mois**  |

💡 Pour dev/test : utiliser **t4g.medium** (~0.034 €/h) et redimensionner en prod.

---

## Notes importantes

- **ARM64 natif** : le Dockerfile utilise `python:3.12-slim` qui a une image ARM64. Ollama supporte ARM64. HuggingFace embeddings aussi.
- **Ollama** : le modèle `llama3.2:1b` est téléchargé au 1er démarrage (~900 MB). Patience.
- **Données persistantes** : ChromaDB et les modèles sont sur le volume EBS `/data` — ils survivent aux rebuilds et redémarrages.
- **Reboot** : le service `rag-api.service` (systemd) relance automatiquement `docker compose up`.
