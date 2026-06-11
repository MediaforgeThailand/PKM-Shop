$ErrorActionPreference = 'Stop'

function Read-DotEnv($path) {
  $vars = @{}

  if (-not (Test-Path $path)) {
    return $vars
  }

  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }

  return $vars
}

$envLocal = Read-DotEnv '.env.local'

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN) -and -not [string]::IsNullOrWhiteSpace($envLocal['SUPABASE_ACCESS_TOKEN'])) {
  $env:SUPABASE_ACCESS_TOKEN = $envLocal['SUPABASE_ACCESS_TOKEN']
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
  throw 'Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens and set it as an environment variable or in .env.local.'
}

$supabaseUrl = $envLocal['EXPO_PUBLIC_SUPABASE_URL']

if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
  throw 'Missing EXPO_PUBLIC_SUPABASE_URL in .env.local.'
}

$projectRef = ([Uri]$supabaseUrl).Host.Split('.')[0]

Write-Output "Deploying MiraCare v2 edge functions to Supabase project $projectRef"
npx supabase functions deploy chat-orchestrator --project-ref $projectRef
npx supabase functions deploy fact-extractor --project-ref $projectRef
npx supabase functions deploy admin-order-action --project-ref $projectRef
npx supabase functions deploy referrer-order --project-ref $projectRef
npx supabase functions deploy line-webhook --project-ref $projectRef --no-verify-jwt
npx supabase functions deploy lab-ingest --project-ref $projectRef
npx supabase functions deploy wearable-ingest --project-ref $projectRef
