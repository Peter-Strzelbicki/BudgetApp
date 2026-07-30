#!/bin/bash
set -e

SUBDOMAIN="${DUCKDNS_SUBDOMAIN:-sphomebudget}"
: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN before running this script}"
TOKEN="$DUCKDNS_TOKEN"
DOMAIN="${SUBDOMAIN}.duckdns.org"

echo "=== Setting up DuckDNS updater ==="
mkdir -p ~/duckdns
cat > ~/duckdns/duck.sh << EOF
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${TOKEN}&ip=" | curl -k -s -o ~/duckdns/duck.log -K -
EOF
chmod +x ~/duckdns/duck.sh
~/duckdns/duck.sh
cat ~/duckdns/duck.log
echo ""

echo "=== Installing cron job (every 5 minutes) ==="
(crontab -l 2>/dev/null | grep -v duckdns; echo "*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1") | crontab -

echo "=== Regenerating phone WireGuard config with domain ==="
sed -i "s/Endpoint = .*/Endpoint = ${DOMAIN}:51820/" /tmp/phone.conf
grep Endpoint /tmp/phone.conf

echo "=== New QR code — delete old tunnel on phone and scan this ==="
qrencode -t ansiutf8 < /tmp/phone.conf
echo ""
echo "  WireGuard endpoint: ${DOMAIN}:51820"
echo "  This domain auto-updates every 5 minutes — IP changes won't break VPN."
