import { ContractCallStack, InteractionCall } from '@warp';

export class InnerWritesEvaluator {
  eval(callStack: ContractCallStack): Array<string> {
    const result = [];
    callStack.interactions.forEach((interaction) => {
      this.evalForeignCalls(callStack.contractTxId, interaction, result);
    });

    return result;
  }

  private evalForeignCalls(rootContractTxId: string, interaction: InteractionCall, result: Array<string>) {
    interaction.interactionInput.foreignContractCalls.forEach((foreignContractCall) => {
      foreignContractCall.interactions.forEach((foreignInteraction) => {
        if (
          foreignInteraction.interactionInput.dryWrite &&
          !result.includes(foreignContractCall.contractTxId) &&
          rootContractTxId !== foreignContractCall.contractTxId /*"write-backs"*/
        ) {
          result.push(foreignContractCall.contractTxId);
        }
        this.evalForeignCalls(rootContractTxId, foreignInteraction, result);
      });
    });
  }
}
