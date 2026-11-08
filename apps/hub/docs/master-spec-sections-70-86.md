# IQI AG MatchHub — Master Specification (Sections 70–86)

> Received 18 Jul 2026. This file preserves the specification exactly as supplied.
> **NOTE: Sections 1–69 of the master specification have not yet been received.**
> Tagline: *One Requirement. Multiple Opportunities. Controlled Collaboration.*

---

## 70. OFFICIAL APPLICATION NAME AND BRAND IDENTITY

The official application name is: **IQI AG MatchHub**

Official tagline: **One Requirement. Multiple Opportunities. Controlled Collaboration.**

Replace the temporary application name "AG MatchHub" with "IQI AG MatchHub" throughout:

* Application interface
* Page titles
* Authentication pages
* Admin dashboard
* Agent dashboard
* Client presentation
* Email templates
* Notifications
* PDF exports
* Metadata
* Documentation
* README
* Environment configuration
* Progressive Web App manifest

Do not hard-code the application name repeatedly inside individual components.

Create a central brand configuration containing:

* Application name
* Short application name
* Tagline
* Company name
* Support email
* Support telephone number
* Website URL
* Primary logo
* Secondary logo
* Favicon
* Application icon
* Brand colours
* Social-media links

Use the following brand identity:

1. IQI logo
2. AG Team logo
3. IQI AG MatchHub application name

The platform must support the IQI logo and AG Team logo appearing together in an organised and professional brand lock-up.

Do not redraw, distort, recolour, crop or modify the official logos without approval.

Maintain:

* Correct aspect ratio
* Clear spacing
* High-resolution output
* Transparent-background logo versions
* Light-background logo versions
* Dark-background logo versions

Until the official logo files are supplied, create clearly labelled logo placeholders.

Do not invent or generate unofficial replacements for the IQI or AG Team logos.

Allow authorised Super Admin users to update:

* IQI logo
* AG Team logo
* Application icon
* Favicon
* Login-page branding
* Email-header branding
* Client-presentation branding
* PDF-export branding

The default platform branding must remain IQI AG MatchHub.

Requesting Agent branding may be added to client presentations, but it must not remove mandatory IQI AG MatchHub platform identification where the platform policy requires it.

## 71. AGENT TRUST PROFILE, NAME CARD, PHOTOGRAPH AND SOCIAL-MEDIA LINKS

Allow every verified Agent to build a professional trust profile.

Both the Requesting Agent and Supply Agent may upload and maintain:

* Professional profile photograph
* Digital name card
* Front image of physical name card
* Back image of physical name card
* Agency logo where authorised
* Professional biography
* Position or designation
* Agency name
* Agent licence number
* Licence type
* Operating country
* Areas served
* Property specialisations
* Languages spoken
* Years of experience
* Professional achievements
* Verified social-media links
* Professional website
* Agency profile page

Supported social-media and professional links may include:

* Facebook
* Instagram
* LinkedIn
* TikTok
* YouTube
* WhatsApp business link
* Telegram
* Personal professional website
* Official agency profile
* Other Admin-approved professional platforms

Create a structured social-link table instead of storing all links in one text field.

Each social link must include:

* Platform
* URL
* Display label
* Verification status
* Visibility setting
* Created date
* Updated date

Validate every URL before saving.

Reject:

* Invalid URLs
* Dangerous URL schemes
* Script-based links
* Malicious redirects
* Clearly unrelated links
* Links prohibited by platform policy

Allow Admin to:

* Verify a social-media link
* Reject a social-media link
* Hide a social-media link
* Request correction
* Flag impersonation
* Remove prohibited content

Display a "Verified Agent" indicator only after the Agent has completed the required platform-verification process.

Do not imply that a social-media account is officially verified by the relevant social platform unless such verification has actually been confirmed.

Name-card and profile-photo uploads must follow secure media-processing rules.

Apply:

* File-type validation
* File-size limits
* Malware-scanning readiness
* Image optimisation
* Metadata removal
* Safe file naming
* Private original storage
* Controlled client-safe copies

Agent trust profiles must support configurable visibility levels:

1. Admin Only
2. Visible to Collaborating Agents
3. Visible After Mutual Collaboration Acceptance
4. Visible After Contact Release
5. Visible on Client Presentation
6. Public Professional Profile

Default privacy rules:

* Admin can view the complete Agent trust profile.
* A collaborating Agent may view approved professional information.
* Buyer or Tenant must only see the Requesting Agent's approved client-facing profile.
* Buyer or Tenant must never see the Supply Agent's name card, photograph, social-media links or contact information.
* The Supply Agent must not see confidential Buyer or Tenant information.
* Social-media links must not become a method for bypassing platform contact controls.

Before contact release, the platform may show a restricted trust profile containing:

* Agent display name or controlled Agent identity
* Professional photograph
* Agency name
* Licence number
* Country
* Verified status
* Property specialisation
* Platform performance indicators

Sensitive direct-contact links may remain hidden until collaboration or contact release has been approved.

Record all changes to Agent trust profiles in the audit log.

## 72. COMMISSION DISCLOSURE AND CO-BROKE AGREEMENT

Create a dedicated Commission and Co-Broke Agreement module for every property submission.

The module must record how much commission is offered by the Seller Agent, Owner Agent, Landlord Agent, Listing Agent, Developer or authorised property representative.

Commission information is confidential commercial information. It must never be displayed to the Buyer, Tenant or unauthorised users.

The Commission and Co-Broke module must support both:

* Sale transactions
* Rental or lease transactions

### Commission Provider

Require the Supply Agent to identify who is responsible for paying the commission:

* Seller
* Owner
* Landlord
* Developer
* Listing Agency
* Supply Agent
* Source Agent
* Master Agent
* Project Marketing Agency
* Other authorised party

### Total Commission Offered

Require the Supply Agent to disclose the total commission available from the Seller, Owner, Landlord or authorised commission-paying party.

Commission calculation types:

1. Percentage of transaction price
2. Fixed amount
3. Number of months of rental
4. Percentage of total tenancy value
5. Percentage of annual rental
6. Tiered commission
7. Custom arrangement
8. To be confirmed

Commission fields:

* Total commission type
* Total commission percentage
* Total commission fixed amount
* Number of rental months
* Commission currency
* Commission calculation basis
* Tax-inclusive or tax-exclusive
* Withholding or deduction information
* Commission payer
* Commission payment timing
* Commission payment conditions
* Supporting remarks
* Confirmation status
* Supporting document
* Last confirmed date
* Confirmed by

Use precise decimal database types for all commission amounts and percentages. **Do not use floating-point values for money.**

### Commission Calculation Basis

Allow the Supply Agent to specify whether the commission is based on:

* Final sale price
* Asking price
* Accepted offer price
* Gross annual rental
* Net annual rental
* Total lease value
* First-year rental
* Monthly rental
* Developer schedule
* Other agreed basis

### Commission Confirmation Status

Use the following statuses:

* Draft
* Declared by Supply Agent
* Supporting Document Pending
* Pending Source Confirmation
* Pending Owner or Landlord Confirmation
* Confirmed
* Revised
* Disputed
* Withdrawn
* Expired
* Payable
* Partially Paid
* Fully Paid
* Cancelled

## 73. COMMISSION-SHARING METHOD

Require both collaborating Agents to agree on the commission-sharing method.

Supported sharing options:

1. Standard 50:50 Sharing
2. Custom Percentage Sharing
3. Custom Fixed-Amount Sharing
4. Hybrid Percentage and Fixed Amount
5. Different Sharing for Different Commission Components
6. To Be Negotiated
7. Admin-Approved Special Arrangement

### Standard 50:50 Sharing

When selected:

* Owner, Landlord, Seller or Listing side receives 50%
* Buyer or Tenant side receives 50%

Display the calculation clearly. Example:

* Total commission: MYR 20,000
* Owner or Landlord Agent share: 50% = MYR 10,000
* Buyer or Tenant Agent share: 50% = MYR 10,000

### Custom Percentage Sharing

Allow the parties to specify:

* Owner, Landlord, Seller or Listing Agent percentage: ___%
* Buyer or Tenant Agent percentage: ___%

Validate that the total equals 100%. Do not allow final acceptance if the combined percentages do not equal 100%.

Example:

* Listing-side Agent: 60%
* Buyer-side Agent: 40%

### Custom Fixed-Amount Sharing

Allow the parties to specify an agreed amount in the selected currency:

* Owner, Landlord, Seller or Listing Agent amount: ______
* Buyer or Tenant Agent amount: ______
* Agreed currency: ______

Validate that the combined amounts do not exceed the total declared commission unless an authorised explanation is recorded.

### Hybrid Sharing

Support arrangements such as:

* Fixed amount to one party
* Remaining balance divided by percentage
* Different allocation for base commission and incentive
* Separate treatment of tax
* Separate treatment of referral fees
* Separate treatment of project bonuses
* Separate treatment of external source-agent fees

### Custom Commission Components

Allow separate commission components, including:

* Base agency fee
* Additional incentive
* Developer bonus
* Campaign bonus
* Referral fee
* Source-agent fee
* Team override
* Country-management fee
* Administration fee
* Tax
* Other agreed component

Each component must record:

* Component name
* Payer
* Amount or percentage
* Currency
* Calculation basis
* Recipient
* Payment condition
* Payment timing
* Supporting remarks

## 74. COMMISSION-SHARING WORKFLOW

Use the following workflow:

1. Supply Agent enters the total commission information.
2. Supply Agent proposes the commission-sharing arrangement.
3. Requesting Agent reviews the proposal.
4. Requesting Agent may: Accept / Reject / Submit a counter-proposal / Request clarification
5. Supply Agent reviews any counter-proposal.
6. Both Agents must provide active acceptance.
7. Admin approval may be required based on country, market, amount, transaction type or platform policy.
8. Once accepted, create a versioned Commission Sharing Agreement record.
9. Lock the accepted version from silent editing.
10. Any later changes must create a new version.
11. Both Agents must accept the revised version.
12. Preserve all previous versions in the audit history.

Commission-sharing statuses:

* Not Proposed
* Draft
* Proposed by Supply Agent
* Awaiting Requesting Agent
* Counter-Proposed
* Awaiting Supply Agent
* Clarification Required
* Agreed in Principle
* Awaiting Admin Approval
* Accepted by Both Agents
* Revised
* Disputed
* Cancelled
* Expired
* Transaction Completed
* Payment Pending
* Partially Paid
* Fully Paid

The platform must show:

* Who proposed the arrangement
* Date proposed
* Current version
* Previous versions
* Who accepted
* Acceptance timestamps
* Current payable calculation
* Any unresolved dispute

## 75. COMMISSION AGREEMENT ACCEPTANCE

Commission agreement acceptance must not be pre-selected.

Require both Agents to actively click: **"I Agree to the Commission Sharing Arrangement"**

Before acceptance, show:

* Total commission
* Commission source
* Calculation basis
* Currency
* Listing-side share
* Buyer-side share
* Additional deductions
* Referral fees
* Taxes
* Expected payment timing
* Payment conditions
* Supporting remarks
* Legal disclosures
* Agreement version

Record:

* Agent ID
* Agent role in the transaction
* Agreement ID
* Agreement version
* Exact accepted commission terms
* Language
* Date and time
* IP address where legally appropriate
* Device or session reference
* Acceptance status

Do not permit one Agent to accept on behalf of the other Agent unless an authorised Admin process and supporting authority exist.

## 76. COMMISSION CHANGE CONTROL

Once both Agents accept an arrangement:

* Do not overwrite it.
* Do not silently modify percentages.
* Do not silently modify fixed amounts.
* Do not silently modify currency.
* Do not silently modify payment conditions.
* Do not silently add deductions.

Any amendment must:

1. Create a new agreement version.
2. State the reason for amendment.
3. Show the previous terms.
4. Show the proposed new terms.
5. Require both Agents to accept again.
6. Require Admin approval where configured.
7. Preserve all previous versions.

Possible amendment reasons:

* Final transaction price changed
* Rental amount changed
* Owner revised commission
* Developer revised incentive
* Source-agent fee added
* Referral fee added
* Tax treatment changed
* Transaction structure changed
* Additional Agent involved
* Error correction
* Mutual commercial agreement
* Other documented reason

## 77. COMMISSION PAYMENT TRACKING

Prepare a commission-payment tracking function.

Payment fields:

* Payment ID
* Agreement ID
* Transaction ID
* Paying party
* Receiving party
* Amount due
* Amount paid
* Outstanding amount
* Currency
* Invoice number
* Invoice date
* Payment due date
* Payment date
* Payment method
* Payment reference
* Supporting receipt
* Tax document
* Payment status
* Admin remarks
* Agent remarks

Payment statuses:

* Not Yet Due
* Invoice Required
* Invoice Submitted
* Invoice Approved
* Payment Pending
* Partially Paid
* Fully Paid
* Payment Delayed
* Disputed
* Cancelled

For the MVP, commission-payment tracking may be implemented as a basic record and status module.

Design the architecture so that invoicing, payment gateway and accounting integrations can be added later.

Do not represent the platform record as proof that payment has legally occurred unless verified supporting evidence is available.

## 78. COMMISSION PRIVACY AND VISIBILITY

Commission information may be viewed by:

* Relevant Requesting Agent
* Relevant Supply Agent
* Authorised Admin
* Authorised Finance Admin
* Authorised Compliance Admin where required

Commission information must not be viewed by:

* Buyer
* Tenant
* Public users
* Unrelated Agents
* Other Supply Agents
* Other Requesting Agents
* Unauthorised staff

Do not expose commission information through:

* Client presentations
* Public APIs
* Browser source
* Client-side hidden fields
* URL parameters
* Image metadata
* Download filenames
* Notification previews
* Analytics data
* Error messages

Create secure server-side commission projections based on user permissions.

## 79. LEGAL AND MATERIAL INFORMATION DISCLOSURE

Create a dedicated Legal and Material Disclosure section for information that must be disclosed to the Buyer-side or Tenant-side Agent.

This information is agent-to-agent information and must not automatically be shown directly to the Buyer or Tenant.

The Requesting Agent decides which disclosures should be presented to the client, subject to applicable law and professional obligations.

Disclosure categories may include:

* Ownership status
* Authority to sell or rent
* Appointment status
* Title status
* Tenure
* Encumbrances
* Restrictions in interest
* Consent requirements
* Caveats
* Charges
* Existing tenancy
* Vacant-possession status
* Outstanding maintenance charges
* Outstanding utility charges
* Outstanding taxes or assessments
* Litigation
* Disputes
* Auction or foreclosure status
* Bankruptcy or insolvency-related information
* Developer restrictions
* Management restrictions
* Renovation restrictions
* Usage restrictions
* Zoning
* Commercial-use restrictions
* Licensing requirements
* Safety concerns
* Structural defects
* Known material defects
* Flood history
* Fire history
* Pest history
* Access limitations
* Parking limitations
* Occupancy limitations
* Foreign-purchaser restrictions
* Minimum purchase-price restrictions
* Financing limitations
* Tax implications requiring professional advice
* Service charges
* Sinking fund
* Special levies
* Planned major repairs
* Required legal documentation
* Other material information

Do not make legal conclusions automatically.

Allow the Supply Agent to record:

* Disclosure category
* Disclosure description
* Whether confirmed
* Source of information
* Supporting document
* Date confirmed
* Confirmed by
* Whether disclosure is mandatory
* Whether disclosure may be shared with client
* Confidentiality level
* Additional remarks

Disclosure statuses:

* Not Declared
* Declared by Supply Agent
* Supporting Evidence Pending
* Under Review
* Confirmed
* Requires Legal Verification
* Disputed
* Updated
* Withdrawn

## 80. LEGAL DISCLOSURE DECLARATION

Before final submission, require the Supply Agent to confirm:

**English**

> "I confirm that I have disclosed to the Requesting Agent all known legal, ownership, authority, restriction, encumbrance, tenancy, condition and material information that may reasonably affect the proposed sale, purchase, rental, lease, use, occupation or negotiation of this property.
> I understand that I must not knowingly conceal or misrepresent material information.
> Where I am uncertain about any legal matter, I will clearly identify it as requiring confirmation or independent legal verification.
> I understand that the Platform does not provide legal advice and that the relevant parties should obtain independent professional advice where necessary."

Create equivalent Bahasa Malaysia and Bahasa Indonesia translations.

The declaration must be:

* Actively accepted
* Version-controlled
* Recorded in the consent log
* Linked to the property submission
* Reconfirmed when material disclosures change

## 81. REQUESTING AGENT DISCLOSURE ACKNOWLEDGEMENT

Allow the Requesting Agent to acknowledge receipt of legal and material disclosures.

Acknowledgement actions:

* Received
* Reviewed
* Further clarification required
* Supporting document required
* Legal review required
* Ready for client disclosure
* Not applicable
* Disputed

The Requesting Agent must not be forced to certify the legal accuracy of information supplied by another party. The acknowledgement records receipt and review status only.

Allow the Requesting Agent to create a client-safe disclosure summary.

The client-safe summary must:

* Exclude internal Agent information
* Exclude commission information
* Exclude confidential source information
* Clearly identify unverified matters
* State when independent legal advice is recommended
* Preserve the original meaning
* Avoid misleading simplification

## 82. COMMISSION AND DISCLOSURE DATABASE TABLES

Add or extend the database schema with tables such as:

* commission_agreements
* commission_agreement_versions
* commission_components
* commission_participants
* commission_acceptances
* commission_payment_records
* commission_supporting_documents
* legal_disclosures
* legal_disclosure_documents
* legal_disclosure_history
* legal_disclosure_acknowledgements
* agent_social_links
* agent_name_cards
* agent_trust_profile_history
* brand_settings
* brand_assets

Suggested commission agreement fields:

* id
* human_readable_id
* request_id
* submission_id
* transaction_id
* proposed_by
* current_version_id
* total_commission_type
* total_commission_percentage
* total_commission_amount
* currency
* calculation_basis
* payer_type
* payment_timing
* tax_treatment
* status
* created_at
* updated_at
* archived_at

Suggested commission-version fields:

* id
* commission_agreement_id
* version_number
* listing_side_percentage
* buyer_side_percentage
* listing_side_amount
* buyer_side_amount
* currency
* custom_terms
* amendment_reason
* proposed_by
* created_at

Suggested legal-disclosure fields:

* id
* request_id
* submission_id
* disclosure_category
* disclosure_description
* confirmation_status
* information_source
* mandatory_disclosure
* client_shareable
* confidentiality_level
* requires_legal_verification
* confirmed_by
* confirmed_at
* created_at
* updated_at

Apply Row-Level Security to every new table.

## 83. COMMISSION CALCULATION VALIDATION

Implement server-side validation.

For percentage sharing:

* Listing-side percentage plus Buyer-side percentage must equal 100%.
* Percentages must not be negative.
* Percentages must not exceed 100%.
* Use configurable decimal precision.

For fixed-amount sharing:

* Amounts must not be negative.
* Currency must be selected.
* Combined allocation must reconcile with the declared distributable commission or include an authorised explanation.
* Show any unallocated balance.
* Show any over-allocation.

For hybrid sharing:

* Calculate fixed components first or according to the selected calculation order.
* Display the calculation order clearly.
* Show all deductions.
* Show the final distributable amount.
* Show the final share for every participant.

Do not trust calculations performed only in the browser. Recalculate and validate on the server before saving acceptance.

## 84. COMMISSION DISPLAY REQUIREMENTS

Create a clear commission-summary card for authorised Agents.

Display:

* Total commission available
* Commission provider
* Calculation basis
* Transaction currency
* Listing-side share
* Buyer-side share
* Additional components
* Deductions
* Tax treatment
* Expected payment timing
* Confirmation status
* Agreement status
* Current version
* Last updated
* Accepted by
* Outstanding actions

Use separate labels for:

* Listing-side Agent
* Seller-side Agent
* Owner-side Agent
* Landlord-side Agent
* Buyer-side Agent
* Tenant-side Agent

Select the appropriate terminology based on transaction type and country configuration.

## 85. ADDITIONAL ACCEPTANCE CRITERIA

The MVP is not complete until:

* The application displays the official name IQI AG MatchHub.
* The branding system supports the IQI logo and AG Team logo.
* Both Agents can upload a professional photograph.
* Both Agents can upload a digital or scanned name card.
* Both Agents can add controlled social-media links.
* Admin can verify or reject Agent social links.
* Buyer or Tenant cannot see the Supply Agent's trust profile.
* Supply Agent can declare the total commission available.
* Supply Agent can identify the commission payer.
* Both Agents can select a 50:50 arrangement.
* Both Agents can negotiate a custom percentage arrangement.
* Both Agents can negotiate a custom fixed-amount arrangement.
* The selected currency is recorded.
* Percentage allocations are validated to equal 100%.
* Both Agents must actively accept the final commission-sharing arrangement.
* Accepted commission agreements are versioned and cannot be silently overwritten.
* Commission information is hidden from the Buyer or Tenant.
* Supply Agent can submit legal and material disclosures.
* Requesting Agent can acknowledge or request clarification.
* Legal disclosures can be converted into a controlled client-safe summary.
* Commission and disclosure actions appear in audit logs.
* Row-Level Security protects all new commission, disclosure and Agent trust-profile data.

## 86. ADDITIONAL IMPLEMENTATION INSTRUCTION

Add these requirements to the existing phased implementation plan without removing or rewriting any previous requirement.

Implement the additional modules in the following order:

1. Official IQI AG MatchHub brand configuration
2. IQI and AG Team logo asset management
3. Agent trust profile
4. Agent photograph and name-card upload
5. Social-media link management
6. Commission declaration
7. Commission-sharing proposal
8. 50:50 and custom allocation calculations
9. Dual-Agent acceptance
10. Commission agreement versioning
11. Legal and material disclosure
12. Requesting Agent acknowledgement
13. Client-safe disclosure summary
14. Commission and disclosure audit logs
15. Row-Level Security tests
16. End-to-end acceptance tests

Do not remove, shorten or alter any previously specified functionality.

Where this additional specification introduces a more specific requirement, apply it as an extension of the existing master specification.
