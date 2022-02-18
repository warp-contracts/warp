/* eslint-disable */

const Undici = require("undici");
const fetch = Undici.fetch;

async function test() {
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`https://arweave.net:443/tx/ydjfv0hRQdD2c-MASv4L5Qahjap_LXJyD9tNyKWvf50`)
      .then((res) => {
        return res.ok ? res.json() : Promise.reject(res);
      })
      .catch((error) => {
        if (error.body?.message) {
          this.logger.error(error.body.message);
        }
        throw new Error(`Unable to retrieve info. ${error.status}.`);
      });

    console.log(response);
  }
}

test().finally();

