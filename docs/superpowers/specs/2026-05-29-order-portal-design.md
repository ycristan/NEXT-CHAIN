# Order Portal — Design Spec
**Date:** 2026-05-29
**Status:** In review

---

## Overview

A customer-facing order portal integrated into the existing NEXT CHAIN WMS. Users log in with username + PIN and browse their assigned product catalog, build a cart, and submit wholesale orders with a desired delivery date. A single user (e.g. a driver) can be linked to multiple client accounts. Orders flow through a defined lifecycle managed by the Order Team and Warehouse Team inside the existing WMS.

---

## Architecture

**Approach:** Single app, role-based layouts (Option A).

When `profile.role === 'client'`, `App.tsx` renders `<ClientPortalLayout>` — a completely separate layout with its own navigation, routes, and visual design. Internal WMS users see the existing `<InternalLayout>` plus a new **Orders** module in the sidebar.

```
App.tsx
├── role = 'client'   → <ClientPortalLayout>
│     ├── /portal/catalog        (browse + search + cart)
│     ├── /portal/orders         (my orders + status tracking)
│     └── /portal/order/:id      (order detail + edit if editable)
│
└── role = admin/manager/operator/viewer → <InternalLayout>
      └── + Orders module in sidebar
            ├── /orders           (order queue — all teams)
            └── /orders/:id       (order detail + actions per stage)
```

Client user accounts are created manually by admin. No self-registration in pilot. Future: import from external client database.

---

## Authentication — Username + PIN

Client users log in with **username + 6-digit PIN** (not email/password).

**Implementation:** Supabase Auth is used internally. Admin generates a hidden email (`<username>@portal.nextchain.internal`) and uses the PIN as the Supabase Auth password. The login form collects only username + PIN; the app looks up the hidden email via a server-side lookup and calls `supabase.auth.signInWithPassword({ email, password: pin })`. The hidden email is never exposed to the user.

`profiles` stores:
- `portal_username` (text, unique) — the username shown/used at login
- `role = 'client'`

Admin creates each user by setting `portal_username` + generating the Supabase Auth account with hidden email + PIN.

---

## Client Account Model (Many-to-Many)

A **client account** represents a company. A **user** (profile) can be linked to one or more client accounts. This allows a driver, for example, to place orders on behalf of multiple companies.

```
profiles (user)  ──< client_account_users >──  client_accounts (company)
                                                      │
                                              client_buildings
                                              client_catalogs
                                              client_settings
```

**Login flow:**
```
Login (username + PIN)
  → linked to 1 account?  → Account auto-selected → Building Selector → Catalog
  → linked to N accounts? → Account Selector → Building Selector → Catalog
```

**Order visibility:** Each user sees only orders they personally submitted (`orders.ordered_by = auth.uid()`). There is no shared order history across users of the same account.

---

## Order Lifecycle

| # | Status | Actor | Description |
|---|---|---|---|
| 1 | `open_prep` | Client user | Submits order: items, desired delivery date, PO (optional), notes |
| 2 | `open` | Order Team | Reviews, verifies, sends to Warehouse |
| 3 | `picking` | Warehouse | Clicks "Start Picking" to begin separation |
| 4 | `dispatch` | Warehouse | Confirms picking complete |
| 5* | `outstanding` | Warehouse → Order Team | Reports unpicked items with reason; Order Team resolves with client |
| 5.1 | *(sub-action)* | Order Team | Creates Back Order or removes item from order |
| 6 | `transit` | Order Team | Order dispatched for delivery |
| 7 | `delivered` | Client user | Confirms receipt |

**Edit rule:** Orders are editable by the submitting user while `status` is `open_prep` or `open`. If edited during `open`, order reverts to `open_prep` for re-review. Orders in `picking` or later are locked.

---

## Data Model

### New Tables

#### `client_accounts`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `company_name` | text | |
| `region` | text | `'IE'` \| `'GB-NIR'` — determines holiday calendar |
| `allow_avulso` | boolean | Default false — allows unit-level ordering |
| `weekend_delivery` | boolean | Default false |
| `holiday_delivery` | boolean | Default false |
| `same_day_delivery` | boolean | Default false |
| `custom_cutoff_time` | time nullable | Overrides global cutoff if set |
| `is_active` | boolean | Default true |

#### `client_account_users`
Junction: user ↔ client account (many-to-many).

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid FK profiles | |
| `client_account_id` | uuid FK client_accounts | |
| PK: `(user_id, client_account_id)` | | |

#### `client_buildings`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_account_id` | uuid FK client_accounts | |
| `name` | text | "Predio 1", "Recepcao", etc. |
| `address` | text | |
| `contact_name` | text nullable | |
| `contact_phone` | text nullable | |
| `delivery_instructions` | text nullable | |
| `is_active` | boolean | Default true |

#### `client_catalogs`
| Column | Type | Notes |
|---|---|---|
| `client_account_id` | uuid FK client_accounts | |
| `brand_id` | uuid FK brands | |
| PK: `(client_account_id, brand_id)` | | |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_number` | text unique | Auto-generated (e.g. ORD-2026-0001) |
| `client_account_id` | uuid FK client_accounts | The company this order belongs to |
| `building_id` | uuid FK client_buildings | Required |
| `ordered_by` | uuid FK profiles | The user who submitted the order |
| `status` | text enum | `open_prep` \| `open` \| `picking` \| `dispatch` \| `outstanding` \| `transit` \| `delivered` \| `cancelled` |
| `desired_delivery_date` | date | Set by client at checkout |
| `confirmed_delivery_date` | date | Set by Order Team |
| `po_number` | text nullable | Client's PO reference |
| `notes` | text nullable | Client notes |
| `total_amount` | numeric | Calculated from order_items |
| `created_at` | timestamptz | |
| `confirmed_at` | timestamptz | |
| `dispatched_at` | timestamptz | |
| `transit_at` | timestamptz | |
| `delivered_at` | timestamptz | |

#### `order_items`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK orders | |
| `brand_id` | uuid FK brands | |
| `quantity_cases` | integer | Default unit |
| `quantity_units` | integer nullable | For accounts with `allow_avulso = true` |
| `price_per_case` | numeric | Snapshot at order creation |
| `price_per_unit` | numeric nullable | Snapshot, if avulso |
| `subtotal` | numeric | Computed |
| `status` | text enum | `pending` \| `picked` \| `outstanding` \| `back_order` \| `cancelled` |
| `outstanding_reason` | text nullable | `out_of_stock` \| `outdated` \| `damaged` \| `other` |
| `outstanding_notes` | text nullable | Warehouse explanation |

#### `brand_prices`
| Column | Type | Notes |
|---|---|---|
| `brand_id` | uuid PK FK brands | |
| `price_per_case` | numeric | |
| `price_per_unit` | numeric nullable | |
| `currency` | text | Default 'EUR' |
| `valid_from` | date | |

Future: `client_price_overrides (client_account_id, brand_id, price_per_case)` for per-account pricing schemes.

#### `cutoff_config`
Single-row global config table.

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Always 1 |
| `cutoff_time` | time | e.g. 14:00 |
| `timezone` | text | e.g. 'Europe/Dublin' |

#### `public_holidays`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `date` | date | |
| `name` | text | |
| `region` | text | `'IE'` \| `'GB-NIR'` |

---

## Client Portal UI

### Layout
- **Desktop:** navbar top (logo, account name, building selector, cart badge, My Orders link) + category pills + 4-column product grid
- **Mobile:** navbar + building selector strip + horizontal-scrollable category pills + compact list (image thumbnail + name + price + `+` button) + sticky cart bar at bottom

### Key interactions
- **Account selector:** shown after login if user is linked to >1 client account; auto-skipped if only 1
- **Building selector:** shown after account selection if account has >1 building; auto-skipped if only 1. Always accessible in navbar to switch
- **Add to cart:** `+` button becomes inline `−/+` counter with blue highlight — no navigation away
- **Search:** global text search within the account's catalog (filtered by active category pill)
- **Checkout flow:** Cart page → delivery date calendar → PO field (optional) → notes → Submit
- **My Orders:** list with color-coded status badges; tap/click → order detail; Edit button visible while `status < picking`

---

## Delivery Calendar & Cut-off Logic

Implemented as a pure function `src/lib/deliveryCalendar.ts` — fully testable in isolation.

```
getAvailableDeliveryDates(clientAccount, cutoffConfig, publicHolidays, fromDate) → Date[]
```

**Algorithm:**
1. Compare current time against `clientAccount.custom_cutoff_time ?? cutoffConfig.cutoff_time` (in `cutoffConfig.timezone`)
2. If before cutoff → candidate = next calendar day; else → candidate = day after next
3. Walk forward from candidate, skipping:
   - Weekends (unless `clientAccount.weekend_delivery = true`)
   - Holidays where `holiday.region = clientAccount.region` (unless `clientAccount.holiday_delivery = true`)
4. If `clientAccount.same_day_delivery = true` and current time is before cutoff → include today as first option
5. Return array of available dates for the next 14 days (calendar highlights these in green)

**Regions:**
- `IE` — uses Republic of Ireland public holidays
- `GB-NIR` — uses UK / Northern Ireland public holidays

---

## Internal Orders Module

### Order Team view
- Queue grouped by status tabs: OPEN-PREP / OPEN / OUTSTANDING / TRANSIT
- Each row: order number, company name, building, ordered by (username), desired delivery date, item count, total
- Detail page actions:
  - `open_prep` → "Confirm & Send to Warehouse" (moves to `open`; Warehouse then clicks "Start Picking" to move to `picking`)
  - `outstanding` → "Resolve Items" (back order or cancel per item, then move to `transit`)
  - `dispatch` → "Mark as Transit"
- Can set `confirmed_delivery_date` when confirming

### Warehouse view
- Same `/orders` route, auto-filtered to `picking` and `dispatch` status
- Picking list per order: brand_code, brand_name, qty cases, bin_address (from WMS slots via `allocMap`)
- Per-item actions: mark `picked` or `outstanding` (reason + notes required)
- "Dispatch Order" button when all items resolved → moves to `dispatch`

### Admin view
- Full access to all statuses
- Client management: create portal users (`portal_username` + PIN), create `client_accounts`, link users to accounts via `client_account_users`, manage `client_buildings`, assign `client_catalogs`, set `brand_prices`
- Global settings: `cutoff_config`, `public_holidays`

---

## PDF / Print

- "Print Order" button available from `open` status onwards
- Follows existing WMS print pattern (`@media print`, landscape-optional)
- Layout: NEXT CHAIN logo header, company name + building + ordered by + delivery date + PO number, items table (code / name / qty cases / price / subtotal), order total, signature line at footer
- Accessible from both client view and internal order detail view

---

## Pilot Scope (what is NOT in v1)

- No per-account price overrides (uniform `brand_prices` only)
- No self-registration for client users
- No integration with Picking Line slots (warehouse sees bin_address read-only)
- No SMS/email notifications (future)
- No Back Order as a separate order entity — noted in `order_items.status = 'back_order'` only; full Back Order flow is post-pilot
- No external client database import

---

## Files to Create

| File | Responsibility |
|---|---|
| `src/pages/ClientPortal/AccountSelector.tsx` | Account selection after login (if user linked to multiple accounts) |
| `src/pages/ClientPortal/BuildingSelector.tsx` | Building selection after account is chosen |
| `src/pages/ClientPortal/Catalog.tsx` | Catalog page — grid/list, search, category pills, cart state |
| `src/pages/ClientPortal/Cart.tsx` | Cart page — items, delivery calendar, PO, notes, submit |
| `src/pages/ClientPortal/MyOrders.tsx` | My orders list + detail |
| `src/pages/Orders/OrderQueue.tsx` | Internal order queue (Order Team + Warehouse) |
| `src/pages/Orders/OrderDetail.tsx` | Order detail + actions per status |
| `src/lib/deliveryCalendar.ts` | Pure function — available delivery dates calculation |
| `src/test/deliveryCalendar.test.ts` | TDD tests for cut-off/calendar logic |
| `sql/order_portal_setup.sql` | All new tables + RLS policies |
| `sql/public_holidays_ie_uk.sql` | Seed data: IE + GB-NIR public holidays |
