import { designClient } from "./client";
export const reviewsRepository = {
  list: (documentId: string, status?: "open" | "closed") =>
    designClient.reviews.list(documentId, status ? { status } : undefined),
  create: (
    documentId: string,
    input?: {
      shareLink?: boolean;
      allowComments?: boolean;
      shareLinkTtlMinutes?: number;
    },
  ) => designClient.reviews.create(documentId, input),
  close: (sessionId: string) => designClient.reviews.close(sessionId),
  redeem: (token: string) => designClient.reviewLink(token).context(),
};
