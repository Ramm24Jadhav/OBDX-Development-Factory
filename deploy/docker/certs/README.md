# Extra CA certificates

Put CA certificates here (PEM, one per `.crt` file) when the factory image must trust a certificate the public CAs did
not sign: the bank's TLS-inspecting proxy during the build, or internal SVN, model, Maven or npm servers at run time.
They are added to the system and Java trust stores of the image. Rebuild afterwards: `docker compose build`.
`.crt` files here are ignored by git; add one with `git add -f` if the whole team should build with it.

Only CA certificates belong here, never private keys.
