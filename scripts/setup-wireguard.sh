#!/bin/bash
set -e
PUBLIC_IP="74.12.22.221"
IFACE="wlan0"
WG_IFACE="wg0"
WG_PORT=51820
SERVER_VPN_IP="10.8.0.1"
PHONE_VPN_IP="10.8.0.2"

echo "=== Installing packages ==="
sudo apt-get update -q
sudo apt-get install -y wireguard wireguard-tools qrencode dnsmasq nginx

echo "=== Enabling IP forwarding ==="
sudo sysctl -w net.ipv4.ip_forward=1
grep -qxF 'net.ipv4.ip_forward=1' /etc/sysctl.d/99-wireguard.conf 2>/dev/null \
  || echo 'net.ipv4.ip_forward=1' | sudo tee -a /etc/sysctl.d/99-wireguard.conf

echo "=== Generating WireGuard keys ==="
sudo mkdir -p /etc/wireguard
SERVER_PRIVATE=$(wg genkey)
SERVER_PUBLIC=$(echo "$SERVER_PRIVATE" | wg pubkey)
PHONE_PRIVATE=$(wg genkey)
PHONE_PUBLIC=$(echo "$PHONE_PRIVATE" | wg pubkey)
echo "$SERVER_PRIVATE" | sudo tee /etc/wireguard/server_private.key > /dev/null
sudo chmod 600 /etc/wireguard/server_private.key

echo "=== Creating WireGuard server config ==="
sudo tee /etc/wireguard/$WG_IFACE.conf > /dev/null <<EOF
[Interface]
PrivateKey = $SERVER_PRIVATE
Address = $SERVER_VPN_IP/24
ListenPort = $WG_PORT
PostUp = iptables -A FORWARD -i $WG_IFACE -j ACCEPT; iptables -t nat -A POSTROUTING -o $IFACE -j MASQUERADE
PostDown = iptables -D FORWARD -i $WG_IFACE -j ACCEPT; iptables -t nat -D POSTROUTING -o $IFACE -j MASQUERADE

[Peer]
# Phone
PublicKey = $PHONE_PUBLIC
AllowedIPs = $PHONE_VPN_IP/32
EOF
sudo chmod 600 /etc/wireguard/$WG_IFACE.conf

echo "=== Creating phone config ==="
cat > /tmp/phone.conf <<EOF
[Interface]
PrivateKey = $PHONE_PRIVATE
Address = $PHONE_VPN_IP/24
DNS = $SERVER_VPN_IP

[Peer]
PublicKey = $SERVER_PUBLIC
Endpoint = $PUBLIC_IP:$WG_PORT
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
EOF

echo "=== Configuring dnsmasq for 'homebudget' hostname ==="
sudo tee /etc/dnsmasq.d/homebudget.conf > /dev/null <<EOF
listen-address=$SERVER_VPN_IP
bind-interfaces
no-resolv
server=1.1.1.1
server=8.8.8.8
address=/homebudget/$SERVER_VPN_IP
EOF

sudo systemctl enable dnsmasq
sudo systemctl restart dnsmasq || true

echo "=== Configuring nginx on port 80 ==="
sudo tee /etc/nginx/sites-available/homebudget > /dev/null <<'EOF'
server {
    listen 80;
    server_name homebudget _;
    location / {
        proxy_pass http://127.0.0.1:8081/;
        proxy_set_header Host $host;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/homebudget /etc/nginx/sites-enabled/homebudget
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo "=== Enabling and starting WireGuard ==="
sudo systemctl enable wg-quick@$WG_IFACE
sudo systemctl restart wg-quick@$WG_IFACE

sleep 2
sudo systemctl restart dnsmasq

echo ""
echo "============================================================"
echo "  STATUS"
echo "============================================================"
sudo wg show
echo ""
echo "  App address on VPN : http://homebudget or http://$SERVER_VPN_IP"
echo "  Router step needed : Forward UDP port $WG_PORT to 192.168.2.107"
echo "============================================================"
echo ""
echo "=== SCAN THIS QR CODE IN THE WIREGUARD APP ON YOUR PHONE ==="
qrencode -t ansiutf8 < /tmp/phone.conf
echo ""
echo "=== Phone config saved at /tmp/phone.conf ==="
