# Test Accounts

All accounts use password: `TestPass123!`

## Users

| Username | Password | Role |
|---|---|---|
| `testuser_alice` | `TestPass123!` | Group chat admin · Snap group owner |
| `testuser_bob` | `TestPass123!` | Group chat & snap group member |
| `testuser_carol` | `TestPass123!` | Group chat & snap group member |
| `testuser_dana` | `TestPass123!` | Alice's friend only — not in any group |

## Friendships

- Alice ↔ Bob ✓
- Alice ↔ Carol ✓
- Bob ↔ Carol ✓
- Alice ↔ Dana ✓
- Dana is **not** friends with Bob or Carol

## Group Chat

- **Room id:** 4
- **Name:** `test group chat`
- **Members:** Alice (admin), Bob, Carol
- **Pre-seeded messages:** 5 messages across all 3 users
- Dana is **not** in this group

## Snap Group

- **Snap group id:** 1
- **Name:** `test snap group`
- **Owner:** Alice
- **Members:** Bob, Carol
- Dana is **not** in this group (useful for testing the "add to group" flow)

## Weekly Schedule

| Course | Days | Time | Room | Who |
|---|---|---|---|---|
| **CS101** — Intro to Computer Science | Tue + Thu | 10:00–11:30 | Tech Hall 201 | Alice, Bob, Carol |
| **MATH201** — Calculus II | Mon + Wed | 14:00–15:30 | Math Building 105 | Alice, Bob, Carol |
| **ENG301** — Technical Writing | Mon | 09:00–10:30 | Arts Hall 301 | Alice only |
| **PHYS101** — Physics I | Fri | 13:00–14:30 | Science Hall 110 | Alice only |
| **BIO201** — Intro to Biology | Tue | 08:00–09:30 | Bio Wing 102 | Bob only |
| **CHEM101** — General Chemistry | Thu | 14:00–15:30 | Chem Lab 204 | Bob only |
| **ART201** — Digital Art & Design | Wed | 09:00–10:30 | Studio 3B | Carol only |
| **HIST101** — World History I | Fri | 11:00–12:30 | Humanities 207 | Carol only |

Dana has no courses.

## What to Test

- **Group chat:** Log in as any of Alice/Bob/Carol → `/feed` → Groups section → `test group chat`
- **Snap group audience:** Log in as Alice → `/feed` → tap `+` (add snap) → pick a course → audience picker → `group` pill → `test snap group`
- **Snap group management:** Log in as Alice → `/profile` → snap groups accordion
- **Non-group friend:** Dana appears in Alice's feed/DM inbox but not in the group chat or snap group member lists — useful for testing "add member" flows
- **Shared classes card:** Open a DM or group chat with any of Alice/Bob/Carol — the side panel SharedClassesCard will show CS101 and MATH201 as shared
