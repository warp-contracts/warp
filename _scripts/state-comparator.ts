/* eslint-disable */
import Arweave from 'arweave';
import * as fs from 'fs';
import path from 'path';
import Transaction from 'arweave/node/lib/transaction';
import { GQLEdgeInterface, GQLResultInterface, LoggerFactory, SmartWeaveNodeFactory } from '@smartweave';
import { readContract } from 'smartweave';

const diffStateToVerify = [
  'mzvUgNc8YFk0w5K5H7c8pyT-FC5Y_ba0r7_8766Kx74',
  'YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE',
  'w27141UQGgrCFhkiw9tL7A0-qWMQjbapU3mq2TfI4Cg'
];

const query = `
query Transactions($tags: [TagFilter!]!, $after: String) {
    transactions(tags: $tags, first: 100,  sort: HEIGHT_ASC, after: $after) {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
        cursor
      }
    }
  }`;

const logger = LoggerFactory.INST.create(__filename);

// LoggerFactory.INST.logLevel('debug');

async function main() {
  const arweave = Arweave.init({
    host: 'dh48zl0solow5.cloudfront.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const txs = loadTxFromFile();

  const resumeFromContractTxId = 'YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE';
  let resumeFrom = false;

  logger.info(`Checking ${txs.length} contracts`);

  const differentStatesContractTxIds = [];

  const errorContractTxIds = [];

  const smartWeave = SmartWeaveNodeFactory.memCached(arweave);

  const contractsBlacklist = [
    'jFInOjLc_FFt802OmUObIIOlY1xNKvomzUTkoUpyP9U', // readContract very long evaluation
    'El4EQmm3IztkMv3qXkuWVBMrwv_VJIxuT3btpmaZpxI', // confirmed with Fabian; https://discord.com/channels/817113909957361664/863061281488896020/871379515199344640
    '4j0j1Dfhz3d7HNcVFTFcrPYP8IvkPS9OfBLD6NxMGCo', // this also seems to be using Foreign Call Protocol and evaluates forever..
    'DVI-gBX6HtNUjoZHWLHnWmeujp01rQRnPOEDs4COwx0', // non-deterministic  - new Date()
    'N9n48HdcRPNB34A4Zcxg2RiYvfFUa7HkbKFbZ1GmjZ8', // non-deterministic  - new Date()
    'FgnK-IPuHLyQhGS_zQUCj22E0Tom-kFEun8zxaoRme4', // non-deterministic  - new Date()
    'QYKnm-uZY9Ib6r-jwD4HXmkmyjtjWrjBiVTPgx6X1n0', // non-deterministic  - new Date()
    '7UkUpwjSn8dWMUYU-XRfeHq68uzH8lbBYjEp5BYnOXY', // non-deterministic  - new Date()
    'vgRwEGqrDsImkGXG9GNxBwCYR6-AVTKiet1kw-M_GdY', // non-deterministic  - new Date()
    'Gx8E31NsUjkte9RMMdYXNynHXft_vo8c_G39OlIkyiQ', // non-deterministic  - new Date()
    'jYn1iueQHZBo-1EJnK6wfiJzl6nSnIdvjQthxPdlnK4', // non-deterministic  - new Date()
    'DeMsB5PRD2FXSMI2zYKgHufi032o5qhEhQMrYkXqUME', // non-deterministic  - new Date()
    'wd2EL4p8aKjxs1mKBZmUFlg7PnMORIOmbKgM3qxT4As', // non-deterministic  - new Date()
    'rJa4Nlifx992N4h-KrYAP4gK_9brSTilpU4OoIZMdco', // non-deterministic  - new Date()
    'Do0Yg4vT9_OhjotAn-DI2J9ubkr8YmOpBg1Z8cBdLNA', // non-deterministic  - new Date()
    'V5n-f9ULvIN8MrId6l34hB5akMBzZfQTnF0GJ9MgXgs', // non-deterministic  - new Date()
    'iEyCOIzQC8hwh4_NkJyNcokp9jHy-qIaAOtIE10jdgY', // non-deterministic  - new Date()
    'aMlIwSFvhUT5iEZSdzgEldOEd0oa8-7ZcbSSI5eA_3o', // non-deterministic  - new Date()
    '8GU6bCVo_ageRXtLEAhNODkzLEMHAycy_d4CprxXlbw', // non-deterministic  - new Date()
    'ENzSyU-5eMwhpdMJaNAPtbgLm-nIg6E0fS_kCQrnOIw', // non-deterministic  - new Date()
    'PfNmSoFfLr5xoL14D6qXy6Gb3HVWX9vI8yLuqDEQTjY', // non-deterministic  - new Date()
    'ZyU1cVKvaIvc1-eoUUp3W7e-I8hf-NkAfIukSq8wB7I', // non-deterministic  - new Date()
    'NvC8d0BwJiCOTL0Jsy9U-jZvFpZb-29ls7VkDQwKZEw', // non-deterministic  - new Date()
    'm_oIuIX0L-ex2pItk8UU1wVXo_ALhvMY-CaPPGrl2AI', // non-deterministic  - new Date()
    'Ky8ypJK8sZTJg3sxFXq4xtwdpU4cDGzjyA9wh1ZHfOg', // non-deterministic  - new Date()
    '2KQh2kOPCMqpOugbjXZGDWPWcWZpO9n6bC_CG6FQ40Q', // non-deterministic  - new Date()
    'RWl3bimVg0Kdlr3R2vbjjxilKaJQwMcmCZ6Ho7dkv0g', // non-deterministic  - new Date()
    'ljy4rdr6vKS6-jLgduBz_wlcad4GuKPEuhrRVaUd8tg', // cannot read state using original readContract - multiple unsafeClient.transactions.get calls
    'oS1dH-gklbNImarAZt8vpmiTSKGAdk9tvHAkn7MrrW0', // diff between consecutive calls of original readContract
    'rq4eay3i_LprbdFS8t3qAXHdzB2zDkTGChBof17oGY0', // diff between consecutive calls of original readContract
    'mNXgCKe0kChDjgs6IJS0sr0gncb2BZiVCfSxiz-wOvI', // diff between consecutive calls of original readContract
    'D5E8st-U-4W7lFnomhQKfJsAQZr6y4mvMpn1YhTfP_U', // diff between consecutive calls of original readContract
    'thL0Uy9N_ZiV1YGKl3ckHv-uMQvMHsuSq-gplbLfdFc', // diff between consecutive calls of original readContract
    'c2l8X1hIYyLvSpLHk2SaqfMhUk56vkLF7WxI1bdnfvE', // non-deterministic  - new Date()
    'hX5IDyPNF8mMxlt_lXyhq_ZR_fB1aHlQLj1AtInEirI', // non-deterministic  - new Date()
    'Mb73oSPIvOcZ07Q_qgVH6g10o2BlZS-Zbb9XddhIMFE', // non-deterministic  - new Date()
    'OUu7a2eVaaOMgjs6bb0GNvLPvdBt4AShoJUtq59w0lY', // non-deterministic  - new Date()
    'NY62EWpa7pTMH0PEUp3ODkqTQP11cdJEiYgV7-pobUw', // non-deterministic  - new Date()
    'DqdgDjfMk6gLry2Sz12HTInOl3vvX7ObHBfzbUHMDGo', // non-deterministic  - new Date()
    'HT5w1hwH6TPU9AIXVlXZ0oKAVyDPl8n4FEJvR8pKb_w', // non-deterministic  - new Date()
    'QwdM8b5530AxTMZOKAg7l-Leh-ZpA8mTGA_8t-6V4R0', // non-deterministic  - new Date()
    '6C6Fdm8qbyr9cWDBBuH_T4aXVi4UHw6WHojCgYg9mYI', // non-deterministic  - new Date()
    'C8sUsnsm_SrUZpuDaHZihNYiR_EPhi3yBW9ae4M60YU', // non-deterministic  - new Date()
    '_JrDtHCJ0AQij5SZjfoCFibMEi1ZvYuZ8kZmzlLjAoo', // non-deterministic  - new Date()
    'LTBBqvVNR-fg_WOEUXYBSffkTGm8szIcJcER4YDmOeY', // non-deterministic  - new Date()
    'I-UjB-xfVWxg9k7UrodhpaPKTqql868CrpFz-nW4szQ', // non-deterministic  - new Date()
    'UDHVRRTPMbhoBHeSBbng6U8ZBryrBjtyqghdXt2Rpns', // non-deterministic  - new Date()
    'ebVWmlGN1KkNZECCn-CzNUgtT50M2w2VOvzmbAvBMJ8', // non-deterministic  - new Date()
    '3-KgLs_QZ39UuFqZMu1WXVd9eLULclj7knVLdv_2CBA', // non-deterministic  - new Date()
    'm0-MJ4mQruT7cPRl8b2I0rF2nu7-MJd2kqw0wfYhG-A', // non-deterministic  - new Date()
    '2JhxyWu9ai9OWJuc4xRFshrqoM5PS0rONJrIvj8RMtg', // non-deterministic  - new Date()
    'p2UpExb4jrFPYg0gfaIJEEiJnmb1u1O_qtXwcIN7Vb4', // non-deterministic  - new Date()
    'Gejd_7-M5q8dedSmjuApM9W2RyEZMMQPkchzGJNbTd0', // non-deterministic  - new Date()
    '3O0Xcwquvl2r2_-qXD3DgT1wtE-FD9SK55HaJN7mWvs', // non-deterministic  - new Date()
    'Q-S3m2Yj6tB0SQTkM1oZH7PvhUSy05OBhxDQ08xaxiU', // non-deterministic  - new Date()
    '7UQr3tR35RtTiCr-_GG1GC-PzE_p0wScB_UqZPFK4T4', // non-deterministic  - new Date()
    'RUsVtU-kywFWf63XivMPPM2o3hmP7xRQYdlwEk52paA', // non-deterministic  - new Date()
    'fRyRiV40kTqz62IGDoK76MmELzB-gV9zcadN7V6fBGM', // non-deterministic  - new Date()
    'uL69aODCIXuamOLyF5SuxrwrctvTw-8k01X_5fgUdqg', // non-deterministic  - new Date()
    'm_eA9FQIwwWQwI2EucyS0V6KKupVJfb9SCycWI1KKJs', // non-deterministic  - new Date()
    'P4Sn8AH0f5dFAda3CO2aI98YkiTIuVzZ2Obbb8ZiCFQ', // non-deterministic  - new Date()
    'oy9X4ZR_qJ-jZCB56rwP1nrw-o0OOqtvm59lvzSfhAU', // non-deterministic  - new Date()
    'kJiz2yvXjHDGUT45XudbRcC9uy6QJce2JgwDXlJlv0Y', // non-deterministic  - new Date()
    'Y1Ik4EPSOpavP24nJzRLO4TeJRbSvarfRVvXxBOqEOI', // non-deterministic  - new Date()
    '0Nx9CWDplg9guCp67_NlT2axv-GLyxQaZaI1TyDMSzg', // non-deterministic  - new Date()
    'YuI0ZV7NziJbqVvTpjvzYah98B2eDtDK4G8h3hYEweA', // non-deterministic  - new Date()
    'A3W2q5aO7Q4QoKb0uqJTcaqqxcLhTnfBvt2T9HJkFt4', // non-deterministic  - new Date()
    'Ckbgnv1clR3au4P9-gDrtrQhf6O4YRD9p6xeZywJ2HQ', // non-deterministic  - new Date()
    'm4_GVkSNSc7hFID68__ODi3xSZgGBfY3TDug7yIcwyE', // non-deterministic  - new Date()
    '8V86hJS6grrBrpShGrUKRbUIuT4pez3PLsEh2bv8kzE', // non-deterministic  - new Date()
    'u3dN2nvq71O3Or3qo_EM_V8_XSPGTh_3oUB0XzmI35A', // non-deterministic  - new Date()
    '6J4K4fwBsu5D8Natm4k4u9HKfV9UdHUP9mCFkNll3ds', // non-deterministic  - new Date()
    'dgxYRw4xxIaVsoOJs_giR6Nmxv0QDPBSglLV5UDnkpA', // non-deterministic  - new Date()
    '_ZXfm1cXinE6-G6Uwjb_QVuo6jq325pienel971h_sw', // non-deterministic  - new Date()
    'OQvFFrjnU-A2MLRzxNtqSym4Yd9d1ywtBKJOj3PxX-A', // non-deterministic  - new Date()
    'P-jT_gXmglmBBmq6bEUKNUwyWX1L9fzzIi-AFftMCSA', // non-deterministic  - new Date()
    'F1rX1aQH-qNKxkMFhTPQ_9pF_6Q8EdIw4iZoEv75dKc', // non-deterministic  - new Date()
    'l1ndwQUSflTVCvlFxC2cScPI-LSHGqzcWwkNIMUOJ14', // non-deterministic  - new Date()
    'tPuubx4kMUPS9Q21NZ2rZz4VlR_BrTawX3b84nl_eeQ', // non-deterministic  - new Date()
    'SOzf9v7R9ddK4LV5zI5VrKJIRqHX3r3Y4p9oVgr36rg', // non-deterministic  - new Date()
    'lAIRxKKWKXQTRT6XIsMvZh4JikXevO3zdu7uqo7VJy0', // non-deterministic  - new Date()
    'Pr6ZKeFaJFHGLdn6vbCJ93JS1L1J3k3ptBRSspqLL2U', // non-deterministic  - new Date()
    'P871U4YnHiClonG80BznhZW5Jy3aKwMV5nOZPONfrw4', // non-deterministic  - new Date()
    '7-JcXmxIFTJoJtfC-E3uBnK1RkknW0WmhR1gmOcZaHc', // non-deterministic  - new Date()
    'AqnCHJqo2ToqmCs6aKDhFW9pqDEe0CAkUr1T4C6rg3U', // non-deterministic  - new Date()
    'WR9ZHiE8cyXjj5g5rpnkOXm4O4ul-iUjNy4j8--LLVs', // non-deterministic  - new Date()
    'JQQHNA7scVEXRtbvFdFVtIw1AXk3LaCRea5t0axPk4k', // non-deterministic  - new Date()
    'Yc6-QiukVnAyKDvS_S0Yz2BpsAPfahNpkbWSo4K5zk4', // non-deterministic  - new Date()
    '1_v7yu1K6ttbwaNsQLmjZOvbAyCg7NNXpcLdZRIJOKg', // non-deterministic  - new Date()
    'x0UlfULWsYGNttZf4QTIEuIvedjsYQtaHh_yOfyhOWg', // non-deterministic  - new Date()
    '6nx5BlJbxPmXA1cFqR1KxHDf1f3zXz2glVEi4L72zMM', // non-deterministic  - new Date()
    'M3JVDpeS8GkcbLYMUb5te1kYnSot0xkOeJktuQmPb9w', // non-deterministic  - new Date()
    'V2CHShHCvXuidRJrPLlydgTbnINLjVpzagZyZjUiHws', // non-deterministic  - new Date()
    'Pt9DTwf3aZcxooq7Eq7XlkVRiIQDt3JJS1LV9UwoxDE', // non-deterministic  - new Date()
    'e9raEJJacDDCWqOshtfXaxjiXfeEfRvTj34eq4GqzVQ', // very long processing
    'DkmTmGPekZmYIvC3DzhcPq9xuKoE7prdebDrHlmRdDY', // very long processing
    'C_1uo08qRuQAeDi9Y1I8fkaWYUC9IWkOrKDNe9EphJo' // very long processing
  ];

  const sourcesBlacklist = [
    // https://discord.com/channels/817113909957361664/863061281488896020/871383143347781694
    'MjrjR6qCFcld0VO83tt3NcpZs2FIuLscvo7ya64afbY',
    'C_1uo08qRuQAeDi9Y1I8fkaWYUC9IWkOrKDNe9EphJo',
    'Z3Arb_sfuLpFxyLfolLClLfe89BFgrbbgJM2rKsebEY'
  ];

  let counter = 0;

  const properContractTxIds = [];

  for (const contractTxId of txs) {
    const tx: Transaction = await arweave.transactions.get(contractTxId);
    counter++;
    logger.info(`\n${contractTxId}: [${counter}/${txs.length}]`);

    if (resumeFrom && contractTxId.localeCompare(resumeFromContractTxId) !== 0) {
      console.info('Skipping...');
      continue;
    } else {
      resumeFrom = false;
    }

    if (contractsBlacklist.includes(contractTxId)) {
      logger.warn('Skipping blacklisted contract: ', contractTxId);
      continue;
    }

    const tags = tx.tags;
    if (
      tags.some((tag) => {
        const key = tag.get('name', { decode: true, string: true });
        const value = tag.get('value', { decode: true, string: true });
        return key.localeCompare('Contract-Src') === 0 && sourcesBlacklist.includes(value);
      })
    ) {
      logger.warn("Skipping blacklisted contract's source");
      continue;
    }

    properContractTxIds.push(contractTxId);

   /* let resultString = '';
    let result2String = '';
    try {
      logger.info('readContract');
      const result = await readContract(arweave, contractTxId);
      resultString = JSON.stringify(result);
      // console.log(resultString);

      logger.info('readState');
      const result2 = await smartWeave.contract(contractTxId).readState();
      result2String = JSON.stringify(result2.state);
      // console.log(result2String);

    } catch (e) {
      logger.error(e);
      logger.info('skipping ', contractTxId);
      errorContractTxIds.push(contractTxId);
    } finally {
      if (resultString.localeCompare(result2String) !== 0) {
        logger.error('States differ!');
        differentStatesContractTxIds.push(contractTxId);
        fs.writeFileSync(path.join(__dirname, 'diffs', `${contractTxId}_old.json`), resultString);
        fs.writeFileSync(path.join(__dirname, 'diffs', `${contractTxId}_new.json`), result2String);
      }
      logger.debug('Contracts with different states:', differentStatesContractTxIds);
      logger.info('\n\n ==== END');
    }*/
  }

  fs.writeFileSync('proper-test-cases.json', JSON.stringify(properContractTxIds));
}

main().catch();

function loadTxFromFile(): string[] {
  const transactions = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-cases.json'), 'utf-8'));
  return Object.keys(transactions);
}

async function loadContractTransactions(arweave: Arweave) {
  let variables = {
    tags: [
      {
        name: 'App-Name',
        values: ['SmartWeaveContract']
      },
      {
        name: 'Content-Type',
        values: ['application/json']
      }
    ],
    after: undefined
  };

  let transactions = await getNextPage(arweave, variables);

  const txs: GQLEdgeInterface[] = transactions.edges.filter((tx) => !tx.node.parent || !tx.node.parent.id);

  while (transactions.pageInfo.hasNextPage) {
    const cursor = transactions.edges[99].cursor;

    variables = {
      ...variables,
      after: cursor
    };

    transactions = await getNextPage(arweave, variables);

    txs.push(...transactions.edges.filter((tx) => !tx.node.parent || !tx.node.parent.id));
  }
  return txs;
}

async function getNextPage(arweave, variables) {
  const response = await arweave.api.post('graphql', {
    query,
    variables
  });

  logger.trace('Status:', response.status);
  if (response.status !== 200) {
    throw new Error('Wrong response from Ar GQL');
  }

  if (response.data.errors) {
    logger.error(response.data.errors);
    throw new Error('Error while loading transactions');
  }

  const data: GQLResultInterface = response.data;
  return data.data.transactions;
}
