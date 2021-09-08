import { SmartWeaveTags } from '@smartweave';
import { BalanceResult, HandlerBasedContract, PstContract, PstState, TransferInput } from '@smartweave/contract';

interface BalanceInput {
  function: string;
  target: string;
}

export class PstContractImpl extends HandlerBasedContract<PstState> implements PstContract {
  async currentBalance(target: string): Promise<BalanceResult> {
    const interactionResult = await this.viewState<BalanceInput, BalanceResult>({ function: 'balance', target });
    if (interactionResult.type !== 'ok') {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result;
  }

  async currentState(): Promise<PstState> {
    return (await super.readState()).state;
  }

  async transfer(transfer: TransferInput): Promise<string | null> {
    return await this.writeInteraction<any>({ function: 'transfer', ...transfer });
  }

  async evolve(newSrcTxId: string): Promise<string | null> {
    return await this.writeInteraction<any>({ function: 'evolve', value: newSrcTxId });
  }

  async saveNewSource(newContractSource: string): Promise<string | null> {
    if (!this.wallet) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    const { arweave } = this.smartweave;

    const tx = await arweave.createTransaction({ data: newContractSource }, this.wallet);
    tx.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContractSource');
    tx.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    tx.addTag('Content-Type', 'application/javascript');

    await arweave.transactions.sign(tx, this.wallet);
    await arweave.transactions.post(tx);

    return tx.id;
  }
}
