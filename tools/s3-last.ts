import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

async function getLast(contractId: string) {
  const client = new S3Client({
    region: 'eu-north-1'
  });
  const command = new ListObjectsV2Command({
    Bucket: 'warp-state-cache',
    Prefix: `state/${contractId}/`
  });
  const response = await client.send(command);

  const result = response.Contents[response.Contents.length - 1];
  console.log(result);
}

getLast('5Yt1IujBmOm1LSux9KDUTjCE7rJqepzP7gZKf_DyzWI').catch((e) => console.error(e));
