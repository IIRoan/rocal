"""Validate the rendered Solace resources and export the deployed gateway test fixture."""

import argparse
import re
import subprocess
import tempfile
from pathlib import Path

import yaml


ROOT = Path(".zeabur")
NAMESPACE = "solace-gitops"


def read(path):
    return [doc for doc in yaml.safe_load_all(path.read_text()) if doc]


def render(flux, spec, path):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml") as file:
        yaml.safe_dump(spec, file)
        file.flush()
        output = subprocess.check_output([
            flux, "build", "kustomization", spec["metadata"]["name"], "--namespace", NAMESPACE,
            "--dry-run", "--strict-substitute", "--path", str(path), "--kustomization-file", file.name,
        ], text=True)
    return [doc for doc in yaml.safe_load_all(output) if doc]


def identity(doc):
    metadata = doc["metadata"]
    return doc["kind"], metadata.get("namespace"), metadata["name"]


def find_resource(docs, kind, namespace, name):
    return next(doc for doc in docs if identity(doc) == (kind, namespace, name))


def check(flux, gateway_dir):
    specs = {doc["metadata"]["name"]: doc for doc in read(ROOT / "bootstrap/sync.yaml")
             if doc["kind"] == "Kustomization"}
    stages = {"solace": [], "solace-stalwart-a": ["solace"], "solace-stalwart-b": ["solace-stalwart-a"]}
    assert specs.keys() == stages.keys()
    common = specs["solace"]
    network = render(flux, common, ROOT / "bootstrap/networking")
    prerequisites = read(ROOT / "bootstrap/project.yaml")
    assert {doc["kind"] for doc in prerequisites} == {"Namespace", "StorageClass"}
    roles = read(ROOT / "bootstrap/reconciler.yaml")
    rules = [rule for doc in roles if doc["kind"] == "ClusterRole" for rule in doc["rules"]]
    grants = {resource for rule in rules for resource in rule["resources"]}
    for resource in ("pods", "replicasets"):
        verbs = {verb for rule in rules if resource in rule["resources"] for verb in rule["verbs"]}
        assert verbs == {"get", "list", "watch"}, resource
    assert grants.isdisjoint({"namespaces", "storageclasses", "services", "ingresses", "networkpolicies", "secrets"})
    assert "validatingadmissionpolicies" not in grants
    assert "validatingadmissionpolicybindings" not in grants
    policy, *bindings = read(ROOT / "bootstrap/stalwart-rollout.yaml")
    policy_name = policy["metadata"]["name"]
    assert policy["spec"]["failurePolicy"] == "Fail"
    assert policy["spec"]["paramKind"] == {"apiVersion": "apps/v1", "kind": "Deployment"}
    peers = {}
    for binding in bindings:
        spec = binding["spec"]
        assert spec["policyName"] == policy_name and spec["validationActions"] == ["Deny"]
        param = spec["paramRef"]
        assert param["namespace"] == "solace-mail" and param["parameterNotFoundAction"] == "Deny"
        (rule,) = spec["matchResources"]["resourceRules"]
        assert rule["operations"] == ["UPDATE"] and rule["resources"] == ["deployments"]
        (replica,) = rule["resourceNames"]
        peers[replica] = param["name"]
    assert peers == {"stalwart-a": "stalwart-b", "stalwart-b": "stalwart-a"}

    seen = {identity(doc) for doc in network + prerequisites}
    fixtures = []
    images = []
    for name, expected_dependencies in stages.items():
        obj = specs[name]
        spec = obj["spec"]
        assert spec["suspend"] and not spec["prune"]
        assert spec["serviceAccountName"] == "solace-reconciler"
        assert spec["sourceRef"] == common["spec"]["sourceRef"]
        assert spec.get("dependsOn", []) == [{"name": dependency} for dependency in expected_dependencies]
        docs = render(flux, obj, spec["path"])
        for doc in docs:
            assert identity(doc) not in seen, identity(doc)
            assert doc["metadata"].get("namespace") == "solace-mail", identity(doc)
            seen.add(identity(doc))
        configs = {(doc["metadata"]["namespace"], doc["metadata"]["name"]): doc
                   for doc in docs if doc["kind"] == "ConfigMap"}
        deployments = {doc["metadata"]["name"]: doc for doc in docs if doc["kind"] == "Deployment"}
        release_containers = {"stalwart-a": "stalwart", "stalwart-b": "stalwart",
                              "solace-api": "api", "notifications": "worker"}
        for deployment, container in release_containers.items():
            if deployment in deployments:
                containers = deployments[deployment]["spec"]["template"]["spec"]["containers"]
                image = next(c["image"] for c in containers if c["name"] == container)
                assert re.fullmatch(r"[^@\s]+@sha256:[0-9a-f]{64}", image), image
        if expected_dependencies:
            replica = name.removeprefix("solace-")
            assert deployments.keys() == {replica}
            assert spec["healthChecks"] == [{"apiVersion": "apps/v1", "kind": "Deployment",
                                              "name": replica, "namespace": "solace-mail"}]
            deployment = deployments[replica]
            fixtures.append(check_gateway(deployment, configs, "config"))
            assert deployment["spec"]["minReadySeconds"] >= 60, replica
            assert deployment["spec"]["strategy"] == {"type": "Recreate"}, replica
            check_stalwart_security(deployment)
            check_service_targets(network, deployment, ("mail-live", "mail-inbound", "mail-public-direct"))
            gateway = next(container for container in deployment["spec"]["template"]["spec"]["containers"]
                           if container["name"] == "gateway")
            assert gateway["readinessProbe"]["httpGet"] == {"path": "/readyz", "port": 8084, "scheme": "HTTP"}
            assert gateway["readinessProbe"]["failureThreshold"] == 1
            stalwart = next(container for container in deployment["spec"]["template"]["spec"]["containers"]
                            if container["name"] == "stalwart")
            assert all(container["readinessProbe"]["initialDelaySeconds"] == 8 for container in (gateway, stalwart))
            images.append(gateway["image"])
        else:
            assert {"stalwart-a", "stalwart-b"}.isdisjoint(deployments)
            check_gateway(deployments["solace-api"], configs, "edge")
            check_service_targets(network, deployments["solace-api"], ("solace-api", "solace-api-direct"))
            check_gateway(deployments["notifications"], configs, "mail-gate")
            validate_redis(docs, network)
            check_public_ingress(network, docs)
        print(f"{name}: rendered {len(docs)} resources")
    assert fixtures[0] == fixtures[1]
    assert len(images) == 2 and all(re.fullmatch(r"[^@\s]+@sha256:[0-9a-f]{64}", image) for image in images)
    alias = find_resource(network, "Service", "solace-mail", "mail-pg")
    assert alias["spec"]["selector"] == {"cnpg.io/cluster": "mail-database", "cnpg.io/instanceRole": "primary"}
    print(f"Networking: rendered {len(network)} resources, including the mail database alias")
    if gateway_dir:
        gateway_dir.mkdir(parents=True, exist_ok=True)
        for key in ("haproxy.cfg", "admin-gate.lua"):
            (gateway_dir / key).write_text(fixtures[0][key])
        (gateway_dir / "images").write_text("\n".join(dict.fromkeys(images)) + "\n")



def check_service_targets(network, deployment, service_names):
    pod = deployment["spec"]["template"]
    declared = {target for container in pod["spec"]["containers"] for port in container.get("ports", [])
                for target in (port["containerPort"], port.get("name"))}
    for name in service_names:
        service = find_resource(network, "Service", "solace-mail", name)
        assert service["spec"]["selector"].items() <= pod["metadata"]["labels"].items(), name
        for port in service["spec"]["ports"]:
            assert port["targetPort"] in declared, (name, port["targetPort"])


def check_public_ingress(network, workloads):
    namespace = "solace-mail"
    public = find_resource(network, "Ingress", namespace, "solace-public")
    expected_paths = {
        "api.solace.onl": [("/", "Prefix")],
        "autodiscover.solace.onl": [
            ("/autodiscover/autodiscover.xml", "Exact"),
            ("/autodiscover/autodiscover.json", "Prefix"),
        ],
        "autoconfig.solace.onl": [
            ("/mail/config-v1.1.xml", "Exact"),
            ("/.well-known/autoconfig/mail/config-v1.1.xml", "Exact"),
            ("/.well-known/mail-v1.xml", "Exact"),
        ],
        "ua-auto-config.solace.onl": [
            ("/.well-known/user-agent-configuration.json", "Exact"),
            ("/.well-known/mail-v1.xml", "Exact"),
        ],
        "mta-sts.solace.onl": [("/.well-known/mta-sts.txt", "Exact")],
        "mail.solace.onl": [("/", "Prefix")],
    }
    rules = public["spec"]["rules"]
    assert len(rules) == len(expected_paths)
    assert {rule["host"]: [(p["path"], p["pathType"]) for p in rule["http"]["paths"]]
            for rule in rules} == expected_paths
    for rule in rules:
        service = "solace-api-direct" if rule["host"] == "api.solace.onl" else "mail-public-direct"
        for path in rule["http"]["paths"]:
            assert path["backend"] == {"service": {"name": service, "port": {"number": 8085}}}
    certificate = find_resource(workloads, "Certificate", namespace, "solace-public")
    assert public["spec"]["tls"] == [{
        "hosts": certificate["spec"]["dnsNames"],
        "secretName": certificate["spec"]["secretName"],
    }]
    assert certificate["spec"]["dnsNames"] == [rule["host"] for rule in rules]
    for name, port, pool in (("solace-public", 443, "solace-https"), ("solace-smtp", 25, "solace-smtp")):
        service = find_resource(network, "Service", namespace, name)
        assert service["spec"]["type"] == "LoadBalancer"
        assert "loadBalancerClass" not in service["spec"]
        assert service["spec"].get("allocateLoadBalancerNodePorts", True) is True
        assert service["metadata"]["labels"]["svccontroller.k3s.cattle.io/lbpool"] == pool
        assert service["spec"]["externalTrafficPolicy"] == "Local"
        assert [item["port"] for item in service["spec"]["ports"]] == [port]
    ingress = find_resource(workloads, "Deployment", namespace, "solace-public-ingress")
    assert ingress["metadata"]["labels"]["app.kubernetes.io/name"] == "traefik"
    template = ingress["spec"]["template"]["spec"]
    find_resource(workloads, "ServiceAccount", namespace, template["serviceAccountName"])
    (controller,) = template["containers"]
    assert "--providers.kubernetesingress.ingressendpoint.publishedservice=solace-mail/solace-public" in controller["args"]
    routes_name = next(vol["configMap"]["name"] for vol in template["volumes"] if vol["name"] == "ingress-routes")
    routes = yaml.safe_load(find_resource(workloads, "ConfigMap", namespace, routes_name)["data"]["routes.yaml"])
    for listener, value in (("direct", ""), ("tunnel", "1")):
        entrypoint = "public" if listener == "direct" else "tunnel"
        middleware = f"solace-{listener}-headers"
        assert f"--entryPoints.{entrypoint}.http.middlewares={middleware}@file" in controller["args"]
        assert routes["http"]["middlewares"][middleware]["headers"]["customRequestHeaders"] == {"X-Solace-Tunnel": value}
    assert routes["tcp"]["services"]["mail-inbound"]["loadBalancer"]["proxyProtocol"]["version"] == 2
    assert routes["tcp"]["routers"]["mx-https"] == {
        "entryPoints": ["public"],
        "rule": "HostSNI(`mx.solace.onl`)",
        "service": "mx-https",
        "tls": {"passthrough": True},
    }
    assert routes["tcp"]["services"]["mx-https"]["loadBalancer"] == {
        "proxyProtocol": {"version": 2},
        "servers": [{"address": "mail-live.solace-mail.svc.cluster.local:8443"}],
    }
    check_zeabur_application_gateway(routes["tcp"])


def check_zeabur_application_gateway(tcp):
    bootstrap = ROOT / "bootstrap"
    projects = read(bootstrap / "zeabur-project-public.yaml")
    resources = read(bootstrap / "zeabur-application-gateway.yaml")
    namespace = "traefik"
    tls = find_resource(resources, "Certificate", namespace, "zeabur-apps")["spec"]
    issuer = find_resource(projects, "ClusterIssuer", None, tls["issuerRef"]["name"])
    gateway = find_resource(resources, "Gateway", namespace, "webdock-apps")
    (listener,) = gateway["spec"]["listeners"]
    assert tls["dnsNames"] == [listener["hostname"]] == ["*.roan.dev"]
    assert listener["tls"]["certificateRefs"] == [{"name": tls["secretName"]}]
    assert tls["dnsNames"][0] in issuer["spec"]["acme"]["solvers"][0]["selector"]["dnsNames"]

    (helm,) = read(bootstrap / "zeabur-traefik-helm.yaml")
    ports = yaml.safe_load(helm["spec"]["valuesContent"])["ports"]
    service = find_resource(resources, "Service", namespace, "zeabur-app-gateway")
    (port,) = service["spec"]["ports"]
    assert listener["port"] == port["port"] == ports[port["targetPort"]]["port"]
    assert ports[port["targetPort"]]["expose"] == {"default": False}
    policy = find_resource(resources, "NetworkPolicy", namespace, "zeabur-app-gateway")
    (app_ingress,) = [rule for rule in policy["spec"]["ingress"] if "from" in rule]
    assert app_ingress["from"] == [{
        "podSelector": {"matchLabels": {"app.kubernetes.io/name": "cloudflared"}},
    }, {
        "namespaceSelector": {"matchLabels": {"kubernetes.io/metadata.name": "solace-mail"}},
        "podSelector": {"matchLabels": {"app.kubernetes.io/name": "solace-public-ingress"}},
    }]
    assert app_ingress["ports"] == [{"port": port["port"], "protocol": "TCP"}]
    router = tcp["routers"]["zeabur-apps"]
    assert router["tls"] == {"passthrough": True}
    protected_hosts = set(re.findall(r"`([^`]+)`", router["rule"].split("&& !", 1)[-1]))
    public = projects + read(bootstrap / "ente-public.yaml")
    static_hosts = {rule["host"] for obj in public if obj["kind"] == "Ingress"
                    for rule in obj["spec"]["rules"] if rule["host"].endswith(".roan.dev")}
    assert static_hosts | {"zeabur.roan.dev", "login.roan.dev", "ingress.roan.dev"} <= protected_hosts
    assert tcp["services"][router["service"]]["loadBalancer"] == {
        "proxyProtocol": {"version": 2},
        "servers": [{"address": f"zeabur-app-gateway.traefik.svc.cluster.local:{port['port']}"}],
    }


def check_gateway(deployment, configs, volume):
    template = deployment["spec"]["template"]["spec"]
    config_name = next(mount["configMap"]["name"] for mount in template["volumes"] if mount["name"] == volume)
    config = configs[(deployment["metadata"]["namespace"], config_name)]
    assert config.get("immutable") is True, config_name
    assert "haproxy.cfg" in config["data"], config_name
    return config["data"]


def check_stalwart_security(deployment):
    _, namespace, name = identity(deployment)
    assert namespace == "solace-mail", name
    template = deployment["spec"]["template"]["spec"]
    pod_security = template["securityContext"]
    for container in template["containers"]:
        label = f"{name}/{container['name']}"
        security = container["securityContext"]
        effective = {**pod_security, **security}
        assert effective["runAsNonRoot"] is True, label
        assert effective["runAsUser"] > 10000 and effective["runAsGroup"] > 10000, label
        assert effective["seccompProfile"]["type"] == "RuntimeDefault", label
        assert security["allowPrivilegeEscalation"] is False, label
        assert security["readOnlyRootFilesystem"] is True, label
        assert "ALL" in security["capabilities"]["drop"], label
        for workload_budget in ("requests", "limits"):
            assert {"cpu", "memory"} <= container["resources"][workload_budget].keys(), label


def validate_redis(docs, network):
    names = ("mail-redis", "mail-redis-replica", "mail-redis-sentinel-a",
             "mail-redis-sentinel-b", "mail-redis-sentinel-witness")
    ips = {}
    for name in names:
        service = find_resource(network, "Service", "solace-mail", name)
        ips[name] = service["spec"]["clusterIP"]
    assert len(set(ips.values())) == len(names)
    for name in names:
        workload = find_resource(docs, "StatefulSet", "solace-mail", name)
        command = workload["spec"]["template"]["spec"]["containers"][0]["command"][-1]
        assert ips[name] in command, name
        if "sentinel" in name:
            assert f"sentinel monitor solace {ips['mail-redis']} 6379" in command
        else:
            assert all(ips[sentinel] in command for sentinel in names if "sentinel" in sentinel), name


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flux", default="flux")
    parser.add_argument("--gateway-dir", type=Path)
    args = parser.parse_args()
    check(args.flux, args.gateway_dir)
