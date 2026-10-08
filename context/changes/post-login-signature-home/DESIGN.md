# Post-login Signature Home

The existing source of semantic colors is `src/styles/global.css`. The authenticated home extends its `primary` role; no second theme or component system is introduced.

| Token                  | Light                  | Dark                    |
| ---------------------- | ---------------------- | ----------------------- |
| `--primary`            | `oklch(0.48 0.14 155)` | `oklch(0.76 0.15 155)`  |
| `--primary-foreground` | `oklch(0.985 0 0)`     | `oklch(0.18 0.025 155)` |
| `--ring`               | `oklch(0.54 0.14 155)` | `oklch(0.76 0.14 155)`  |

The signature preview is a clearly labeled sample. It uses the existing Lucide icon package and project components; it does not imply that the sample belongs to the signed-in user.

## Public And Authenticated Theme Alignment (2026-10-08)

The public home is the visual reference for both variants: `--background: #101d1a`, an emerald radial highlight, and a subtle diagonal grid. These existing public-home values now live in the shared `bg-brand` utility in `src/styles/global.css`. The legacy `bg-cosmic` utility delegates to it so existing routes inherit the same background. Dark-theme muted text is green-tinted rather than blue.

Both home variants use the same content width, spacing, heading sizes, and desktop breakpoint. Authentication changes the content and available actions, not the theme.

### State Verification

| State         | Verification                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Default       | Authenticated screenshots at 1440x1000 and 390x844; shared background confirmed through computed styles. |
| Hover         | Existing primary-token hover treatment preserved.                                                        |
| Focus-visible | Primary link focused in the browser; visible outline confirmed.                                          |
| Disabled      | N/A: the home only contains navigation links and sign-out.                                               |
| Error         | N/A: no data-loading or editable controls on the home.                                                   |
| Empty         | N/A: the labeled signature sample does not depend on department data.                                    |
| Loading       | N/A: the home is server-rendered without client-side data loading.                                       |

Production build passed. Both viewports had no horizontal overflow. The temporary local visual-test account was deleted after verification.
