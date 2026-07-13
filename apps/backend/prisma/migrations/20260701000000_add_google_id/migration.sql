-- Migration: Google Sign-In support

-- Google account identifier (OAuth "sub" claim), linked after phone/OTP
-- verification since phone remains the required unique identity.
ALTER TABLE "User" ADD COLUMN "google_id" TEXT;

CREATE UNIQUE INDEX "User_google_id_key" ON "User"("google_id");
