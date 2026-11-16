# Public feedback board

The fifth navigation tab, 문의, opens /contact/. The previous footer destination and contact email remain valid. The board has three categories (problem, suggestion, question), a newest-first summary list with stable keyset pagination, expandable plain-text details, and a login-free write form. Empty and failed loads have explicit messages. No sample posts are seeded.

Posts are persisted in the existing D1 binding in feedback_posts via the additive 0008 migration. Product tables and previous migrations are unchanged. API writes require same-origin requests, bounded JSON bodies, validated fields, and parameterized SQL. Creation is limited atomically to three posts per ten minutes and ten per daily creator hash. Raw IP addresses are not stored. Deleted rows remain excluded from public reads and retained for rate counting.

Creation returns a random author capability exactly once; only its SHA-256 digest is stored server-side. The browser retains the capability locally and shows edit/delete actions for its own posts. There is no account recovery, so clearing browser data removes access to these controls. Public list/detail responses exclude capability digests, creator hashes and deletion metadata. Visitor-supplied text is rendered using textContent, never HTML. UI text warns that posts are public and contact/personal data should not be included.

Tests exercise durable CRUD, authorization, origin checks, input/body limits, rate limits, stable same-time pagination and category filters using actual SQLite.
