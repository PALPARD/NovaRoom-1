#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"
ENV_FILE="${SCRIPT_DIR}/.env"

echo "=============================================="
echo "    NovaRoom Deployment Packager (Runflare)   "
echo "=============================================="

if [ ! -f "${ENV_FILE}" ]; then
  if [ -f "${ROOT_DIR}/.env" ]; then
    echo "[*] Copying root .env to deploy/.env..."
    cp "${ROOT_DIR}/.env" "${ENV_FILE}"
  elif [ -f "${SCRIPT_DIR}/.env.example" ]; then
    echo "[!] Warning: deploy/.env not found. Creating from .env.example..."
    cp "${SCRIPT_DIR}/.env.example" "${ENV_FILE}"
  fi
fi

if ! command -v zip &> /dev/null; then
  echo "[!] Error: 'zip' utility is not installed. Please install it with: sudo apt-get install zip"
  exit 1
fi

echo "[1/4] Building frontend (Vite)..."
cd "${ROOT_DIR}/front-end"

if [ ! -d "node_modules" ]; then
  echo "[*] Installing frontend dependencies..."
  npm ci || npm install
fi

VITE_API_URL="/api" npm run build

if [ ! -f "${ROOT_DIR}/front-end/dist/index.html" ]; then
  echo "[!] Frontend build failed: dist/index.html not found!"
  exit 1
fi

echo "[2/4] Preparing deployment staging..."
STAGE_DIR=$(mktemp -d -t novaroom-stage-XXXXXX)
trap 'rm -rf "${STAGE_DIR}"' EXIT

mkdir -p "${STAGE_DIR}/back-end"
mkdir -p "${STAGE_DIR}/back-end/uploads"
mkdir -p "${STAGE_DIR}/front-end"
mkdir -p "${STAGE_DIR}/docker"

tar --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='uploads' \
    --exclude='.env*' \
    -cf - -C "${ROOT_DIR}/back-end" . | tar -xf - -C "${STAGE_DIR}/back-end"

cp -r "${ROOT_DIR}/front-end/dist" "${STAGE_DIR}/front-end/"

cp "${ROOT_DIR}/docker/nginx.conf" "${STAGE_DIR}/docker/"
cp "${ROOT_DIR}/docker/supervisord.conf" "${STAGE_DIR}/docker/"

cp "${ENV_FILE}" "${STAGE_DIR}/.env"
cp "${ENV_FILE}" "${STAGE_DIR}/back-end/.env"

cat << 'EOF' > "${STAGE_DIR}/Dockerfile"
FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /etc/nginx/sites-enabled/* /etc/nginx/sites-available/* /var/www/html/*

COPY back-end/requirements.txt ./back-end/
RUN pip install --no-cache-dir -r back-end/requirements.txt

COPY back-end/ ./back-end/
RUN mkdir -p /app/back-end/uploads

COPY front-end/dist /usr/share/nginx/html

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY .env /app/.env

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
EOF

echo "[3/4] Creating zip package..."
mkdir -p "${OUTPUT_DIR}"
ZIP_PATH="${OUTPUT_DIR}/novaroom-deploy.zip"
rm -f "${ZIP_PATH}"

(cd "${STAGE_DIR}" && zip -r -q "${ZIP_PATH}" .)

echo "[4/4] Package created successfully!"
echo "----------------------------------------------"
echo "Output File : ${ZIP_PATH}"
echo "File Size   : $(du -h "${ZIP_PATH}" | cut -f1)"
echo "----------------------------------------------"
echo "Ready to upload to Runflare Docker service!"
