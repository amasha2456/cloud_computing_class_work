import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new LambdaClient({ region: process.env.AWS_REGION || "us-east-2" });

type SeatsUnavailableNotification = {
  eventId: string;
  eventTitle: string;
  attendeeName: string;
  to: string;
  ticketcount: number;
  remainingSeats: number;
};

export async function triggerSeatsUnavailableNotification(details: SeatsUnavailableNotification) {
  const command = new InvokeCommand({
    FunctionName: process.env.SEATS_UNAVAILABLE_LAMBDA_NAME,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(details)),
  });

  return client.send(command);
}

type RegistrationConfirmation = {
  to: string;
  attendeeName: string;
  eventTitle: string;
  ticketcount: number;
  remainingSeats: number;
  seatsLow: boolean;
};

export async function triggerRegistrationConfirmation(details: RegistrationConfirmation) {
  const command = new InvokeCommand({
    FunctionName: process.env.REGISTRATION_CONFIRMATION_LAMBDA_NAME,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(details)),
  });

  return client.send(command);
}
