#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Administrator access required"; exit 1; }
stage="${STAGE:-/home/matt/rep-onboarding-oauth}"
app=/opt/rep-onboarding
previous="$(readlink "$app/current")"
[[ "$previous" == "$app/releases/initial" ]] || { echo "Active Rep Launch release changed; stop for review"; exit 1; }
[[ "$(sha256sum /etc/nginx/sites-available/rep.mattjhagen.xyz.conf | cut -d' ' -f1)" == 497a9097b5d7c6696585afc1c1d0f160e936f94a8fdfb3667f94454928d2e589 ]]
if [[ -e /etc/systemd/system/rep-launch-accounts.service ]]; then
  cmp -s "$stage/deploy/rep-launch-accounts.service" /etc/systemd/system/rep-launch-accounts.service || { echo "Existing service differs; stop for review"; exit 1; }
  systemctl is-active --quiet rep-launch-accounts && { echo "Account service already active; stop for review"; exit 1; }
fi
[[ -s "$stage/dist/index.html" && -s /home/matt/.config/rep-launch/google-oauth.json ]]
(cd "$stage/dist" && sha256sum -c "$stage/SHA256SUMS")
release="$app/releases/google-accounts-$(date -u +%Y%m%dT%H%M%SZ)"
backup="/var/backups/rep-launch-accounts-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup" "$release" "$app/accounts"
cp -a /etc/nginx/sites-available/rep.mattjhagen.xyz.conf "$backup/nginx.conf"
printf '%s\n' "$previous" > "$backup/previous-release"
cp -a "$stage/dist" "$release/dist"
cp -a "$stage/server" "$release/server"
chmod 755 "$release" "$release/dist" "$release/server"
rollback() {
  result=$?
  trap - ERR
  cp -a "$backup/nginx.conf" /etc/nginx/sites-available/rep.mattjhagen.xyz.conf
  ln -s "$previous" "$app/.rep-rollback-$$"
  mv -Tf "$app/.rep-rollback-$$" "$app/current"
  nginx -t && systemctl reload nginx
  systemctl disable --now rep-launch-accounts.service || true
  echo "Activation failed; prior Rep Launch release restored. Backup: $backup"
  exit "$result"
}
trap rollback ERR
ln -s "$release/server" "$app/accounts/.server-next-$$"
mv -Tf "$app/accounts/.server-next-$$" "$app/accounts/server"
install -m 644 "$stage/deploy/rep-launch-accounts.service" /etc/systemd/system/rep-launch-accounts.service
systemctl daemon-reload
systemctl enable --now rep-launch-accounts.service
python3 "$release/server/wait-ready.py" http://127.0.0.1:3023/api/healthz
install -m 644 "$stage/deploy/rep.nginx.conf" /etc/nginx/sites-available/rep.mattjhagen.xyz.conf
nginx -t
ln -s "$release/dist" "$app/.rep-next-$$"
mv -Tf "$app/.rep-next-$$" "$app/current"
systemctl reload nginx
python3 "$release/server/wait-ready.py" http://127.0.0.1:3021/api/me
curl -fsS http://127.0.0.1:3021/ | cmp - "$release/dist/index.html"
[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3021/api/profile)" == 401 ]]
[[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3021/auth/google)" == 302 ]]
systemctl is-active rep-launch-accounts pitchpilot-accounts nginx cloudflared-purepulse-r510
systemctl is-enabled rep-launch-accounts nginx cloudflared-purepulse-r510
trap - ERR
echo "Rep Launch Google sign-in activated; Pitch Coach was not restarted."
echo "Previous release and Nginx configuration retained at $backup"
