import argparse
import json
import os
import re
import subprocess
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.sources.extend(value for key, value in attrs if key == "src")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--apply", action="store_true")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--preview", action="store_true")
    mode.add_argument("--candidate", action="store_true")
    args = parser.parse_args()
    project_id = os.environ["VERCEL_PROJECT_ID"]
    team_id = os.environ["VERCEL_ORG_ID"]
    team_slug = os.environ.get("VERCEL_TEAM_SLUG", "astralgrove")
    source_commit = os.environ.get("GITHUB_SHA", "manual")
    if source_commit != "manual" and not re.fullmatch(r"[a-f0-9]{40}", source_commit):
        raise ValueError("A full source commit is required")
    if not re.fullmatch(r"vcr\.vercel\.com/[a-z0-9-]+/[a-z0-9-]+/web@sha256:[a-f0-9]{64}", args.image):
        raise ValueError("An immutable web image is required")
    config = json.loads(Path("vercel.json").read_text())
    if not args.apply:
        print(json.dumps({"projectId": project_id, "image": args.image, "apply": False}))
        return
    opener = urllib.request.build_opener(NoRedirect)

    def api(method, path, body=None):
        request = urllib.request.Request(
            "https://api.vercel.com" + path + "?teamId=" + team_id,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Authorization": "Bearer " + os.environ["VERCEL_TOKEN"], "Content-Type": "application/json"},
            method=method,
        )
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    project = api("GET", "/v9/projects/" + project_id)
    if project["id"] != project_id:
        raise ValueError("Unexpected project")
    if project.get("rootDirectory") is not None or project.get("framework") is not None:
        raise ValueError("Set the Vercel project root to the repository root and framework to Other")
    bypass = next(iter(project.get("protectionBypass", {})), None)
    if not bypass:
        raise ValueError("Configure a Vercel automation bypass before deploying")
    body = {
        "name": project["name"],
        "project": project_id,
        "files": [
            {"file": "vercel.json", "data": json.dumps(config)},
            {"file": "Dockerfile.vercel", "data": "FROM " + args.image + "\n"},
        ],
        "projectSettings": {"rootDirectory": None, "framework": None},
        "autoAssignCustomDomains": False,
        "meta": {"sourceCommit": source_commit, "imageSource": args.image},
    }
    if not args.preview:
        body["target"] = "production"
    deployment = api("POST", "/v13/deployments", body)
    for _ in range(120):
        deployment = api("GET", "/v13/deployments/" + deployment["id"])
        if deployment["readyState"] == "READY":
            break
        if deployment["readyState"] in {"ERROR", "CANCELED"}:
            raise RuntimeError("Container deployment failed")
        time.sleep(5)
    else:
        raise TimeoutError("Container deployment did not become ready")
    if deployment["projectId"] != project_id or not re.fullmatch(r"[a-z0-9-]+\.vercel\.app", deployment["url"]):
        raise ValueError("Unexpected deployment destination")
    origin = "https://" + deployment["url"]
    request = urllib.request.Request(origin + "/login", headers={"x-vercel-protection-bypass": bypass})
    with opener.open(request, timeout=60) as response:
        assert response.status == 200
        assert "text/html" in response.headers["Content-Type"]
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert urlparse(os.environ["NEXT_PUBLIC_API_URL"]).netloc in response.headers["Content-Security-Policy"]
        scripts = Scripts()
        scripts.feed(response.read().decode())
    assert scripts.sources
    for source in scripts.sources[:3]:
        assert source.startswith("/_next/") and not urlparse(source).netloc
        request = urllib.request.Request(origin + source, headers={"x-vercel-protection-bypass": bypass})
        with opener.open(request, timeout=30) as response:
            assert response.status == 200
            assert "javascript" in response.headers["Content-Type"]
    if not args.preview and not args.candidate:
        subprocess.run(["vercel", "promote", deployment["id"], "--yes", "--scope", team_slug], check=True)
    status = "preview" if args.preview else "candidate" if args.candidate else "promoted"
    print(json.dumps({"deploymentId": deployment["id"], "image": args.image, "status": status}))


if __name__ == "__main__":
    main()
