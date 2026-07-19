import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({});

export const handler = async (event) => {
  const eventId = event?.eventId ?? "unknown";
  const eventTitle = event?.eventTitle || eventId;
  const attendeeName = event?.attendeeName || "there";
  const remainingSeats = event?.remainingSeats ?? "unknown";
  const threshold = event?.threshold ?? "unknown";
  const timestamp = event?.timestamp ?? new Date().toISOString();

  const sourceEmail = process.env.SES_FROM_EMAIL;
  const fallbackEmail = process.env.LOW_SEATS_NOTIFY_EMAIL || sourceEmail;
  const notifyEmail = event?.email || fallbackEmail;

  const command = new SendEmailCommand({
    Source: sourceEmail,
    Destination: {
      ToAddresses: [notifyEmail],
    },
    Message: {
      Subject: {
        Data: `Seats are running low: ${eventTitle}`,
      },
      Body: {
        Html: {
          Data: `
            <p>Hi ${attendeeName},</p>
            <p>Thanks for registering for <strong>${eventTitle}</strong> &mdash; heads up, this event is almost full!</p>
            <ul>
              <li><strong>Seats remaining:</strong> ${remainingSeats}</li>
              <li><strong>Threshold:</strong> ${threshold}</li>
              <li><strong>As of:</strong> ${timestamp}</li>
            </ul>
          `,
        },
        Text: {
          Data: `Hi ${attendeeName}, ${eventTitle} is almost full. Remaining: ${remainingSeats} (threshold: ${threshold}) as of ${timestamp}.`,
        },
      },
    },
  });

  const result = await sesClient.send(command);

  console.log("Low-seats notification sent", {
    eventId,
    remainingSeats,
    notifyEmail,
    messageId: result.MessageId,
  });

  return {
    statusCode: 200,
    messageId: result.MessageId,
  };
};
