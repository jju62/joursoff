<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.
https://ai.studio/apps/9f9146b0-5433-4d00-9cee-a6d0f4764ab5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase Duo sharing

To enable calendar sharing, apply
[`supabase/migrations/20261006153000_user_relationships.sql`](./supabase/migrations/20261006153000_user_relationships.sql)
to the Supabase project (for example, through the Supabase SQL Editor or the Supabase CLI).
It creates the `user_relationships` table, participant-only RLS, and authenticated RPC
functions for creating/redeeming invitations, reading the linked calendar, and unlinking.

The shared-calendar RPC returns only leave dates, leave types, and half-day periods; it
does not return leave labels, account email addresses, or CP/RTT balances.