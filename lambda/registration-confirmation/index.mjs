import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({});

export const handler = async (event) => {
  const to = event?.to;
  const attendeeName = event?.attendeeName || "there";
  const eventTitle = event?.eventTitle || "the event";
  const ticketcount = event?.ticketcount ?? "your";
  const remainingSeats = event?.remainingSeats;
  const seatsLow = Boolean(event?.seatsLow);

  const sourceEmail = process.env.SES_FROM_EMAIL;

  const lowSeatsHtml = seatsLow
    ? `<p>Heads up &mdash; only <strong>${remainingSeats}</strong> seat(s) remain for this event!</p>`
    : "";
  const lowSeatsText = seatsLow
    ? ` Heads up: only ${remainingSeats} seat(s) remain for this event!`
    : "";

  const command = new SendEmailCommand({
    Source: sourceEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: "Registration Confirmed",
      },
      Body: {
        Html: {
          Data: `
            <p>Dear ${attendeeName},</p>
            <p>Your registration for <strong>${eventTitle}</strong> is confirmed for ${ticketcount} ticket(s).</p>
            ${lowSeatsHtml}
            <p>We look forward to seeing you there!</p>
          `,
        },
        Text: {
          Data: `Dear ${attendeeName}, your registration for ${eventTitle} is confirmed for ${ticketcount} ticket(s).${lowSeatsText} We look forward to seeing you there!`,
        },
      },
    },
  });

  const result = await sesClient.send(command);

  console.log("Registration confirmation email sent", {
    to,
    eventTitle,
    messageId: result.MessageId,
  });

  return {
    statusCode: 200,
    messageId: result.MessageId,
  };
};
