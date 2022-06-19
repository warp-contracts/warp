const { build } = require('esbuild');
const rimraf = require('rimraf');

const clean = async () => {
  return new Promise((resolve) => {
    rimraf('./bundles', () => resolve());
  });
};

const runBuild = async () => {
  await clean();

  build({
    entryPoints: ['./src/index.ts'],
    minify: false,
    bundle: true,
    outfile: './bundles/web.bundle.js',
    platform: 'browser',
    target: ['es2020', 'chrome58', 'firefox57', 'safari11'],
    format: 'iife',
    globalName: 'warp'
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });

  build({
    entryPoints: ['./src/index.ts'],
    minify: true,
    bundle: true,
    outfile: './bundles/web.bundle.min.js',
    platform: 'browser',
    target: ['es2020', 'chrome58', 'firefox57', 'safari11'],
    format: 'iife',
    globalName: 'warp'
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });

  build({
    entryPoints: ['./src/index.ts'],
    minify: false,
    bundle: true,
    outfile: './bundles/esm.bundle.js',
    platform: 'browser',
    target: ['es2020', 'chrome58', 'firefox57', 'safari11'],
    format: 'esm',
    globalName: 'warp'
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });

  build({
    entryPoints: ['./src/index.ts'],
    minify: true,
    bundle: true,
    outfile: './bundles/esm.bundle.min.js',
    platform: 'browser',
    target: ['es2020', 'chrome58', 'firefox57', 'safari11'],
    format: 'esm',
    globalName: 'warp'
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });
};
runBuild();

module.exports = runBuild;
