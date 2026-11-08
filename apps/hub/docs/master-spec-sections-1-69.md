# IQI AG MatchHub — Master Build Specification (Sections 1–69)

> Received 18 Jul 2026. Preserved as supplied. Companion file: [master-spec-sections-70-86.md](master-spec-sections-70-86.md).
> Per §70 the official name is **IQI AG MatchHub** (supersedes the temporary "AG MatchHub" used below).

---

## MASTER BUILD PROMPT FOR CLAUDE CODE

You are acting as a senior product architect, senior full-stack engineer, database architect, cybersecurity engineer, UX/UI designer, DevOps engineer, QA engineer and technical documentation specialist.

Your assignment is to design and build a secure, scalable, multilingual, mobile-first property requirement and agent collaboration platform.

The temporary product name is: **AG MatchHub**
Temporary tagline: **One Requirement. Multiple Opportunities. Controlled Collaboration.**

The final product name, domain and subdomain will be provided later. Do not hard-code the product name, company name, domain, logo or final branding into the application. Use configuration files, environment variables and Admin-controlled settings wherever possible.

## 1. PRIMARY PRODUCT VISION

Build a controlled property collaboration platform that connects:

1. Admin
2. Requesting Agent
3. Supply or Listing Agent
4. Buyer or Tenant Viewer

The platform is not intended to operate as a normal public property-listing portal. It is a private, requirement-driven collaboration platform.

A Requesting Agent represents a buyer or tenant who needs a particular property. The Requesting Agent submits a property requirement to the platform. Admin verifies and approves the requirement. The platform then generates a secure, password-protected request link. The Requesting Agent may distribute this request link to verified agents. Supply Agents who have suitable properties may open the link, review the requirement and submit one or more properties. The Requesting Agent reviews all submissions and decides which properties are suitable. Only selected properties are shared with the buyer or tenant through a separate client presentation link.

The buyer or tenant may:

* Review selected properties
* Compare properties
* Rank properties
* Shortlist properties
* Ask questions
* Suggest an offer
* Request a viewing
* Provide feedback

The buyer or tenant must never see the identity or contact information of the Supply Agent. All client-facing properties must appear to be presented and managed by the Requesting Agent.

Admin must have full governance visibility over users, requests, property submissions, communications, offers, client feedback, audit logs and platform activity.

The platform must protect:

* The Requesting Agent's client relationship
* The Supply Agent's property relationship
* Confidential owner information
* Confidential client information
* Co-broke collaboration integrity
* Platform database integrity
* User privacy
* Transaction records

## 2. BUSINESS OBJECTIVES

The platform must achieve the following objectives:

* Help agents find properties based on actual buyer or tenant demand.
* Help agents with properties reach genuine buyer or tenant requirements.
* Enable local and cross-border property collaboration.
* Protect agents from being bypassed.
* Protect buyer, tenant, owner and landlord information.
* Provide a structured submission and matching process.
* Allow Requesting Agents to filter unsuitable properties.
* Allow clients to compare selected properties professionally.
* Provide traceable internal negotiation.
* Record every meaningful action through audit logs.
* Build a reusable property and requirement database.
* Support future AI-powered property matching.
* Support future CRM and communication integrations.
* Support multiple countries, languages, currencies and property regulations.
* Provide Admin with operational intelligence and reporting.
* Make the system simple enough for non-technical property agents.

## 3. CORE USER ROLES

Implement strict role-based access control. The initial roles are:

1. Super Admin
2. Admin
3. Country Admin
4. Compliance Admin
5. Requesting Agent
6. Supply Agent
7. Buyer or Tenant Viewer
8. Suspended User

An agent may act as a Requesting Agent in one transaction and a Supply Agent in another transaction. Do not create separate permanent accounts for Requesting Agents and Supply Agents. Create one verified Agent account with transaction-specific roles.

## 4. SUPER ADMIN PERMISSIONS

Super Admin has full global access. Super Admin can:

* Manage all countries and markets.
* Manage all users.
* Manage Admin accounts.
* Assign Admin roles.
* Verify, suspend, restore or ban agents.
* View all requests.
* View all property submissions.
* View all agent identities.
* View all client presentation links.
* View all internal messages.
* View all offers.
* View all viewings.
* View all disputes.
* View all uploaded documents.
* View all audit logs.
* View login and security events.
* Configure platform branding.
* Configure languages.
* Configure currencies.
* Configure property terminology.
* Configure market-specific fields.
* Configure legal declarations.
* Configure consent versions.
* Configure notification templates.
* Configure request expiry rules.
* Configure link expiry rules.
* Configure agent verification rules.
* Export data.
* Archive records.
* Freeze requests.
* Freeze property submissions.
* Disable links.
* Manage reported violations.
* Manage database retention settings.
* Access executive analytics.
* View system health.
* View failed jobs.
* View application logs.
* Manage feature flags.
* Activate or deactivate countries.
* Activate or deactivate platform modules.

All Super Admin actions must be recorded in immutable audit logs.

## 5. ADMIN PERMISSIONS

Admin can:

* Review agent registrations.
* Verify agent identity.
* Review licence details.
* Approve or reject agent registration.
* Request additional verification documents.
* Approve or reject property requirements.
* Request amendments to property requirements.
* Generate request links.
* Set request passwords.
* Set request expiry dates.
* Disable request links.
* View submissions.
* View communications.
* View true user identities.
* Review reported violations.
* Issue warnings.
* Suspend accounts.
* Freeze transactions.
* Record compliance notes.
* Review supporting documents.
* Export operational reports.
* Manage requests within assigned countries or markets.

Admin access may be restricted by country, region or business unit.

## 6. COUNTRY ADMIN PERMISSIONS

Country Admin can only access records belonging to assigned countries. Country Admin can:

* Manage local agents.
* Verify local licence information.
* Review local property requirements.
* Review local submissions.
* Manage local terminology.
* Manage local legal wording.
* Manage local currencies and measurement units.
* View local reports.
* Handle local disputes.
* Manage local notification templates.

Country Admin must not access another country's restricted data unless specifically authorised.

## 7. COMPLIANCE ADMIN PERMISSIONS

Compliance Admin can:

* Review agent verification records.
* Review declarations and consent records.
* Review appointment letters.
* Review reported violations.
* Review suspicious activities.
* Review attempts to expose contact information.
* Review possible duplicate or fraudulent listings.
* Freeze relevant records.
* Issue warnings.
* Recommend account suspension.
* Add internal compliance notes.
* Export investigation reports.
* View relevant communication history.

Compliance Admin cannot change financial or commercial information unless separately authorised.

## 8. AGENT ACCOUNT CAPABILITIES

A verified Agent can act as either:

* Requesting Agent
* Supply Agent
* Both, depending on the transaction

Agent account features:

* Agent profile
* Identity verification
* Agency information
* Licence information
* Market coverage
* Preferred language
* Preferred currency
* Notification preferences
* Request dashboard
* Submission dashboard
* Message centre
* Offer centre
* Viewing calendar
* Saved drafts
* Archived transactions
* Violation reports
* Security settings
* Active sessions
* Device management

## 9. REQUESTING AGENT CAPABILITIES

A Requesting Agent represents a buyer or tenant. The Requesting Agent can:

* Create a property requirement.
* Save the requirement as a draft.
* Submit the requirement to Admin.
* Edit the requirement before approval.
* Respond to Admin amendment requests.
* Receive an approved private request link.
* Receive a password and QR code.
* Share the request link.
* Monitor link activity.
* View submitted properties.
* Filter submissions.
* Sort submissions.
* Add internal notes.
* Reject submissions.
* Request additional information.
* Shortlist submissions.
* Select properties for client presentation.
* Generate client presentation links.
* Apply Requesting Agent branding.
* Add a custom client introduction.
* Add custom notes to each property.
* Hide selected fields from the client.
* Track client views.
* Track client shortlists.
* Track client comparisons.
* Receive client feedback.
* Request property availability confirmation.
* Request viewings.
* Submit offers.
* Receive counter-offers.
* Negotiate through internal messaging.
* Request secure contact release.
* Close successful transactions.
* Cancel or archive requirements.
* Report a Supply Agent.
* Report inaccurate property information.

The Requesting Agent must not be able to edit the original factual information submitted by a Supply Agent. Instead, use separate fields for:

* Original Supply Agent information
* Requesting Agent client-facing notes
* Admin corrections
* Verified current information

Maintain a full edit history.

## 10. SUPPLY AGENT CAPABILITIES

A Supply Agent has a property or legitimate access to a property. The Supply Agent can:

* Open an authorised request link.
* Enter the request password.
* Log in or register.
* Complete agent verification.
* View the requirement after authorisation.
* Submit one or multiple properties.
* Save property submissions as drafts.
* Upload images.
* Upload videos.
* Upload floor plans.
* Upload brochures.
* Upload appointment letters.
* Upload supporting documents.
* Declare the listing source.
* Declare whether the listing is direct or indirect.
* Declare appointment status.
* Declare owner confirmation status.
* Declare commission or co-broke terms.
* State price negotiability.
* State minimum acceptable price.
* Confirm property availability.
* Update property information.
* Respond to questions.
* Accept or reject viewing requests.
* Accept, reject or counter an offer.
* Withdraw a property.
* Mark a property as no longer available.
* Report misuse by a Requesting Agent.
* View the status of submitted properties.

A Supply Agent must not see:

* Buyer or tenant contact details.
* Buyer or tenant full identity unless explicitly authorised.
* Other Supply Agents.
* Competing submissions.
* Other agents' prices.
* Other agents' communications.
* The complete client shortlist.
* The client presentation link unless authorised.

## 11. BUYER OR TENANT VIEWER

The Buyer or Tenant Viewer is not a full platform user. The client accesses a private presentation link.

Client access methods may include:

* Password
* Email one-time code
* Mobile one-time code
* Secure access token
* Combination of password and one-time code

The client can:

* View only selected properties.
* View Requesting Agent branding.
* View property images.
* View client-safe videos.
* View floor plans.
* View client-safe property descriptions.
* View prices.
* View general location.
* View maps where permitted.
* Compare properties.
* Shortlist properties.
* Rank properties.
* Mark properties as not interested.
* Request a viewing.
* Ask questions.
* Suggest an offer.
* Submit comments.
* Submit preferred viewing dates.
* Download a client-safe PDF presentation if enabled.
* Return to the presentation later while the link remains valid.

The client must never see:

* Supply Agent name.
* Supply Agent profile.
* Supply Agent phone number.
* Supply Agent email.
* Supply Agent agency.
* Supply Agent licence number.
* Owner or landlord identity.
* Owner or landlord contact information.
* Appointment letters.
* Source Agent information.
* Direct or indirect status.
* Commission terms.
* Co-broke terms.
* Minimum confidential price.
* Internal notes.
* Agent-to-agent messages.
* Admin notes.
* Compliance notes.
* Rejected submissions.
* Properties not approved by the Requesting Agent.

## 12. AGENT REGISTRATION AND VERIFICATION

Create a detailed agent registration process.

Required fields:

* Full legal name
* Display name
* Email
* Mobile number
* WhatsApp number
* Country
* State or region
* City
* Agency name
* Agency registration information
* Agent role
* Licence type
* Licence number
* Licence expiry date
* Identification number where legally permitted
* Preferred language
* Preferred currency
* Markets served
* Property categories served
* Profile photograph
* Licence document
* Agency confirmation document
* Identity verification document
* Referral or invitation code if applicable
* Terms acceptance
* Privacy notice acceptance
* Agent declaration acceptance

Agent statuses:

* Draft
* Email Verification Pending
* Mobile Verification Pending
* Documents Pending
* Under Review
* Additional Information Required
* Verified
* Rejected
* Suspended
* Temporarily Restricted
* Banned
* Expired Licence
* Archived

Only verified agents may submit properties or create approved request links.

If an agent's licence expires:

* Notify the agent.
* Notify Admin.
* Restrict selected actions based on country policy.
* Preserve existing records.
* Do not delete historical transactions.

## 13. PROPERTY REQUIREMENT CREATION

The Requesting Agent creates a requirement.

### General Information

* Request ID
* Request title
* Request description
* Transaction type: Buy or Rent
* Residential, Commercial, Industrial, Land or Other
* Client type: Individual, Company or Organisation
* Requirement visibility
* Priority level
* Urgency level
* Required date
* Submission deadline
* Request expiry date

### Location

* Country
* State or region
* City
* District
* Preferred areas
* Acceptable alternative areas
* Radius
* Nearby landmarks
* Required proximity to transportation
* Required proximity to schools
* Required proximity to hospitals
* Required proximity to business districts
* Map coordinates where relevant

### Financial Requirements

* Minimum budget
* Maximum budget
* Currency
* Budget flexibility
* Cash or financing
* Financing status
* Loan pre-approval status
* Deposit readiness
* Maximum monthly rent
* Maximum annual rent
* Expected lease term
* Renewal preference
* Tax considerations
* Service-charge preference
* Other financial requirements

### Property Requirements

* Property category
* Property type
* Minimum built-up area
* Maximum built-up area
* Minimum land area
* Maximum land area
* Preferred measurement unit
* Minimum bedrooms
* Maximum bedrooms
* Minimum bathrooms
* Car parks
* Furnishing level
* Floor preference
* Building age preference
* Tenure preference
* Facing preference
* Condition preference
* Accessibility requirements
* Facilities required
* Pet policy
* Renovation permission
* Signage permission
* Operating-hour requirements

### Commercial Requirements

* Business type
* Intended use
* Required licences
* Required frontage
* Ground-floor requirement
* Loading access
* Ceiling height
* Electrical capacity
* Water requirements
* Gas requirements
* Exhaust requirements
* Parking requirements
* Footfall requirements
* Nearby tenant mix
* Prohibited business restrictions
* Commercial zoning
* Delivery access

### Client Profile

* Client nationality
* Client residency status
* Client type
* Number of occupants
* Number of employees
* General client description
* Expected move-in date
* Decision-making timeline
* Viewing availability
* Special conditions

Do not expose sensitive client identity to Supply Agents. Allow Requesting Agents to provide an anonymised client profile. Example: "Malaysian retail operator seeking a shop in Jakarta for regional expansion."

### Internal Information

* Requesting Agent internal notes
* Admin notes
* Client identity reference
* Lead source
* CRM reference
* Team reference
* Branch reference
* Confidential instructions

## 14. PROPERTY REQUEST WORKFLOW

Request statuses:

1. Draft
2. Pending Admin Approval
3. Under Admin Review
4. Amendment Required
5. Resubmitted
6. Approved
7. Link Ready
8. Link Active
9. Receiving Submissions
10. Reviewing Submissions
11. Client Presentation Preparation
12. Client Review
13. Viewing Stage
14. Negotiation Stage
15. Offer Stage
16. Transaction in Progress
17. Successfully Closed
18. Unsuccessful
19. Expired
20. Cancelled
21. Frozen
22. Archived

Workflow:

1. Requesting Agent creates a draft.
2. Agent submits request for approval.
3. Admin reviews the request.
4. Admin approves, rejects or requests amendments.
5. On approval, generate a unique Request ID.
6. Generate a secure private link.
7. Generate a random password.
8. Allow Admin to change the password.
9. Generate a QR code.
10. Set a submission deadline.
11. Set a link expiry date.
12. Allow Requesting Agent to share the link.
13. Track link visits.
14. Require agent login before viewing sensitive request information.
15. Record every property submission.
16. Notify Requesting Agent when a property is submitted.
17. Allow Requesting Agent to review submissions.
18. Allow selected properties to be added to a client presentation.
19. Allow client feedback.
20. Allow negotiation and viewing.
21. Allow closure and archive.

## 15. REQUEST LINK SECURITY

Each approved request link must include:

* Non-sequential secure token
* Request ID
* Password protection
* Expiry date
* Active or inactive status
* Optional maximum access count
* Optional country restrictions
* Optional approved-agent restriction
* Optional agency restriction
* Optional invitation-only restriction
* Rate limiting
* Bot protection
* Access log
* Failed password attempt log
* Account lockout protection

Do not expose the internal database ID in the public URL.

Example only: `https://subdomain.example.com/r/secure-random-token`
Do not use: `/request/123`

The Requesting Agent may share the URL and password. However, the user must still log in as a verified agent before submitting a property. A password alone must not allow anonymous property submission.

Admin can:

* Reset link password
* Disable link
* Extend expiry
* Shorten expiry
* Restrict access
* View access history
* Revoke selected sessions

## 16. PROPERTY SUBMISSION

Each property submission must be associated with:

* Supply Agent
* Requesting Agent
* Property Request
* Country
* Market
* Submission timestamp
* Declaration acceptance
* Source type
* Verification status

### Identity

* Submission ID
* Request ID
* Property reference number
* Supply Agent ID
* Source Agent ID if applicable
* Agency ID
* Submission date
* Last updated date

### Property Information

* Property title
* Property category
* Property type
* Country
* State or region
* City
* District
* Full address
* Client-visible general address
* Building name
* Project name
* Unit number
* Postal code
* Latitude
* Longitude

### Pricing

* Asking price
* Minimum acceptable price
* Currency
* Negotiable: Yes, No or Subject to Offer
* Monthly rental
* Annual rental
* Deposit
* Utility deposit
* Advance rental
* Service charge
* Maintenance fee
* Taxes
* Additional fees
* Fee remarks

Minimum acceptable price must be confidential and must never appear on the client-facing presentation.

### Specifications

* Built-up area
* Land area
* Measurement unit
* Bedrooms
* Bathrooms
* Car parks
* Floor level
* Total floors
* Furnishing
* Property condition
* Tenure
* Title type
* Completion year
* Availability date
* Vacant or occupied
* Facing
* Facilities
* Accessibility
* Restrictions

### Commercial Specifications

* Business suitability
* Existing business type
* Permitted use
* Frontage
* Ceiling height
* Electrical capacity
* Loading access
* Water access
* Gas access
* Exhaust access
* Signage permission
* Operating-hour restrictions
* Zoning
* Footfall information

### Marketing Information

* Property description
* Key selling points
* Nearby amenities
* Nearby transportation
* Nearby landmarks
* Client-safe remarks
* Internal remarks
* Viewing instructions

### Media

* Cover image
* Gallery images
* Video
* Virtual tour
* Floor plan
* Brochure
* Location map
* Supporting documents

### Availability and Authority

* Availability status
* Last availability confirmation date
* Confirmed by
* Owner confirmation status
* Appointment status
* Appointment type
* Appointment commencement date
* Appointment expiry date
* Exclusive or open listing
* Direct or indirect source
* Co-agent status
* Developer listing status
* Authority remarks

### Co-Broke Information

* Co-broke accepted
* Co-broke terms
* Commission percentage
* Commission amount
* Commission currency
* Commission conditions
* Tax handling
* Payment timing
* Internal commercial notes

Commission and co-broke information must never appear on client-facing pages.

## 17. LISTING SOURCE CLASSIFICATION

Require the Supply Agent to choose one:

1. Direct Listing — Valid Written Appointment
2. Direct Listing — Appointment Pending
3. Direct Listing — Verbal Owner Authorisation
4. Direct Listing — Without Written Appointment
5. Indirect Listing — From Another Agent
6. Co-Agent Listing
7. Agency Shared Listing
8. Developer Listing
9. Landlord Direct Referral
10. Open Market Information
11. Other

If the Supply Agent selects an indirect source, request:

* Source Agent name
* Source Agency
* Source Agent contact reference
* Source Agent licence number where appropriate
* Permission to share
* Date permission was obtained
* Appointment status
* Last availability confirmation date
* Person authorised to confirm price
* Co-broke chain
* Number of agents in the chain
* Supporting evidence
* Internal notes

Display a risk indicator to the Requesting Agent:

* Verified Direct
* Direct — Document Pending
* Indirect — Verified Source
* Indirect — Limited Verification
* Open Market — Confirmation Required
* High-Risk Submission

Admin must be able to override the risk classification with an explanation.

## 18. PROPERTY SUBMISSION STATUS

Use the following statuses:

1. Draft
2. Submitted
3. Declaration Pending
4. Under Review
5. More Information Required
6. Verification Pending
7. Suitable
8. Rejected
9. Shortlisted
10. Approved for Client
11. Shared with Client
12. Client Viewed
13. Client Interested
14. Client Not Interested
15. Viewing Requested
16. Viewing Proposed
17. Viewing Confirmed
18. Viewing Completed
19. Negotiation
20. Offer Submitted
21. Counter Offer
22. Offer Accepted
23. Offer Rejected
24. Transaction in Progress
25. Closed
26. Withdrawn
27. No Longer Available
28. Expired
29. Frozen
30. Archived

Maintain status history. Every status change must store:

* Previous status
* New status
* Changed by
* User role
* Timestamp
* Reason
* Related message
* Device or session ID where appropriate

## 19. REQUESTING AGENT REVIEW BOARD

Create a property submission review board.

Display:

* Property cover image
* Submission ID
* Property title
* Location
* Price
* Area
* Property type
* Availability
* Source classification
* Appointment status
* Risk indicator
* Negotiable status
* Submission time
* Supply Agent verified status
* Response time
* Current status

Actions:

* View details
* Shortlist
* Reject
* Request more information
* Approve for client
* Compare internally
* Add internal note
* Start conversation
* Request appointment document
* Confirm availability
* Request viewing
* Submit offer
* Report submission

Filters:

* Price
* Location
* Property type
* Area
* Appointment status
* Direct or indirect
* Verified or unverified
* Negotiable
* Availability
* Submission status
* Risk level
* Date submitted
* Supply Agent rating when introduced

Sorting:

* Newest
* Oldest
* Lowest price
* Highest price
* Closest match
* Highest verification level
* Most complete
* Fastest Supply Agent response

## 20. REJECTION REASONS

Allow the Requesting Agent to select rejection reasons:

* Over budget
* Below required size
* Wrong location
* Wrong property type
* Incorrect specifications
* Insufficient information
* Poor image quality
* Property not available
* Availability not confirmed
* No appointment
* Indirect listing
* Too many co-broke layers
* Client not interested
* Unacceptable commercial terms
* Duplicate submission
* Suspicious information
* Other

The rejection reason may be:

* Internal only
* Shared with Supply Agent
* Shared with Admin only

## 21. CLIENT PRESENTATION BUILDER

The Requesting Agent can create a client presentation.

Presentation fields:

* Presentation title
* Client display name or reference
* Introduction message
* Requesting Agent profile
* Requesting Agent agency
* Requesting Agent logo
* Requesting Agent contact information
* Brand colours
* Selected properties
* Property order
* Custom client-safe notes
* Hidden fields
* Expiry date
* Password
* OTP requirement
* Download permission
* Client feedback permission
* Comparison permission
* Offer suggestion permission
* Viewing request permission

The system generates a secure client link. Example only: `https://subdomain.example.com/p/secure-random-token`

The client presentation must appear to be fully managed by the Requesting Agent.

Never expose Supply Agent identifiers through:

* Page content
* HTML source
* API responses
* Browser network requests
* URL parameters
* File names
* Image metadata
* Document metadata
* Storage paths
* Analytics properties
* Download links
* Error messages
* Source maps
* Client-side JavaScript objects

Create a dedicated server-side client-safe data projection. Do not send confidential fields to the browser and merely hide them with CSS.

## 22. CLIENT PRESENTATION INTERFACE

The client interface must include:

* Premium cover section
* Requesting Agent details
* Client introduction
* Property cards
* Large image galleries
* Property highlights
* Asking price
* General location
* Property specifications
* Map or general map
* Video
* Floor plan
* Key selling points
* Custom Requesting Agent comments
* Shortlist button
* Compare button
* Not interested button
* Request viewing button
* Ask agent button
* Suggest offer button
* Rank property
* Save feedback button
* Progress indicator
* Return-later functionality

Include a disclaimer that price and availability remain subject to confirmation.

## 23. PROPERTY COMPARISON TOOL

Allow the client to compare between two and five properties.

Comparison categories:

* Asking price
* Monthly rent
* Annual rent
* Currency
* General location
* Distance from preferred location
* Property type
* Built-up area
* Land area
* Price per square foot
* Price per square metre
* Bedrooms
* Bathrooms
* Car parks
* Furnishing
* Condition
* Floor
* Availability
* Deposit
* Service charge
* Facilities
* Transportation access
* Negotiable status
* Key advantages
* Requesting Agent notes

Allow the client to assign:

* First choice
* Second choice
* Third choice
* Maybe
* Not interested

Display missing information clearly. Do not invent or estimate missing property information.

## 24. INTERNAL COMMUNICATION

Create a secure internal messaging system. Each property submission must have its own conversation thread.

Participants may include:

* Requesting Agent
* Supply Agent
* Assigned Admin when necessary

Messaging features:

* Text messages
* File attachments
* Image attachments
* Voice-note readiness
* Date and time
* Read receipts
* Typing indicators where appropriate
* Message search
* Message replies
* Message references
* System-generated status messages
* Message reporting
* Admin visibility
* Message archive

Quick actions:

* Confirm availability
* Request latest price
* Request lower price
* Request appointment letter
* Request owner confirmation
* Request additional images
* Request floor plan
* Request viewing
* Propose viewing time
* Confirm viewing
* Submit offer
* Submit counter-offer
* Accept offer
* Reject offer
* Withdraw property
* Report violation

Do not display direct agent contact details in messages unless contact release is approved.

Detect and flag attempts to share:

* Phone numbers
* Email addresses
* Social-media handles
* External contact links

Do not automatically block legitimate communication without a configurable policy. Provide Admin with configurable:

* Warning mode
* Masking mode
* Review mode
* Blocking mode

## 25. CONTACT RELEASE PROCESS

Provide a controlled contact-release process.

Possible workflow:

1. One agent clicks "Request Direct Contact".
2. The other agent receives a request.
3. Both agents review collaboration terms.
4. Both agents accept.
5. Admin approval may be required based on market settings.
6. Contact information is released.
7. Acceptance is recorded.
8. The transaction remains tracked inside the platform.

Contact release statuses:

* Not Requested
* Requested
* Awaiting Other Agent
* Awaiting Admin
* Approved
* Rejected
* Revoked
* Expired

Contact release must not reveal buyer or tenant contact details unless separately authorised.

## 26. VIEWING MANAGEMENT

Create a viewing workflow.

Viewing fields:

* Viewing ID
* Request ID
* Submission ID
* Property
* Proposed date
* Proposed time
* Time zone
* Meeting point
* Viewing type
* Physical viewing
* Virtual viewing
* Participants
* Requesting Agent
* Supply Agent
* Client attendance status
* Confirmation status
* Special instructions
* Reschedule reason
* Cancellation reason
* Viewing notes
* Outcome
* Follow-up required

Viewing statuses:

* Requested
* Proposed
* Awaiting Confirmation
* Confirmed
* Reschedule Requested
* Completed
* Client Did Not Attend
* Agent Did Not Attend
* Cancelled
* Archived

Prepare the architecture for future Google Calendar integration.

## 27. OFFER AND NEGOTIATION MANAGEMENT

Create structured offer management.

Offer fields:

* Offer ID
* Request ID
* Submission ID
* Proposed amount
* Currency
* Offer type
* Purchase offer
* Rental offer
* Lease term
* Commencement date
* Deposit
* Conditions
* Financing conditions
* Valid-until date
* Supporting document
* Requesting Agent notes
* Supply Agent response
* Owner response status
* Counter-offer amount
* Counter-offer terms

Offer statuses:

* Draft
* Submitted
* Received
* Under Consideration
* More Information Required
* Countered
* Accepted in Principle
* Accepted
* Rejected
* Withdrawn
* Expired
* Converted to Transaction

Display a clear warning that platform offers are not necessarily legally binding unless formal documents are executed.

## 28. SUPPLY AGENT DECLARATION

Before submitting any property, require the Supply Agent to actively accept a declaration. The checkbox must not be pre-selected. Disable the final Submit Property button until the declaration is accepted. Record the exact declaration version.

### English Declaration

"I confirm that all information, descriptions, prices, availability details, photographs, documents and representations provided in this property submission are true, accurate and current to the best of my knowledge.
I confirm that I have the authority, permission or legitimate professional basis to submit and represent this property.
I understand that I am fully responsible for any false, misleading, outdated, unauthorised or inaccurate information submitted by me.
I agree to promptly update or withdraw the property submission if the property is no longer available or if any material information changes.
I acknowledge that the Platform Administrator acts as a technology and collaboration facilitator and is not responsible for verifying every representation made by me.
I agree not to directly approach, solicit, contact or bypass the buyer, tenant or client represented by the Requesting Agent without written consent through the platform.
I agree not to share confidential client, agent, owner or property information outside the authorised transaction.
I understand that a breach of this declaration may result in removal of my submission, account restriction, suspension, termination of access, investigation or other action determined by the Platform Administrator."

### Bahasa Malaysia Declaration

"Saya mengesahkan bahawa semua maklumat, keterangan, harga, status ketersediaan, gambar, dokumen dan representasi yang diberikan dalam penyerahan hartanah ini adalah benar, tepat dan terkini sepanjang pengetahuan saya.
Saya mengesahkan bahawa saya mempunyai kuasa, kebenaran atau asas profesional yang sah untuk menyerahkan dan mewakili hartanah ini.
Saya memahami bahawa saya bertanggungjawab sepenuhnya terhadap sebarang maklumat palsu, mengelirukan, tidak terkini, tidak dibenarkan atau tidak tepat yang diserahkan oleh saya.
Saya bersetuju untuk mengemas kini atau menarik balik penyerahan hartanah dengan segera sekiranya hartanah tersebut tidak lagi tersedia atau terdapat perubahan penting terhadap maklumatnya.
Saya mengakui bahawa Pentadbir Platform bertindak sebagai penyedia teknologi dan fasilitator kerjasama serta tidak bertanggungjawab untuk mengesahkan setiap representasi yang dibuat oleh saya.
Saya bersetuju untuk tidak mendekati, memujuk, menghubungi atau memintas pembeli, penyewa atau pelanggan yang diwakili oleh Requesting Agent tanpa persetujuan bertulis melalui platform.
Saya bersetuju untuk tidak berkongsi maklumat sulit pelanggan, ejen, pemilik atau hartanah di luar urusan yang dibenarkan.
Saya memahami bahawa pelanggaran terhadap deklarasi ini boleh menyebabkan penyerahan saya dipadamkan, akaun dihadkan, digantung, akses ditamatkan, siasatan dijalankan atau tindakan lain yang ditentukan oleh Pentadbir Platform."

### Bahasa Indonesia Declaration

"Saya menyatakan bahwa seluruh informasi, deskripsi, harga, status ketersediaan, foto, dokumen dan pernyataan yang diberikan dalam pengajuan properti ini adalah benar, akurat dan terkini berdasarkan pengetahuan terbaik saya.
Saya menyatakan bahwa saya memiliki kewenangan, izin atau dasar profesional yang sah untuk mengajukan dan mewakili properti ini.
Saya memahami bahwa saya bertanggung jawab penuh atas setiap informasi palsu, menyesatkan, tidak terkini, tanpa izin atau tidak akurat yang saya ajukan.
Saya setuju untuk segera memperbarui atau menarik kembali pengajuan properti apabila properti tersebut tidak lagi tersedia atau terdapat perubahan penting terhadap informasinya.
Saya memahami bahwa Administrator Platform bertindak sebagai penyedia teknologi dan fasilitator kolaborasi serta tidak bertanggung jawab untuk memverifikasi setiap pernyataan yang saya berikan.
Saya setuju untuk tidak mendekati, menawarkan, menghubungi atau melewati agen yang mewakili pembeli, penyewa atau klien tanpa persetujuan tertulis melalui platform.
Saya setuju untuk tidak membagikan informasi rahasia mengenai klien, agen, pemilik atau properti di luar transaksi yang diizinkan.
Saya memahami bahwa pelanggaran terhadap pernyataan ini dapat mengakibatkan penghapusan pengajuan, pembatasan akun, penangguhan, penghentian akses, pemeriksaan atau tindakan lain yang ditentukan oleh Administrator Platform."

## 29. REQUESTING AGENT DECLARATION

Before creating or activating a client presentation, require the Requesting Agent to accept:

### English

"I confirm that I am authorised to represent or assist the buyer or tenant connected to this property requirement.
I agree to use submitted property information only for the legitimate purpose of serving the relevant client.
I agree not to misuse, copy, distribute or commercially exploit another agent's confidential information outside the authorised transaction.
I agree not to bypass or remove the Supply Agent from a transaction involving a property submitted by that agent.
I acknowledge that property availability, price, specifications and terms remain subject to confirmation."

Create equivalent Bahasa Malaysia and Bahasa Indonesia translations.

## 30. CLIENT DISCLAIMER

Display a client disclaimer in the selected language.

### English

"Property information, price, availability, dimensions and terms are subject to confirmation and may change without prior notice.
The information presented is for preliminary evaluation and comparison only and does not constitute a binding offer, contract, valuation, financial advice or legal advice.
Please contact your representing agent to confirm current availability, arrange a viewing, submit an offer or obtain additional information."

Create equivalent Bahasa Malaysia and Bahasa Indonesia translations.

## 31. CONSENT RECORDS

For each accepted declaration, store:

* Consent ID
* User ID
* Agent ID
* Request ID where relevant
* Submission ID where relevant
* Presentation ID where relevant
* Declaration type
* Declaration version
* Language
* Exact accepted text
* Acceptance timestamp
* IP address where legally appropriate
* User agent
* Device or session reference
* Country
* Acceptance status
* Revocation status where applicable

Consent wording must be version-controlled. Do not overwrite previously accepted consent text.

When wording changes materially:

* Create a new version.
* Preserve the old version.
* Require new acceptance for future relevant actions.

## 32. NO-BYPASS AND CLIENT PROTECTION RULES

Supply Agents must not:

* Contact the buyer or tenant directly without permission.
* Solicit the buyer or tenant.
* Remove the Requesting Agent from the transaction.
* Use client information for unrelated marketing.
* Share client information.
* Share private request links with unauthorised users.
* Extract or resell platform data.
* Misrepresent authority to offer a property.
* Upload false or misleading information.

Requesting Agents must not:

* Remove the Supply Agent from the transaction.
* Misrepresent a submission as their own exclusive listing.
* Share confidential Supply Agent information with the client.
* Reuse appointment letters without permission.
* Use a property submission for unrelated clients without authorisation.
* Alter factual property information deceptively.
* Contact an owner directly to bypass the Supply Agent.

Provide a "Report Violation" function for both agents.

## 33. REPORTING AND DISPUTE MANAGEMENT

Violation categories:

* Client bypass
* Agent bypass
* False information
* Unauthorised listing
* Incorrect price
* Property unavailable
* Misleading images
* Fraud suspicion
* Confidentiality breach
* Harassment
* Commission dispute
* Appointment dispute
* Duplicate listing
* Inappropriate content
* Other

Report fields:

* Report ID
* Reporter
* Reported user
* Request
* Submission
* Message
* Description
* Evidence
* Date
* Priority
* Assigned Admin
* Status
* Resolution
* Internal notes

Report statuses:

* Submitted
* Under Review
* Additional Evidence Required
* User Contacted
* Account Restricted
* Resolved
* Rejected
* Escalated
* Archived

## 34. MULTILINGUAL REQUIREMENTS

Initial languages:

1. English
2. Bahasa Malaysia
3. Bahasa Indonesia

English is the global default and fallback language.

Initial country-language behaviour:

**Malaysia** — Default interface: English. Optional: Bahasa Malaysia. User can manually change language.
**Indonesia** — Default interface: Bahasa Indonesia. Optional: English. User can manually change language.
**United Arab Emirates** — Default interface: English. Optional future language: Arabic. Support right-to-left layout when Arabic is introduced.
**Other Countries** — Default interface: English. Admin may configure country-specific default languages.

Language selection priority:

1. User's saved language preference
2. User's registered country
3. Selected active market
4. Browser language
5. English fallback

Do not rely solely on IP location. The user may be travelling or using a VPN.

Do not hard-code visible interface text into components. Use a structured internationalisation system.

Suggested locale structure: `en`, `ms`, `id`, `ar`

Translate:

* Navigation
* Buttons
* Form labels
* Instructions
* Validation
* Error messages
* Statuses
* Notifications
* Emails
* Password pages
* Agent registration
* Property requests
* Property submissions
* Client presentations
* Comparison pages
* Messaging
* Declarations
* Disclaimers
* Reports
* Admin interface

Prepare for future languages: Arabic, Mandarin Chinese, Thai, Vietnamese, Japanese, Korean, French, Spanish.

Provide locale fallback logic. Allow Admin to manage selected translation content without code changes.

## 35. COUNTRY AND MARKET MANAGEMENT

Create Admin-managed country settings.

Fields:

* Country name
* ISO country code
* Active status
* Default language
* Supported languages
* Default currency
* Currency symbol
* Currency decimal rules
* Measurement unit
* Area calculation method
* Date format
* Time format
* Time zone
* Phone country code
* Address format
* Property terminology
* Agent terminology
* Buyer terminology
* Tenant terminology
* Owner terminology
* Landlord terminology
* Sale terminology
* Rental terminology
* Required licence fields
* Required property fields
* Local disclaimer
* Local declarations
* Local privacy wording
* Local retention period
* Local contact-release policy
* Local appointment requirements

Examples:

**Malaysia** — Default language: English. Additional: Bahasa Malaysia. Currency: MYR. Common unit: square feet. Agent classifications may include Estate Agent and Real Estate Negotiator. Licence fields may include REN or REA references.
**Indonesia** — Default language: Bahasa Indonesia. Additional: English. Currency: IDR. Common unit: square metres. Terminology may include Agen Properti, Pemilik and Penyewa.
**United Arab Emirates** — Default language: English. Additional: Arabic. Currency: AED. Common unit: square feet. Terminology may include Real Estate Broker, Landlord and Tenant.

Do not implement country-specific legal conclusions without configurable Admin wording.

## 36. MULTI-CURRENCY SUPPORT

Create a currency table.

Fields:

* Currency code
* Currency name
* Symbol
* Decimal precision
* Thousand separator
* Decimal separator
* Active status

Store monetary values using appropriate precise decimal database types. Never use floating-point values for money. Store original transaction currency. Future exchange-rate conversion may be added later. Do not automatically convert legal offers using stale exchange rates.

## 37. UI AND UX DIRECTION

Create a world-class, premium, professional and intuitive user interface.

The interface must be:

* Mobile-first
* Fully responsive
* Easy for non-technical users
* Fast
* Accessible
* Consistent
* Visually clean
* International-ready
* Touch-friendly
* Suitable for agents using mobile devices
* Suitable for Admin using desktop dashboards

Initial brand colours:

* Crimson Red: `#B11226`
* Charcoal Black: `#1F1F1F`
* Metallic Silver: `#C0C0C0`
* White: `#FFFFFF`

Use crimson red primarily as an accent colour. Do not overuse red backgrounds.

Use:

* Spacious layout
* Clear hierarchy
* Large touch targets
* Clean typography
* Professional property cards
* Clear status badges
* Progress indicators
* Step-by-step forms
* Responsive sidebar
* Mobile bottom navigation
* Breadcrumbs on desktop
* Loading skeletons
* Empty states
* Error states
* Success states
* Confirmation modals
* Toast notifications
* Search
* Filters
* Sorting
* Pagination
* Infinite scrolling only where appropriate
* Drag-and-drop uploads
* Image previews
* Form autosave
* Unsaved-change warning
* Accessible contrast
* Keyboard navigation
* Screen-reader labels

Provide: Light mode, Dark mode, System mode.

Use reusable design tokens. Do not hard-code colours throughout components.

## 38. PRIMARY SCREENS

### Public and Authentication

* Landing page
* Login
* Registration
* Forgot password
* Reset password
* Email verification
* Mobile verification readiness
* Agent verification
* Terms
* Privacy notice
* Access denied
* Suspended account
* Expired link
* Invalid link

### Agent

* Agent dashboard
* Profile
* Verification status
* My requests
* Create request
* Edit request
* Request details
* Request link management
* Submission review board
* Property submission details
* My property submissions
* Create property submission
* Edit property submission
* Message centre
* Offer centre
* Viewing centre
* Notifications
* Saved drafts
* Reports
* Security settings

### Client

* Client access page
* Password or OTP page
* Presentation home
* Property details
* Property comparison
* Client shortlist
* Client feedback
* Viewing request
* Offer suggestion
* Confirmation page

### Admin

* Executive dashboard
* User management
* Agent verification
* Request approval queue
* Request management
* Property submission management
* Country management
* Language management
* Currency management
* Legal content management
* Consent-version management
* Violation reports
* Disputes
* Audit logs
* Security events
* Notifications
* Email templates
* System settings
* Feature flags
* Data export
* System health

## 39. ADMIN DASHBOARD METRICS

Display:

* Total registered agents
* Total verified agents
* Pending verification
* Suspended agents
* Active countries
* Active property requests
* Requests pending approval
* Active request links
* Total property submissions
* Direct submissions
* Indirect submissions
* Submissions with appointments
* Submissions without appointments
* Client presentations
* Client presentation views
* Client shortlists
* Client comparison sessions
* Viewing requests
* Confirmed viewings
* Active negotiations
* Offers submitted
* Offers accepted
* Transactions in progress
* Closed transactions
* Conversion rate
* Average agent response time
* Average time to first submission
* Average time to shortlist
* Top Requesting Agents
* Top Supply Agents
* Requests by country
* Requests by city
* Requests by category
* Requests by price range
* Expired requests
* Unanswered requests
* Suspicious activity
* Open violation reports
* Recent Admin actions

Use charts only where they improve understanding. Provide date, country, market and agent filters.

## 40. NOTIFICATIONS

Create in-app notifications. Prepare architecture for: Email, WhatsApp, SMS, Push notifications, Browser notifications.

Notification events:

* Registration received
* Verification approved
* Verification rejected
* Additional documents requested
* Request submitted
* Request approved
* Request amendment required
* Request rejected
* Request link activated
* Request expiring
* New property submitted
* More information requested
* Property shortlisted
* Property rejected
* Property shared with client
* Client viewed presentation
* Client shortlisted property
* Client requested viewing
* Client suggested offer
* New message
* Availability confirmation requested
* Offer received
* Counter-offer received
* Offer accepted
* Offer rejected
* Viewing proposed
* Viewing confirmed
* Viewing rescheduled
* Property withdrawn
* Violation reported
* Account warning
* Account suspended

Allow users to configure notification preferences. Do not expose confidential information in notification previews.

## 41. DATABASE ARCHITECTURE

Use Supabase PostgreSQL. Design a normalised and scalable schema.

Expected tables may include:

* profiles
* users_private
* roles
* user_roles
* agent_profiles
* agent_verifications
* agencies
* agency_members
* countries
* markets
* languages
* translations
* currencies
* property_categories
* property_types
* property_requests
* request_locations
* request_preferences
* request_links
* request_link_access_logs
* property_submissions
* property_submission_sources
* property_submission_media
* property_submission_documents
* property_submission_status_history
* property_availability_history
* client_presentations
* client_presentation_properties
* client_access_tokens
* client_access_logs
* client_feedback
* client_shortlists
* client_rankings
* comparison_sessions
* conversations
* conversation_participants
* messages
* message_attachments
* offers
* offer_history
* viewing_appointments
* viewing_history
* contact_release_requests
* notifications
* notification_preferences
* declarations
* declaration_versions
* consent_records
* violation_reports
* violation_evidence
* admin_actions
* compliance_notes
* audit_logs
* security_events
* banned_users
* blocked_sessions
* feature_flags
* system_settings
* country_settings
* email_templates
* translation_overrides

Use UUIDs for internal primary keys. Use human-readable IDs separately:

* `REQ-2026-000001`
* `SUB-2026-000001`
* `PRE-2026-000001`
* `OFF-2026-000001`
* `VIEW-2026-000001`

Do not use human-readable IDs as security tokens.

Include: created_at, updated_at, created_by, updated_by, archived_at where appropriate, deleted_at only where soft deletion is required, version number where optimistic locking is useful.

## 42. SUPABASE AUTHENTICATION

Use Supabase Authentication.

Support:

* Email and password
* Magic link readiness
* Email verification
* Password reset
* Optional social-login readiness
* Multi-factor authentication readiness
* Secure session management

Store private information separately from public profile information. Do not store authorisation roles only in editable client metadata. Use secure role tables, server-side checks and Row-Level Security.

## 43. ROW-LEVEL SECURITY

Enable Row-Level Security on all protected tables.

**Requesting Agent** may access: own requests; submissions linked to own requests; own client presentations; conversations where the agent is a participant; offers linked to own requests; viewings linked to own requests. May not access: other Requesting Agents' requests; unrelated Supply Agent submissions; confidential Admin notes; other agents' private verification documents.

**Supply Agent** may access: own submissions; authorised request details; conversations involving own submissions; offers involving own submissions; viewings involving own submissions. May not access: other Supply Agents; competing submissions; client identity; client contact information; Requesting Agent internal notes; other conversations.

**Client Viewer** must not receive direct database access to internal tables. Use restricted server-side functions or dedicated client-safe views. Client access must be limited to: one active presentation; selected properties; client-safe fields; allowed feedback actions.

**Admin** access must follow Admin role and country scope.

Do not rely only on frontend hiding. Implement all authorisation at: database layer, server layer, API layer, storage layer.

## 44. STORAGE ARCHITECTURE

Use Supabase Storage.

Suggested buckets:

* agent-profile-public
* agent-verification-private
* property-original-private
* property-client-safe
* appointment-documents-private
* internal-attachments-private
* client-presentation-files
* violation-evidence-private
* system-assets-public

Use:

* Signed URLs
* Expiring access
* Access policies
* File-size limits
* MIME-type validation
* Safe filename generation
* Virus-scanning integration readiness
* Image compression
* Thumbnail generation
* Metadata removal
* EXIF removal
* Duplicate-file detection readiness

Never expose sensitive documents through permanent public URLs.

## 45. CLIENT-SAFE MEDIA PROCESSING

When an image is uploaded:

1. Validate file type.
2. Validate file size.
3. Scan or prepare for malware scanning.
4. Remove EXIF metadata.
5. Remove GPS metadata.
6. Generate optimised versions.
7. Generate thumbnails.
8. Detect potential watermarks where possible.
9. Flag visible phone numbers or email addresses where possible.
10. Create a client-safe copy.
11. Store the original privately.
12. Serve only the client-safe version to the client.

Do not automatically remove legitimate content destructively without preserving the original. Provide Admin review for flagged media.

## 46. SECURITY REQUIREMENTS

Implement:

* Secure headers
* Content Security Policy
* HTTPS-only production
* CSRF protection where relevant
* XSS protection
* SQL injection prevention
* Parameter validation
* Server-side input validation
* Rate limiting
* Bot protection
* Brute-force protection
* Password attempt limits
* Secure cookies
* SameSite cookie policy
* Session expiration
* Device/session revocation
* File upload validation
* Signed URLs
* Secret management
* Audit logging
* Security-event logging
* Error-message sanitisation
* Production source-map protection
* Dependency scanning
* Automated security checks
* Database backups
* Restore documentation

Use Cloudflare Turnstile on high-risk public forms.

Never expose: Supabase service-role key, database password, Cloudflare API token, GitHub token, email credentials, private storage keys.

## 47. CLOUDFLARE REQUIREMENTS

Use Cloudflare for:

* DNS
* SSL
* CDN
* Web Application Firewall readiness
* Rate limiting
* Bot protection
* Turnstile
* Security headers
* Caching rules
* Custom subdomain
* Optional Workers where appropriate

The final subdomain will be supplied later.

Use environment variables:

* NEXT_PUBLIC_APP_URL
* APP_BASE_URL
* AUTH_CALLBACK_URL
* CLIENT_PRESENTATION_BASE_URL
* REQUEST_LINK_BASE_URL
* SUPABASE_URL
* SUPABASE_ANON_KEY
* SUPABASE_SERVICE_ROLE_KEY
* CLOUDFLARE_ACCOUNT_ID
* CLOUDFLARE_API_TOKEN
* EMAIL_FROM_DOMAIN

Do not hard-code the final domain. Prepare custom-domain setup documentation.

## 48. GITHUB AND DEPLOYMENT WORKFLOW

Use GitHub for version control.

Recommended branches: `main` (production), `develop` (integration), feature branches, fix branches, release branches where appropriate.

Implement:

* Pull-request template
* Issue templates
* Code owners
* Branch protection recommendations
* Automated linting
* Type checking
* Unit tests
* Integration tests
* Build verification
* Database migration checks
* Security dependency checks
* Automated deployment

Workflow:

1. Create a feature branch.
2. Implement changes.
3. Run local checks.
4. Push to GitHub.
5. GitHub Actions runs tests.
6. Open pull request.
7. Review changes.
8. Merge approved changes.
9. Deploy automatically to staging or production.
10. Apply controlled database migrations.
11. Run post-deployment checks.

Do not require manual uploading of the entire application to the server after every change.

## 49. ENVIRONMENTS

**Local** — Local development; local Supabase or isolated development project; seed data; safe test accounts.
**Staging** — Staging domain; staging Supabase project; test users; test email; non-production data; preview deployments.
**Production** — Production domain; production Supabase project; production secrets; production backups; restricted Admin access; monitoring.

Never share production and staging secrets.

## 50. RECOMMENDED TECHNICAL STACK

Use:

* Next.js current stable release
* React
* TypeScript
* Tailwind CSS
* Accessible component system
* Supabase PostgreSQL
* Supabase Authentication
* Supabase Storage
* Supabase Realtime where beneficial
* Supabase Edge Functions where beneficial
* PostgreSQL Row-Level Security
* Cloudflare
* GitHub
* GitHub Actions
* Schema-validation library
* Form-management library
* Internationalisation library
* Testing framework
* End-to-end testing framework

Before selecting specific package versions: check compatibility; avoid abandoned dependencies; avoid unnecessary packages; document every major dependency; pin versions appropriately; generate a dependency rationale.

## 51. APPLICATION ARCHITECTURE

Use a clean, modular architecture.

Suggested structure:

* app routes
* feature modules
* reusable UI components
* domain services
* database repositories
* validation schemas
* authorisation services
* notification services
* audit services
* file-processing services
* translation services
* configuration services
* test utilities

Separate: client-safe data, agent-private data, Admin data, compliance data.

Do not put all logic inside page components. Use server-side actions or secure API endpoints appropriately.

## 52. AUDIT LOGGING

Create append-only audit logs.

Audit events include:

* Login
* Logout
* Failed login
* Password reset
* Agent registration
* Verification approval
* Verification rejection
* Role changes
* Request creation
* Request edits
* Request approval
* Request rejection
* Request-link generation
* Request-link access
* Property submission
* Property edits
* Status changes
* Client-presentation creation
* Client access
* Client feedback
* Messages
* Offers
* Viewings
* Contact release
* Document downloads
* Admin actions
* Account suspension
* Account restoration
* Data export
* Security-policy changes
* Consent acceptance

Audit records should store: actor, role, action, entity type, entity ID, timestamp, previous values where appropriate, new values where appropriate, IP where permitted, session reference, country, result, reason.

Prevent normal users from editing audit logs.

## 53. PRIVACY AND DATA MINIMISATION

Apply data minimisation. Only collect information required for: agent verification, property collaboration, client servicing, security, compliance, reporting.

Separate: public data, internal agent data, private identity data, confidential transaction data, compliance data.

Provide architecture for:

* User data export
* Account closure request
* Data-retention policies
* Anonymisation
* Soft deletion
* Legal hold
* Country-specific privacy wording

Do not automatically delete transaction records that must be retained for legitimate operational or legal reasons.

## 54. SEARCH AND FILTERING

Create secure search for: requests, submissions, agents, locations, messages, offers, viewings, reports.

Use server-side filtering for protected datasets. Do not download all protected records to the browser for filtering. Prepare for scalable indexing.

## 55. DUPLICATE DETECTION READINESS

Prepare architecture for duplicate-property detection.

Potential signals: same address, same unit, same coordinates, same project, same price, same image hash, same floor plan, similar description, same owner reference, same phone number found in media.

Do not automatically merge records. Flag potential duplicates for Admin review.

## 56. FUTURE AI FEATURES

Do not build all advanced AI features in the first MVP.

Prepare extension points for:

* AI property matching
* Requirement-to-property scoring
* Image-quality analysis
* Duplicate detection
* Automatic translation
* Property-description improvement
* Price benchmarking
* Risk detection
* Suspicious listing detection
* Client preference analysis
* Recommended shortlist
* Automated client presentation
* Agent-response suggestions
* Conversation summary

AI-generated output must be clearly identified and reviewable. Do not allow AI to change legally significant information automatically.

## 57. FUTURE INTEGRATIONS

Prepare architecture for:

* WhatsApp Business API
* Email provider
* SMS provider
* Google Calendar
* CRM
* GoHighLevel
* Digital signature
* Payment gateway
* Agent subscription
* Commission tracking
* Document verification
* Map service
* Currency-rate service
* Analytics platform

Use adapters or service interfaces so integrations can be changed later.

## 58. MVP SCOPE

Build the first functional MVP with:

1. Authentication
2. Agent registration
3. Agent verification
4. Role-based permissions
5. Admin dashboard
6. Agent dashboard
7. Property requirement creation
8. Admin request approval
9. Password-protected request links
10. Request access logs
11. Property submission
12. Image upload
13. Source declaration
14. Supply Agent consent
15. Submission review
16. Shortlisting
17. Property rejection
18. Client presentation builder
19. Client-safe presentation
20. Property comparison
21. Client shortlist and feedback
22. Internal messaging
23. Basic viewing request
24. Basic offer submission
25. Notifications
26. Audit logs
27. English, Bahasa Malaysia and Bahasa Indonesia
28. Country and currency configuration
29. Supabase Row-Level Security
30. Cloudflare-ready deployment
31. GitHub CI/CD
32. Documentation
33. Automated tests

Do not build unnecessary advanced features before the MVP works correctly.

## 59. PHASED DEVELOPMENT PLAN

### Phase 0 — Discovery and Architecture

Before writing production code:

* Review this specification.
* Identify assumptions.
* Identify risks.
* Produce architecture decisions.
* Produce database relationship diagram.
* Produce role permission matrix.
* Produce data-classification matrix.
* Produce sitemap.
* Produce main user flows.
* Produce threat model.
* Produce MVP backlog.
* Produce implementation order.

Do not ask unnecessary questions. Where information is missing, make a reasonable, configurable assumption and document it.

### Phase 1 — Foundation

Build: repository, Next.js, TypeScript, Tailwind, Supabase setup, authentication, environment handling, translation system, design system, core database, Row-Level Security, audit service, seed data.

### Phase 2 — Agent and Admin

Build: agent registration, agent verification, Admin user management, country management, legal-content management, agent dashboard.

### Phase 3 — Property Requirements

Build: requirement forms, Admin approval, request status, secure request links, password access, QR generation, access logs.

### Phase 4 — Property Submission

Build: submission form, media upload, source classification, consent, submission statuses, Requesting Agent review board.

### Phase 5 — Client Presentation

Build: presentation builder, client-safe projection, client link, client comparison, shortlist, feedback, view tracking.

### Phase 6 — Collaboration

Build: messaging, viewing requests, offers, contact release, notifications.

### Phase 7 — Governance

Build: violation reports, compliance review, security events, advanced audit views, reports, exports.

### Phase 8 — Quality and Deployment

Complete: unit tests, integration tests, end-to-end tests, security tests, accessibility review, performance review, staging deployment, production deployment guide, backup and recovery guide.

## 60. TESTING REQUIREMENTS

Write tests for critical workflows.

**Authentication Tests** — Registration; login; logout; password reset; invalid session; suspended user; unverified user.

**Permission Tests** — Requesting Agent cannot access unrelated request; Supply Agent cannot access competing submissions; Client cannot access Supply Agent identity; Country Admin cannot access another country; Normal Agent cannot access Admin; Public user cannot access private storage; Client link cannot retrieve confidential API fields.

**Request Tests** — Create draft; submit; approve; request amendment; activate link; expire link; disable link.

**Submission Tests** — Submit property; consent required; upload image; reject invalid file; update availability; withdraw property; prevent unauthorised editing.

**Client Tests** — Access valid presentation; reject invalid token; reject expired presentation; compare properties; shortlist; submit feedback; verify no Supply Agent data leakage.

**Messaging Tests** — Authorised participants only; message audit; attachment security; report message.

**Security Tests** — Rate limiting; password brute force; SQL injection attempts; XSS attempts; invalid file types; direct object reference attempts; client-data leakage; storage policy bypass.

## 61. ACCEPTANCE CRITERIA

The MVP is only complete when:

* A new Agent can register.
* Admin can verify the Agent.
* A verified Agent can create a property requirement.
* Admin can approve the requirement.
* The system can generate a secure link and password.
* Another verified Agent can open the link and submit a property.
* Submission requires active declaration acceptance.
* Requesting Agent can review the submission.
* Requesting Agent can shortlist or reject the submission.
* Requesting Agent can create a client presentation.
* Client can view only selected properties.
* Client can compare properties.
* Client can submit feedback.
* Client cannot access the Supply Agent's identity.
* Supply Agent cannot access client identity.
* Both agents can communicate securely.
* Admin can view relevant platform activity.
* All critical actions are audited.
* English, Bahasa Malaysia and Bahasa Indonesia work.
* Row-Level Security tests pass.
* CI/CD deployment works.
* Documentation is complete.
* No sensitive keys are committed.
* Production build completes without critical errors.

## 62. REQUIRED DOCUMENTATION

Create:

* README
* Product overview
* Local installation guide
* Supabase setup guide
* Cloudflare setup guide
* GitHub setup guide
* Environment-variable guide
* Database schema documentation
* Row-Level Security documentation
* Role permission matrix
* API documentation
* Storage-policy documentation
* Translation guide
* Country configuration guide
* Admin user guide
* Agent user guide
* Client presentation guide
* Deployment guide
* Backup guide
* Restore guide
* Security checklist
* Testing guide
* Troubleshooting guide
* Future roadmap

## 63. REQUIRED REPOSITORY FILES

Create or recommend:

* `.env.example`
* `.gitignore`
* `README.md`
* `CONTRIBUTING.md`
* `SECURITY.md`
* `CHANGELOG.md`
* `LICENSE` placeholder
* `docs/architecture.md`
* `docs/database.md`
* `docs/permissions.md`
* `docs/deployment.md`
* `docs/security.md`
* `docs/i18n.md`
* `docs/admin-guide.md`
* `docs/agent-guide.md`
* `supabase/migrations/`
* `supabase/seed.sql`
* `.github/workflows/`
* `.github/pull_request_template.md`
* `.github/ISSUE_TEMPLATE/`
* `CLAUDE.md`

Create a detailed `CLAUDE.md` file describing: project purpose, architecture, commands, coding conventions, security rules, database workflow, testing rules, files Claude Code must not modify without review, required checks before completion.

## 64. CODING STANDARDS

Use:

* Strict TypeScript
* Clear names
* Small reusable components
* Server-side validation
* Schema-based forms
* Consistent error handling
* Secure defaults
* Accessible HTML
* Clear comments only where useful
* No duplicated business logic
* No hard-coded roles
* No hard-coded countries
* No hard-coded legal text inside components
* No hard-coded production URLs
* No confidential logging
* No `any` unless justified
* No ignored security warnings without documentation

## 65. EXECUTION INSTRUCTIONS FOR CLAUDE CODE

Follow this operating sequence:

1. Inspect the existing repository if one exists.
2. Do not delete existing work without reviewing it.
3. Create a project-status summary.
4. Identify missing dependencies.
5. Produce the proposed architecture.
6. Produce the implementation plan.
7. Create the database schema.
8. Create migrations.
9. Create Row-Level Security policies.
10. Create seed data.
11. Build authentication.
12. Build role management.
13. Build Admin functions.
14. Build Agent functions.
15. Build request workflow.
16. Build property submission.
17. Build client-safe presentation.
18. Build messaging and collaboration.
19. Add multilingual support.
20. Add tests.
21. Run tests.
22. Fix failures.
23. Run type checking.
24. Run linting.
25. Run production build.
26. Review security.
27. Update documentation.
28. Produce a final implementation report.

Do not merely generate sample screens. Build functional workflows connected to the actual database. Do not claim a feature is complete unless it works. Do not use mock data in production paths. Seed data may be used for local and staging demonstrations. Do not silently skip security policies. Do not disable Row-Level Security to make development easier. Do not expose confidential fields to the browser. Do not proceed to advanced functionality while critical MVP workflows are broken.

## 66. REQUIRED OUTPUT BEFORE CODING

Before making major code changes, provide:

1. Executive product summary
2. Assumptions
3. System architecture
4. User-role permission matrix
5. Database table plan
6. Data-classification matrix
7. Main user flows
8. Security threat model
9. MVP backlog
10. Implementation sequence
11. Proposed folder structure
12. Required environment variables
13. Risks and mitigation
14. Acceptance criteria

After producing these items, proceed with implementation unless a critical blocker makes implementation impossible.

## 67. FINAL IMPLEMENTATION REPORT

At the end of each development phase, report:

* Features completed
* Files created
* Files modified
* Database migrations added
* Security policies added
* Tests added
* Tests passed
* Tests failed
* Known limitations
* Manual configuration required
* Deployment status
* Recommended next phase

Be transparent. Never claim that deployment, testing, integration or security verification was completed unless it was actually performed.

## 68. LEGAL CONFIGURATION NOTICE

The platform must support configurable and versioned:

* Terms of use
* Privacy notices
* Supply Agent declarations
* Requesting Agent declarations
* Client disclaimers
* No-bypass clauses
* Country-specific legal notices
* Data-retention notices
* Consent wording

The initial wording in this specification is operational draft wording. The final legal text must be reviewed by qualified legal professionals in each operating country before commercial launch. Do not represent the platform as providing legal, financial or valuation advice.

## 69. FINAL PRODUCT PRINCIPLE

The platform must be built around the following principle:

The Requesting Agent controls the relationship with the buyer or tenant.
The Supply Agent retains recognition and protection for the submitted property.
The client sees only information authorised by the Requesting Agent.
Admin has governance visibility without unnecessarily interfering in legitimate agent-to-agent negotiations.
Every critical action is secure, permission-controlled, traceable and auditable.

**Begin with Phase 0. Produce the architecture and implementation plan first, then build the MVP systematically.**
