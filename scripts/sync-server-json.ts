import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const packageText = readFileSync('package.json', 'utf8');
const pkg = JSON.parse(packageText) as {
  version: string;
  optionalDependencies?: Record<string, string>;
};
const server = JSON.parse(readFileSync('server.json', 'utf8')) as {
  version: string;
  packages: Array<{ version: string }>;
};

const nativePackagePrefix = '@sylphx/iris-';
let packageNativeVersionsChanged = false;
for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
  if (name.startsWith(nativePackagePrefix)) {
    packageNativeVersionsChanged ||= pkg.optionalDependencies![name] !== pkg.version;
    pkg.optionalDependencies![name] = pkg.version;
  }
}

if (packageNativeVersionsChanged) {
  writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
}

for (const directory of readdirSync('packages/npm', { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const manifestPath = `packages/npm/${directory.name}/package.json`;
  let nativeManifest: Record<string, unknown>;
  try {
    nativeManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      [key: string]: unknown;
    };
  } catch {
    continue;
  }
  if (
    typeof nativeManifest.name !== 'string' ||
    !nativeManifest.name.startsWith(nativePackagePrefix)
  ) {
    continue;
  }
  if (nativeManifest.version !== pkg.version) {
    nativeManifest.version = pkg.version;
    writeFileSync(manifestPath, `${JSON.stringify(nativeManifest, null, 2)}\n`);
  }
}

server.version = pkg.version;
server.packages[0].version = pkg.version;

writeFileSync('server.json', `${JSON.stringify(server, null, 2)}\n`);
