CREATE TABLE IF NOT EXISTS events (
  eventId TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  dateTime TIMESTAMP NOT NULL,
  ticketPrice NUMERIC NOT NULL,
  capacity INTEGER NOT NULL,
  seatsAvailable INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  programId TEXT PRIMARY KEY,
  sessionName TEXT NOT NULL,
  track TEXT NOT NULL,
  speakerName TEXT NOT NULL,
  dateTime TIMESTAMP NOT NULL,
  duration TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registration (
  registrationId TEXT PRIMARY KEY,
  eventId TEXT NOT NULL REFERENCES events(eventId),
  attendeeName TEXT NOT NULL,
  email TEXT NOT NULL,
  ticketcount INTEGER NOT NULL,
  timeStamp TIMESTAMP NOT NULL
);
