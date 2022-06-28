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

(async () => {
  await main();
  console.log('After main');
  await sleep(500);

  console.log('After timeout');
})();
