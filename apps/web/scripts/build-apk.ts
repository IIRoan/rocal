import { $ } from "bun";
import path from "path";

const androidDir = path.resolve(import.meta.dir, "../android");
const outputDir = path.resolve(import.meta.dir, "../output");
const bundletoolPath = path.join(
  androidDir,
  "bundletool/bundletool-all-1.18.3.jar",
);

async function main() {
  console.log("Starting Android APK build...");

  // 1. Build the web assets with production env vars from .env.production
  //    Env vars set inline take precedence over .env.local
  console.log("Building web assets...");
  await $`NEXT_PUBLIC_API_URL=https://api.solace.onl NEXT_PUBLIC_APP_URL=https://solace.onl NODE_ENV=production bun run mobile:build`;

  // 2. Sync the web assets to the native project
  console.log("Syncing web assets...");
  await $`NODE_ENV=production bunx cap sync`;

  // 3. Build the Android App Bundle
  console.log("Building Android App Bundle...");
  await $`cd ${androidDir} && ./gradlew bundleRelease`;

  const aabPath = path.join(
    androidDir,
    "app/build/outputs/bundle/release/app-release.aab",
  );
  const apksPath = path.join(androidDir, "app-release.apks");

  // 2. Generate the .apks archive
  console.log("Generating .apks archive...");
  await $`java -jar ${bundletoolPath} build-apks --bundle=${aabPath} --output=${apksPath} --mode=universal`;

  // 3. Extract the universal.apk
  console.log("Extracting universal.apk...");
  const apksZipPath = apksPath.replace(".apks", ".zip");
  await $`mv ${apksPath} ${apksZipPath}`;
  await $`unzip -o ${apksZipPath} -d ${androidDir}`;

  const universalApkPath = path.join(androidDir, "universal.apk");

  // 4. Move to output directory
  console.log("Moving APK to output directory...");
  await $`mkdir -p ${outputDir}`;
  await $`mv ${universalApkPath} ${path.join(outputDir, "solace.apk")}`;

  // 5. Cleanup
  console.log("Cleaning up...");
  await $`rm ${apksZipPath}`;

  console.log(
    "Build complete! Find your APK at: ",
    path.join(outputDir, "solace.apk"),
  );
}

main();
