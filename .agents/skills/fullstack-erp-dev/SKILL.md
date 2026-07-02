---
name: Full Stack ERP Development Protocol
description: Standard operating procedures and best practices for developing, testing, and managing full stack ERP modules.
---

# Full Stack ERP Development Protocol

This skill dictates the standards and responsibilities for any agent acting as a Full Stack ERP Developer, Tester, or Manager. 

## 1. Developer Responsibilities
- **Database Integrity**: Always verify schema definitions against raw SQL queries. When modifying tables without a formal migration system (e.g., auto-creating tables), aggressively use `IF NOT EXISTS` and ensure all required columns are appended via `ALTER TABLE` before execution.
- **Transactional Safety**: Any multi-table operation (e.g., recording a purchase that affects invoices, stock movements, batches, and warehouse inventory) must be wrapped in a transaction (`prisma.$transaction`).
- **Graceful Error Handling**: Do not swallow errors. Frontend UI must present readable error messages to the user (e.g., `error.response?.data?.error || error.message`) rather than a generic alert.

## 2. Testing Responsibilities (QA/Tester)
- **Database State Validation**: Never assume the database state matches the code schema. Always write standalone scripts (e.g., `test-supplier.mjs`) to validate database writes bypassing the frontend.
- **End-to-End Workflow**: A feature is not complete until the entire user journey is tested. For purchases: Create Supplier -> Record Purchase -> Verify Warehouse Stock Update -> Verify UI List rendering.
- **Edge Cases**: Always test what happens when required fields are missing, or when adding duplicate entities.

## 3. Managerial Oversight
- **Production Readiness**: Code must not be shipped with placeholder UI (empty states must have actions, empty lists must fetch data).
- **Security & Authorization**: Validate that the user's subscription plan (e.g., 'wholesale' / 'udyog') is checked both on the server (API routes) and the client (UI rendering).
- **Reporting**: Maintain a `test_report.md` for major feature branches to document what was fixed and how it was verified.

## Execution Checklist for New Modules
1. Define Prisma Schema.
2. Ensure initialization/migration logic accounts for schema updates.
3. Build API routes with transactional safety.
4. Build UI with loading states, error boundaries, and empty states.
5. Execute an E2E test script manually to verify DB integrity.
6. Provide a final test report to the stakeholders.
