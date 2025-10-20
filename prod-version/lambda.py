import json, os, random, datetime, traceback, re, mimetypes, sys
import urllib.request, urllib.parse
from urllib.error import HTTPError, URLError
import boto3

"""
DFJ Document-Share Lambda (full file)
------------------------------------
Handles:
 • OTP generation / verification
 • Presigned S3 URLs for upload & download
 • Document approval
 • Chat messaging (ChatMessage__c)
 • (UPDATED) Sends Document_Type__c/Market_Unit__c to client
 • (UPDATED) On view: set Last_Viewed__c, and Sent→Viewed (conditional)
 • (UPDATED) Upload-start blocks if filename doesn't contain Journal Name (e.g. J-00xxxx)
 • (NEW) Upload S3 path is prefixed per Market Unit (dk/se/ie) with env override
"""

# ===================== ENV =====================
AWS_REGION     = os.environ.get("AWS_REGION", "eu-north-1")
DOCS_BUCKET    = os.environ.get("DOCS_BUCKET", "dfj-docs-prod")

SF_LOGIN_URL     = os.environ.get("SF_LOGIN_URL", "https://login.salesforce.com")
SF_CLIENT_ID     = os.environ.get("SF_CLIENT_ID")
SF_CLIENT_SECRET = os.environ.get("SF_CLIENT_SECRET")
SF_REFRESH_TOKEN = os.environ.get("SF_REFRESH_TOKEN")

ALLOWED_ORIGINS = {
    "https://dfj.lightning.force.com",
    "https://dfj.my.salesforce.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8000",
    "http://localhost:8080",
    "https://dok.dinfamiliejurist.dk",
    "https://dok.dinfamiljejurist.se",
    "https://docs.hereslaw.ie",
}

# Optional JSON mapping override for S3 base prefixes by Market Unit.
# Example: {"DFJ_DK":"dk/customer-documents","FA_SE":"se/customer-documents","Ireland":"ie/customer-documents"}
try:
    _S3_PREFIX_MAP = json.loads(os.environ.get("S3_PREFIX_MAP", "") or "{}")
except Exception:
    _S3_PREFIX_MAP = {}

_DEFAULT_PREFIX_MAP = {
    "DFJ_DK": "dk/customer-documents",
    "FA_SE":  "se/customer-documents",
    "Ireland":"ie/customer-documents",
}
_FALLBACK_PREFIX = "customer-documents"


def s3_base_prefix_for_market(market_unit: str) -> str:
    """
    Decide the S3 base prefix (e.g., 'dk/customer-documents') based on Market Unit.
    Honors env override (S3_PREFIX_MAP). Falls back to plain 'customer-documents'.
    """
    mu = (market_unit or "").strip()
    if mu in _S3_PREFIX_MAP:
        return _S3_PREFIX_MAP[mu]
    return _DEFAULT_PREFIX_MAP.get(mu, _FALLBACK_PREFIX)


# ===================== RESP / CORS =====================

def _cors_origin(event):
    try:
        hdrs = event.get("headers") or {}
        origin = hdrs.get("origin") or hdrs.get("Origin")
        if origin in ALLOWED_ORIGINS:
            return origin
    except Exception:
        pass
    return "*"


def resp(event, status, body):
    payload = body if isinstance(body, str) else json.dumps(body)
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": _cors_origin(event),
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
        },
        "body": payload,
    }


def log(*args):
    print(*args, file=sys.stdout, flush=True)

# ===================== SALESFORCE AUTH =====================

def get_org_token():
    """
    Refresh a Salesforce OAuth token using a connected app's refresh token.
    Returns: (access_token, instance_url)
    """
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": SF_CLIENT_ID or "",
        "client_secret": SF_CLIENT_SECRET or "",
        "refresh_token": SF_REFRESH_TOKEN or "",
    }).encode("utf-8")
    url = f"{SF_LOGIN_URL}/services/oauth2/token"
    req = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        out = json.loads(r.read().decode("utf-8"))
        if "access_token" not in out or "instance_url" not in out:
            log("SF token success but missing fields:", out)
            raise RuntimeError("Salesforce token response missing fields")
        return out["access_token"], out["instance_url"]

# ===================== SF HELPERS =====================

def salesforce_query(instance_url, org_token, soql):
    url = f"{instance_url}/services/data/v61.0/query?q={urllib.parse.quote(soql)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {org_token}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))

def salesforce_patch(instance_url, org_token, sobject, rec_id, payload):
    url = f"{instance_url}/services/data/v61.0/sobjects/{sobject}/{rec_id}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="PATCH",
        headers={"Authorization": f"Bearer {org_token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10):
        return True

def salesforce_insert(instance_url, org_token, sobject, payload):
    url = f"{instance_url}/services/data/v61.0/sobjects/{sobject}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {org_token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))["id"]

# ===================== S3 PRESIGN =====================
_s3 = boto3.client("s3", region_name=AWS_REGION)

def s3_presign_get(bucket, key, expires=600):
    return _s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=int(expires),
    )

# ===================== JOURNAL AUTH =====================

def auth_journal(external_id: str, access_token: str):
    """
    Validate Journal by External_ID__c + Access_Token__c.
    Return dict {id, externalId} on success, else None.
    """
    if not external_id or not access_token:
        log("auth_journal: missing externalId or accessToken")
        return None
    org_token, instance_url = get_org_token()

    esc_ext = external_id.replace("'", "\\'")
    soql = (
        "SELECT Id, Access_Token__c "
        "FROM Journal__c "
        f"WHERE External_ID__c = '{esc_ext}' "
        "LIMIT 1"
    )
    recs = salesforce_query(instance_url, org_token, soql).get("records", [])
    if not recs:
        log("auth_journal: no journal for externalId", external_id)
        return None
    row = recs[0]
    if (row.get("Access_Token__c") or "") != access_token:
        log("auth_journal: token mismatch for externalId", external_id)
        return None
    return {"id": row["Id"], "externalId": external_id}

# ===================== OTP HANDLERS =====================

def handle_otp_send(event, event_json):
    data = event_json or {}
    external_id = (data.get("externalId") or "").strip()
    if not external_id:
        return resp(event, 400, {"error": "Missing externalId"})

    org_token, instance_url = get_org_token()

    esc_ext = external_id.replace("'", "\\'")
    q = "SELECT Id FROM Journal__c WHERE External_ID__c = '" + esc_ext + "' LIMIT 1"
    qres = salesforce_query(instance_url, org_token, q)
    recs = qres.get("records", [])
    if not recs:
        return resp(event, 404, {"error": "Not found"})

    journal_id = recs[0]["Id"]
    otp = f"{random.randint(0, 999999):06d}"
    expires = (datetime.datetime.utcnow() + datetime.timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")

    payload = {"OTP_Code__c": otp, "OTP_Expires__c": expires}
    salesforce_patch(instance_url, org_token, "Journal__c", journal_id, payload)

    return resp(event, 200, {"ok": True})


def handle_otp_verify(event, event_json):
    data = event_json or {}
    external_id = (data.get("externalId") or "").strip()
    otp = (data.get("otp") or "").strip()

    if not external_id or not otp:
        return resp(event, 400, {"error": "Missing externalId or otp"})

    org_token, instance_url = get_org_token()

    esc_ext = external_id.replace("'", "\\'")
    soql = (
        "SELECT Id, OTP_Code__c, OTP_Expires__c "
        "FROM Journal__c "
        f"WHERE External_ID__c = '{esc_ext}' "
        "LIMIT 1"
    )
    recs = salesforce_query(instance_url, org_token, soql).get("records", [])
    if not recs:
        return resp(event, 404, {"error": "Not found"})

    row = recs[0]
    row_code   = row.get("OTP_Code__c") or ""
    row_expiry = row.get("OTP_Expires__c") or ""

    if otp != row_code:
        return resp(event, 200, {"ok": False, "error": "Invalid code"})

    try:
        iso = row_expiry.strip()
        if iso.endswith("+0000"):
            iso = iso[:-5] + "Z"
        iso = iso.replace(".000Z", "Z")
        exp_dt = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")
        if datetime.datetime.utcnow() > exp_dt:
            return resp(event, 200, {"ok": False, "error": "Code expired"})
    except Exception:
        log("Bad expiry format:", row_expiry)
        return resp(event, 200, {"ok": False, "error": "Code expired"})

    return resp(event, 200, {"ok": True})

# ===================== DOC LIST / URL (Journal scope) =====================

def handle_doc_list(event, event_json):
    data = event_json or {}
    external_id  = (data.get("externalId")  or "").strip()
    access_token = (data.get("accessToken") or "").strip()

    auth = auth_journal(external_id, access_token)
    if not auth:
        return resp(event, 401, {"error": "Unauthorized"})

    org_token, instance_url = get_org_token()

    # (UPDATED) Include type, market, sent & last-viewed
    soql = (
        "SELECT Id, Name, Version__c, Status__c, S3_Key__c, Is_Newest_Version__c, "
        "Document_Type__c, Market_Unit__c, Sent_Date__c, Last_Viewed__c "
        "FROM Shared_Document__c "
        f"WHERE Journal__c = '{auth['id']}' "
        "ORDER BY Name"
    )
    rows = salesforce_query(instance_url, org_token, soql).get("records", [])

    items = [{
        "id":                r.get("Id"),
        "name":              r.get("Name"),
        "version":           r.get("Version__c"),
        "status":            r.get("Status__c"),
        "s3Key":             r.get("S3_Key__c"),
        "isNewestVersion":   r.get("Is_Newest_Version__c"),
        "documentType":      r.get("Document_Type__c"),
        "marketUnit":        r.get("Market_Unit__c"),
        "sentDate":          r.get("Sent_Date__c"),
        "lastViewed":        r.get("Last_Viewed__c"),
    } for r in rows]

    return resp(event, 200, {"ok": True, "documents": items})


def handle_doc_url(event, event_json):
    data = event_json or {}
    external_id  = (data.get("externalId")  or "").strip()
    access_token = (data.get("accessToken") or "").strip()
    doc_id       = (data.get("docId")       or "").strip()
    if not doc_id:
        return resp(event, 400, {"error": "Missing docId"})

    auth = auth_journal(external_id, access_token)
    if not auth:
        return resp(event, 401, {"error": "Unauthorized"})

    org_token, instance_url = get_org_token()

    # (UPDATED) read Status__c as well
    soql = (
        "SELECT Id, S3_Key__c, Journal__c, Status__c "
        "FROM Shared_Document__c "
        f"WHERE Id = '{doc_id}' "
        "LIMIT 1"
    )
    recs = salesforce_query(instance_url, org_token, soql).get("records", [])
    if not recs:
        return resp(event, 404, {"error": "Not found"})
    doc = recs[0]
    if doc.get("Journal__c") != auth["id"]:
        return resp(event, 403, {"error": "Forbidden"})

    s3_key = doc.get("S3_Key__c")
    if not s3_key:
        return resp(event, 400, {"error": "Missing S3 key"})

    # (UPDATED) Update Last_Viewed__c always; if status is Sent, set to Viewed (and only then)
    now_iso = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    patch = {"Last_Viewed__c": now_iso}
    if (doc.get("Status__c") or "").strip().lower() == "sent":
        patch["Status__c"] = "Viewed"
    try:
        salesforce_patch(instance_url, org_token, "Shared_Document__c", doc_id, patch)
    except Exception as e:
        log("Warning: failed to patch Last_Viewed/Viewed:", repr(e))

    try:
        url = s3_presign_get(DOCS_BUCKET, s3_key, expires=600)
    except Exception as e:
        log("s3_presign_get error:", repr(e))
        return resp(event, 500, {"error": "S3 presign failed"})
    return resp(event, 200, {"ok": True, "url": url})

# ===================== UPLOAD-START (presign PUT to S3) =====================
_SAFE_CHARS = re.compile(r'[^A-Za-z0-9._-]')

def sanitize_filename(name: str) -> str:
    if not name:
        return "file.pdf"
    base = _SAFE_CHARS.sub('_', name.strip())
    if not base or base in ('.', '..'):
        base = 'file.pdf'
    if len(base) > 180:
        base = base[:180]
    return base

def handle_upload_start(event, event_json):
    data = event_json or {}
    ext_id = (data.get("externalId") or "").strip()
    tok    = (data.get("accessToken") or "").strip()
    files  = data.get("files") or []

    if not ext_id or not tok:
        return resp(event, 400, {"error": "Missing externalId or accessToken"})
    if not isinstance(files, list) or not files:
        return resp(event, 400, {"error": "No files specified"})

    auth = auth_journal(ext_id, tok)
    if not auth:
        return resp(event, 401, {"error": "Unauthorized"})

    org_token, instance_url = get_org_token()

    # Try to read Journal Name + Market_Unit__c (if field exists); fall back gracefully if not.
    journal_name = "JOURNAL"
    journal_mu   = None
    try:
        soql = f"SELECT Name, Market_Unit__c FROM Journal__c WHERE Id = '{auth['id']}' LIMIT 1"
        recs = salesforce_query(instance_url, org_token, soql).get("records", [])
    except HTTPError:
        # If org doesn't have Market_Unit__c on Journal__c, try Name only
        soql = f"SELECT Name FROM Journal__c WHERE Id = '{auth['id']}' LIMIT 1"
        recs = salesforce_query(instance_url, org_token, soql).get("records", [])
    except Exception:
        recs = []

    if not recs:
        return resp(event, 404, {"error": "Journal not found"})

    row = recs[0]
    journal_name  = (row.get("Name") or "JOURNAL").strip()
    journal_lower = journal_name.lower()
    journal_mu    = (row.get("Market_Unit__c") or "").strip() if "Market_Unit__c" in row else None

    base_prefix = s3_base_prefix_for_market(journal_mu)  # e.g., 'dk/customer-documents' or fallback

    items = []
    for f in files:
        raw_name = (f.get("name") or "").strip()
        safe_name = sanitize_filename(raw_name or "file.pdf")
        if not safe_name.lower().endswith(".pdf"):
            safe_name += ".pdf"

        # Enforce filename contains the Journal auto-number
        if journal_lower not in safe_name.lower():
            return resp(event, 400, {"error": f'Filename must include the journal number "{journal_name}".'})

        ctype = (f.get("type") or "").strip()
        content_type = ctype or mimetypes.guess_type(safe_name)[0] or "application/pdf"

        # (NEW) S3 key: <base_prefix>/<JournalName>/<fileName>
        #            e.g., dk/customer-documents/J-001234/MyFile.pdf
        s3_key = f"{base_prefix}/{journal_name}/{safe_name}"

        put_url = _s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": DOCS_BUCKET,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=600
        )

        items.append({
            "fileName": safe_name,
            "key": s3_key,
            "putUrl": put_url,
            "contentType": content_type
        })

    return resp(event, 200, {"ok": True, "items": items})

# ===================== APPROVE / CHAT =================================

def handle_doc_approve(event, data):
    ext  = (data.get("externalId")  or "").strip()
    tok  = (data.get("accessToken") or "").strip()
    ids  =  data.get("docIds") or []

    if not ext or not tok or not isinstance(ids, list) or not ids:
        return resp(event, 400, {"error": "Missing externalId, accessToken or docIds"})

    auth = auth_journal(ext, tok)
    if not auth:
        return resp(event, 401, {"error": "Unauthorized"})

    org_tok, inst = get_org_token()

    success, skipped = 0, 0
    for doc_id in ids:
        try:
            q = ("SELECT Id, Journal__c FROM Shared_Document__c "
                 f"WHERE Id = '{doc_id}' LIMIT 1")
            row = salesforce_query(inst, org_tok, q)["records"]
            if not row or row[0].get("Journal__c") != auth["id"]:
                skipped += 1
                continue
            salesforce_patch(inst, org_tok, "Shared_Document__c",
                             doc_id, {"Status__c": "Approved"})
            success += 1
        except Exception:
            skipped += 1

    return resp(event, 200, {"ok": True, "approved": success, "skipped": skipped})

# ---------- CHAT ----------

def handle_chat_send(event, data):
    ext  = (data.get("externalId")  or "").strip()
    tok  = (data.get("accessToken") or "").strip()
    body = (data.get("body")       or "").strip()

    if not ext or not tok or not body:
        return resp(event, 400, {"error": "Missing externalId, accessToken or body"})

    auth = auth_journal(ext, tok)
    if not auth:
        return resp(event, 401, {"error": "Unauthorized"})

    try:
        org_tok, inst = get_org_token()
        rec_id = salesforce_insert(
            inst, org_tok, "ChatMessage__c", {
                "Journal__c": auth["id"],
                "Body__c":    body,
                "Is_Inbound__c": True,
            })
        return resp(event, 200, {"ok": True, "id": rec_id})
    except Exception as e:
        log("chat_send error:", repr(e))
        return resp(event, 500, {"error": "Salesforce insert failed"})

def handle_chat_list(event):
    qs = event.get("queryStringParameters") or {}
    ext  = (qs.get("e") or "").strip()
    tok  = (qs.get("t") or "").strip()
    since = (qs.get("since") or "").strip()

    auth = auth_journal(ext, tok)
    if not auth:
        return resp(event, 401, {"error": "Unauthorized"})

    try:
        org_tok, inst = get_org_token()
        soql = (
            "SELECT Id, Body__c, Is_Inbound__c, CreatedDate "
            "FROM ChatMessage__c "
            f"WHERE Journal__c = '{auth['id']}' " +
            (f"AND CreatedDate > {since} " if since else "") +
            "ORDER BY CreatedDate ASC LIMIT 500"
        )
        rows = salesforce_query(inst, org_tok, soql).get("records", [])
        msgs = [{
            "id": r["Id"],
            "body": r["Body__c"],
            "inbound": r["Is_Inbound__c"],
            "at": r["CreatedDate"],
        } for r in rows]
        return resp(event, 200, {"ok": True, "messages": msgs})
    except Exception as e:
        log("chat_list error:", repr(e))
        return resp(event, 500, {"error": "Salesforce query failed"})

# ===================== HEALTH / DIAG =====================

def handle_ping(event):
    return resp(event, 200, {"ok": True, "pong": True})

def handle_sf_oauth_check(event):
    try:
        tok, inst = get_org_token()
        return resp(event, 200, {"ok": True, "instanceUrl": inst})
    except Exception:
        return resp(event, 502, {"ok": False, "error": "Salesforce OAuth failed"})

# ===================== ROUTER =====================

def lambda_handler(event, context):
    try:
        method = (event.get("requestContext", {}).get("http", {}).get("method") or "").upper()
        path   = (event.get("rawPath") or "").lower()

        if method == "OPTIONS":
            return resp(event, 200, {"ok": True})

        data = {}
        if method in ("POST", "PUT", "PATCH"):
            try:
                data = json.loads(event.get("body") or "{}")
            except Exception:
                data = {}

        if path.endswith("/ping")             and method == "GET":  return handle_ping(event)
        if path.endswith("/sf-oauth-check")   and method == "GET":  return handle_sf_oauth_check(event)

        if path.endswith("/otp-send")         and method == "POST": return handle_otp_send(event, data)
        if path.endswith("/otp-verify")       and method == "POST": return handle_otp_verify(event, data)
        if path.endswith("/doc-list")         and method == "POST": return handle_doc_list(event, data)
        if path.endswith("/doc-url")          and method == "POST": return handle_doc_url(event, data)
        if path.endswith("/upload-start")     and method == "POST": return handle_upload_start(event, data)
        if path.endswith("/approve")          and method == "POST": return handle_doc_approve(event, data)
        if path.endswith("/chat/list")        and method == "GET":  return handle_chat_list(event)
        if path.endswith("/chat/send")        and method == "POST": return handle_chat_send(event, data)

        return resp(event, 404, {"error": "Not Found"})

    except HTTPError as e:
        try:
            log("Top-level HTTPError:", e.code, e.reason)
            log("HTTPError body:", e.read().decode("utf-8"))
        except Exception:
            log("Top-level HTTPError (no body readable)")
        return resp(event, 500, {"error": "Server error"})
    except Exception as e:
        log("Top-level exception:", repr(e))
        log(traceback.format_exc())
        return resp(event, 500, {"error": "Server error"})
