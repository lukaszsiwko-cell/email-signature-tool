# Post-login Signature Home

The existing source of semantic colors is `src/styles/global.css`. The authenticated home extends its `primary` role; no second theme or component system is introduced.

| Token | Light | Dark |
| --- | --- | --- |
| `--primary` | `oklch(0.48 0.14 155)` | `oklch(0.76 0.15 155)` |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.18 0.025 155)` |
| `--ring` | `oklch(0.54 0.14 155)` | `oklch(0.76 0.14 155)` |

The signature preview is a clearly labeled sample. It uses the existing Lucide icon package and project components; it does not imply that the sample belongs to the signed-in user.