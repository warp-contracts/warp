import GlobalsPolyfills from '@esbuild-plugins/node-globals-polyfill';
import { build } from 'esbuild';

build({
  entryPoints: ['./tools/data/js/verify.js'],
  outdir: './tools/dist',
  minify: false,
  bundle: true,
  /*plugins: [
    GlobalsPolyfills({
      buffer: true
    })
  ],*/
  legalComments: 'none'
}).catch(() => process.exit(1));
