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

main().catch((e) => console.error(e))