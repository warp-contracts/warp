import { InteractionData } from './modules/impl/HandlerExecutorFactory';
import { InnerCallType } from '../contract/Contract';
import { isomorphicRandomUUID } from '../utils/utils';

export class ContractCallRecord {
  readonly interactions: { [key: string]: InteractionCall } = {};
  readonly id: string;

  constructor(readonly contractTxId: string, readonly depth: number, readonly innerCallType: InnerCallType = null) {
    this.id = isomorphicRandomUUID();
  }

  addInteractionData(interactionData: InteractionData<any>): InteractionCall {
    const { action, interaction } = interactionData;

    const interactionCall = InteractionCall.create(
      new InteractionInput(
        interaction.id,
        interaction.sortKey,
        interaction.block.height,
        interaction.block.timestamp,
        action?.caller,
        action?.input.function,
        action?.input,
        interaction.dry,
        {}
      )
    );

    this.interactions[interaction.id] = interactionCall;

    return interactionCall;
  }

  getInteraction(txId: string): InteractionCall {
    return this.interactions[txId];
  }

  print(): string {
    return JSON.stringify(this, null, 2);
  }
}

export class InteractionCall {
  interactionOutput: InteractionOutput;

  private constructor(readonly interactionInput: InteractionInput) {}

  static create(interactionInput: InteractionInput): InteractionCall {
    return new InteractionCall(interactionInput);
  }

  update(interactionOutput: InteractionOutput): void {
    this.interactionOutput = interactionOutput;
  }
}

export class InteractionInput {
  constructor(
    public readonly txId: string,
    public readonly sortKey: string,
    public readonly blockHeight: number,
    public readonly blockTimestamp: number,
    public readonly caller: string,
    public readonly functionName: string,
    public readonly functionArguments: [],
    public readonly dryWrite: boolean,
    public readonly foreignContractCalls: { [key: string]: ContractCallRecord } = {}
  ) {}
}

export class InteractionOutput {
  constructor(
    public readonly cacheHit: boolean,
    public readonly executionTime: number,
    public readonly valid: boolean,
    public readonly errorMessage: string = '',
    public readonly gasUsed: number
  ) {}
}
