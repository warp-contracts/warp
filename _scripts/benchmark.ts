/* eslint-disable */
import { LoggerFactory, SmartWeaveNodeFactory } from '@smartweave';
import Arweave from 'arweave';
import fs from 'fs';
import path from 'path';

async function main() {
  const arweave = Arweave.init({
    host: 'dh48zl0solow5.cloudfront.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });
  const logger = LoggerFactory.INST.create(__filename);
  LoggerFactory.INST.logLevel('silly', 'benchmark');
  const swcClient = SmartWeaveNodeFactory.fileCacheClient(arweave);

  const contractTxId = 'OrO8n453N6bx921wtsEs-0OCImBLCItNU5oSbFKlFuU';
  // Kyve:
  // C_1uo08qRuQAeDi9Y1I8fkaWYUC9IWkOrKDNe9EphJo
  // OFD4GqQcqp-Y_Iqh8DN_0s3a_68oMvvnekeOEu_a45I
  // 8cq1wbjWHNiPg7GwYpoDT2m9HX99LY7tklRQWfh1L6c

  const resultDiffs = [];

  try {
    /*  console.log('readContract');
      const result = await readContract(arweave, contractTxId);
      const resultString = JSON.stringify(result);
      console.log(resultString);
*/
    const result2 = await swcClient.readState(contractTxId);
    const result2String = JSON.stringify(result2.state);
    logger.silly(result2String);

    /*  if (resultString.localeCompare(result2String) !== 0) {
        console.error('\n\n ====== States differ ======\n\n');
        resultDiffs.push(contractTxId);
        const targetPath = path.join(__dirname, 'tests', contractTxId);
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath);
        }
        fs.writeFileSync(path.join(targetPath, 'new.json'), result2String);
        fs.writeFileSync(path.join(targetPath, 'old.json'), resultString);
      }*/

    const targetPath = path.join(__dirname, '../', 'tests', contractTxId);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath);
    }
    fs.writeFileSync(path.join(targetPath, 'new.json'), result2String);
    logger.silly('Contracts with diff state:', resultDiffs);
  } catch (e) {
    logger.error(e);
    logger.log('skipping ', contractTxId);
  }
}

main();
