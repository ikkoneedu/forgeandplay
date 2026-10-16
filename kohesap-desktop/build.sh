#!/usr/bin/env bash
# KO Hesap Windows exe derlemesi.
# Arayüzün tek kaynağı ../public/kohesap-app klasörüdür; derlemeden önce buraya kopyalanır.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf web && cp -r ../public/kohesap-app web
VERSION=$(grep -oP 'appVersion = "\K[^"]+' main.go)
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o KOHesap-raw.exe .
# ikon ve sürüm bilgisi (npx resedit-cli)
npx --yes resedit-cli@2 --in KOHesap-raw.exe --out ../public/downloads/KOHesap.exe --icon 1,icon.ico \
  --product-name "KO Hesap" --file-description "KO Hesap - Knight Online defteri (forgeandplay.com)" \
  --product-version "$VERSION.0" --file-version "$VERSION.0" --original-filename KOHesap.exe
rm -f KOHesap-raw.exe
echo "Hazır: public/downloads/KOHesap.exe (v$VERSION)"
