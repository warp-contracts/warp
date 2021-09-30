export async function handle(state, action) {

  const COLORS = ["green", "red", "yellow", "blue", "black", "brown", "pink", "orange", "purple", "gray"];
  const MATERIALS = ["gold", "wood", "silver", "fire", "diamond", "platinum", "palladium", "bronze", "lithium", "titanium"];
  const ITEMS = ["sword", "shield", "robe", "stone", "crown", "katana", "dragon", "ring", "axe", "hammer"];

  function bigIntFromBytes(byteArr) {
    let hexString = "";
    for (const byte of byteArr) {
      hexString += byte.toString(16).padStart(2, '0');
    }
    return BigInt("0x" + hexString);
  }

  // This function calculates a pseudo-random int value,
  // which is less then the `max` argument.
  // Note! To correctly generate several random numbers in
  // a single contract interaction, you should pass different
  // values for the `uniqueValue` argument
  async function getRandomIntNumber(max, uniqueValue = "") {
    console.log('random input:', {
      max,
      uniqueValue,
      height: SmartWeave.block.height,
      timestamp: SmartWeave.block.timestamp,
      id: SmartWeave.transaction.id,
      caller: action.caller
    });

    const pseudoRandomData = SmartWeave.arweave.utils.stringToBuffer(
      SmartWeave.block.height
      + SmartWeave.block.timestamp
      + SmartWeave.transaction.id
      + action.caller
      + uniqueValue
    );
    const hashBytes = await SmartWeave.arweave.crypto.hash(pseudoRandomData);
    const randomBigInt = bigIntFromBytes(hashBytes);
    const result = Number(randomBigInt % BigInt(max));
    console.log('random output:', {
      hashBytes,
      randomBigInt,
      result
    });
    return result;
  }

  switch (action.input.function) {

    case "name": {
      return { result: state.name };
    }

    case "generatedAssets": {
      return { result: Object.keys(state.assets) };
    }

    case "assetsLeft": {
      const allAssetsCount = COLORS.length * MATERIALS.length * ITEMS.length;
      const generatedAssetsCount = Object.keys(state.assets).length;
      const assetsLeftCount = allAssetsCount - generatedAssetsCount;
      return { result: assetsLeftCount };
    }

    case "getOwner": {
      const asset = action.input.data.asset;
      if (state.assets[asset]) {
        return { result: state.assets[asset] };
      } else {
        return { result: `The asset "${asset}" doesn't exist yet` };
      }
    }

    case "generate": {
      console.log(`---- ${SmartWeave.transaction.id} ----`);
      const colorIndex = await getRandomIntNumber(COLORS.length, "color");
      const materialIndex = await getRandomIntNumber(MATERIALS.length, "material");
      const itemIndex = await getRandomIntNumber(ITEMS.length, "item");
      const asset = COLORS[colorIndex] + " " + MATERIALS[materialIndex] + " " + ITEMS[itemIndex];
      console.log('asset:', asset);
      if (!state.assets[asset]) {
        state.assets[asset] = action.caller;
      } else {
        throw new ContractError(
          `Generated item (${asset}) is already owned by: ${state.assets[asset]}`);
      }
      return { state };
    }
      

    case "transfer": {
      const toAddress = action.input.data.to;
      const asset = action.input.data.asset;
      if (state.assets[asset] !== action.caller) {
        throw new ContractError("Can not transfer asset that doesn't belong to sender");
      }
      state.assets[asset] = toAddress;
      return { state };
    }
    
    default: {
      throw new ContractError(
        `Unsupported contract function: ${functionName}`);
    }

  }
}
