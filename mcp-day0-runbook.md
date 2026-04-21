# MCP Day 0 Runbook — GCP Setup

Steps you need to run in the GCP Console or gcloud CLI. I can't do these remotely — you need IAM-level permissions.

Project: `project-for-method-dw`

## 1. Create the service account

**Console:** IAM & Admin → Service Accounts → **Create Service Account**
- Name: `mcp-reader`
- ID: `mcp-reader`
- Description: `Read-only BQ access for Metrics MCP`

**or gcloud:**
```bash
gcloud iam service-accounts create mcp-reader \
  --project=project-for-method-dw \
  --display-name="MCP Reader" \
  --description="Read-only BQ access for Metrics MCP"
```

## 2. Grant BigQuery roles

Two roles needed: `dataViewer` (read the data) + `jobUser` (run queries).

**Console:** IAM & Admin → IAM → **Grant Access**
- Principal: `mcp-reader@project-for-method-dw.iam.gserviceaccount.com`
- Roles: `BigQuery Data Viewer`, `BigQuery Job User`
- Condition: *(none — apply at project level for simplicity; scope tighter later if needed)*

**or gcloud:**
```bash
SA="mcp-reader@project-for-method-dw.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding project-for-method-dw \
  --member="serviceAccount:$SA" \
  --role="roles/bigquery.jobUser"

# Scope dataViewer to just the revenue dataset (tighter than project-level):
bq update --source_format=JSON \
  --dataset_access_allowlist \
  <(bq show --format=prettyjson project-for-method-dw:revenue \
    | jq ".access += [{\"role\":\"READER\",\"userByEmail\":\"$SA\"}]") \
  project-for-method-dw:revenue
```

*(If the jq dance is annoying, just grant `roles/bigquery.dataViewer` project-wide via Console — simpler, and the SA still can't touch datasets it doesn't need because only the MCP code references `revenue.*`.)*

## 3. Enable Data Access audit logs

**Console:** IAM & Admin → Audit Logs → find **BigQuery** → check all three (Admin Read, Data Read, Data Write) → Save.

This means every query by any principal is logged. Cost: negligible for our volume.

## 4. Create and download the SA key

**Console:** IAM & Admin → Service Accounts → click `mcp-reader` → Keys tab → **Add Key → Create new key** → JSON → Create.

A JSON file downloads. **Don't commit this.** It's the SA's credential.

**or gcloud:**
```bash
gcloud iam service-accounts keys create mcp-reader-key.json \
  --iam-account=mcp-reader@project-for-method-dw.iam.gserviceaccount.com
```

## 5. Upload the key to Supabase as an edge function secret

The edge function will read the SA key from env.

```bash
# From repo root:
supabase secrets set MCP_BQ_SA_KEY="$(cat /path/to/mcp-reader-key.json)" \
  --project-ref <your-supabase-project-ref>
```

*(If you don't have the Supabase CLI linked: Dashboard → Edge Functions → Secrets → add `MCP_BQ_SA_KEY` with the full JSON as the value.)*

Then **delete the local JSON file.** Key now lives only in Supabase's encrypted store.

## 6. Rotation runbook (reference)

Every 90 days:
1. Create new key via step 4
2. Update Supabase secret via step 5
3. Test the MCP still works
4. Delete old key in GCP Console → SA → Keys

Revocation on leak:
1. GCP Console → SA → Keys → delete compromised key
2. Check BQ audit logs for anomalous queries in the key's lifetime
3. Rotate to new key

---

## What I'm doing in parallel

While you do the above, I'll scaffold:
- `supabase/functions/mcp-metrics/` edge function skeleton
- `supabase/migrations/<timestamp>_mcp_tokens.sql` — user-token storage
- `scripts/generate_mcp_token.py` — one-per-user token issuer

When you're done with steps 1-5 above, we meet at Day 1: wiring the skeleton to BQ via the SA key.
