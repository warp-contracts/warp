import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function getRange(contractId: string, from: string) {
  const client = new S3Client({
    region: 'eu-north-1'
  });
  const command = new ListObjectsV2Command({
    Bucket: 'warp-state-cache',
    Prefix: `state/${contractId}/`
  });
  const response = await client.send(command);
  let fromIndex = -1;
  const searchString = `state/${contractId}/${from}`;
  for (let i = 0; i < response.Contents.length; i++) {
    if (response.Contents[i].Key.startsWith(searchString)) {
      fromIndex = i;
      break;
    }
  }
  if (fromIndex === -1) {
    throw Error(`Element ${from} not found`);
  }
  const result = response.Contents.slice(fromIndex);
  console.log(result);
}

getRange('5Yt1IujBmOm1LSux9KDUTjCE7rJqepzP7gZKf_DyzWI', '000001047808').catch((e) => console.error(e));
