"""Publish Solace's direct ingress on selected Webdock workers."""

import argparse
import json
import socket
import subprocess


SERVICES = {"https": "solace-public", "smtp": "solace-smtp"}
MX_HOSTS = {"mx": "mx.solace.onl", "mx2": "mx2.solace.onl"}
KUBECTL = ["kubectl", "-n", "solace-mail"]


def resolve_ipv4(host):
    addresses = {
        address[0]
        for _, _, _, _, address in socket.getaddrinfo(
            host, None, socket.AF_INET, socket.SOCK_STREAM
        )
    }
    if len(addresses) != 1:
        raise RuntimeError(f"{host} must resolve to one direct IPv4 address")
    return addresses.pop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("listener", choices=SERVICES)
    parser.add_argument("worker", nargs="*", metavar="MX", help="mx, mx2, or both")
    args = parser.parse_args()
    if set(args.worker) - MX_HOSTS.keys() or len(set(args.worker)) != len(args.worker):
        parser.error("specify mx and/or mx2 once, or omit both to withdraw the listener")

    addresses = [resolve_ipv4(MX_HOSTS[worker]) for worker in args.worker]
    if len(set(addresses)) != len(addresses):
        raise RuntimeError("MX hosts resolve to the same address")

    name = SERVICES[args.listener]
    current = json.loads(subprocess.check_output([*KUBECTL, "get", "svc", name, "-o", "json"]))
    if current["spec"].get("loadBalancerClass") != "solace.onl/vps-ingress":
        raise RuntimeError(f"{name} is not the dedicated public ingress Service")
    patch = {
        "metadata": {"resourceVersion": current["metadata"]["resourceVersion"]},
        "status": {"loadBalancer": {"ingress": [{"ip": ip, "ipMode": "VIP"} for ip in addresses]}},
    }
    subprocess.run(
        [*KUBECTL, "patch", "svc", name, "--type=merge", "--subresource=status",
         "--patch", json.dumps(patch)],
        check=True,
    )


if __name__ == "__main__":
    main()
