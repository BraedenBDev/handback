# Design

The handoff's own words are set in a serif, because a person wrote them and
another person has to read them. The machinery around them (labels, versions,
keys, seals) is mono, because it is apparatus. You can tell which is which at a
glance.

Amber is the accent because it means *awaiting you*. The approval gate is the
product, so the product's colour is the colour of something stopped, waiting for
a person.

Every version carries a **seal**: the first eight characters of a SHA-256 over
its state, bound to its version number and its parent's hash. Edit a document
outside the approval path and it stops matching its seal, and the page says so.
It proves internal consistency and nothing about authorship. The copy takes care
not to imply otherwise.
