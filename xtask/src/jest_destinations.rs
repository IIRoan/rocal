//! Checks that every backend Jest case has exactly one destination and that its suite or unit test exists.

use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, bail};

pub fn run(args: &[&str]) -> anyhow::Result<()> {
    let require_all = args.contains(&"--complete");
    let root = crate::repo_root();
    let dir = root.join("crates/solace-api-tests/jest");
    let cases: BTreeSet<(String, String)> = std::fs::read_to_string(dir.join("cases.tsv"))?
        .lines()
        .filter(|line| !line.starts_with('#') && !line.is_empty())
        .filter_map(|line| line.split_once('\t'))
        .map(|(file, name)| (file.to_owned(), name.to_owned()))
        .collect();

    let mut destinations: BTreeMap<(String, String), (String, String)> = BTreeMap::new();
    let mut problems = Vec::new();
    for entry in std::fs::read_dir(&dir)? {
        let path = entry?.path();
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if file_name == "cases.tsv" || !file_name.ends_with(".tsv") {
            continue;
        }
        for (number, line) in std::fs::read_to_string(&path)?.lines().enumerate() {
            let mut fields = line.splitn(3, '\t');
            let (Some(file), Some(name), Some(destination)) =
                (fields.next(), fields.next(), fields.next())
            else {
                problems.push(format!(
                    "{file_name}:{}: expected file<TAB>name<TAB>destination",
                    number + 1
                ));
                continue;
            };
            let key = (file.to_owned(), name.to_owned());
            if !cases.contains(&key) {
                problems.push(format!(
                    "{file_name}:{}: not a Jest case: {file} › {name}",
                    number + 1
                ));
            }
            if let Some((other, _)) =
                destinations.insert(key, (file_name.clone(), destination.to_owned()))
            {
                problems.push(format!(
                    "{file_name}:{}: also mapped in {other}: {name}",
                    number + 1
                ));
            }
            if let Err(error) = check_destination(&root, destination) {
                problems.push(format!("{file_name}:{}: {error:#}", number + 1));
            }
        }
    }

    let missing: Vec<_> = cases
        .iter()
        .filter(|case| !destinations.contains_key(*case))
        .collect();
    println!(
        "{} of {} Jest cases have a destination; {} problem(s)",
        cases.len() - missing.len(),
        cases.len(),
        problems.len()
    );
    for problem in &problems {
        println!("  {problem}");
    }
    if require_all {
        for (file, name) in &missing {
            println!("  missing: {file} › {name}");
        }
    }
    if !problems.is_empty() || (require_all && !missing.is_empty()) {
        bail!("Jest destinations are incomplete");
    }
    Ok(())
}

fn check_destination(root: &std::path::Path, destination: &str) -> anyhow::Result<()> {
    if let Some(reason) = destination.strip_prefix("n/a: ") {
        if reason.trim().is_empty() {
            bail!("n/a needs a reason");
        }
        return Ok(());
    }
    if let Some(target) = destination.strip_prefix("unit:") {
        return check_unit(root, target);
    }
    let Some(target) = destination.strip_prefix("suite:") else {
        bail!("destination must start with suite:, unit: or n/a: ({destination})");
    };
    let Some((module, test)) = target.split_once("::") else {
        bail!("suite destination is module::test ({destination})");
    };
    let source = std::fs::read_to_string(
        root.join(format!("crates/solace-api-tests/tests/api/{module}.rs")),
    )
    .with_context(|| format!("no suite module {module}"))?;
    if !source.contains(&format!("async fn {test}(")) {
        bail!("no test {test} in suite module {module}");
    }
    Ok(())
}

/// `unit:solace-server::<module path>::tests::<name>`: the API's module file must hold `fn <name>(`.
fn check_unit(root: &std::path::Path, target: &str) -> anyhow::Result<()> {
    let segments: Vec<&str> = target.split("::").collect();
    let ["solace-server", modules @ .., "tests", test] = segments.as_slice() else {
        bail!("unit destination is solace-server::module::tests::name ({target})");
    };
    let file = root
        .join("apps/backend/src")
        .join(format!("{}.rs", modules.join("/")));
    let source = std::fs::read_to_string(&file)
        .with_context(|| format!("no unit module {}", file.display()))?;
    if !source.contains(&format!("fn {test}(")) {
        bail!("no unit test {test} in {}", file.display());
    }
    Ok(())
}
