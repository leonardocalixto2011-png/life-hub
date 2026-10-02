# Confidentiality incident register

**Internal document — not legal advice.** Québec's *Act respecting the
protection of personal information in the private sector* (as amended by
Law 25) requires every business to keep a register of confidentiality
incidents and to act on the ones that carry a risk of serious injury. This
file is the procedure and the template. Have the wording of any notice
checked by a lawyer before it goes out.

> **This repository is public.** Never write a real incident in this file.
> Keep the actual register in a private place (a private document or a
> private repository) and copy the template below into it. Nothing that
> identifies a person, an account or a balance belongs in git.

## 1. What counts as an incident

Any of these, involving personal information Life Hub holds:

- access that was not authorised by law;
- use that was not authorised by law;
- communication (disclosure) that was not authorised by law;
- loss of the information, or any other breach of its protection.

Examples for this app: a database credential or the `MAIL_TOKEN_ENCRYPTION_KEY`
leaked; a bug that showed one hub's content to another; an email sent to the
wrong person; a lost device holding a database export; `/api/health` reporting
`rls: "BYPASSED"` in production; a sub-processor (Vercel, Neon, Resend,
Anthropic, a mail provider) telling us they were breached.

**Every incident goes in the register — including the ones judged harmless.**

## 2. What to do, in order

1. **Contain it.** Rotate the exposed secret, disable the feature, take the
   deploy down if needed. Write down the time.
2. **Tell the person in charge of the protection of personal information**
   (`PRIVACY_OFFICER_TITLE` / `PRIVACY_OFFICER_EMAIL` in the environment). By
   default this is the person with the highest authority in the business.
3. **Establish the facts.** Which information, whose, how many people, from
   when to when, and whether it left our control.
4. **Assess the risk of serious injury** (section 3 below). Write the reasoning
   down even when the answer is "no".
5. **If there is a risk of serious injury**, with diligence:
   - notify the **Commission d'accès à l'information (CAI)** using its
     incident-declaration form;
   - notify **every person whose information is concerned**;
   - you *may* also notify anyone able to reduce the risk (for example a bank),
     sharing only what is needed for that, and record that you did.
6. **Reduce the risk** of injury and of it happening again. Record the measures.
7. **Fill in the register entry** (section 5) and keep it.

## 3. Assessing the risk of serious injury

Consider, at least:

- **How sensitive is the information?** In Life Hub the most sensitive are
  debt records (creditor, balance, **default status**), parsed email content,
  and mailbox credentials. Budget entries and subscription costs come next.
  A task title is usually low — unless it says something sensitive.
- **What could it be used for?** Fraud, identity theft, harm to reputation or
  credit, harassment, embarrassment within a household.
- **How likely is that?** Was it actually accessed, by whom, could they
  identify the people, was it encrypted, was it recovered?

"Serious injury" includes humiliation, damage to reputation or relationships,
financial loss, identity theft, a negative effect on a credit file, and loss
of employment or opportunities. If in doubt, treat it as a risk and notify.

## 4. What a notice must say

**To the CAI** — the facts known so far, even if incomplete; update it as you
learn more.

**To each person concerned** — in plain language, sent directly to them:

- a description of the information involved (or why it can't be described);
- a short account of what happened;
- the date or period of the incident (or an estimate);
- what we have done or will do to reduce the risk of injury;
- what they can do themselves to protect themselves (change a password, watch
  their credit file, revoke an app password, …);
- who to contact for more information.

A public notice may replace direct notices only where notifying directly could
cause more harm, would be an excessive hardship, or we have no contact details.

## 5. Register entry template

Copy this block for each incident. Keep entries for **at least five (5) years**
after the date we became aware of the incident. The CAI can ask for a copy of
the register at any time.

```
Incident no.:                (year-sequence, e.g. 2026-001)
Recorded by / date:

1. Personal information involved
   (categories — or why it cannot be described):

2. What happened
   (circumstances, in a few sentences):

3. When it happened
   (date or period; or best estimate):

4. When we became aware of it:

5. Number of people concerned
   (and how many live in Québec; or best estimate):

6. Risk of serious injury?            yes / no
   Reasoning (sensitivity, possible uses, likelihood):

7. If yes — notices sent
   CAI notified on:
   People concerned notified on:      (and how: email / in-app / public notice)
   Others notified to reduce the risk (who, when, what was shared):

8. Measures taken
   To contain it:
   To reduce the risk of injury:
   To prevent it happening again:

9. Closed on / by:
```

## 6. Where to look when establishing the facts

- `DATA-INVENTORY.md` — what is held, where it goes, who can see it.
- Vercel function logs and `ALERT_WEBHOOK_URL` alerts (`src/lib/observability.ts`).
- `GET /api/health` — the `rls` field says whether row-level security is in force.
- `npm run verify:isolation` — proves (or disproves) hub and privacy isolation.
- The `Consent` table — what each person had agreed to at the time.
- Sub-processor status pages and their own breach notices.

## 7. Review

Re-read this procedure once a year, and after every incident. Last reviewed:
2026-10-01.
