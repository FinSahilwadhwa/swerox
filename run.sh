#!/usr/bin/env bash
set -euo pipefail

# SWEROX - Daily SBI FOREX Card Rates Fetcher
# Saves SBI's official PDF to sbi-tt-rates/YYYY/MM/YYYY-MM-DD.pdf

export TZ="${TZ:-Asia/Kolkata}"

RUN_DATE="${SBI_TT_DATE:-$(date '+%Y-%m-%d')}"
YEAR="${RUN_DATE:0:4}"
MONTH="${RUN_DATE:5:2}"
ARCHIVE_ROOT="sbi-tt-rates"
OUTPUT_DIR="${ARCHIVE_ROOT}/${YEAR}/${MONTH}"
OUTPUT_FILE="${OUTPUT_DIR}/${RUN_DATE}.pdf"
TMP_FILE="$(mktemp)"

PDF_URLS=(
  "${SBI_TT_SOURCE_URL:-https://sbi.bank.in/documents/16012/1400784/FOREX_CARD_RATES.pdf}"
  "https://www.sbi.co.in/documents/16012/1400784/FOREX_CARD_RATES.pdf"
)

cleanup() {
  rm -f "${TMP_FILE}"
}
trap cleanup EXIT

if [ -f "${OUTPUT_FILE}" ]; then
  echo "Archive already exists: ${OUTPUT_FILE}"
  exit 0
fi

echo "Fetching SBI FOREX rates for ${RUN_DATE}..."
mkdir -p "${OUTPUT_DIR}"

downloaded=0
for url in "${PDF_URLS[@]}"; do
  echo "Trying ${url}"
  if curl -fsSL \
    --retry 3 \
    --retry-delay 10 \
    --connect-timeout 30 \
    --max-time 90 \
    -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36" \
    -H "Accept: application/pdf,*/*" \
    -H "Referer: https://sbi.co.in/" \
    "${url}" \
    --output "${TMP_FILE}"; then
    downloaded=1
    break
  fi
done

if [ "${downloaded}" -ne 1 ]; then
  echo "Download failed from all SBI URLs."
  exit 1
fi

if [ "$(wc -c < "${TMP_FILE}")" -le 5000 ]; then
  echo "Downloaded file is too small to be a valid rates PDF."
  exit 1
fi

if ! head -c 5 "${TMP_FILE}" | grep -q "%PDF-"; then
  echo "Downloaded file does not look like a PDF."
  exit 1
fi

mv "${TMP_FILE}" "${OUTPUT_FILE}"
echo "Saved ${OUTPUT_FILE} ($(wc -c < "${OUTPUT_FILE}") bytes)"

git config user.email "auto@swerox.in"
git config user.name "SWEROX Auto Update"
git add "${OUTPUT_FILE}"

if git diff --cached --quiet; then
  echo "No new SBI TT rates PDF to commit."
  exit 0
fi

git commit -m "Archive SBI TT rates: ${RUN_DATE}"
git push origin "HEAD:${GITHUB_REF_NAME:-main}"

echo "Done. Rates pushed to GitHub."
