#!/usr/bin/env bash
# One-time setup of a fresh Oracle Cloud "Always Free" Ubuntu server (ARM or AMD)
# for the AxrflowsQuotes backend. Run as the default "ubuntu" user:
#
#   curl -fsSL https://raw.githubusercontent.com/abdulrehman3003/quotation-app/master/deploy/oracle/setup.sh -o setup.sh
#   bash setup.sh
#
# It installs Docker, opens ports 80/443 in the server firewall, adds swap,
# turns on automatic security updates and fail2ban, and downloads the code to
# /opt/axrflows. It does NOT start the app: you add the secrets first
# (the script prints the next steps).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/abdulrehman3003/quotation-app.git}"
APP_DIR=/opt/axrflows

echo "==> Updating the system"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "==> Installing Docker, git, firewall tools, fail2ban and automatic updates"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  docker.io docker-compose-v2 git iptables-persistent fail2ban unattended-upgrades
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

echo "==> Opening ports 80 and 443 in the server firewall"
# Oracle's Ubuntu images reject everything except SSH in iptables, in addition
# to the cloud Security List. Insert the rules before that final REJECT.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo "==> Adding 2 GB of swap (insurance during image builds)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Turning on automatic security updates and SSH brute-force protection"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
sudo systemctl enable --now fail2ban

echo "==> Downloading the code to $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi

touch "$APP_DIR/backend/.env.production"
chmod 600 "$APP_DIR/backend/.env.production"
[ -f "$APP_DIR/deploy/oracle/.env" ] || cp "$APP_DIR/deploy/oracle/.env.example" "$APP_DIR/deploy/oracle/.env"

cat <<EOF

Setup finished. Next steps:

  1. Log out and back in (so you can run docker without sudo):  exit
  2. Paste your secrets (same as the Railway variables):
       nano $APP_DIR/backend/.env.production
  3. Set your DuckDNS hostname:
       nano $APP_DIR/deploy/oracle/.env
  4. Start everything:
       bash $APP_DIR/deploy/oracle/deploy.sh
EOF
