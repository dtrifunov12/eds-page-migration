#!/usr/bin/env bash
# Upload the imported diva-e home page to da.live as a document.
#
# Usage:
#   export DA_TOKEN="<paste your IMS access token>"
#   ./import-work/upload-to-da.sh
#
# What it does:
#   PUT https://admin.da.live/source/dtrifunov12/eds-page-migration/en/index.html
#   with multipart/form-data data=@import-work/da-document.html
#
# After it succeeds, the doc is editable at:
#   https://da.live/edit#/dtrifunov12/eds-page-migration/en/index

set -euo pipefail

ORG="dtrifunov12"
REPO="eds-page-migration"
DOC_PATH="en/index"            # no extension; admin.da.live appends .html
SRC_HTML="import-work/da-document.html"

if [[ -z "${DA_TOKEN:-}" ]]; then
  echo "ERROR: set DA_TOKEN to your da.live IMS access token before running." >&2
  echo "  export DA_TOKEN=\"eyJhbGciOi...\"" >&2
  exit 1
fi

if [[ ! -f "$SRC_HTML" ]]; then
  echo "ERROR: $SRC_HTML not found. Run from the repo root." >&2
  exit 1
fi

URL="https://admin.da.live/source/${ORG}/${REPO}/${DOC_PATH}.html"
echo "PUT $URL"
echo "    body: $SRC_HTML ($(wc -c <"$SRC_HTML") bytes)"

HTTP_CODE=$(curl -sS -o /tmp/da-upload.out -w "%{http_code}" \
  -X PUT "$URL" \
  -H "Authorization: Bearer ${DA_TOKEN}" \
  -F "data=@${SRC_HTML};type=text/html")

echo
echo "HTTP $HTTP_CODE"
cat /tmp/da-upload.out
echo

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo
  echo "✓ Uploaded. Edit it here:"
  echo "  https://da.live/edit#/${ORG}/${REPO}/${DOC_PATH}"
  echo "  https://da.live/#/${ORG}/${REPO}/en   (folder view)"
else
  echo
  echo "✗ Upload failed. Common causes:"
  echo "  - 401: token expired or wrong scope (re-grab from da.live tab)"
  echo "  - 403: token user has no write access to ${ORG}/${REPO}"
  echo "  - 404: org/repo not yet bootstrapped in da.live"
  exit 1
fi
