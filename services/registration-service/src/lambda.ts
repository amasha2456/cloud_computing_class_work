import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: process.env.AWS_REGION || "us-east-2" });

type LowSeatsNotification = {
  eventId: string;
  eventTitle: string;
  attendeeName: string;
  email: string;
  remainingSeats: number;
};

export async function triggerLowSeatsNotification(details: LowSeatsNotification) {
  const command = new InvokeCommand({
    FunctionName: process.env.LOW_SEATS_LAMBDA_NAME,
    InvocationType: "Event",
    Payload: Buffer.from(
      JSON.stringify({
        ...details,
        threshold: Number(process.env.SEATS_AVAILABLE_THRESHOLD),
        timestamp: new Date().toISOString(),
      }),
    ),
  });

  return client.send(command);
}
