import { ContractDefinition, ExecutorFactory } from '@smartweave/core';

/**
 * An ExecutorFactory that allows to substitute original contract's source code.
 * Useful for debugging purposes (eg. to quickly add some console.logs in contract
 * or to test a fix or a new feature - without the need of redeploying a new contract on Arweave);
 *
 * Not meant to be used in production env! ;-)
 */
export class DebuggableExecutorFactory<Api> implements ExecutorFactory<Api> {
  constructor(
    private readonly baseImplementation: ExecutorFactory<Api>,
    // contract source code before default "normalization"
    private readonly sourceCode: { [key: string]: string }
  ) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<Api> {
    if (Object.prototype.hasOwnProperty.call(this.sourceCode, contractDefinition.txId)) {
      contractDefinition = {
        ...contractDefinition,
        src: this.sourceCode[contractDefinition.txId]
      };
    }

    return await this.baseImplementation.create(contractDefinition);
  }
}
