# Mira Health

Mobile-first health app scaffold built with Expo, React Native, TypeScript, Expo Router, and Supabase.

## Quick Start

```bash
npm install
copy .env.example .env
npm run start
```

Fill `.env` with the Supabase project URL and publishable key.

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

## Development

```bash
npm run android
npm run ios
npm run web
npm run typecheck
```

Use Expo Go for fast previews. Use EAS Build later when the app needs store-ready Android and iOS builds, custom native modules, push notifications, or team distribution.

## Stack Decision

- Expo + React Native keeps one TypeScript codebase for iOS and Android.
- Expo Router gives file-based navigation similar to web routing.
- Supabase covers Postgres, Auth, Storage, Edge Functions, Realtime, and RLS.
- `expo-secure-store` is used for persisted mobile auth sessions.

## Supabase

The first migration lives in `supabase/migrations/20260604000000_initial_health_schema.sql` and creates:

- `profiles`
- `health_logs`
- Row Level Security policies so authenticated users can only access their own records.

Do not put Supabase secret keys in the app. Mobile apps can safely include publishable keys only when RLS is correctly enabled.

## Health Data Notes

Before storing real health information, decide:

- consent flow and privacy policy
- data retention and deletion rules
- audit logging needs
- backup and recovery policy
- whether the product handles PHI/ePHI and needs HIPAA controls, BAA, and high-compliance Supabase configuration

## Repository Status

This repository is initialized for a new team project. Create remote hosting on GitHub/GitLab/Bitbucket, then push:

```bash
git remote add origin <repo-url>
git push -u origin main
```
