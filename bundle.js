const { build } = require('esbuild');
const rimraf = require('rimraf');

const clean = async () => {
  return new Promise((resolve) => {
    rimraf('./bundles', () => resolve());
  });
};

const runBuild = async () => {
  await clean();

  const buildConfig = {
    entryPoints: ['./src/index.ts'],
    bundle: true,
    platform: 'browser',
    target: ['esnext'],
    format: 'esm',
    globalName: 'warp'
  };

  console.log('Building web bundle esm.');
  build({
    ...buildConfig,
    minify: true,
    outfile: './bundles/web.bundle.min.js'
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });

  console.log('Building web bundle iife.');
  build({
    ...buildConfig,
    minify: true,
    target: ['esnext'],
    format: 'iife',
    outfile: './bundles/web.iife.bundle.min.js'
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });
};
runBuild().finally(() => {
  console.log('Build done.');
});

module.exports = runBuild;
