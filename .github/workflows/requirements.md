## Overall concept

- GHA workflow run for every new pull request to main
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

1) Implementation correctness — 1 means the intended behavior is materially incorrect or relevant edge cases fail; 10 means the change correctly implements the intended behavior and handles relevant edge cases.
2) Idiomaticity — 1 means the implementation conflicts with language, framework, or repository conventions; 10 means it consistently follows established idioms and patterns.
3) Complexity — 1 means the solution is unnecessarily complex or difficult to reason about; 10 means it is clear, straightforward, and proportionate.
4) Test / risk coverage — 1 means important behavior or likely regression risks lack adequate tests or safeguards; 10 means tests and safeguards thoroughly cover the important behavior and risks.
5) Documentation — 1 means relevant documentation is missing, misleading, or unclear; 10 means it accurately and sufficiently explains changed behavior and usage.
6) Security and safety — 1 means the change introduces serious unmitigated security, privacy, or user-safety risks; 10 means relevant risks are appropriately prevented or mitigated.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
