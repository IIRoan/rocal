#!/usr/bin/env python3
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.error import URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ZONE = "solace.onl"
HOST = "mail.solace.onl"
PRIMARY = "mx.solace.onl"
STANDBY = "mx2.solace.onl"
PREVIOUS = "edge.solace.onl"
ORIGINS = (PRIMARY, STANDBY)
POLL_SECONDS = 5
FAILURES_TO_SWITCH = 2
SUCCESSES_TO_RETURN = 12
API = "https://api.cloudflare.com/client/v4"


def probe(origin):
    result = subprocess.run(
        [
            "/usr/bin/curl", "--silent", "--fail", "--noproxy", "*",
            "--max-time", "3", "--max-filesize", "1048576",
            "--connect-to", f"{HOST}:443:{origin}:443",
            f"https://{HOST}/jmap/session",
        ],
        capture_output=True,
        check=False,
    )
    if result.returncode:
        return False
    try:
        session = json.loads(result.stdout)
        api_url = urlsplit(session["apiUrl"])
        return (
            api_url.scheme == "https" and api_url.netloc == HOST and api_url.path.rstrip("/") == "/jmap"
            and "urn:ietf:params:jmap:core" in session["capabilities"]
        )
    except (ValueError, KeyError, TypeError):
        return False


def choose(active, streaks):
    alternate = STANDBY if active == PRIMARY else PRIMARY
    if streaks[active] <= -FAILURES_TO_SWITCH and streaks[alternate] >= FAILURES_TO_SWITCH:
        return alternate
    if active == STANDBY and streaks[PRIMARY] >= SUCCESSES_TO_RETURN:
        return PRIMARY
    return active


class Dns:
    def __init__(self, token):
        self.token = token
        zones = self.request("/zones?" + urlencode({"name": ZONE}))
        zone, = zones
        if zone["name"] != ZONE or not re.fullmatch(r"[a-f0-9]{32}", zone["id"]):
            raise ValueError("Unexpected DNS zone")
        self.records = f"/zones/{zone['id']}/dns_records"

    def request(self, path, data=None):
        request = Request(
            API + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Authorization": "Bearer " + self.token, "Content-Type": "application/json"},
            method="PATCH" if data is not None else "GET",
        )
        with urlopen(request, timeout=10) as response:
            document = json.load(response)
        if not document["success"]:
            raise ValueError("Cloudflare DNS request failed")
        return document["result"]

    def current(self, allow_previous=False):
        record, = self.request(self.records + "?" + urlencode({"name": HOST}))
        allowed = (*ORIGINS, PREVIOUS) if allow_previous else ORIGINS
        if (
            record["name"] != HOST or record["type"] != "CNAME" or record["proxied"]
            or record["content"] not in allowed or not re.fullmatch(r"[a-f0-9]{32}", record["id"])
        ):
            raise ValueError("Refusing to manage an unexpected CNAME")
        return record

    def switch(self, expected, target, allow_previous=False):
        if target not in ORIGINS:
            raise ValueError("Unexpected target")
        latest = self.current(allow_previous)
        if latest["content"] != expected:
            raise ValueError("CNAME changed since selection")
        if target == expected:
            return
        record = self.request(f"{self.records}/{latest['id']}", {"content": target})
        if record["content"] != target or record["proxied"]:
            raise ValueError("Cloudflare did not confirm the direct DNS target")
        print(f"{HOST} switched from {expected} to {target}", flush=True)


def monitor(dns):
    active = dns.current()["content"]
    streaks = dict.fromkeys(ORIGINS, 0)
    previous = None
    print(f"Monitoring direct JMAP origins with {active} active", flush=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        while True:
            start = time.monotonic()
            health = dict(zip(ORIGINS, pool.map(probe, ORIGINS), strict=True))
            if health != previous:
                print("JMAP health", health, flush=True)
                previous = health
            for origin, ok in health.items():
                prior = streaks[origin]
                streaks[origin] = max(0, prior) + 1 if ok else min(0, prior) - 1
            target = choose(active, streaks)
            if target != active:
                try:
                    dns.switch(active, target)
                    active = target
                except URLError as error:
                    print(f"DNS switch failed ({type(error).__name__})", flush=True)
                    active = dns.current()["content"]
                streaks = dict.fromkeys(ORIGINS, 0)
            time.sleep(max(0, POLL_SECONDS - (time.monotonic() - start)))


def main():
    parser = argparse.ArgumentParser()
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--check", action="store_true")
    actions.add_argument("--select", choices=ORIGINS)
    parser.add_argument("--token-file", type=Path)
    args = parser.parse_args()
    if args.check:
        health = {origin: probe(origin) for origin in ORIGINS}
        print(json.dumps(health))
        return 0 if all(health.values()) else 1

    token_file = args.token_file or Path(os.environ["CREDENTIALS_DIRECTORY"]) / "cloudflare-token"
    dns = Dns(token_file.read_text().strip())
    if args.select:
        if not probe(args.select):
            raise ValueError("Requested origin failed the JMAP discovery check")
        current = dns.current(allow_previous=True)["content"]
        dns.switch(current, args.select, allow_previous=True)
    else:
        monitor(dns)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (URLError, ValueError, KeyError, OSError) as error:
        raise SystemExit(f"JMAP failover could not continue ({type(error).__name__})") from None
