const { sleep } = require('../lib/cjs/utils/utils');

async function main() {
  try {
    await two();
  } catch (e) {
    console.log('gotcha!');
  }

  console.log('still alive');
}

async function one() {
  Object.values(null);
}

async function two() {
  one();
}

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
  });

(async () => {
  await main();
  console.log('After main');
  await sleep(500);

  console.log('After timeout');
})();
