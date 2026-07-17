/* eslint-disable @typescript-eslint/no-require-imports */
const { copyFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rootPath(name) {
  return new RegExp(`^[\\\\/]${escapeRegExp(name)}(?:[\\\\/]|$)`);
}

function copyWindowsSqliteNativeModule(packageResult) {
  if (packageResult.platform !== "win32") return;

  const source = join(
    __dirname,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node",
  );
  if (readFileSync(source).subarray(0, 2).toString("ascii") !== "MZ") {
    throw new Error(
      "Windows better-sqlite3 module is missing. Run pnpm native:electron:win before packaging.",
    );
  }

  for (const outputPath of packageResult.outputPaths) {
    copyFileSync(source, join(
      outputPath,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ));
  }
}

module.exports = {
  outDir: "release",
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      copyWindowsSqliteNativeModule(packageResult);
    },
  },
  packagerConfig: {
    appBundleId: "com.tmxforge.desktop",
    asar: {
      unpack: "**/*.node",
    },
    electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
    executableName: "TMX-Forge",
    icon: join(__dirname, "build", "icon"),
    ignore: [
      rootPath(".next"),
      rootPath(".pnpm-store"),
      rootPath("coverage"),
      rootPath("desktop"),
      rootPath("docs"),
      rootPath("release"),
      rootPath("src"),
      rootPath("eslint.config.mjs"),
      rootPath("next.config.ts"),
      rootPath("postcss.config.mjs"),
      rootPath("tailwind.config.ts"),
      rootPath("tsconfig.json"),
      rootPath("tsconfig.desktop.json"),
      rootPath("tsconfig.tsbuildinfo"),
      rootPath("vitest.config.ts"),
    ],
    name: "TMX-Forge",
    osxSign: {
      identity: "-",
      identityValidation: false,
    },
    overwrite: true,
    win32metadata: {
      FileDescription: "TMX Forge",
      ProductName: "TMX Forge",
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32", "darwin"],
    },
  ],
  plugins: [
    { name: "@electron-forge/plugin-auto-unpack-natives", config: {} },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
