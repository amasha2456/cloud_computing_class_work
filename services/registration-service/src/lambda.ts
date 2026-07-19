import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: process.env.AWS_REGION || "us-east-2" });

export async function triggerLowSeatsNotification(
  eventId: string,
  remainingSeats: number,
) {
  const command = new InvokeCommand({
    FunctionName: process.env.LOW_SEATS_LAMBDA_NAME,
    InvocationType: "Event",
    Payload: Buffer.from(
      JSON.stringify({
        eventId,
        remainingSeats,
        threshold: Number(process.env.SEATS_AVAILABLE_THRESHOLD),
        timestamp: new Date().toISOString(),
      }),
    ),
  });

  return client.send(command);
}
