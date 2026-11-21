# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

If Expo Go cannot download the project after scanning the QR code, stop the
development server and start it through a tunnel:

```bash
npm run start:tunnel -- --clear
```

Keep the terminal running, then scan the new QR code. On Android, if Expo Go
still shows the old error, force-close and reopen Expo Go before scanning again.
Clear Expo Go's cache only if needed; do not clear its app storage, which may
contain MediMate data.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Medication schedules

MediMate generates dose records for active **Meal-based** and **Fixed times**
medicines for today and the following 29 days. Each medicine's start and end
dates limit the generated range. New doses start as **Pending**; generating
again does not duplicate a medicine/date/time entry or change an existing dose
status. Interval-based schedules are not generated yet.
Changing meal times rebuilds future Pending meal-based doses while retaining
Taken, Skipped, and Missed records.

Pending doses appear on Home until confirmed as Taken. A dose still Pending
five minutes after its scheduled reminder time becomes **Missed**. Expiry is
checked while the app is active and when it returns to the foreground; if the
operating system suspends the app, the status update waits until JavaScript can
run again.

## Settings and reminders

Settings are saved separately for each profile. Users can choose light, dark,
or system appearance and enable or disable medication, missed-dose, refill,
appointment, and health-measurement notifications independently. Refill
notifications are scheduled three days before an active medicine's end date.
Health measurement reminders can be one-time or weekly, including weekend days.
Notifications are local to the device and require notification permission;
scheduled notifications are unavailable on web. Feedback opens the device
share sheet and is not sent automatically.

## AI chat

ChatWithMe uses the Supabase Edge Function in `supabase/functions/chatwithme/`
to call OpenAI. It sends the user's typed chat and recent conversational
context; it does not read or send SQLite medication or measurement records.
Local summary buttons and **HowWasYou** continue to use MediMate's existing
on-device data. Chat transcripts remain in screen memory only. Supabase Auth
persists an anonymous session on the device so the function can require a user
JWT. Typed messages are processed by OpenAI and are subject to its current
data-handling terms; no MediMate health records are automatically included.

### Set up Supabase and OpenAI

1. Create a Supabase project at [database.new](https://database.new). In
   **Project Settings → API**, copy the project's URL and **publishable key**
   (the key beginning `sb_publishable_`). Do not use a secret/service-role key
   in the app.
2. In **Authentication → Sign In / Providers**, enable **Allow anonymous
   sign-ins**. MediMate creates a pseudonymous Supabase Auth user on first chat;
   no email or password is requested. That identity is stored on the device.
   Clearing the app's data or reinstalling can lose the anonymous identity and
   create a new one.
3. Create an OpenAI API key in your OpenAI account. Set an appropriate usage
   limit there. Never put this key in the app, in an `EXPO_PUBLIC_` variable,
   or in this repository.
4. Copy `supabase/functions/.env.example` to
   `supabase/functions/.env` and add the OpenAI key. This local file is ignored
   by Git. Or set `OPENAI_API_KEY` under **Edge Functions → Secrets** in the
   Supabase Dashboard. Optionally set `OPENAI_MODEL`; it defaults to
   `gpt-4o-mini`.
5. Install the project's dependencies with `npm install`, then authenticate
   and link the Supabase CLI to your own project:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   Replace `YOUR_PROJECT_REF` with the real reference from your Supabase
   dashboard. If you used the local secret file, upload it after linking:

   ```powershell
   npx supabase secrets set --env-file supabase/functions/.env
   ```

6. Deploy the function without requiring Docker:

   ```powershell
   npx supabase functions deploy chatwithme --use-api
   ```

   The config disables Supabase's platform-level JWT check for **only**
   `chatwithme`, because that check rejected this project's asymmetric JWTs.
   Authentication remains required inside the function: its pinned
   `@supabase/server@1.9.2` `withSupabase({ auth: "user" })` middleware verifies
   the signature against the project's JWKS, token expiration, issuer
   (`<project URL>/auth/v1`), and `authenticated` audience before the handler
   runs. The handler also requires a user ID. Missing or invalid tokens are
   rejected; do not remove this middleware or set another function's
   `verify_jwt` to `false`. The function validates message roles and lengths,
   accepts only chat messages, adds medical-safety instructions, and returns
   actionable messages for common OpenAI key, quota, rate-limit, and model
   errors without exposing provider details or the OpenAI secret. It does not
   access SQLite or save chat history.
7. Copy the root `.env.example` to `.env.local` and fill in the exact Supabase
   project URL and publishable key from **Project Settings → API**:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=<your actual Supabase project URL>
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your actual sb_publishable_ key>
   ```

   These two values are public client configuration; the OpenAI key is not.
   Restart Expo with `npx expo start --clear` and reload the app.

### Verify the setup

1. Run the focused Edge Function validation tests locally:

   ```powershell
   npm run test:chat
   ```

2. Verify the function's JWT checks with synthetic ES256 tokens:

   ```powershell
   npm run test:edge-auth
   ```

   These tests exercise the actual `withSupabase` handler and do not call
   Supabase or OpenAI with real credentials.
3. In ChatWithMe, ask a non-sensitive general question, then ask a follow-up
   about the previous answer. This checks the deployed function and in-memory
   conversation context. The app sends up to the latest 12 conversational
   messages.
4. Use a local summary button and confirm it still works independently. Its
   local-only messages are excluded from requests to OpenAI.
5. Check the Supabase function logs for invocation errors. Do not share API
   keys or test with private health information.

An actual cloud connection cannot be verified until you create a Supabase
project, configure its OpenAI secret, deploy the function, and provide the
project URL and publishable key in your local `.env.local`. No project URL or
secret is included in this repository. Anonymous sign-in authenticates users
but is not a per-user usage quota; monitor OpenAI usage and set provider limits.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
