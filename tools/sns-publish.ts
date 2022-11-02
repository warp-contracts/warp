import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

async function getLast(message: string) {
  const client = new SNSClient({
    region: 'eu-north-1'
  });
  const command = new PublishCommand({
    Message: message,
    TopicArn: 'arn:aws:sns:eu-north-1:731675056359:WarpContractUpdate'
  });
  const response = await client.send(command);
  console.log(response);
}

getLast('tst message').catch((e) => console.error(e));
