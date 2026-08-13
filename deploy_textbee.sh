#!/bin/bash
# TextBee SMS Gateway Docker Deployment Script for Soulmate OS VPS
# Deploys a self-hosted Android SMS gateway that receives SMS on an Android phone
# and forwards them to the Soulmate OS backend via webhook.
#
# Prerequisites:
#   - Docker & Docker Compose installed on VPS
#   - An Android phone with the TextBee app installed (https://github.com/vernu/textbee)
#   - The Android phone must be paired with this gateway via the TextBee app
#
# Usage:
#   chmod +x deploy_textbee.sh
#   ./deploy_textbee.sh

set -e

# Configuration
VPS_DOMAIN="soulmateos.de5.net"
BACKEND_PORT="8546"
TEXTBEE_PORT="3001"
WEBHOOK_URL="https://${VPS_DOMAIN}/v1/sms/textbee/webhook"
TEXTBEE_DATA_DIR="/opt/textbee/data"

echo "========================================="
echo "  TextBee SMS Gateway Deployment"
echo "  Soulmate OS Hybrid SMS Verification"
echo "========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully."
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "ERROR: Docker Compose is not available. Please install Docker Compose v2."
    exit 1
fi

# Create data directory
echo "Creating data directory at ${TEXTBEE_DATA_DIR}..."
mkdir -p "${TEXTBEE_DATA_DIR}"

# Generate a random API key for TextBee gateway
API_KEY=$(openssl rand -hex 16)
echo "Generated TextBee API Key: ${API_KEY}"

# Create docker-compose.yml
echo "Creating docker-compose.yml..."
cat > /opt/textbee/docker-compose.yml << EOF
version: "3.8"

services:
  textbee:
    image: vernu/textbee:latest
    container_name: textbee-gateway
    restart: unless-stopped
    ports:
      - "${TEXTBEE_PORT}:3000"
    environment:
      - PORT=3000
      - API_KEY=${API_KEY}
      - WEBHOOK_URL=${WEBHOOK_URL}
      - WEBHOOK_SECRET=soulmate_textbee_2024
      - DB_PATH=/data/textbee.db
      - LOG_LEVEL=info
    volumes:
      - ${TEXTBEE_DATA_DIR}:/data
    networks:
      - soulmate-net

networks:
  soulmate-net:
    external: true
    name: soulmate-network
EOF

# Create network if it doesn't exist
docker network create soulmate-network 2>/dev/null || true

# Start TextBee container
echo "Starting TextBee gateway container..."
cd /opt/textbee
docker compose up -d

# Wait for container to be healthy
echo "Waiting for TextBee to start..."
sleep 5

# Check if container is running
if docker ps | grep -q textbee-gateway; then
    echo ""
    echo "========================================="
    echo "  TextBee Gateway Deployed Successfully!"
    echo "========================================="
    echo ""
    echo "  Gateway URL:  http://${VPS_DOMAIN}:${TEXTBEE_PORT}"
    echo "  API Key:      ${API_KEY}"
    echo "  Webhook URL:  ${WEBHOOK_URL}"
    echo ""
    echo "  Next Steps:"
    echo "  1. Install the TextBee Android app on your phone"
    echo "  2. Open the app and enter the gateway URL:"
    echo "     http://${VPS_DOMAIN}:${TEXTBEE_PORT}"
    echo "  3. Enter the API key: ${API_KEY}"
    echo "  4. Grant SMS permissions to the app"
    echo "  5. The phone will now forward all SMS to the gateway"
    echo "     which will relay them to the Soulmate OS backend"
    echo ""
    echo "  To check status:  docker logs textbee-gateway"
    echo "  To restart:       cd /opt/textbee && docker compose restart"
    echo "  To stop:          cd /opt/textbee && docker compose down"
    echo ""
else
    echo "ERROR: TextBee container failed to start. Check logs:"
    docker logs textbee-gateway
    exit 1
fi

# Save API key for backend reference
echo "${API_KEY}" > /opt/textbee/api_key.txt
chmod 600 /opt/textbee/api_key.txt

echo "API key saved to /opt/textbee/api_key.txt"
echo ""
echo "Add this to your backend .env file:"
echo "  TEXTBEE_API_KEY=${API_KEY}"
echo "  TEXTBEE_GATEWAY_URL=http://textbee-gateway:3000"
