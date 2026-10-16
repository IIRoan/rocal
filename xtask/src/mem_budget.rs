//! `cargo xtask mem-budget`: the plan's memory budgets, measured on a release build with the RSS/PSS/VmHWM sampling of `experiments/backend-rust/benchmark.py`.

use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use anyhow::{Context, bail, ensure};
use serde_json::json;
use solace_api_tests::env::{BackendTarget, TEMPLATE_DATABASE, TestEnv};
use solace_api_tests::seed::insert_invite;
use sqlx::{Connection, Executor, PgConnection};

const IDLE_BUDGET_MIB: f64 = 30.0;
const STEADY_BUDGET_MIB: f64 = 80.0;
/// Two scrypt hashes of 32 MiB at a time, plus headroom.
const BURST_ALLOWANCE_MIB: f64 = 2.0 * 32.0 + 16.0;
const AFTER_BURST_TOLERANCE: f64 = 0.10;
const SOAK_GROWTH_TOLERANCE: f64 = 0.05;
const SAMPLE_EVERY: Duration = Duration::from_millis(25);

#[derive(Debug, Clone, Copy, Default)]
struct Memory {
    rss_mib: f64,
    pss_mib: f64,
    hwm_mib: f64,
}

/// `/proc/<pid>/status` VmRSS and VmHWM, and `smaps_rollup` Pss, like `benchmark.py`'s `metrics`.
fn sample(pid: u32) -> anyhow::Result<Memory> {
    let directory = Path::new("/proc").join(pid.to_string());
    let status = std::fs::read_to_string(directory.join("status"))?;
    let rollup = std::fs::read_to_string(directory.join("smaps_rollup"))?;
    Ok(parse_memory(&format!("{status}\n{rollup}")))
}

/// The `VmRSS:`, `VmHWM:` and `Pss:` lines (in kB) of procfs text, in MiB.
fn parse_memory(text: &str) -> Memory {
    let mut memory = Memory::default();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(key), Some(value)) = (parts.next(), parts.next()) else {
            continue;
        };
        let mib = value.parse::<f64>().unwrap_or_default() / 1024.0;
        match key {
            "VmRSS:" => memory.rss_mib = mib,
            "VmHWM:" => memory.hwm_mib = mib,
            "Pss:" => memory.pss_mib = mib,
            _ => {}
        }
    }
    memory
}

/// Samples `pid` until `running` turns false, returning the peak of each figure.
fn sample_until(pid: u32, running: &AtomicBool) -> Memory {
    let mut peak = Memory::default();
    while running.load(Ordering::Relaxed) {
        if let Ok(current) = sample(pid) {
            peak.rss_mib = peak.rss_mib.max(current.rss_mib);
            peak.pss_mib = peak.pss_mib.max(current.pss_mib);
            peak.hwm_mib = peak.hwm_mib.max(current.hwm_mib);
        }
        std::thread::sleep(SAMPLE_EVERY);
    }
    peak
}

struct Options {
    soak: Option<Duration>,
    steady: Duration,
}

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    let mut options = Options {
        soak: None,
        steady: Duration::from_secs(30),
    };
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        let value = iter
            .next()
            .with_context(|| format!("{arg} needs a value"))?;
        match *arg {
            "--soak-minutes" => {
                options.soak = Some(Duration::from_secs(value.parse::<u64>()? * 60))
            }
            "--steady-seconds" => options.steady = Duration::from_secs(value.parse()?),
            _ => bail!("usage: cargo xtask mem-budget [--steady-seconds N] [--soak-minutes N]"),
        }
    }
    let env = TestEnv::from_env()?;
    let binary = build()?;
    let database = format!("solace_test_mem_{}", std::process::id());
    let database_url = env.database_url_for(&database)?;
    let mut admin = PgConnection::connect(&env.database_url).await?;
    crate::test_env::recreate_database(&mut admin, &database, Some(TEMPLATE_DATABASE)).await?;
    let result = measure(&binary, &env, &database_url, &options).await;
    admin
        .execute(format!("DROP DATABASE IF EXISTS {database} WITH (FORCE)").as_str())
        .await?;
    result
}

/// A release build for x86-64-v3, as the Dockerfile builds it.
fn build() -> anyhow::Result<std::path::PathBuf> {
    let root = crate::repo_root();
    let status = Command::new("cargo")
        .current_dir(&root)
        .args(["build", "--release", "--locked", "-p", "solace-server"])
        .env("RUSTFLAGS", "-C target-cpu=x86-64-v3")
        .status()?;
    ensure!(status.success(), "release build failed");
    Ok(root.join("target/release/solace-server"))
}

async fn measure(
    binary: &Path,
    env: &TestEnv,
    database_url: &str,
    options: &Options,
) -> anyhow::Result<()> {
    let port = free_port()?;
    let vars = env.backend_vars(&BackendTarget {
        port,
        production: false,
        database_url,
        stalwart_provision_token: "",
    });
    let mut server = Command::new(binary)
        .env_clear()
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .envs(vars.iter().map(|(name, value)| (*name, value.as_str())))
        .env("RUST_LOG", "warn")
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .context("start the release server")?;
    let outcome = phases(&server, port, env, database_url, options).await;
    let _ = server.kill();
    let _ = server.wait();
    let report = outcome?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    ensure!(
        report["failures"].as_array().is_none_or(Vec::is_empty),
        "memory budgets exceeded"
    );
    Ok(())
}

async fn phases(
    server: &Child,
    port: u16,
    env: &TestEnv,
    database_url: &str,
    options: &Options,
) -> anyhow::Result<serde_json::Value> {
    let pid = server.id();
    let base = format!("http://127.0.0.1:{port}");
    let client = reqwest::Client::new();
    wait_until_up(&client, &base).await?;
    let cookie = session_cookie(env, database_url, port).await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    let idle = sample(pid)?;

    let steady = load(pid, &client, &base, &cookie, options.steady, 8).await?;
    tokio::time::sleep(Duration::from_secs(2)).await;
    let before_burst = sample(pid)?;
    let burst = sign_in_burst(pid, &client, &base, env, database_url).await?;
    let after_burst = match burst {
        Some(_) => {
            tokio::time::sleep(Duration::from_secs(60)).await;
            Some(sample(pid)?)
        }
        None => None,
    };
    let soak = match options.soak {
        Some(duration) => {
            let start = sample(pid)?;
            load(pid, &client, &base, &cookie, duration, 4).await?;
            tokio::time::sleep(Duration::from_secs(5)).await;
            Some((start, sample(pid)?))
        }
        None => None,
    };

    let mut failures = Vec::new();
    let mut check = |name: &str, value: f64, budget: f64| {
        if value > budget {
            failures.push(format!("{name}: {value:.1} MiB > {budget:.1} MiB"));
        }
    };
    check("idle RSS", idle.rss_mib, IDLE_BUDGET_MIB);
    check("steady peak RSS", steady.rss_mib, STEADY_BUDGET_MIB);
    if let Some(burst) = burst {
        check(
            "sign-in burst peak RSS",
            burst.rss_mib,
            idle.rss_mib + BURST_ALLOWANCE_MIB,
        );
    }
    if let Some(after) = after_burst {
        check(
            "60 s after the burst",
            after.rss_mib,
            before_burst.rss_mib * (1.0 + AFTER_BURST_TOLERANCE),
        );
    }
    if let Some((start, end)) = soak {
        check(
            "soak growth",
            end.rss_mib,
            start.rss_mib * (1.0 + SOAK_GROWTH_TOLERANCE),
        );
    }
    Ok(json!({
        "idle": memory_json(idle),
        "steady_peak": memory_json(steady),
        "before_burst": memory_json(before_burst),
        "sign_in_burst_peak": burst.map(memory_json),
        "after_burst": after_burst.map(memory_json),
        "soak": soak.map(|(start, end)| json!({"start": memory_json(start), "end": memory_json(end)})),
        "failures": failures,
    }))
}

fn memory_json(memory: Memory) -> serde_json::Value {
    json!({
        "rss_mib": (memory.rss_mib * 10.0).round() / 10.0,
        "pss_mib": (memory.pss_mib * 10.0).round() / 10.0,
        "hwm_mib": (memory.hwm_mib * 10.0).round() / 10.0,
    })
}

fn free_port() -> anyhow::Result<u16> {
    Ok(std::net::TcpListener::bind("127.0.0.1:0")?
        .local_addr()?
        .port())
}

async fn wait_until_up(client: &reqwest::Client, base: &str) -> anyhow::Result<()> {
    for _ in 0..100 {
        if client
            .get(format!("{base}/api/health"))
            .send()
            .await
            .is_ok_and(|r| r.status().is_success())
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    bail!("the release server did not come up")
}

/// A user and session written the way the TypeScript backend writes them, and its signed cookie.
async fn session_cookie(env: &TestEnv, database_url: &str, port: u16) -> anyhow::Result<String> {
    let mut db = PgConnection::connect(database_url).await?;
    let suffix = std::process::id();
    let token = format!("memsession{suffix:022}");
    sqlx::query(
        "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Mem', $2, true, now(), now())",
    )
    .bind(format!("memuser{suffix}"))
    .bind(format!("mem{suffix}@{}", env.mail_domain))
    .execute(&mut db)
    .await?;
    sqlx::query(
        "INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at) VALUES ($1, $2, $3, now() + interval '14 days', now(), now())",
    )
    .bind(format!("memsession{suffix}"))
    .bind(&token)
    .bind(format!("memuser{suffix}"))
    .execute(&mut db)
    .await?;
    let vars = env.backend_vars(&BackendTarget {
        port,
        production: false,
        database_url,
        stalwart_provision_token: "",
    });
    let config = solace_server::config::Config::from_lookup(|wanted| {
        vars.iter()
            .find(|(name, _)| *name == wanted)
            .map(|(_, value)| value.clone())
    })?;
    let settings = solace_server::auth::cookies::CookieSettings::new(&config);
    let set_cookie = settings.signed(&settings.session_token(), &token, None);
    Ok(set_cookie.split(';').next().unwrap_or_default().to_owned())
}

/// The routes the server has, at `concurrency` requests in flight, for `duration`.
async fn load(
    pid: u32,
    client: &reqwest::Client,
    base: &str,
    cookie: &str,
    duration: Duration,
    concurrency: usize,
) -> anyhow::Result<Memory> {
    let running = Arc::new(AtomicBool::new(true));
    let sampler = {
        let running = running.clone();
        std::thread::spawn(move || sample_until(pid, &running))
    };
    let deadline = Instant::now() + duration;
    let mut workers = tokio::task::JoinSet::new();
    for worker in 0..concurrency {
        let (client, base, cookie) = (client.clone(), base.to_owned(), cookie.to_owned());
        workers.spawn(async move {
            let mut round = worker;
            while Instant::now() < deadline {
                let request = match round % 5 {
                    0 => client.get(format!("{base}/api/health")),
                    1 => client
                        .get(format!("{base}/api/auth/get-session"))
                        .header("cookie", &cookie),
                    2 => client
                        .get(format!("{base}/api/me"))
                        .header("cookie", &cookie),
                    3 => client.get(format!("{base}/api/does-not-exist")),
                    _ => client
                        .request(reqwest::Method::OPTIONS, format!("{base}/api/settings"))
                        .header("origin", "http://localhost:4100")
                        .header("access-control-request-method", "PUT"),
                };
                let _ = request.send().await.map(|r| r.bytes());
                round += 1;
            }
        });
    }
    while workers.join_next().await.is_some() {}
    running.store(false, Ordering::Relaxed);
    sampler
        .join()
        .map_err(|_| anyhow::anyhow!("sampler panicked"))
}

/// Twenty concurrent password sign-ins, once the server has the sign-in route.
async fn sign_in_burst(
    pid: u32,
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    database_url: &str,
) -> anyhow::Result<Option<Memory>> {
    let probe = client
        .post(format!("{base}/api/auth/sign-in/email"))
        .json(&json!({"email": "nobody@solace.test", "password": "x"}))
        .send()
        .await?;
    if probe.status().as_u16() == 404 {
        println!("sign-in is not served yet; skipping the burst budgets");
        return Ok(None);
    }
    let users = sign_up_users(client, base, env, database_url, 20).await?;
    let running = Arc::new(AtomicBool::new(true));
    let sampler = {
        let running = running.clone();
        std::thread::spawn(move || sample_until(pid, &running))
    };
    let mut sign_ins = tokio::task::JoinSet::new();
    for (index, (email, password)) in users.into_iter().enumerate() {
        let (client, base) = (client.clone(), base.to_owned());
        sign_ins.spawn(async move {
            client
                .post(format!("{base}/api/auth/sign-in/email"))
                .header("origin", "http://localhost:4100")
                .header("x-forwarded-for", format!("2001:db8:5:{index:x}::1"))
                .json(&json!({"email": email, "password": password}))
                .send()
                .await
                .map(|r| r.status().as_u16())
        });
    }
    let mut statuses = Vec::new();
    while let Some(result) = sign_ins.join_next().await {
        statuses.push(result??);
    }
    running.store(false, Ordering::Relaxed);
    let peak = sampler
        .join()
        .map_err(|_| anyhow::anyhow!("sampler panicked"))?;
    ensure!(
        statuses.iter().all(|status| *status == 200),
        "sign-ins failed: {statuses:?}"
    );
    Ok(Some(peak))
}

/// Accounts made through the API (invite claim, then sign-up), so their passwords are real scrypt hashes.
async fn sign_up_users(
    client: &reqwest::Client,
    base: &str,
    env: &TestEnv,
    database_url: &str,
    count: usize,
) -> anyhow::Result<Vec<(String, String)>> {
    let mut db = PgConnection::connect(database_url).await?;
    let root = format!("memroot{}", std::process::id());
    sqlx::query(
        "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Root', $2, true, now(), now())",
    )
    .bind(&root)
    .bind(format!("{root}@example.com"))
    .execute(&mut db)
    .await?;
    let mut users = Vec::with_capacity(count);
    for index in 0..count {
        let token = format!("memtoken{}x{index}", std::process::id());
        insert_invite(
            &mut db,
            &format!("meminvite{}x{index}", std::process::id()),
            &token,
            &root,
            &format!("invitee{index}@example.com"),
        )
        .await?;
        let email = format!("mem{}x{index}@{}", std::process::id(), env.mail_domain);
        let password = format!("solace-test-mem-{index:04}");
        let forwarded = format!("2001:db8:6:{index:x}::1");
        let claim = client
            .post(format!("{base}/api/account/invite/claim"))
            .header("origin", "http://localhost:4100")
            .header("x-forwarded-for", &forwarded)
            .json(&json!({"token": token, "chosenEmail": email}))
            .send()
            .await?;
        let sign_up = client
            .post(format!("{base}/api/auth/sign-up/email"))
            .header("origin", "http://localhost:4100")
            .header("x-forwarded-for", &forwarded)
            .json(&json!({"email": email, "password": password, "name": "Mem"}))
            .send()
            .await?;
        ensure!(
            claim.status().is_success() && sign_up.status().is_success(),
            "could not create burst account {index}: {} / {}",
            claim.status(),
            sign_up.status()
        );
        users.push((email, password));
    }
    Ok(users)
}
