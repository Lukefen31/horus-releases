# Store listings and review answers

Everything the App Store and Google Play ask for, written once, for the
three phone apps. Copy-paste into App Store Connect and Play Console.
Rules followed: the claims register (`web/docs/marketing-claims.md`): no
"approved", "certified" or "compliant" about ARUC, only "designed around
ARUC's Directives"; no cannabis prices, no consumption advice, no product
promotion; the member app says nothing about products (Directive 7); Horus
Home is 18+, never a marketplace, never legal advice. No em dashes.

Screenshots: `apps/store/screenshots/` (rendered by
`apps/store/render-screenshots.mjs`). Shared URLs:

| Field | Value |
|---|---|
| Marketing URL | https://horus.farm |
| Support URL | https://horus.farm/support |
| Privacy policy URL | https://horus.farm/privacy |
| Contact email | hello@horus.farm |
| Copyright | 2026 Horus |

App Store Connect records (team 23Y8G4D63V): Horus for Clubs (id 6818920843,
`farm.horus.club`), Horus Member (6818921024, `farm.horus.member`), Horus
Home (6818921205, `farm.horus.home`). "Horus" alone was taken on the App
Store; the name under the icon on the device is still "Horus".

---

## 1. Horus for Clubs (staff app)

**Distribution.** iOS: TestFlight for pilot clubs now; App Store or Apple
Business Manager custom app once the account is an organisation (see the
morning notes on guideline 5.1.1(ix)). Android: direct install of the signed
APK or a managed (private) Play app, not a public Play listing.

| Field | App Store | Google Play (if ever listed) |
|---|---|---|
| Name / title | Horus for Clubs | Horus for Clubs |
| Subtitle (30) / short description (80) | Grow, counter and compliance | Cultivation, dispensing records and compliance for licensed associations |
| Category | Business (secondary: Productivity) | Business |
| Age rating | 18+ (frequent references to regulated drugs, in a records context) | Mature 17+ / PEGI 18 |

**Promotional text (170):**
Everything a licensed association records, in one place: rooms and plants, lots and lab results, the counter, members, waste and the reports the regulator asks for.

**Keywords (100):**
association,club,compliance,cultivation,grow,inventory,dispensing,audit,records,harm reduction

**Description:**
Horus is the records system for licensed cannabis harm reduction associations. It joins the grow room, the counter, the club office and the regulator's paperwork in one place, so every plant, lot and gram is on the record.

For the grow team
- Seeds and clones received, plant counts by room, harvests and dry weights
- Waste recorded with a witness, composting logged
- Processing runs, where the club's permit allows them

For the counter
- Each member's allowance checked before anything is handed over
- Lots released only after their lab results
- Every dispense recorded against the member and the lot

For the office
- Members, dues and notices to members
- Two-step sign-in for every staff member
- An append-only, hash-chained audit trail: entries are corrected, never quietly edited
- Quarterly reconciliation and registers ready to export, with the reporting designed around ARUC's Directives

Access is by invitation from your association's Key Officer. Not a club yet? The sign-in screen opens a sample club with placeholder data so you can see every part of Horus first.

Horus is software for licensed operators. It does not sell, supply or promote cannabis.

**What's new (1.0.1):** The first release of Horus for iPhone and iPad.

**App Review notes:**
Horus for Clubs is business software for associations licensed by Malta's Authority for the Responsible Use of Cannabis (ARUC). Staff use it to keep the records the licence requires: cultivation, lab results, waste, member allowances and audit trails. It does not sell, deliver, advertise or arrange the purchase of anything; no payments happen in the app.

Accounts are created only by invitation from a licensed association, so there is no public sign-up. To see the full product without an invite, tap "Explore the sample club" on the sign-in screen: it opens a complete sample association with placeholder data, every screen working. A reviewer account on a demo association is available on request at hello@horus.farm.

Sign-in sends a one-time link and code by email; in the app, type the code. Two-step sign-in with an authenticator app follows, as the association rules require.

**App Privacy (App Store "nutrition label"):**
- Contact Info: Email address. Linked to the user. Used for App Functionality (sign-in). Not used for tracking.
- Identifiers: User ID. Linked. App Functionality.
- User Content: Other user content (records staff enter for their association). Linked. App Functionality.
- No tracking. No advertising. No data sold or shared with data brokers.

**Content rating questionnaire answers:** references to drugs: yes (frequent, informational, records of a regulated activity); sale of drugs facilitated: no; user-generated content shared publicly: no; location shared: no; gambling: no; violence, sex, profanity: no.

---

## 2. Horus Member

**Distribution.** iOS: TestFlight now; App Store once the account question is settled. Android: Google Play (public listing, after the closed test if the account is personal), and the APK on horus.farm/download.

| Field | App Store | Google Play |
|---|---|---|
| Name / title | Horus Member | Horus Member |
| Subtitle (30) / short description (80) | Your association account | Your member account: allowance, history, dues and notices from your association |
| Category | Lifestyle | Lifestyle |
| Age rating | 18+ | Mature 17+ / PEGI 18 |

**Promotional text (170):**
Your own records from your association, behind two-step sign-in: what you've received, what's left of your allowance, your dues and your association's notices.

**Keywords (100):**
member,association,club,account,allowance,dues,notices,records,two-step,privacy

**Description:**
Horus Member is your account with an association that keeps its records on Horus. It shows only your own records:

- What you've received, and when
- What's left of your monthly allowance
- Your membership dues and their status
- Notices from your association, like meeting dates and opening hours

Your association sets up your account and sends you an invite. You sign in with a one-time code by email and then the code from your authenticator app: two-step sign-in is required for members' pages.

There is nothing to buy or order in Horus Member, and no product list: associations are not allowed to promote what they distribute. Your association is responsible for your records; Horus keeps them on its behalf, in the EU.

No invite yet? The sign-in screen opens a sample member account with placeholder data.

For adults 18 and over who are members of a licensed association.

**What's new (1.0.1):** The first release of Horus Member for iPhone and iPad.

**App Review notes:**
Horus Member is the member's view of their own records at an association licensed by Malta's Authority for the Responsible Use of Cannabis (ARUC). It shows a member's allowance, history, dues and notices. It has no ordering, reservations, payments, product listings or promotion of any kind; Maltese rules forbid associations from promoting what they distribute, and the app is designed around that.

Accounts exist only by invitation from a licensed association. To see the app without an invite, tap "See a sample member account" on the sign-in screen: a full member account with placeholder data. A reviewer account is available on request at hello@horus.farm.

**App Privacy:**
- Contact Info: Email address. Linked. App Functionality (sign-in).
- Identifiers: User ID. Linked. App Functionality.
- Purchases: Purchase history (records of what the member received and the contribution recorded by the association). Linked. App Functionality. Shown only to the member.
- Other Data: membership dues status. Linked. App Functionality.
- No tracking, no advertising, nothing sold or shared.

**Google Play Data safety:** Collected: email address (account management, required), user IDs (account management), purchase history (app functionality). Encrypted in transit: yes. Users can request deletion: yes (through their association and hello@horus.farm). Shared with third parties: no. Data collection is required for the app to work.

**Content rating:** references to drugs: yes (records context, no promotion); facilitates purchase: no; user interaction or sharing: no.

---

## 3. Horus Home

**Distribution.** iOS: TestFlight now; App Store after review. Android: Google Play (public), and the APK on horus.farm/download. Also runs in any browser at horus.farm/home.

| Field | App Store | Google Play |
|---|---|---|
| Name / title | Horus Home | Horus Home: Grow Journal |
| Subtitle (30) / short description (80) | Grow journal and legal limits | A private grow journal for personal growers: plants, photos, reminders, limits |
| Category | Lifestyle (secondary: Productivity) | Lifestyle |
| Age rating | 18+ | Mature 17+ / PEGI 18 |

**Promotional text (170):**
A private journal for a few plants at home: entries with photos, reminders for lights and watering, and your local limits beside it all. Everything stays on your phone.

**Keywords (100):**
grow journal,garden,plants,diary,reminders,photos,tent,indoor,watering,feeding,home grow,private

**Description:**
Horus Home is a grow journal for personal growers. It keeps your plants, your entries and your reminders in one place, and keeps them on your phone.

- Plants with their stage, from seedling to curing, and a timeline of everything you've done
- Entries for watering, feeding, training, notes, photos, issues and harvest weights
- Your grow space: light schedule, size and the temperature and humidity you aim for at each stage
- Reminders for lights on and off, watering and anything else you set
- Your jurisdiction's home-grow plant count beside your plants, with where the rule comes from and when it was checked

Private by design. There is no account and no server: your journal lives on your device. Lock it with a PIN, export it to a file, or delete everything in one go.

What Horus Home is not
- For adults 18 and over only
- Never sells, lists or helps you buy or sell cannabis, seeds or clones
- Not a marketplace, and not a place to arrange a pickup or delivery
- Not medical or legal advice: rules change, so check the current rule where you live
- Separate from Horus's association software: no club can see your journal

**What's new (1.0.1):** The first release of Horus Home for iPhone and iPad.

**App Review notes:**
Horus Home is a private grow journal, like a gardening diary, for adults in places where growing a few plants at home is legal. It shows the home-cultivation plant limit for the user's chosen jurisdiction, with its source and a "not legal advice" note. It has no buying, selling, listings, delivery or meetups, no consumption content, and no account: all data stays on the device (export and delete are in Settings). The first screen asks the user to confirm they are 18 or older.

**App Privacy:** Data Not Collected. (Everything is stored on the device. Horus has no server for Horus Home and no analytics in it.)

**Google Play Data safety:** No data collected; no data shared. Data is stored only on the device and can be deleted by the user at any time.

**Content rating:** references to drugs: yes (cultivation records, no consumption); facilitates purchase: no; user interaction: no; location: no.

---

## Shared answers

- **Export compliance (both stores):** uses only standard HTTPS; `ITSAppUsesNonExemptEncryption = false` is in the Info.plist.
- **Ads:** none. **In-app purchases:** none. **Price:** free.
- **Countries:** Club and Member: Malta first (add others when associations there sign up); Home: the jurisdictions in its limits table, or worldwide with the 18+ gate (decide; Apple asks apps related to legal cannabis to be geo-restricted to where it's legal).
- **Sign-in for reviewers:** samples on both sign-in screens; a demo association reviewer account can be set up if a reviewer asks (needs a decision from Luke, see the morning notes).
