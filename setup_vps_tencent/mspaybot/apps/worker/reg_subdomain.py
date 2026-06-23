#!/usr/bin/env python3
"""Register workers.dev subdomain via Cloudflare API."""
import json, os
from urllib.request import Request, urlopen

config_path = os.path.expanduser("~/../AppData/Roaming/xdg.config/.wrangler/config/default.toml")
with open(config_path) as f:
    for line in f:
        if "oauth_token" in line:
            token = line.split('"')[1]
            break

account_id = "f76f43df5bd8a43a793f6ecd7e5e7eaf"
subdomain = "telebotsb"
url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/subdomain"

# Register
data = json.dumps({"subdomain": subdomain}).encode()
req = Request(url, data=data, method="POST")
req.add_header("Authorization", f"Bearer {token}")
req.add_header("Content-Type", "application/json")
try:
    resp = urlopen(req)
    print("REGISTER:", json.dumps(json.loads(resp.read()), indent=2))
except Exception as e:
    print(f"REGISTER Error: {e}")
    if hasattr(e, 'read'):
        print("Response:", e.read().decode()[:500])

# Check
req2 = Request(url, method="GET")
req2.add_header("Authorization", f"Bearer {token}")
try:
    resp2 = urlopen(req2)
    print("STATUS:", json.dumps(json.loads(resp2.read()), indent=2))
except Exception as e:
    print(f"STATUS Error: {e}")
    if hasattr(e, 'read'):
        print("Response:", e.read().decode()[:500])
