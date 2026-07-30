# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into Agentboard. PostHog is initialized in `src/client/main.tsx` with the `PostHogProvider` wrapping the entire app. Users are identified in `AuthenticatedLayout.tsx` on both login and page refresh using their user ID, name, and email. Sign-out calls `posthog.reset()` to end the identified session. Twelve events are captured across six files covering board management, Lock In focus sessions, flashcard study, and the inline canvas AI agent.

| Event name | Description | File |
|---|---|---|
| `oauth_sign_in_started` | User clicked the OAuth provider sign-in button to begin authentication. | `src/client/features/auth/routes/LoginRoute.tsx` |
| `user_signed_out` | User clicked the sign-out button and their session was ended. | `src/client/features/boards/routes/BoardsRoute.tsx` |
| `board_created` | User successfully created a new study board. | `src/client/features/boards/routes/BoardsRoute.tsx` |
| `board_archived` | User archived an existing board, removing it from the active list. | `src/client/features/boards/routes/BoardsRoute.tsx` |
| `board_restored` | User restored an archived board back to the active list. | `src/client/features/boards/routes/BoardsRoute.tsx` |
| `lock_in_session_started` | User started a Lock In focus session with a defined goal and duration. | `src/client/features/lock-in/LockInProvider.tsx` |
| `lock_in_session_ended` | User manually ended a Lock In focus session before it completed. | `src/client/features/lock-in/LockInProvider.tsx` |
| `lock_in_session_completed` | Lock In session completed after the AI coach confirmed the goal was met. | `src/client/features/lock-in/LockInProvider.tsx` |
| `flashcard_answer_checked` | User submitted their flashcard answer to be checked by AI grading. | `src/client/features/study/components/FlashcardAnswerPanel.tsx` |
| `flashcard_review_completed` | User confirmed their verdict and rating for a flashcard review attempt. | `src/client/features/study/components/FlashcardAnswerPanel.tsx` |
| `inline_prompt_submitted` | User submitted a prompt via the inline canvas AI agent (cmd+I). | `src/client/features/boards/components/InlinePrompt.tsx` |
| `craft_whiteboard_imported` | User initiated a Craft whiteboard import into a board. | `src/client/features/boards/routes/BoardsRoute.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/534484/dashboard/1927366)
- [Board creation over time](https://us.posthog.com/project/534484/insights/fBXxl2xv)
- [Flashcard study engagement](https://us.posthog.com/project/534484/insights/fJGPmiIK)
- [Lock In session completion funnel](https://us.posthog.com/project/534484/insights/k3A1OLyT)
- [Sign-in to first board funnel](https://us.posthog.com/project/534484/insights/oGkNn5Mx)
- [Lock In sessions by duration](https://us.posthog.com/project/534484/insights/fjScVFu7)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` and `VITE_PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — `AuthenticatedLayout` calls it on every mount where `session.data` is present, which covers both fresh logins (redirect back from OAuth) and page refreshes.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
