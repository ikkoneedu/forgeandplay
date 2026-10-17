#!/usr/bin/env bash
# KO Ekip Windows exe derlemesi.
# Arayüzün tek kaynağı ../public/kohesap-app klasörüdür; derlemeden önce buraya kopyalanır.
set -euo pipefail
cd "$(dirname "$0")"
# Firebase kurallarının güncel kopyası (uygulamadaki "Kuralları kopyala" düğmesi için)
cp ../firestore.rules ../public/kohesap-app/firestore.rules.txt
rm -rf web && cp -r ../public/kohesap-app web
# exe arayüzü kökten sunar: web sitesine özel <base> etiketi çıkarılır
sed -i '/<base href=/d' web/index.html
VERSION=$(grep -oP 'appVersion = "\K[^"]+' main.go)
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -H windowsgui" -o KOEkip-raw.exe .
# ikon ve sürüm bilgisi (npx resedit-cli)
npx --yes resedit-cli@2 --in KOEkip-raw.exe --out ../public/downloads/KOEkip.exe --icon 1,icon.ico \
  --product-name "KO Ekip" --file-description "KO Ekip - Knight Online ekip uygulaması (forgeandplay.com)" \
  --product-version "$VERSION.0" --file-version "$VERSION.0" --original-filename KOEkip.exe
rm -f KOEkip-raw.exe ../public/downloads/KOHesap.exe
echo "Hazır: public/downloads/KOEkip.exe (v$VERSION)"
