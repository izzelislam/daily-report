#!/usr/bin/env bash
# Rilis versi baru: bump versi -> build -> npm pack (.tgz) -> commit + tag -> push -> GitHub Release (+ .tgz).
#
# Pemakaian:
#   script/rilis_tag.sh patch|minor|major     # naikkan versi otomatis
#   script/rilis_tag.sh 1.2.3                 # versi eksplisit
#   opsi: -y (tanpa konfirmasi)  -n "catatan rilis"  --dry-run (build + pack saja, tanpa commit/push)
#
# User tinggal download dailyreport-<versi>.tgz dari halaman Release, lalu:
#   npm i -g ./dailyreport-<versi>.tgz   &&   dailyreport init
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/release"

BUMP="" YES=0 DRY=0 NOTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) YES=1 ;;
    --dry-run) DRY=1 ;;
    -n|--notes) NOTES="${2:?catatan rilis kosong}"; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) BUMP="$1" ;;
  esac
  shift
done
[ -n "$BUMP" ] || { echo "Isi versi: patch | minor | major | x.y.z  (lihat --help)"; exit 1; }

command -v gh >/dev/null || { echo "gh (GitHub CLI) belum terpasang"; exit 1; }
command -v npm >/dev/null || { echo "npm belum terpasang"; exit 1; }
[ "$DRY" = 1 ] || gh auth status >/dev/null 2>&1 || { echo "Belum login gh. Jalankan: gh auth login"; exit 1; }

cd "$ROOT"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
CUR="$(node -p "require('$APP/package.json').version")"

# hitung versi baru (tanpa menyentuh git)
NEW="$(cd "$APP" && npm version "$BUMP" --no-git-tag-version --allow-same-version >/dev/null && node -p "require('./package.json').version")"
TAG="v$NEW"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  (cd "$APP" && npm version "$CUR" --no-git-tag-version --allow-same-version >/dev/null)
  echo "Tag $TAG sudah ada."; exit 1
fi

echo "Rilis  : dailyreport $CUR -> $NEW  (tag $TAG, branch $BRANCH)"
if [ "$DRY" = 0 ] && [ "$YES" = 0 ]; then
  read -r -p "Lanjut build, tag, push & buat GitHub Release? [y/N] " a
  [[ "$a" =~ ^[Yy]$ ]] || { (cd "$APP" && npm version "$CUR" --no-git-tag-version --allow-same-version >/dev/null); echo "Dibatalkan."; exit 1; }
fi

echo "==> Build"
(cd "$APP" && [ -d node_modules ] || npm --prefix "$APP" install)
(cd "$APP" && npm run build)

echo "==> Pack"
mkdir -p "$OUT"
(cd "$APP" && npm pack --pack-destination "$OUT" >/dev/null)
TGZ="$OUT/dailyreport-$NEW.tgz"
[ -f "$TGZ" ] || { echo "File $TGZ tidak ditemukan"; exit 1; }
echo "    $TGZ ($(du -h "$TGZ" | cut -f1))"

if [ "$DRY" = 1 ]; then
  (cd "$APP" && npm version "$CUR" --no-git-tag-version --allow-same-version >/dev/null)
  echo "Dry run selesai: versi dikembalikan ke $CUR, tidak ada commit/push."; exit 0
fi

echo "==> Commit, tag & push"
git add "$APP/package.json" "$APP/package-lock.json" 2>/dev/null || git add "$APP/package.json"
git commit -m "chore(release): dailyreport $TAG" -- "$APP/package.json" $( [ -f "$APP/package-lock.json" ] && echo "$APP/package-lock.json" )
git tag -a "$TAG" -m "dailyreport $TAG"
git push origin "$BRANCH"
git push origin "$TAG"

echo "==> GitHub Release"
gh release create "$TAG" "$TGZ" --title "dailyreport $TAG" \
  --notes "${NOTES:-Rilis dailyreport $TAG}

**Install**
\`\`\`
npm i -g ./dailyreport-$NEW.tgz
dailyreport init
dailyreport server start
\`\`\`"

echo "Selesai: $(gh release view "$TAG" --json url -q .url)"
