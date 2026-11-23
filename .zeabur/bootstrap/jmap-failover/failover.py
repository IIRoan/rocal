#!/usr/bin/env python3
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from http.client import HTTPException, HTTPSConnection
import json
import os
from pathlib import Path
import re
import subprocess
import time

ZONE = "solace.onl"
HOST = "mail.solace.onl"
PRIMARY = "mx.solace.onl"
STANDBY = "mx2.solace.onl"
PREVIOUS = "edge.solace.onl"
ORIGINS = (PRIMARY, STANDBY)
POLL_SECONDS = 5
DNS_CHECK_SECONDS = 60
DNS_RETRY_SECONDS = 30
FAILURES_TO_SWITCH = 2
SUCCESSES_TO_RETURN = 12
API_HOST = "api.cloudflare.com"
MAX_DNS_REPLY = 65536
CORE = "urn:ietf:params:jmap:core"


class DnsError(Exception):
    pass


def probe(origin):
    try:
        result = subprocess.run(
            [
                "/usr/bin/curl", "--disable", "--silent", "--fail", "--noproxy", "*",
                "--max-time", "3", "--max-filesize", "1048576",
                "--connect-to", f"{HOST}:443:{origin}:443",
                "--write-out", "\n%{http_code}", f"https://{HOST}/jmap/session",
            ],
            capture_output=True,
            check=False,
            timeout=4,
        )
    except subprocess.TimeoutExpired:
        return False
    if result.returncode:
        return False
    body, _, status = result.stdout.rpartition(b"\n")
    if status != b"200":
        return False
    try:
        session = json.loads(body)
    except (ValueError, RecursionError):
        return False
    if not isinstance(session, dict) or session.get("apiUrl") not in (
        f"https://{HOST}/jmap", f"https://{HOST}/jmap/",
    ):
        return False
    capabilities = session.get("capabilities")
    return isinstance(capabilities, dict) and isinstance(capabilities.get(CORE), dict)


def choose(active, streaks):
    alternate = STANDBY if active == PRIMARY else PRIMARY
    if streaks[active] <= -FAILURES_TO_SWITCH and streaks[alternate] >= FAILURES_TO_SWITCH:
        return alternate
    if active == STANDBY and streaks[PRIMARY] >= SUCCESSES_TO_RETURN:
        return PRIMARY
    return active


def valid_id(value):
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{32}", value) is not None


def validate_record(record, targets):
    if (
        not isinstance(record, dict) or record.get("name") != HOST or record.get("type") != "CNAME"
        or record.get("proxied") is not False or record.get("ttl") != 60
        or record.get("content") not in targets or not valid_id(record.get("id"))
    ):
        raise DnsError("Unexpected mail CNAME")


class Dns:
    def __init__(self, token):
        self.token = token
        self.records = None

    def request(self, path, data=None):
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        method = "PATCH" if data is not None else "GET"
        body = json.dumps(data).encode() if data is not None else None
        try:
            with closing(HTTPSConnection(API_HOST, timeout=5)) as connection:
                connection.request(method, path, body, headers)
                response = connection.getresponse()
                if response.status != 200:
                    raise DnsError(f"Cloudflare HTTP {response.status}")
                reply = response.read(MAX_DNS_REPLY + 1)
            if len(reply) > MAX_DNS_REPLY:
                raise DnsError("Cloudflare response too large")
            document = json.loads(reply)
        except (OSError, HTTPException, ValueError, RecursionError) as error:
            raise DnsError(f"Cloudflare request failed ({type(error).__name__})") from None
        if (
            not isinstance(document, dict) or document.get("success") is not True
            or "result" not in document
        ):
            raise DnsError("Unexpected Cloudflare response")
        return document["result"]

    def current(self, allow_previous=False):
        if self.records is None:
            zones = self.request(f"/client/v4/zones?name={ZONE}")
            if not isinstance(zones, list) or len(zones) != 1:
                raise DnsError("Expected one Cloudflare zone")
            zone = zones[0]
            if not isinstance(zone, dict) or zone.get("name") != ZONE or not valid_id(zone.get("id")):
                raise DnsError("Unexpected Cloudflare zone")
            self.records = f"/client/v4/zones/{zone['id']}/dns_records"
        records = self.request(f"{self.records}?name={HOST}")
        if not isinstance(records, list) or len(records) != 1:
            raise DnsError("Expected one mail CNAME")
        record = records[0]
        validate_record(record, (*ORIGINS, PREVIOUS) if allow_previous else ORIGINS)
        return record

    def switch(self, current, target):
        if target not in ORIGINS:
            raise ValueError("Unexpected target")
        previous = current["content"]
        if target == previous:
            return
        record = self.request(f"{self.records}/{current['id']}", {"content": target})
        validate_record(record, (target,))
        if record["id"] != current["id"]:
            raise DnsError("Cloudflare returned a different CNAME")
        print(f"{HOST} switched from {previous} to {target}", flush=True)


class Monitor:
    def __init__(self, dns):
        self.dns = dns
        self.active = None
        self.streaks = dict.fromkeys(ORIGINS, 0)
        self.next_check = 0
        self.retry_at = 0

    def poll(self, health, now):
        for origin, healthy in health.items():
            prior = self.streaks[origin]
            self.streaks[origin] = max(0, prior) + 1 if healthy else min(0, prior) - 1
        if now < self.retry_at:
            return
        if (
            self.active is not None and not self.retry_at and now < self.next_check
            and choose(self.active, self.streaks) == self.active
        ):
            return
        try:
            record = self.dns.current()
            current = record["content"]
            target = choose(current, self.streaks)
            if target != current:
                self.dns.switch(record, target)
                self.streaks = dict.fromkeys(ORIGINS, 0)
        except DnsError as error:
            self.retry_at = now + DNS_RETRY_SECONDS
            print(f"DNS check deferred for {DNS_RETRY_SECONDS}s ({error})", flush=True)
            return
        if self.active != target or self.retry_at:
            print(f"{HOST} DNS target is {target}", flush=True)
        self.active = target
        self.next_check = now + DNS_CHECK_SECONDS
        self.retry_at = 0


def monitor(dns):
    controller = Monitor(dns)
    previous = None
    with ThreadPoolExecutor(max_workers=2) as pool:
        while True:
            start = time.monotonic()
            health = dict(zip(ORIGINS, pool.map(probe, ORIGINS), strict=True))
            if health != previous:
                print("JMAP health", health, flush=True)
                previous = health
            controller.poll(health, time.monotonic())
            time.sleep(max(0, POLL_SECONDS - (time.monotonic() - start)))


def main():
    parser = argparse.ArgumentParser()
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--check", action="store_true", help="probe both origins without DNS writes")
    actions.add_argument("--check-dns", action="store_true", help="read and validate the mail CNAME")
    actions.add_argument("--select", choices=ORIGINS, help="route to a healthy origin with the unit stopped")
    parser.add_argument("--token-file", type=Path)
    args = parser.parse_args()
    if args.check:
        health = {origin: probe(origin) for origin in ORIGINS}
        print(json.dumps(health))
        return 0 if all(health.values()) else 1

    token_file = args.token_file or Path(os.environ["CREDENTIALS_DIRECTORY"]) / "cloudflare-token"
    token = token_file.read_text().strip()
    if not token:
        raise ValueError("Cloudflare token file is empty")
    dns = Dns(token)
    if args.check_dns:
        print(f"{HOST} DNS target is {dns.current()['content']}")
    elif args.select:
        if not probe(args.select):
            raise ValueError("Requested origin failed the JMAP discovery check")
        dns.switch(dns.current(allow_previous=True), args.select)
    else:
        monitor(dns)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DnsError as error:
        raise SystemExit(str(error)) from None
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(f"JMAP failover could not continue ({type(error).__name__})") from None
