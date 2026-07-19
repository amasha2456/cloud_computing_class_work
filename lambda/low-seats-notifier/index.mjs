import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({});

export const handler = async (event) => {
  const eventId = event?.eventId ?? "unknown";
  const remainingSeats = event?.remainingSeats ?? "unknown";
  const threshold = event?.threshold ?? "unknown";
  const timestamp = event?.timestamp ?? new Date().toISOString();

  const notifyEmail = process.env.SES_FROM_EMAIL;

  const command = new SendEmailCommand({
    Source: notifyEmail,
    Destination: {
      ToAddresses: [notifyEmail],
    },
    Message: {
      Subject: {
        Data: `Low Seats Alert: ${eventId}`,
      },
      Body: {
        Html: {
          Data: `
            <p>An event has dropped below the seats-available threshold.</p>
            <ul>
              <li><strong>Event ID:</strong> ${eventId}</li>
              <li><strong>Seats remaining:</strong> ${remainingSeats}</li>
              <li><strong>Threshold:</strong> ${threshold}</li>
              <li><strong>Timestamp:</strong> ${timestamp}</li>
            </ul>
          `,
        },
        Text: {
          Data: `Low seats alert for event ${eventId}. Remaining: ${remainingSeats} (threshold: ${threshold}) at ${timestamp}.`,
        },
      },
    },
  });

  const result = await sesClient.send(command);

  console.log("Low-seats notification sent", {
    eventId,
    remainingSeats,
    messageId: result.MessageId,
  });

  return {
    statusCode: 200,
    messageId: result.MessageId,
  };
};
