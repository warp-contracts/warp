import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'; // ES Modules import

async function main() {
  const client = new S3Client({
    region: 'eu-north-1'
  });
  const command = new PutObjectCommand({
    Body: 'some data',
    Bucket: 'warp-state-cache',
    Key: 'tst/testwrite'
  });
  const response = await client.send(command);
  console.log(response);
}

main().catch((e) => console.error(e));
