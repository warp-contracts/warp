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
    target: ['esnext'],
    format: 'iife',
    globalName: 'warp',
    external: ['events']
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
    target: ['esnext'],
    format: 'iife',
    globalName: 'warp',
    external: ['events']
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
    target: ['esnext'],
    format: 'esm',
    globalName: 'warp',
    external: ['events']
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
    target: ['esnext'],
    format: 'esm',
    globalName: 'warp',
    external: ['events']
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });
};
runBuild();

module.exports = runBuild;
