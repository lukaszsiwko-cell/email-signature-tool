# AI code reviewer

## Attended cost pilot

Run candidate models locally against maintainer-approved, representative JSON
inputs before configuring unattended reviews. Do not include credentials or
other data that is not approved for submission to the selected provider.

1. Install the isolated reviewer dependencies:

   ```powershell
   npm ci --prefix reviewer
   ```

2. Save an input JSON object outside the repository, for example as
   `$env:USERPROFILE\reviewer-pilot.json`. It must contain string fields named
   `title`, `body`, and `diff`:

   ```json
   {
     "title": "Representative change",
     "body": "Why the change was made",
     "diff": "diff --git a/example.ts b/example.ts\n..."
   }
   ```

3. Set the attended key and candidate model in the current PowerShell session,
   then pipe the JSON into the reviewer. The secure prompt avoids putting the
   key in a command literal or a tracked file:

   ```powershell
   $secureKey = Read-Host "OpenRouter API key" -AsSecureString
   $env:OPENROUTER_API_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
   $env:OPENROUTER_MODEL = "provider/candidate-model"
   Get-Content (Join-Path $env:USERPROFILE "reviewer-pilot.json") -Raw |
     npm run review --prefix reviewer
   Remove-Item Env:OPENROUTER_API_KEY
   Remove-Item Env:OPENROUTER_MODEL
   ```

   The validated review JSON is written to standard output. A JSON
   `review_usage` record is written to standard error for each successful run;
   it includes the model, input/output/total token counts, and
   `providerCostUsd`. A `null` field means the provider did not report that
   value; it is not a zero-cost result. Usage logging emits normalized numeric
   values rather than raw provider metadata or credentials.

4. While attending each run, record its model, reported token units, and
   provider cost, then compare them with the corresponding request in the
   OpenRouter dashboard. Use the results to select the production model and
   reconcile any missing or differing usage before proceeding.

## Production configuration and enable gate

The GitHub review job runs only when the repository variable
`AI_REVIEW_ENABLED` is exactly `true`; an unset or any other value skips the
job. Keep it set to `false` (or unset) by default. The workflow condition is a
fail-closed gate, not a substitute for completing the cost pilot.

After the attended pilot has selected a model and reconciled its reported
usage, configure production manually in GitHub repository **Settings >
Secrets and variables > Actions**:

- Add `OPENROUTER_API_KEY` as a secret using a dedicated production key. Never
  put the key in a variable, workflow file, or committed local file.
- Add `OPENROUTER_MODEL` as a variable containing the pilot-selected model ID.
- Keep `AI_REVIEW_ENABLED` as `false` while the key, model, and budget are
  being checked.

In OpenRouter, configure and verify a hard spend limit for the dedicated key
or its workspace. This is an **aggregate key/workspace cap**, not a per-review
limit; it does not guarantee that an individual review stays below a given
amount. Confirm the selected model and the budget's scope and value in the
provider dashboard. Only after the pilot, dashboard reconciliation, and
dedicated-key budget verification are complete—and the workflow is wired to
the production settings—may an operator change `AI_REVIEW_ENABLED` to
`true`. Until then, leave automatic reviews disabled.

## Pull request workflow

When enabled, the `AI Code Review` workflow reviews pull requests targeting
`main` when they are opened, updated, or reopened. It checks out the trusted
base commit before invoking the repository-local action. Pull requests from
forks are excluded: they do not run the reviewer or receive the OpenRouter
secret. The workflow also skips model execution unless the repository variable
`AI_REVIEW_ENABLED` is exactly `true`; keep it unset or set to `false` until
the cost pilot and budget checks above are complete.

The action updates its existing review comment and result labels before the
workflow reports the verdict. A `pass` verdict completes the review check; a
`fail` verdict fails it after those updates. Operational errors also fail the
check rather than being treated as a successful review.

To retry a review on a same-repository pull request, add the `ai-cr:review`
label. Only adding that label triggers a retry; the action consumes it, so
another retry requires adding the label again. Adding other labels does not
run the reviewer.

To make the review a merge requirement, configure branch protection or a
repository ruleset manually and require the `AI Code Review / review` status
check. The check can be skipped while reviews are disabled or for fork pull
requests, so requiring it is an explicit repository policy decision.
