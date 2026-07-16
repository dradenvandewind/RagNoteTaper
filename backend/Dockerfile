FROM python:3.11-slim

# RUN printf '%s\n' \
# 'deb http://ports.ubuntu.com/ubuntu-ports jammy main restricted universe multiverse' \
# 'deb http://ports.ubuntu.com/ubuntu-ports jammy-updates main restricted universe multiverse' \
# 'deb http://ports.ubuntu.com/ubuntu-ports jammy-security main restricted universe multiverse' \
# > /etc/apt/sources.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
