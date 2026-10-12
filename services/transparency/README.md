# services/transparency

Hash-chained public decision log (the only writer of the chain) and the public read models (Firestore).
Owns the `transparency` database; consumes `keputusan.dicatat` and every event shown on the public dashboard.
Filled in at CP0.
