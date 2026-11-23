const ZONE = "solace.onl";
export const HOST = "mail.solace.onl";
export const PRIMARY = "mx.solace.onl";
export const STANDBY = "mx2.solace.onl";
const ORIGINS = [PRIMARY, STANDBY] as const;
const API = "https://api.cloudflare.com/client/v4";
const POLL_MS = 5_000;
export const DNS_CHECK_MS = 60_000;
export const DNS_RETRY_MS = 30_000;
const FAILURES_TO_SWITCH = 2;
const SUCCESSES_TO_RETURN = 12;
const TOKEN_FILE = "/var/run/secrets/jmap-failover/api-token";
const ID_PATTERN = /^[a-f0-9]{32}$/;
const CORE = "urn:ietf:params:jmap:core";

type Origin = (typeof ORIGINS)[number];
type Health = Record<Origin, boolean>;
type Streaks = Record<Origin, number>;
type HttpRequest = (url: string, options: BunFetchRequestInit) => Promise<Response>;
type DnsRecord = { id: string; target: Origin };

class DnsError extends Error {}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

async function readJson(response: Response, limit: number): Promise<unknown> {
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new DnsError(`Unexpected HTTP status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return JSON.parse(text + decoder.decode());
      size += chunk.value.byteLength;
      if (size > limit) throw new DnsError("HTTP response exceeds the size limit");
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function probe(origin: Origin, request: HttpRequest = fetch): Promise<boolean> {
  try {
    const response = await request(`https://${origin}/jmap/session`, {
      headers: { Host: HOST },
      tls: { serverName: HOST },
      proxy: false,
      keepalive: false,
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    });
    const session = await readJson(response, 1_048_576);
    if (!object(session) || !object(session.capabilities)) return false;
    const url = session.apiUrl;
    return (url === `https://${HOST}/jmap` || url === `https://${HOST}/jmap/`)
      && object(session.capabilities[CORE]);
  } catch {
    return false;
  }
}

function only(result: unknown): unknown {
  if (!Array.isArray(result) || result.length !== 1) return undefined;
  return result[0];
}

function directRecord(value: unknown): DnsRecord {
  if (
    !object(value) || !id(value.id) || value.name !== HOST || value.type !== "CNAME"
    || value.proxied !== false || value.ttl !== 60
    || (value.content !== PRIMARY && value.content !== STANDBY)
  ) {
    throw new DnsError("Unexpected mail CNAME");
  }
  return { id: value.id, target: value.content };
}

export class CloudflareDns {
  private recordPath?: string;

  constructor(private readonly token: string, private readonly request: HttpRequest = fetch) {}

  private async api(path: string, target?: Origin): Promise<unknown> {
    try {
      const response = await this.request(API + path, {
        method: target === undefined ? "GET" : "PATCH",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: target === undefined ? undefined : JSON.stringify({ content: target }),
        proxy: false,
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      const body = await readJson(response, 65_536);
      if (!object(body) || body.success !== true || !("result" in body)) {
        throw new DnsError("Unexpected Cloudflare response");
      }
      return body.result;
    } catch (error) {
      if (error instanceof DnsError) throw error;
      throw new DnsError("Cloudflare request failed");
    }
  }

  private async records(): Promise<string> {
    if (!this.recordPath) {
      const zone = only(await this.api(`/zones?name=${ZONE}`));
      if (!object(zone) || zone.name !== ZONE || !id(zone.id)) {
        throw new DnsError("Expected one matching Cloudflare zone");
      }
      this.recordPath = `/zones/${zone.id}/dns_records`;
    }
    return this.recordPath;
  }

  async current(): Promise<DnsRecord> {
    const path = await this.records();
    return directRecord(only(await this.api(`${path}?name=${HOST}`)));
  }

  async switch(record: DnsRecord, target: Origin): Promise<void> {
    const path = await this.records();
    const result = directRecord(await this.api(`${path}/${record.id}`, target));
    if (result.id !== record.id || result.target !== target) {
      throw new DnsError("Cloudflare did not confirm the requested CNAME");
    }
  }
}

function choose(active: Origin, streaks: Streaks): Origin {
  const alternate = active === PRIMARY ? STANDBY : PRIMARY;
  if (streaks[active] <= -FAILURES_TO_SWITCH && streaks[alternate] >= FAILURES_TO_SWITCH) {
    return alternate;
  }
  if (active === STANDBY && streaks[PRIMARY] >= SUCCESSES_TO_RETURN) return PRIMARY;
  return active;
}

export class FailoverMonitor {
  private active?: Origin;
  private streaks: Streaks = { [PRIMARY]: 0, [STANDBY]: 0 };
  private nextCheck = 0;
  private retryAt = 0;

  constructor(private readonly dns: CloudflareDns, private readonly log = console.info) {}

  ready(now: number): boolean {
    return this.active !== undefined && now < this.nextCheck + DNS_RETRY_MS && this.retryAt === 0;
  }

  async poll(health: Health, now: number): Promise<void> {
    for (const origin of ORIGINS) {
      const previous = this.streaks[origin];
      this.streaks[origin] = health[origin] ? Math.max(previous, 0) + 1 : Math.min(previous, 0) - 1;
    }
    if (now < this.retryAt) return;
    if (
      this.active !== undefined && this.retryAt === 0 && now < this.nextCheck
      && choose(this.active, this.streaks) === this.active
    ) return;

    try {
      const record = await this.dns.current();
      const target = choose(record.target, this.streaks);
      if (target !== record.target) {
        await this.dns.switch(record, target);
        this.streaks = { [PRIMARY]: 0, [STANDBY]: 0 };
      }
      if (this.active !== target || this.retryAt !== 0) this.log(`JMAP DNS target is ${target}`);
      this.active = target;
      this.nextCheck = now + DNS_CHECK_MS;
      this.retryAt = 0;
    } catch (error) {
      if (!(error instanceof DnsError)) throw error;
      this.retryAt = now + DNS_RETRY_MS;
      this.log(`JMAP DNS check deferred (${error.message})`);
    }
  }
}

async function checkOrigins(): Promise<Health> {
  const [preferred, standby] = await Promise.all([probe(PRIMARY), probe(STANDBY)]);
  return { [PRIMARY]: preferred, [STANDBY]: standby };
}

async function run(): Promise<void> {
  const mode = Bun.argv[2];
  if (mode === "--check") {
    const health = await checkOrigins();
    console.info(JSON.stringify(health));
    if (!ORIGINS.every(origin => health[origin])) process.exitCode = 1;
    return;
  }

  if (mode !== undefined && mode !== "--check-dns") throw new Error("Unknown failover monitor argument");
  const token = (await Bun.file(TOKEN_FILE).text()).trim();
  if (!token) throw new DnsError("Cloudflare token file is empty");
  const dns = new CloudflareDns(token);
  if (mode === "--check-dns") {
    const record = await dns.current();
    console.info(`JMAP DNS target is ${record.target}`);
    return;
  }
  const monitor = new FailoverMonitor(dns);
  Bun.serve({
    port: 8080,
    fetch(request) {
      if (new URL(request.url).pathname !== "/healthz") return new Response(null, { status: 404 });
      const ready = monitor.ready(performance.now());
      return new Response(ready ? "ready" : "unready", { status: ready ? 200 : 503 });
    },
  });
  let previous: Health | undefined;
  for (;;) {
    const start = performance.now();
    const health = await checkOrigins();
    if (!previous || ORIGINS.some(origin => previous?.[origin] !== health[origin])) {
      console.info("JMAP gateway health", health);
      previous = health;
    }
    await monitor.poll(health, performance.now());
    await Bun.sleep(Math.max(0, POLL_MS - (performance.now() - start)));
  }
}

if (import.meta.main) {
  await run().catch(error => {
    console.error(error instanceof DnsError ? error.message : "Unable to run JMAP failover");
    process.exit(1);
  });
}
