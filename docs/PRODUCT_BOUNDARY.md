# Product Boundary

## What the Pilot Control Plane owns

- Product registration and product versions
- Demonstration templates
- Trial organizations and trial participants
- Time-limited access grants and invitation links
- Feature entitlements
- Synthetic-data provisioning
- Trial state (the pilot lifecycle state machine)
- Expiration, revocation, extension
- Usage and health receipts
- Feedback collection
- Conversion handoff (packet generation, not activation)
- Export and destruction workflows

## What it does not own

- The customer product's own operational data model
- The product's canonical authentication system after conversion to production
- Payment processing or customer financial accounts
- Customer production credentials
- Echo canonical memory
- Deployment authority for the underlying products
- External communications (email/SMS sending)

## Why this boundary

Every ZPO product family (Sovereign Document Concierge, ForgeFlow /
Universal KDS Bridge, AI Notion Companion, and future applications) would
otherwise need its own bespoke trial-access, synthetic-data, expiration,
and audit mechanism. The control plane exists so a completed product
becomes safely demonstrable to a prospect by implementing one narrow
adapter (see `PRODUCT_ADAPTER_CONTRACT.md`), not by rebuilding access
control.

The control plane is intentionally *not* a general-purpose auth system, a
CRM, or a billing platform. It hands off to those systems (or to Brody,
manually) at the conversion boundary — see `docs/DATA_RETENTION.md` and the
`ConversionRecord` / CRM adapter seam described in `ARCHITECTURE.md`.

## Non-negotiable operating constraints (current build)

- No public deployment.
- No production billing connections.
- No customer communications sent by this system.
- No import of real customer data — all demo datasets are synthetic and
  labeled as such in both the admin cockpit and the participant portal.
- No production credentials created or stored.
- Does not modify `echo-api`, the Document Concierge repository, or the
  ForgeFlow repository — it integrates with them only through the adapter
  contract, using mock/local adapters until those products expose a real
  integration surface.
