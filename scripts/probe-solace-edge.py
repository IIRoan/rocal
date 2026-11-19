"""Check Solace HTTPS and SMTP through each Webdock worker with certificate validation."""

import argparse
import http.client
import smtplib
import socket
import ssl


MX_HOSTS = ("mx.solace.onl", "mx2.solace.onl")
HTTPS_ROUTES = (
    ("api.solace.onl", "/api/health", 200),
    ("api.solace.onl", "/api/health/mail-jmap", 200),
    ("mail.solace.onl", "/jmap/session", 200),
    ("autoconfig.solace.onl", "/mail/config-v1.1.xml", 200),
    ("autodiscover.solace.onl", "/autodiscover/autodiscover.json?Protocol=AutodiscoverV1", 200),
    ("ua-auto-config.solace.onl", "/.well-known/user-agent-configuration.json", 200),
    ("mta-sts.solace.onl", "/.well-known/mta-sts.txt", 200),
)
TLS = ssl.create_default_context()


class DirectHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, target, port):
        super().__init__(host, port, timeout=10, context=TLS)
        self.target = target

    def connect(self):
        with socket.create_connection((self.target, self.port), timeout=self.timeout) as sock:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class DirectSMTP(smtplib.SMTP):
    def __init__(self, host, target, port):
        self.target = target
        super().__init__(host, port, timeout=10)

    def _get_socket(self, host, port, timeout):
        return super()._get_socket(self.target, port, timeout)


def check_https(target, port):
    for host, path, expected in HTTPS_ROUTES:
        connection = DirectHTTPS(host, target or host, port)
        try:
            connection.request("GET", path, headers={"Host": host})
            response = connection.getresponse()
            if response.status != expected:
                raise RuntimeError(f"{host}{path} expected HTTP {expected}, got {response.status}")
            if host == "mta-sts.solace.onl":
                policy = response.read(8192).decode("ascii").splitlines()
                mx_hosts = {line.partition(":")[2].strip() for line in policy if line.startswith("mx:")}
                if "mode: enforce" not in policy or mx_hosts != set(MX_HOSTS):
                    raise RuntimeError("MTA-STS policy does not enforce the expected MX hosts")
            print(f"{target or 'public DNS'} {host}{path} HTTPS passed", flush=True)
        finally:
            connection.close()


def check_smtp(host, target, port):
    with DirectSMTP(host, target, port) as smtp:
        smtp.ehlo()
        smtp.starttls(context=TLS)
        code, _ = smtp.ehlo()
        if code != 250:
            raise RuntimeError(f"{host} returned SMTP {code} after STARTTLS")
    print(f"{host} STARTTLS passed", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--https-port", default=443, type=int)
    parser.add_argument("--smtp-port", default=25, type=int)
    parser.add_argument("--skip-smtp", action="store_true")
    parser.add_argument("--public-dns", action="store_true")
    parser.add_argument("--primary", default=MX_HOSTS[0])
    parser.add_argument("--secondary", default=MX_HOSTS[1])
    args = parser.parse_args()

    for host, target in zip(MX_HOSTS, (args.primary, args.secondary), strict=True):
        check_https(target, args.https_port)
        if not args.skip_smtp:
            check_smtp(host, target, args.smtp_port)
    if args.public_dns:
        check_https(None, 443)


if __name__ == "__main__":
    main()
