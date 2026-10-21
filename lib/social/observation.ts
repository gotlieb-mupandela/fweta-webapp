export type ViewObservation = {
  views: number;
  /** null means the provider could not tell. Do not treat that as deleted. */
  live: boolean | null;
  likes: number | null;
  comments: number | null;
  authorHandle: string | null;
  authorBio: string | null;
  publishedAt: string | null;
  providerId: string;
};
