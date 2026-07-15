/* eslint-disable @typescript-eslint/no-require-imports */
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rootPath(name) {
  return new RegExp(`^[\\\\/]${escapeRegExp(name)}(?:[\\\\/]|$)`);
}

module.exports = {
  outDir: "release",
  packagerConfig: {
    asar: {
      unpack: "**/*.node",
    },
    electronZipDir: process.env.ELECTRON_ZIP_DIR || undefined,
    executableName: "TMX-Workbench",
    ignore: [
      rootPath(".next"),
      rootPath(".pnpm-store"),
      rootPath("coverage"),
      rootPath("desktop"),
      rootPath("docs"),
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
    name: "TMX-Local-Workbench",
    overwrite: true,
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
