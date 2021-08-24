/* eslint-disable */
import Arweave from 'arweave';
import { LoggerFactory } from '../logging';
import { SwClientFactory } from '@client';

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

  const swcClient = SwClientFactory.memCacheClient(arweave);
  LoggerFactory.INST.logLevel('debug');

  const contractTxId = 'W_njBtwDRyltjVU1RizJtZfF0S_4X3aSrrrA0HUEhUs';
  const contractTxId2 = 'TMkCZKYO3GwcTLEKGgWSJegIlYCHi_UArtG0unCi2xA';

  await swcClient.readState(contractTxId);

  await swcClient.readState(contractTxId2);
}

main();
