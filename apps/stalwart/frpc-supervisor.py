#!/usr/bin/env python3
"""Own frpc children, slot leases and the live tunnel health snapshot."""

import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request


def log(message):
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} [frpc-supervisor] {message}",
          file=sys.stderr, flush=True)


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value), encoding="utf-8")
    temporary.replace(path)


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.3):
            return True
    except OSError:
        return False


class Manager:
    def __init__(self):
        self.url = os.environ.get("SLOT_MANAGER_URL", "https://mail.solace.onl/slot-manager")
        self.token = os.environ["SLOT_MANAGER_TOKEN"]
        self.owner = os.environ["FRPC_OWNER"]

    def request(self, path, slot=None, timeout=2):
        data = None if slot is None else json.dumps({"slot": slot, "owner": self.owner}).encode()
        request = urllib.request.Request(
            self.url + path, data=data,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            error.close()
            return None
        except (OSError, ValueError):
            return None


class Tunnel:
    def __init__(self, name, config, log_path, admin_port=None):
        self.name, self.config, self.log_path = name, config, log_path
        self.admin_port = admin_port
        self.process = None
        self.lease_until = 0
        self.renew_at = 0
        self.started_at = 0
        self.retry_at = 0
        self.ready = False

    def alive(self):
        return self.process is not None and self.process.poll() is None

    def start(self):
        # No command substitution, orphaned child, tail marker, or inherited
        # capture pipe. Each generation owns its log descriptor and reader.
        if self.admin_port is not None and time.monotonic() >= self.lease_until:
            return False
        output = open(self.log_path, "w", encoding="utf-8")
        try:
            self.process = subprocess.Popen(
                [os.environ.get("FRPC_BINARY", "/usr/local/bin/frpc"), "-c", self.config],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            )
        except OSError:
            output.close()
            raise
        stream = self.process.stdout

        def mirror():
            with output, stream:
                for line in stream:
                    output.write(line)
                    output.flush()
                    print(f"[frpc-{self.name}] {line.rstrip()}", file=sys.stderr, flush=True)

        threading.Thread(target=mirror, daemon=True).start()
        self.started_at = time.monotonic()
        self.retry_at = self.started_at + 5
        self.ready = False
        log(f"Started {self.name} pid={self.process.pid}.")
        return True

    def stop(self):
        if self.alive():
            self.process.terminate()
            try:
                self.process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.process = None
        self.ready = False

    def check_ready(self):
        if not self.alive():
            self.ready = False
            return
        if self.admin_port is None:
            self.ready = port_open(int(os.environ.get("FRPC_RELAY_LOCAL_PORT", "2525")))
            return
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.admin_port}/api/status", timeout=0.3) as response:
                proxies = {p["name"]: p["status"] for p in json.load(response).get("tcp", [])}
            required = [f"https-{self.name}"]
            if os.environ.get("RECOVERY_MODE") != "true":
                required.append(f"smtp-{self.name}")
            self.ready = all(proxies.get(name) == "running" for name in required)
        except (OSError, ValueError, KeyError, TypeError):
            self.ready = False

    def snapshot(self):
        alive = self.alive()
        return {"pid": self.process.pid if alive else 0, "ready": alive and self.ready}


class Supervisor:
    def __init__(self, manager=None):
        self.manager = manager or Manager()
        self.boot_slot = os.environ["FRPC_SLOT"]
        self.active = self.boot_slot
        self.slots = {
            slot: Tunnel(slot, os.environ.get("FRPC_CONFIG", "/tmp/frpc.toml") if slot == self.boot_slot else
                         os.environ.get("FRPC_STANDBY_CONFIG", "/tmp/frpc-standby.toml"),
                         os.environ.get("FRPC_LOG_FILE", "/tmp/frpc.log") if slot == self.boot_slot else
                         os.environ.get("FRPC_STANDBY_LOG_FILE", "/tmp/frpc-standby.log"),
                         7400 if slot == "blue" else 7401)
            for slot in ("blue", "green")
        }
        self.relay = Tunnel("relay", os.environ.get("FRPC_RELAY_CONFIG", "/tmp/frpc-relay.toml"),
                            os.environ.get("FRPC_RELAY_LOG_FILE", "/tmp/frpc-relay.log"))
        self.path = os.environ.get("FRPC_STATE_PATH", "/tmp/frpc-state.json")
        self.gate_path = os.environ.get("HEALTH_STATE_PATH", "/tmp/railway-health.json")
        self.standby_enabled = os.environ.get("FRPC_STANDBY_ENABLED", "true").lower() in ("1", "true", "yes")
        self.boot_deadline = time.monotonic() + int(os.environ.get("FRPC_PRIMARY_VACANT_TIMEOUT_SECONDS", "60"))
        self.relay_boot_deadline = time.monotonic() + 30
        self.ready_timeout = int(os.environ.get("FRPC_READY_TIMEOUT_SECONDS", "120"))
        self.primary_ready_deadline = 0
        self.bound = False
        self.owned = set()
        self.cleared = False
        self.boot_complete = False
        self.preempt_at = 0
        self.standby_deadline = 0
        self.running = True

    def gate_open(self):
        try:
            return json.loads(Path(self.gate_path).read_text()).get("ready", False)
        except (OSError, ValueError):
            return False

    def release(self, tunnel):
        # Acknowledge only after the child is dead; until then the peer cannot
        # claim, even if this child had not registered any proxies yet.
        tunnel.stop()
        self.manager.request("/lease/release", tunnel.name)
        tunnel.lease_until = 0
        tunnel.retry_at = time.monotonic() + 5

    def lease(self, tunnel, action, timeout=2):
        started = time.monotonic()
        result = self.manager.request(action, tunnel.name, timeout=timeout)
        if result is None:
            return False
        # Use request start, not receipt time, and expire locally before the VPS.
        tunnel.lease_until = started + result.get("leaseSeconds", 0) - 10
        tunnel.renew_at = started + 5
        return time.monotonic() < tunnel.lease_until

    def tick(self):
        now = time.monotonic()
        timeout = 2 if self.bound else min(2, self.boot_deadline - now)
        if timeout <= 0:
            raise RuntimeError("Primary vacancy deadline exceeded; refusing occupied/unknown slot")
        status = self.manager.request("/status", timeout=timeout)
        if status is not None and status.get("protocolVersion") != 2:
            raise RuntimeError("VPS slot-manager protocol v2 required; deploy VPS first")
        gate = self.gate_open()
        if gate:
            self.boot_complete = True
        if status:
            self.active = status["active"]

        for slot, tunnel in self.slots.items():
            if not tunnel.lease_until:
                continue
            preempted = status and status.get(f"{slot}PreemptOwner") not in (None, self.manager.owner)
            if (preempted and self.active != slot) or time.monotonic() >= tunnel.lease_until:
                log(f"Releasing slot={slot}: preempted or lease expired.")
                self.release(tunnel)
                continue
            if now >= tunnel.renew_at:
                # A failed renewal never extends the local deadline. Keep a
                # healthy tunnel through a brief API outage, then stop safely.
                self.lease(tunnel, "/lease/renew")
                if time.monotonic() >= tunnel.lease_until:
                    self.release(tunnel)
                    continue
            if not tunnel.alive() and time.monotonic() >= tunnel.retry_at:
                tunnel.start()
            tunnel.check_ready()
            is_standby = self.boot_complete and slot != self.active
            if is_standby and not tunnel.ready and time.monotonic() - tunnel.started_at >= self.ready_timeout:
                log(f"Standby slot={slot} registration timed out; retrying later.")
                self.release(tunnel)

        primary = self.slots[self.boot_slot]
        if not self.bound:
            remaining = self.boot_deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError("Primary vacancy deadline exceeded; refusing occupied/unknown slot")
            if status and now >= self.preempt_at:
                result = self.manager.request("/preempt", self.boot_slot, timeout=min(2, remaining))
                if result is not None:
                    self.preempt_at = now + 20
            if self.preempt_at and status:
                remaining = self.boot_deadline - time.monotonic()
                if remaining > 0 and self.lease(primary, "/lease/claim", timeout=min(2, remaining)):
                    if primary.start():
                        self.bound = True
                        self.primary_ready_deadline = time.monotonic() + self.ready_timeout
                        self.owned.add(self.boot_slot)
        elif not self.boot_complete and not primary.ready and time.monotonic() >= self.primary_ready_deadline:
            raise RuntimeError("Primary proxy readiness deadline exceeded")

        if primary.ready and not self.cleared:
            self.cleared = self.manager.request("/preempt/clear", self.boot_slot) is not None

        if not self.relay.alive() and now >= self.relay.retry_at:
            self.relay.start()
            self.relay.retry_at = now + 5
        self.relay.check_ready()
        if not self.boot_complete and not self.relay.ready and time.monotonic() >= self.relay_boot_deadline:
            raise RuntimeError("Relay readiness deadline exceeded")
        if (self.boot_complete and self.relay.alive() and not self.relay.ready
                and time.monotonic() - self.relay.started_at >= 30):
            self.relay.stop()
            self.relay.retry_at = now + 5

        # After an API outage, reacquire our active slot only after its old
        # process has stopped. The manager remembers the last owner.
        if gate and status and self.active in self.owned:
            active = self.slots[self.active]
            if not active.lease_until and now >= active.retry_at:
                if self.lease(active, "/lease/reclaim"):
                    active.start()
                else:
                    active.retry_at = now + 5

        if gate and self.standby_enabled and status:
            other = "green" if self.active == "blue" else "blue"
            standby = self.slots[other]
            # Never preempt for standby. A failed claim is just a deferred attempt.
            if not standby.lease_until and now >= standby.retry_at:
                if not self.standby_deadline:
                    self.standby_deadline = now + int(os.environ.get("FRPC_STANDBY_VACANT_TIMEOUT_SECONDS", "300"))
                if now >= self.standby_deadline:
                    standby.retry_at = now + 30
                    self.standby_deadline = 0
                elif self.lease(standby, "/lease/claim"):
                    standby.start()
                    self.owned.add(other)
                    self.standby_deadline = 0
                else:
                    standby.retry_at = now + 5

        self.publish()

    def publish(self, error=None):
        atomic_json(self.path, {
            "updated": time.monotonic(), "supervisor_pid": os.getpid(),
            "owner": self.manager.owner,
            "slots": {slot: tunnel.snapshot() for slot, tunnel in self.slots.items()},
            "relay": self.relay.snapshot(),
            "boot_ready": self.bound and self.slots[self.boot_slot].ready and self.relay.ready and self.cleared,
            "error": error,
        })

    def run(self):
        signal.signal(signal.SIGTERM, lambda *_: setattr(self, "running", False))
        signal.signal(signal.SIGINT, lambda *_: setattr(self, "running", False))
        try:
            while self.running:
                self.tick()
                time.sleep(1)
        finally:
            for tunnel in self.slots.values():
                self.release(tunnel)
            self.relay.stop()
            self.publish("supervisor stopped")


if __name__ == "__main__":
    try:
        Supervisor().run()
    except (RuntimeError, OSError, ValueError, KeyError) as exc:
        log(str(exc))
        sys.exit(1)
