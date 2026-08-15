/** Image URL helpers, split from client.ts so the browser never imports the API client. */
export const posterUrl = (path: string, size: "w342" | "w500" = "w500") =>
  `https://image.tmdb.org/t/p/${size}${path}`;

export const profileUrl = (path: string, size: "w185" | "h632" = "w185") =>
  `https://image.tmdb.org/t/p/${size}${path}`;
