-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('GRANT', 'TOPUP', 'USAGE', 'ADJUST', 'REFUND');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('AI', 'DIRECT', 'GROUP', 'HUB');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "CreditWallet" (
    "userId" TEXT NOT NULL,
    "balanceMillicents" INTEGER NOT NULL DEFAULT 0,
    "welcomeGrantedAt" TIMESTAMP(3),
    "monthlyLimitCents" INTEGER,
    "lowBalanceNotifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "amountMillicents" INTEGER NOT NULL,
    "rawCostMillicents" INTEGER,
    "feature" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "hubId" TEXT,
    "note" TEXT,
    "externalRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "title" TEXT,
    "hubId" TEXT,
    "createdById" TEXT,
    "uniqueKey" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "mutedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT,
    "role" "ChatRole" NOT NULL DEFAULT 'USER',
    "body" TEXT NOT NULL,
    "content" JSONB,
    "meta" JSONB,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditEntry_externalRef_key" ON "CreditEntry"("externalRef");

-- CreateIndex
CREATE INDEX "CreditEntry_userId_createdAt_idx" ON "CreditEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_uniqueKey_key" ON "Conversation"("uniqueKey");

-- CreateIndex
CREATE INDEX "Conversation_createdById_kind_lastMessageAt_idx" ON "Conversation"("createdById", "kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_hubId_idx" ON "Conversation"("hubId");

-- CreateIndex
CREATE INDEX "ConversationMember_userId_idx" ON "ConversationMember"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Row-level security: Claude credits.
--
-- CreditWallet and CreditEntry are money. Every read and write goes through
-- lib/credits.ts on the owner-role client, keyed on the signed-in user's id
-- from the session (or a Stripe webhook whose signature was verified). The
-- app role has no reason to touch them: no grant, and RLS on with no policy
-- as a second wall, like AppInvite.
-- ---------------------------------------------------------------------------
ALTER TABLE "CreditWallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditEntry" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "CreditWallet" FROM app_user;
    REVOKE ALL ON "CreditEntry" FROM app_user;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: chats.
--
-- Who can see a conversation:
--   AI, DIRECT, GROUP  the people with a ConversationMember row in it.
--   HUB                every ACTIVE member of its hub (membership implied).
--
-- ConversationMember's own policy needs the same "can I see this
-- conversation?" question, and Conversation's needs ConversationMember: two
-- policies that query each other's tables recurse ("infinite recursion
-- detected in policy"). The question is therefore asked once, in a SECURITY
-- DEFINER function owned by the migration (table-owner) role, which reads the
-- two tables without RLS. It only ever answers for app.user_id, so it can't
-- be used to probe anyone else's chats.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION chat_can_see(conv_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c.id = conv_id
      AND (
        (c.kind <> 'HUB' AND EXISTS (
          SELECT 1 FROM "ConversationMember" m
          WHERE m."conversationId" = c.id
            AND m."userId" = current_setting('app.user_id', true)
        ))
        OR
        (c.kind = 'HUB' AND EXISTS (
          SELECT 1 FROM "HubMembership" h
          WHERE h."hubId" = c."hubId"
            AND h."userId" = current_setting('app.user_id', true)
            AND h.status = 'ACTIVE'
        ))
      )
  );
$$;

-- The assistant's replies are written in the person's own session, with no
-- author. Only allowed in an AI chat the person started.
CREATE OR REPLACE FUNCTION chat_is_my_ai(conv_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Conversation" c
    WHERE c.id = conv_id AND c.kind = 'AI'
      AND c."createdById" = current_setting('app.user_id', true)
  );
$$;

REVOKE ALL ON FUNCTION chat_can_see(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION chat_is_my_ai(TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT EXECUTE ON FUNCTION chat_can_see(TEXT) TO app_user;
    GRANT EXECUTE ON FUNCTION chat_is_my_ai(TEXT) TO app_user;
  END IF;
END
$$;

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConversationMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;

-- Conversation. Every conversation is created on the owner-role client by
-- lib/chat.ts: a DIRECT/GROUP chat seats other people (after checking they
-- share a hub with the creator), a hub chat belongs to the hub, and even an AI
-- chat can't be inserted by the app role, because INSERT ... RETURNING has to
-- pass the SELECT policy and the creator's seat doesn't exist yet. So there is
-- no INSERT policy: the app role can't create one at all. UPDATE is the
-- lastMessageAt bump and renaming.
CREATE POLICY conversation_select ON "Conversation" FOR SELECT
USING (chat_can_see(id));

CREATE POLICY conversation_update ON "Conversation" FOR UPDATE
USING (chat_can_see(id))
WITH CHECK (chat_can_see(id));

-- Only an AI chat can be deleted by its owner; people's chats are left, not
-- deleted out from under the others.
CREATE POLICY conversation_delete ON "Conversation" FOR DELETE
USING (kind = 'AI' AND "createdById" = current_setting('app.user_id', true));

-- ConversationMember. You see the seats of chats you can see. You may seat
-- only yourself (your own AI chat, or your read marker in a hub chat), move
-- only your own read marker / mute, and remove only yourself (leave).
CREATE POLICY conversation_member_select ON "ConversationMember" FOR SELECT
USING (chat_can_see("conversationId"));

CREATE POLICY conversation_member_insert ON "ConversationMember" FOR INSERT
WITH CHECK (
  "userId" = current_setting('app.user_id', true)
  AND (chat_can_see("conversationId") OR chat_is_my_ai("conversationId"))
);

CREATE POLICY conversation_member_update ON "ConversationMember" FOR UPDATE
USING ("userId" = current_setting('app.user_id', true))
WITH CHECK ("userId" = current_setting('app.user_id', true));

CREATE POLICY conversation_member_delete ON "ConversationMember" FOR DELETE
USING ("userId" = current_setting('app.user_id', true));

-- ChatMessage. Read what you can see. Write in your own name, or as the
-- assistant in your own AI chat. Edit or delete only your own words (and the
-- assistant's in your own AI chat, which is how a conversation is cleared).
CREATE POLICY chat_message_select ON "ChatMessage" FOR SELECT
USING (chat_can_see("conversationId"));

CREATE POLICY chat_message_insert ON "ChatMessage" FOR INSERT
WITH CHECK (
  chat_can_see("conversationId")
  AND (
    ("authorId" = current_setting('app.user_id', true) AND role = 'USER')
    OR ("authorId" IS NULL AND role = 'ASSISTANT' AND chat_is_my_ai("conversationId"))
  )
);

CREATE POLICY chat_message_update ON "ChatMessage" FOR UPDATE
USING (
  "authorId" = current_setting('app.user_id', true)
  OR ("authorId" IS NULL AND chat_is_my_ai("conversationId"))
)
WITH CHECK (
  "authorId" = current_setting('app.user_id', true)
  OR ("authorId" IS NULL AND chat_is_my_ai("conversationId"))
);

CREATE POLICY chat_message_delete ON "ChatMessage" FOR DELETE
USING (
  "authorId" = current_setting('app.user_id', true)
  OR ("authorId" IS NULL AND chat_is_my_ai("conversationId"))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Conversation" TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ConversationMember" TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ChatMessage" TO app_user;
  END IF;
END
$$;
