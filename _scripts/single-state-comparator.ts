/* eslint-disable */
import { LoggerFactory, SmartWeaveNodeFactory } from '@smartweave';
import Arweave from 'arweave';
import fs from 'fs';
import path from 'path';
import { readContract } from 'smartweave';

async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });
  const logger = LoggerFactory.INST.create(__filename);
  const smartWeave = SmartWeaveNodeFactory.memCached(arweave);

  const contractTxId = 'YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE';
  // Kyve:
  // C_1uo08qRuQAeDi9Y1I8fkaWYUC9IWkOrKDNe9EphJo
  // OFD4GqQcqp-Y_Iqh8DN_0s3a_68oMvvnekeOEu_a45I
  // 8cq1wbjWHNiPg7GwYpoDT2m9HX99LY7tklRQWfh1L6c

  const resultDiffs = [];

  try {
    logger.info('readContract');
    const { state, validity } = await readContract(arweave, contractTxId, undefined, true);
    logger.debug('readContract validity', validity);
    const resultString = JSON.stringify(state);

    logger.info('readState');
    const result2 = await smartWeave.contract(contractTxId).readState();
    logger.debug('readState validity', result2.validity);
    const result2String = JSON.stringify(result2.state);

    if (resultString.localeCompare(result2String) !== 0) {
      console.error('\n\n ====== States differ ======\n\n');
      resultDiffs.push(contractTxId);
      const targetPath = path.join(__dirname, 'diffs', contractTxId);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath);
      }
      fs.writeFileSync(path.join(targetPath, 'new.json'), result2String);
      fs.writeFileSync(path.join(targetPath, 'old.json'), resultString);
    }
  } catch (e) {
    logger.error(e);
    logger.info('skipping ', contractTxId);
  }
}

main();
