import Arweave from 'arweave';
import { WarpNodeFactory } from '../../src';
import { expose } from 'threads';

const arweave = Arweave.init({
  host: 'arweave.net', // Hostname or IP address for a Arweave host
  port: 443, // Port
  protocol: 'https', // Network protocol http or https
  timeout: 60000, // Network request timeouts in milliseconds
  logging: false // Enable network request logging
});

const warp = WarpNodeFactory.memCached(arweave);

expose({
  readState(txId) {
    console.log(txId);
    return warp.contract(txId).readState();
  }
});
