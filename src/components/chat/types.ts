export type WireMessage = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  role: "USER" | "ASSISTANT";
  body: string;
  meta: unknown;
  createdAt: string;
};
