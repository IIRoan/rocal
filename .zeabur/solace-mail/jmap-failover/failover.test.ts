import { describe, expect, test } from "bun:test";
import { CloudflareDns, DNS_CHECK_MS, DNS_RETRY_MS, FailoverMonitor, HOST, POLL_MS, PRIMARY, probe, STANDBY } from "./failover";

const RECORD_ID = "a".repeat(32);
const ZONE_ID = "b".repeat(32);
const CORE = "urn:ietf:params:jmap:core";

function record(target: string, fields: Record<string, unknown> = {}) {
  return { id: RECORD_ID, name: HOST, type: "CNAME", proxied: false, ttl: 60, content: target, ...fields };
}

function cloudflare(result: unknown) {
  return Response.json({ success: true, result });
}

function fixture(initial: typeof PRIMARY | typeof STANDBY = PRIMARY) {
  let target = initial;
  let readFailure = false;
  let writeFailure: "applied" | "unapplied" | undefined;
  const writes: { url: string; body: BodyInit | null | undefined }[] = [];
  const logs: string[] = [];
  let reads = 0;
  const dns = new CloudflareDns("test-credential", async (url, options) => {
    expect(options.redirect).toBe("error");
    if (url.endsWith("/zones?name=solace.onl")) return cloudflare([{ name: "solace.onl", id: ZONE_ID }]);
    if (options.method === "GET") {
      reads++;
      if (readFailure) return new Response(null, { status: 429 });
      return cloudflare([record(target)]);
    }

    writes.push({ url, body: options.body });
    const next = options.body === JSON.stringify({ content: PRIMARY }) ? PRIMARY : STANDBY;
    if (writeFailure !== "unapplied") target = next;
    if (writeFailure) throw new Error("Timed out");
    return cloudflare(record(target));
  });
  const monitor = new FailoverMonitor(dns, message => logs.push(message));
  return {
    monitor, writes, logs,
    get reads() { return reads; },
    get target() { return target; },
    routeTo(value: typeof PRIMARY | typeof STANDBY) { target = value; },
    failReads(value: boolean) { readFailure = value; },
    failWrites(value?: typeof writeFailure) { writeFailure = value; },
    poll(now: number, preferred: boolean, standby: boolean) {
      return monitor.poll({ [PRIMARY]: preferred, [STANDBY]: standby }, now);
    },
  };
}

describe("JMAP origin probes", () => {
  const valid = { apiUrl: `https://${HOST}/jmap/`, capabilities: { [CORE]: {} } };

  test("validates the canonical hostname while connecting to each origin", async () => {
    for (const origin of [PRIMARY, STANDBY] as const) {
      expect(await probe(origin, async (url, options) => {
        expect(url).toBe(`https://${origin}/jmap/session`);
        expect(options.headers).toEqual({ Host: HOST });
        expect(options.tls?.serverName).toBe(HOST);
        expect(options.proxy).toBe(false);
        expect(options.keepalive).toBe(false);
        expect(options.redirect).toBe("error");
        expect(options.signal).toBeInstanceOf(AbortSignal);
        return Response.json(valid);
      })).toBe(true);
    }
  });

  test("rejects redirects, malformed sessions, oversize replies and timeouts", async () => {
    for (const response of [
      Response.json(valid, { status: 302 }),
      Response.json({ ...valid, apiUrl: "https://elsewhere.example/jmap/" }),
      Response.json({ ...valid, apiUrl: `https://${HOST}/jmap/?unexpected=1` }),
      Response.json({ ...valid, capabilities: CORE }),
      Response.json({ ...valid, capabilities: { [CORE]: null } }),
      Response.json([]),
      new Response("{broken"),
      new Response("x".repeat(1_048_577)),
    ]) {
      expect(await probe(PRIMARY, async () => response)).toBe(false);
    }
    expect(await probe(STANDBY, async () => { throw new Error("Timed out"); })).toBe(false);
  });
});

describe("Cloudflare DNS validation", () => {
  test("refuses any record outside the exact DNS-only mail CNAME", async () => {
    for (const result of [
      [record("edge.solace.onl")], [record(PRIMARY, { ttl: 300 })], [record(PRIMARY, { proxied: true })],
      [record(PRIMARY, { type: "A" })], [record(PRIMARY, { name: "other.solace.onl" })],
      [record(PRIMARY, { id: "../other" })], [record(PRIMARY), record(PRIMARY)], [], [null],
    ]) {
      const dns = new CloudflareDns("test-credential", async (url, options) => {
        expect(options.method).toBe("GET");
        return cloudflare(url.includes("/zones?") ? [{ name: "solace.onl", id: ZONE_ID }] : result);
      });
      await expect(dns.current()).rejects.toThrow("Unexpected mail CNAME");
    }
  });

  test("rejects an unexpected zone or unconfirmed update", async () => {
    const invalidZone = new CloudflareDns("test-credential", async () => cloudflare([{ name: "other.example", id: ZONE_ID }]));
    await expect(invalidZone.current()).rejects.toThrow("Expected one matching Cloudflare zone");

    const dns = new CloudflareDns("test-credential", async (url, options) => {
      if (url.includes("/zones?")) return cloudflare([{ name: "solace.onl", id: ZONE_ID }]);
      if (options.method === "GET") return cloudflare([record(PRIMARY)]);
      return cloudflare(record(STANDBY, { id: "c".repeat(32) }));
    });
    await expect(dns.switch(await dns.current(), STANDBY)).rejects.toThrow("did not confirm");
  });

  test("bounds API responses and rejects failed envelopes", async () => {
    for (const response of [
      new Response(null, { status: 429 }),
      new Response(null, { status: 302 }),
      new Response("x".repeat(65_537)),
      new Response("{broken"),
      Response.json({ success: false, result: [] }),
    ]) {
      await expect(new CloudflareDns("test-credential", async () => response).current()).rejects.toThrow();
    }
  });
});

describe("failover reconciliation", () => {
  test("waits for two consecutive failures and two healthy alternate checks", async () => {
    const service = fixture();
    await service.poll(0, false, false);
    await service.poll(POLL_MS, false, true);
    await service.poll(2 * POLL_MS, true, true);
    await service.poll(3 * POLL_MS, false, true);
    expect(service.writes).toHaveLength(0);

    await service.poll(4 * POLL_MS, false, true);
    expect(service.writes).toEqual([{
      url: `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RECORD_ID}`,
      body: JSON.stringify({ content: STANDBY }),
    }]);
    expect(service.target).toBe(STANDBY);
  });

  test("keeps DNS during a shared failure and fails back after thirty healthy checks", async () => {
    const service = fixture(STANDBY);
    await service.poll(0, false, false);
    await service.poll(POLL_MS, false, false);
    for (let check = 2; check < 31; check++) {
      await service.poll(check * POLL_MS, true, true);
    }
    expect(service.writes).toHaveLength(0);
    await service.poll(31 * POLL_MS, true, true);
    expect(service.target).toBe(PRIMARY);
    expect(service.writes).toHaveLength(1);
  });

  test("returns promptly if the standby fails while the preferred origin is healthy", async () => {
    const service = fixture(STANDBY);
    await service.poll(0, true, false);
    await service.poll(5_000, true, false);
    expect(service.target).toBe(PRIMARY);
  });

  test("uses the actual record if another change was made before the write", async () => {
    const service = fixture();
    await service.poll(0, false, true);
    service.routeTo(STANDBY);
    await service.poll(5_000, false, true);
    expect(service.reads).toBe(2);
    expect(service.writes).toHaveLength(0);
  });

  test("checks DNS periodically, reports readiness and keeps health during throttling", async () => {
    const service = fixture();
    expect(service.monitor.ready(0)).toBe(false);
    await service.poll(0, true, true);
    await service.poll(5_000, true, true);
    expect(service.reads).toBe(1);
    expect(service.monitor.ready(5_000)).toBe(true);

    service.failReads(true);
    await service.poll(DNS_CHECK_MS, false, true);
    await service.poll(DNS_CHECK_MS + 5_000, false, true);
    expect(service.monitor.ready(DNS_CHECK_MS + 5_000)).toBe(false);
    expect(service.reads).toBe(2);
    expect(service.writes).toHaveLength(0);

    service.failReads(false);
    await service.poll(DNS_CHECK_MS + DNS_RETRY_MS, false, true);
    expect(service.monitor.ready(DNS_CHECK_MS + DNS_RETRY_MS)).toBe(true);
    expect(service.target).toBe(STANDBY);
  });

  test("re-reads DNS after a lost PATCH response and sends no duplicate write", async () => {
    const service = fixture();
    service.failWrites("applied");
    await service.poll(0, false, true);
    await service.poll(5_000, false, true);
    await service.poll(10_000, true, true);
    expect(service.reads).toBe(2);
    await service.poll(5_000 + DNS_RETRY_MS, true, true);
    expect(service.reads).toBe(3);
    expect(service.target).toBe(STANDBY);
    expect(service.writes).toHaveLength(1);
    expect(service.logs.at(-1)).toBe(`JMAP DNS target is ${STANDBY}`);
  });

  test("retries a write that did not apply while the failover conditions still hold", async () => {
    const service = fixture();
    service.failWrites("unapplied");
    await service.poll(0, false, true);
    await service.poll(5_000, false, true);
    await service.poll(10_000, false, true);
    expect(service.writes).toHaveLength(1);
    expect(service.target).toBe(PRIMARY);

    service.failWrites();
    await service.poll(5_000 + DNS_RETRY_MS, false, true);
    expect(service.reads).toBe(3);
    expect(service.writes).toHaveLength(2);
    expect(service.target).toBe(STANDBY);
  });
});
