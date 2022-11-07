const { build } = require('esbuild');
const rimraf = require('rimraf');
const fs = require("fs");

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
  const result = await build({
    ...buildConfig,
    minify: true,
    outfile: './bundles/web.bundle.min.js',
    metafile: true
  }).catch((e) => {
    console.log(e);
    process.exit(1);
  });

  fs.writeFileSync('metadata.json', JSON.stringify({
    inputs: result.metafile.inputs,
    outputs: result.metafile.outputs
  }));

  console.log('Building web bundle iife.');
  await build({
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
