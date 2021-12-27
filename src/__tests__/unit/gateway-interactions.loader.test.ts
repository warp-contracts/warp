import { RedstoneGatewayInteractionsLoader, LoggerFactory } from '@smartweave';
import { GQLEdgeInterface } from '../../legacy/gqlResult';

const responseData = {
  paging: {
    total: '1',
    limit: 500,
    items: 1,
    page: 1,
    pages: 1
  },
  interactions: [
    {
      status: 'confirmed',
      confirming_peers: '94.130.135.178,159.203.49.13,95.217.114.57',
      confirmations: '172044,172044,172044',
      interaction: {
        id: 'XyJm1OERe__Q-YcwTQrCeYsI14_ylASey6eYdPg-HYg',
        fee: {
          winston: '48173811033'
        },
        tags: [],
        block: {
          id: 'w8y2bxCQd3-26lvvy2NOt6Qz0kVooN9h4rwy6UIeC5mEfVnbftqcnWEavZfT14vY',
          height: 655393,
          timestamp: 1617060107
        },
        owner: {
          address: 'oZjQWwcTYbEvnwr6zkxFqpEoDTPvWkaL3zO3-SFq2g0'
        },
        parent: null,
        quantity: {
          winston: '0'
        },
        recipient: ''
      }
    },
    {
      status: 'confirmed',
      confirming_peers: '94.130.135.178,159.203.49.13,95.217.114.57',
      confirmations: '172044,172044,172044',
      interaction: {
        id: 'XyJm1OERe__Q-YcwTQrCeYsI14_ylASey6eYdPg-HYg',
        fee: {
          winston: '48173811033'
        },
        tags: [],
        block: {
          id: 'w8y2bxCQd3-26lvvy2NOt6Qz0kVooN9h4rwy6UIeC5mEfVnbftqcnWEavZfT14vY',
          height: 655393,
          timestamp: 1617060107
        },
        owner: {
          address: 'oZjQWwcTYbEvnwr6zkxFqpEoDTPvWkaL3zO3-SFq2g0'
        },
        parent: null,
        quantity: {
          winston: '0'
        },
        recipient: ''
      }
    }
  ]
};

const responseDataPaging = {
  paging: {
    total: '5',
    limit: 500,
    items: 1,
    page: 1,
    pages: 5
  },
  interactions: []
};

LoggerFactory.INST.logLevel('error');

const contractId = 'SJ3l7474UHh3Dw6dWVT1bzsJ-8JvOewtGoDdOecWIZo';
const fromBlockHeight = 600000;
const toBlockHeight = 655393;
const baseUrl = `http://baseUrl/gateway/interactions?contractId=SJ3l7474UHh3Dw6dWVT1bzsJ-8JvOewtGoDdOecWIZo&from=600000&to=655393`;
const fetchMock = jest
  .spyOn(global, 'fetch')
  .mockImplementation(
    () => Promise.resolve({ json: () => Promise.resolve(responseData), ok: true, status: 200 }) as Promise<Response>
  );

describe('RedstoneGatewayInteractionsLoader -> load', () => {
  it('should be called with baseUrl devoid of trailing slashes', async () => {
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl/');

    expect(loader['baseUrl']).toBe('http://baseUrl');
  });
  it('should return correct number of interactions', async () => {
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl');
    const response: GQLEdgeInterface[] = await loader.load(contractId, fromBlockHeight, toBlockHeight);
    expect(fetchMock).toHaveBeenCalled();
    expect(response.length).toEqual(2);
  });
  it('should be called with correct params', async () => {
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl');
    await loader.load(contractId, fromBlockHeight, toBlockHeight);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=1`);
  });
  it('should be called accordingly to the amount of pages', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        Promise.resolve({
          json: () => Promise.resolve(responseDataPaging),
          ok: true,
          status: 200
        }) as Promise<Response>
    );
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl');
    await loader.load(contractId, fromBlockHeight, toBlockHeight);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=1`);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=2`);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=3`);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=4`);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=4`);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
  it('should be called with confirmationStatus set to "confirmed"', async () => {
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl', { confirmed: true });
    await loader.load(contractId, fromBlockHeight, toBlockHeight);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=1&confirmationStatus=confirmed`);
  });
  it('should be called with confirmationStatus set to "not_corrupted"', async () => {
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl', { notCorrupted: true });
    await loader.load(contractId, fromBlockHeight, toBlockHeight);
    expect(fetchMock).toBeCalledWith(`${baseUrl}&page=1&confirmationStatus=not_corrupted`);
  });
  it('should throw an error in case of timeout', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject({ status: 504, ok: false }));
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl');
    try {
      await loader.load(contractId, fromBlockHeight, toBlockHeight);
    } catch (e) {
      expect(e).toEqual(new Error('Unable to retrieve transactions. Redstone gateway responded with status 504.'));
    }
  });
  it('should throw an error when request fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.reject({ status: 500, ok: false, body: { message: 'request fails' } }));
    const loader = new RedstoneGatewayInteractionsLoader('http://baseUrl');
    try {
      await loader.load(contractId, fromBlockHeight, toBlockHeight);
    } catch (e) {
      expect(e).toEqual(new Error('Unable to retrieve transactions. Redstone gateway responded with status 500.'));
    }
  });
});
