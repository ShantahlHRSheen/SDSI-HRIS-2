# Messages and Meetings — setup

Company chat (**Messages**, `/chat`) and video calls (**Meetings**, `/meetings`) run inside the HRIS. They use the same login, the same employee records and the company's existing Supabase project. They are on for SDSI only (`chat: true` in `lib/companies.ts`).

## 1. Database (SQL Editor)

Run these in the SDSI project's **SQL Editor**, in this order. Each one is safe to run again.

| File | What it adds | SDSI |
|---|---|---|
| `supabase/migrate_phase73_messaging.sql` | Chats, messages, meetings, notes, recordings, chat photos, Row Level Security, Realtime channel policies, the 3 private storage buckets | ✅ run |
| `supabase/migrate_phase75_recording_parts.sql` | 50 MB files; recordings uploaded in parts | ✅ run |
| `supabase/migrate_phase76_meeting_end.sql` | Calls end when the last person leaves; call message and notes summary posted to the chat | ✅ run |
| `supabase/migrate_phase74_recording_retention.sql` | Daily deletion of old recordings | after step 4 |

Every new table has Row Level Security. Employees only see the chats they're in and the meetings they take part in.

## 2. Install the Supabase CLI (once, on your computer)

```bash
npm install -g supabase
supabase login
supabase link --project-ref uqdcviycysculydmupfa
```

Run these from the HRIS project folder (the one that contains `supabase/functions`).

## 3. Calls: the Cloudflare TURN relay

Calls connect browsers directly. Some office and mobile networks block direct connections, so a TURN relay passes the call through. Without it, calls still work on most networks.

1. Sign in at **dash.cloudflare.com**, then go to **Realtime → TURN Server → Create**. Give the key a name, for example "SDSI HRIS".
2. Copy the **Turn Token ID** and the **API Token**. Cloudflare shows the token only once.
3. Save both as Edge Function secrets and deploy the function:

```bash
supabase secrets set CLOUDFLARE_TURN_KEY_ID=<Turn Token ID> CLOUDFLARE_TURN_API_TOKEN=<API Token>
supabase functions deploy turn-credentials
```

The key and token stay in Supabase. Signed-in employees only receive short-lived credentials (4 hours). Never put the key or token in the app's code or in Vercel.

**Cost:** the first 1,000 GB of relayed traffic each month is free, then $0.05 per GB. Most calls connect directly and use no relay traffic at all.

**To check it's working:** go to Supabase → **Edge Functions → turn-credentials → Logs**. Start a call; a request should appear with status 200. If you see `"turn": false`, the secrets aren't set.

## 4. Deleting old recordings (60 days)

1. Make a random secret, for example `openssl rand -hex 32`, and save it for the function:

   ```bash
   supabase secrets set PURGE_RECORDINGS_SECRET=<the random value>
   supabase functions deploy purge-recordings --no-verify-jwt
   ```

2. In the SQL Editor, save the project address and the same secret in Vault:

   ```sql
   select vault.create_secret('https://uqdcviycysculydmupfa.supabase.co', 'project_url');
   select vault.create_secret('<the same random value>', 'purge_recordings_secret');
   ```

3. Run `supabase/migrate_phase74_recording_retention.sql`. It deletes recordings older than the limit every day at 3:17 AM (Manila time).

**To change the number of days** (SQL Editor):

```sql
update chat_settings set recording_retention_days = 90;
```

**To check it ran:**

```sql
select * from cron.job_run_details order by start_time desc limit 5;
```

## 5. Storage limits

- Chat files: up to 50 MB each.
- Recordings: saved in parts of about 45 MB each, up to 2 GB per recording. Each recording plays back and downloads as one file.
- Chat photos: up to 2 MB, cropped to a square.
- The project's own upload limit (**Storage → Settings**) must be at least 50 MB. That is the Pro plan's default.

## 6. Good to know

- **Meeting size:** everyone connects to everyone, so video works best with up to 10 people. Quality adjusts automatically: 720p for 2–3 people, 480p for 4–6, 360p for 7 or more, and lower on weak connections.
- **Browsers:** current Chrome, Edge, Firefox and Safari. Screen sharing works on computers only.
- **Recordings** are `.webm` files. They play in Chrome, Edge and Firefox, and in VLC on any computer.
- **Recording runs in the browser** of the person who started it, so that person should stay in the meeting until it's saved. Everyone in the meeting sees a "Recording" banner.
- **Notifications:** each person clicks "Turn on notifications" once in Messages.

## 7. Turning it on for another company (LSMBiz, Daro)

1. Run phases 73, 75 and 76 (and 74 with its secrets) in that company's Supabase project.
2. Deploy both Edge Functions and set their secrets in that project.
3. Set `chat: true` for that company in `lib/companies.ts`.

## 8. How it was tested

- **Database:** a local Postgres copy of the migrations, 75 checks. Outsiders can't read, post to, upload to or listen in on a chat or meeting. Nobody can post as someone else or change membership directly. Only the owner removes group members; only the host ends a meeting for everyone.
- **Live SDSI**, with throwaway employee accounts in two or three browser windows using simulated cameras and microphones:
  - messaging: 21 checks
  - calls and meetings: 21 checks
  - 3-person meeting: 6 checks
  - phase 76: 6 checks
- All test accounts and test data were deleted afterward.
