const { Reference } = require('isolated-vm');
const Transaction = require('arweave/node/lib/transaction').default;

const transaction = {
  format: 2,
  id: '_0YqJWg12HsNw35uMjoa_UTMM6F_5dYXozBTwwb8Etg',
  last_tx: 'u67y8L9_jaA_90VTTWYoG0SRWNr35cwFhFt80P4viVgp-2350H9bpxas9hZE3CA1',
  owner:
    'xGx07uNnjitWsOSfKZC-ic74oXs9qDXU5QOsAis4V3tXk0krk5zUlGYu7SlZ-4xfNVA1QsHa_pOvlgE-0xGKJvMZRZYzlYcBDsnDJgLYQc5D2B2Ng4HQjLON-Gqsxl25Uj7-VSEeUgk5b2Q4SrAoVTKLWKEtuGDqwy5qKKCvNHYShYJHbmAsjQzwCwvfn2bqKv_zFUD4QeukihfDJbVyZaiev7GoE1NzTsqJ_V_eZ9tKV_5YVy-ZVU8a9dEeTnGJm2rT6z9aCcQwd9EqVYi7h8QCbKOn2r5K2NbD6V8xjQGHvODHMO0iHk2hLzcLbfDfyn_Ej-xZsHU6LBJCTeDBy_5kWtOVlYL_RH34UA1j_IYEMVDYnQBKo5laassByvkn7nODZiXesvw6TsXPYdrqrgIL7x4Td5QVK8UHXCGXOrtAlhxfzNWyjP0z5ezAsQpzGPgGI9OKgjmPIk4K6K88BoxNmJ_XFPV1DN8qZGsPSVz2N7XN9wFetDs4CMOGyDToTDEea77TsP1ykKMcXf2h-JCZlvzFEpxS_zMaRMcwV502zXN01oCR2QpUEISf_IzxQYXsjR_F75VPpUvfmDtPYf4ftQN1cZYiH68zxn74uO7DLqIa3nUXq_IrUP7SmEnbMgjzjElp0a_u62XtmgT3GQv7SBrQdzym3yhhM-3kcok',
  tags: [
    { name: 'QXBwLU5hbWU', value: 'U21hcnRXZWF2ZUFjdGlvbg' },
    { name: 'QXBwLVZlcnNpb24', value: 'MC4zLjA' },
    {
      name: 'Q29udHJhY3Q',
      value: 'RmRZNjhpWXFUdkE0MFUzNGFYUUJCWXNlR21JVW1MVi11NTdiVDdMWldtMA'
    },
    {
      name: 'SW5wdXQ',
      value:
        'eyJmdW5jdGlvbiI6InRyYW5zZmVyIiwidGFyZ2V0IjoidGhWQlBHbERjQ2ZSb0tiR1hIOGE1Q01ialdJWjN0SnJIdnNWSVc1MUN3cyIsInF0eSI6N30'
    }
  ],
  target: '',
  quantity: '0',
  data_size: '4',
  data: new Uint8Array([51, 52, 55, 56]),
  data_root: 'FP80kip8MrNBm-iBzL375KcqOK6TybHP949LZY89CoA',
  reward: '1681564',
  signature:
    'IspILlJqjWPBPISDAvGqt2bWvmsrCLhVkbSpx7-Ympe0GNTvXU29RkO6kV7qcqXCuABOkNWLPUdWkemK5RqqQQbQMRNeIj8x9Dgfiva4upMjeIyJkxqBldjZR_juzkxAEbv8kerzWFASIS56Wj6OeWdX0bMJ4HeJVMl99Uem74XyEAxnNb6wBGKnmCn_nsvuOIgNa5NN_7DIyQRgqu38MWYuzlQnU_pR6gLXfh5dnYliIh6D90n76IDZdzLa6-6-ScH8-7c336FKEoBfg8kw_fGkHRgFEogd8tZPL7siIn8uxmbjQj0nAUuuhXJZm5i8vuHkc-9OoLwqrjBis1QjbB0sOeLjdcYCe9hVWOc2fCgKZ6d9shgIW_20VPZG59b_F92th8NNEUU9xYm9hwq5P-ZlgAvH4o8A1oh1Hld9_a_ogexdt8urKvrt6f2xaYE4puDitN58KZFekb4T2uazI3pEEiQ30ivyn1Y4jba_3uaGyPe5QAYMYLMLtIRBP3o3ZlfvahaRDwfAqOiy2r2IiVc3wQeJNZfJAd02Uzv-48IiJzP5-SlLnpzl-qyBg1HXS8xIreBuHrSFX33nAhX4r2YcCcykAnC4BRlmTkTKVFv7BIP0B2DgTy5lkoVylTeM389cio-aBLSVXhqQ9hBKXBvQjBF9DSmLFucUD52gpKg',
  data_tree: []
};

console.log(Transaction);

let transaction1 = new Transaction(transaction);
const ref = new Reference(transaction1);

console.log(ref.getSync('get'));

//const tags = ref.getSync('get').applySync(undefined, ['tags']);
