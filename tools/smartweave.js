const Arweave = require("arweave");
const { readContract } = require("smartweave");

const arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});

(async () => {
  console.log(
    await readContract(
      arweave,
      "t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE",
      749180,
    ),
  );
})();
