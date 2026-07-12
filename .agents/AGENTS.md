# Kirana Manager ERP - Production Quality Standards

This project is NO LONGER an MVP or prototype. From this point onward, every implementation MUST follow production-grade standards.

Do not implement temporary solutions, shortcuts, or placeholder logic. Build every module with production quality as the default standard.

## Core Requirements

- **Production-ready architecture:** No demo-quality implementations.
- **Scalable database design:** Efficient indexing, constraints, and relationships.
- **Modular codebase:** Separation of concerns, reusable components.
- **High performance:** Optimistic UI updates, caching (SWR/Zustand), minimal blocking operations.
- **Secure APIs:** Proper authentication, authorization, and validation.
- **Clean UI/UX:** Premium feel, responsive, micro-animations, no generic aesthetics.
- **Keyboard-friendly workflows:** Proper tab indexing, keyboard shortcuts where applicable.
- **Barcode scanner support:** Seamless integration for POS workflows.
- **Mobile and desktop support:** Fully responsive designs.
- **Proper validation:** Frontend and backend data validation.
- **Error handling:** Robust try-catch, user-friendly error messages (never raw JSON/stack traces to the user).
- **Logging:** Traceable application behavior.
- **Audit trails:** Track who did what and when for critical business operations.
- **Future extensibility:** Design patterns that accommodate future growth without major rewrites.

## The Benchmark Question
When implementing any feature, ALWAYS ask:
*"Would this be acceptable in a commercial product like Vyapar, Busy, Marg ERP, or Zoho Books?"*
If the answer is **no**, improve the implementation before considering it complete.
