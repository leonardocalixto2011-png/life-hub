/**
 * Google Maps links for a place on a trip. Plain module so the trip page
 * (server) and an item's page share one spelling of each URL.
 */
export function mapSearchUrl(where: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
}

/**
 * The keyless embed. Needs `frame-src https://www.google.com` in the CSP
 * (next.config.ts) and nothing else: no API key, no script on our page.
 */
export function mapEmbedUrl(where: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(where)}&output=embed`;
}
