export function hasEnoughSeats(ticketcount: number, seatsAvailable: number): boolean {
  return ticketcount <= seatsAvailable;
}

export function isBelowThreshold(seatsAvailable: number, threshold: number): boolean {
  return seatsAvailable < threshold;
}
