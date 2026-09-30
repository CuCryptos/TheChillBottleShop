-- Draw-based drops: a reservation starts as an 'entered' entry and is only
-- allocated or waitlisted when the draw runs. Kept in its own migration because
-- a new enum value can't be used in the transaction that adds it.

alter type reservation_status add value if not exists 'entered' before 'allocated';
