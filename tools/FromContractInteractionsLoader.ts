/* eslint-disable */
import { InteractionsLoader } from '../src/core/modules/InteractionsLoader';
import { GQLEdgeInterface } from '../src/legacy/gqlResult';
import * as fs from 'fs';
import {ArweaveGatewayInteractionsLoader, LoggerFactory} from '../src';
import { EvaluationOptions } from '../src/core/modules/StateEvaluator';

export class FromContractInteractionsLoader extends ArweaveGatewayInteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('FromContractInteractionsLoader');

  private _contractTxId: string;

  constructor(contractTxId: string) {
    super();
    this._contractTxId = contractTxId;
  }

  async load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    evaluationOptions: EvaluationOptions
  ): Promise<GQLEdgeInterface[]> {
    return await super.load(this._contractTxId, fromBlockHeight, toBlockHeight, evaluationOptions);
  }


  set contractTxId(value: string) {
    this._contractTxId = value;
  }
}
