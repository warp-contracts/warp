/* eslint-disable */
import Arweave from 'arweave';
import { SmartWeaveNodeFactory, LoggerFactory } from '@smartweave';
import fs from 'fs';
import { readContract } from 'smartweave';

const contracts = [
  'gepLlre8wG8K3C15rNjpdKZZv_9pWsurRoEB6ir_EC4',
  'dNXaqE_eATp2SRvyFjydcIPHbsXAe9UT-Fktcqs7MDk',
  'KXeqPReolrKuSKCqFaemdt4hGzp9F5FdzpdZnoPW-Gs',
  'YkvsC-BgdxdRSvYg48nIakEzDXq91JvMZoGodKpiwD8',
  'q-KEZPOoWXAoo21hMNcuVeRLSXe99-YAjlVXfDcOhSQ',
  'TMkCZKYO3GwcTLEKGgWSJegIlYCHi_UArtG0unCi2xA',
  'yscNec3CnlXDbI99-KooeetQfISqBh5kmxouBrI9pcQ',
  'hf4jA5IToo10XULwTZ_vFP6WYD-j8cr33j3UbtvUC4M',
  'W_njBtwDRyltjVU1RizJtZfF0S_4X3aSrrrA0HUEhUs'
];

async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const smartWeave = SmartWeaveNodeFactory.memCached(arweave);
  const contract1 = smartWeave.contract('YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE');
  //const contract2 = smartWeave.contract('TMkCZKYO3GwcTLEKGgWSJegIlYCHi_UArtG0unCi2xA');
  const { state } = await contract1.readState();
  //await contract2.readState();
  const state2 = await readContract(arweave, 'YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE');
  console.log;
}

function readJSON(path) {
  const content = fs.readFileSync(path, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`File "${path}" does not contain a valid JSON`);
  }
}

main();
