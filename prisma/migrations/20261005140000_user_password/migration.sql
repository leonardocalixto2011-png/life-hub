-- CreateTable
CREATE TABLE "UserPassword" (
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPassword_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserPassword" ADD CONSTRAINT "UserPassword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only, like AppInvite: password checks and changes run on the
-- owner-role client after their own checks (src/auth.ts, account actions).
-- The app role gets nothing, and RLS with no policy is the second wall.
ALTER TABLE "UserPassword" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "UserPassword" FROM app_user;
  END IF;
END
$$;
