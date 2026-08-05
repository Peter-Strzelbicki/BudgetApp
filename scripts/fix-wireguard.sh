#!/bin/bash
set -e

echo "=== Installing iptables ==="
sudo apt-get install -y -q iptables

echo "=== Fixing dnsmasq config ==="
sudo tee /etc/dnsmasq.d/homebudget.conf > /dev/null <<'EOF'
interface=wg0
bind-dynamic
no-resolv
server=1.1.1.1
server=8.8.8.8
address=/homebudget/10.8.0.1
EOF

echo "=== Updating WireGuard PostUp/PostDown to manage dnsmasq ==="
sudo sed -i 's|^PostUp = |PostUp = systemctl restart dnsmasq; |' /etc/wireguard/wg0.conf
sudo sed -i 's|^PostDown = |PostDown = systemctl stop dnsmasq; |' /etc/wireguard/wg0.conf

echo "=== Starting dnsmasq ==="
sudo systemctl start dnsmasq || true

echo "=== Starting WireGuard ==="
sudo systemctl start wg-quick@wg0

sleep 3

echo "=== Status ==="
sudo wg show
echo ""
systemctl is-active wg-quick@wg0 dnsmasq nginx
echo ""
echo "=== SCAN THIS QR CODE IN THE WIREGUARD APP ON YOUR PHONE ==="
qrencode -t ansiutf8 < /tmp/phone.conf
echo ""
echo "============================================================"
echo "  Next step: forward UDP port 51820 to 192.168.2.108"
echo "  in your router settings."
echo "  App URL on VPN: http://homebudget"
echo "============================================================"
