#!/usr/bin/env bash
#
# Check (and, if missing, add) the Resend domains for the lead form, then print
# the DNS records needed to verify each one.
#
# The Resend API key is read from the environment and never printed. Run it as:
#
#   RESEND_API_KEY="re_your_key_here" bash scripts/resend-domains.sh
#
# Get the key from the Resend dashboard (API Keys) or reveal it in the Vercel
# project settings — `vercel env pull` masks it as [SENSITIVE], so it cannot be
# fetched automatically.
#
set -euo pipefail

: "${RESEND_API_KEY:?Set RESEND_API_KEY (e.g. RESEND_API_KEY=re_xxx bash scripts/resend-domains.sh)}"

DOMAINS=("solventisbaa.com" "solventisbankers.com")
API="https://api.resend.com/domains"
AUTH=(-H "Authorization: Bearer ${RESEND_API_KEY}")

echo "== Domains currently in this Resend account =="
existing="$(curl -sS --max-time 25 "$API" "${AUTH[@]}")"
echo "$existing" | python3 -c "import sys,json;d=json.load(sys.stdin).get('data',[]);[print(f\"  - {x.get('name')}  status={x.get('status')}  id={x.get('id')}\") for x in d] or print('  (none)')" \
  || { echo "$existing"; echo "!! Could not parse — key may be invalid"; exit 1; }

for d in "${DOMAINS[@]}"; do
  echo ""
  echo "=================== ${d} ==================="
  id="$(echo "$existing" | python3 -c "import sys,json;data=json.load(sys.stdin).get('data',[]);print(next((x['id'] for x in data if x.get('name')=='${d}'),''))")"

  if [ -z "$id" ]; then
    echo "Not present — adding to Resend..."
    resp="$(curl -sS --max-time 25 -X POST "$API" "${AUTH[@]}" -H "Content-Type: application/json" -d "{\"name\":\"${d}\"}")"
    id="$(echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)"
    [ -z "$id" ] && { echo "  Add failed: $resp"; continue; }
    echo "  Added (id ${id})."
  fi

  echo "--- DNS records to add for ${d} (status + each record) ---"
  curl -sS --max-time 25 "$API/$id" "${AUTH[@]}" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('  overall status:', d.get('status'))
for r in d.get('records',[]):
    print(f\"    [{r.get('record','')}] type={r.get('type')} host={r.get('name')} value={r.get('value')} priority={r.get('priority','-')} ttl={r.get('ttl','')} -> {r.get('status')}\")
"
done

echo ""
echo "Add the records above at each domain's DNS provider, then re-run this"
echo "script (or click Verify in the Resend dashboard) until status = verified."
