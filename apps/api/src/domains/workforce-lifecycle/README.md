# Workforce lifecycle ownership

This folder is owned by Developer 4. It contains leave and availability plus onboarding/offboarding domain logic, repositories and persistence adapters.

Other domains should reference users by `userId` and consume the HTTP/application contracts rather than modifying these tables directly.
